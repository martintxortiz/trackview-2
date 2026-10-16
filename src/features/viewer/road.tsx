'use client'

/**
 * Track ribbon — asphalt, optional heatmap / section overlays, curb strokes.
 * Buffer builders match canvas digests; layer opacity is immediate (U04).
 * Full crossfade animation stays on the canvas pin until U09.
 */
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Xy } from '@/track/frame'
import { resampleTrack } from '@/track/smooth'
import {
  checkeredSegmentPositions,
  edgeAt,
  offsetPolyline,
  ribbonArcPositions,
  ribbonHeatmap,
  ribbonPositions,
  segmentPositions,
  sidesOf,
  strokeHeatmap,
  strokePositions,
} from '@/track/ribbon'
import {
  FILL_SPACING_M,
  type HeatPaint,
  type RoadProps,
} from '@/features/viewer/contracts'
import {
  heatUsesAlpha,
  paintMetricColors,
  shadeRgb,
} from '@/features/viewer/math'

const ROAD = '#45454e'
const ROAD_LIGHT = '#5b5b64'
const SECTION_TINT = 0.8
const STROKE = '#787886'
const STROKE_LIGHT = '#3f3f46'
const START_OPACITY = 0.9
const STROKE_PX_OUT = 1.5
const STROKE_PX_IN = 3.25
const MAX_SECTIONS = 16
const ZOOM_OUT = 0.4
const ZOOM_IN = 7.5

function strokePx(zoom: number, fit: number): number {
  const rel = zoom / Math.max(fit, 1e-6)
  const t = THREE.MathUtils.smoothstep(rel, ZOOM_OUT, ZOOM_IN)
  return THREE.MathUtils.lerp(STROKE_PX_OUT, STROKE_PX_IN, t)
}

export const Road = memo(function Road({
  track,
  view,
  layer,
  palette,
  metric,
  traces,
  zones,
  heatPaintRef,
  metricsSource,
  invert,
  light,
}: RoadProps) {
  const fill = useMemo(() => new THREE.BufferGeometry(), [])
  const heat = useMemo(() => new THREE.BufferGeometry(), [])
  const sectionFills = useMemo(
    () => Array.from({ length: MAX_SECTIONS }, () => new THREE.BufferGeometry()),
    [],
  )
  const leftStroke = useMemo(() => new THREE.BufferGeometry(), [])
  const rightStroke = useMemo(() => new THREE.BufferGeometry(), [])
  const startLine = useMemo(() => new THREE.BufferGeometry(), [])
  const sectionLines = useMemo(
    () => Array.from({ length: MAX_SECTIONS }, () => new THREE.BufferGeometry()),
    [],
  )
  const edges = useRef<{ left: Xy[]; right: Xy[] } | null>(null)
  const edgeRgb = useRef<{ colors: Float32Array; channels: 3 | 4 } | null>(null)
  const strokeZoom = useRef(NaN)
  const activeSections = useRef(0)

  useEffect(
    () => () => {
      fill.dispose()
      heat.dispose()
      for (const g of sectionFills) g.dispose()
      leftStroke.dispose()
      rightStroke.dispose()
      startLine.dispose()
      for (const g of sectionLines) g.dispose()
    },
    [fill, heat, sectionFills, leftStroke, rightStroke, startLine, sectionLines],
  )

  useLayoutEffect(() => {
    const smooth = resampleTrack(track, FILL_SPACING_M)
    const sides = sidesOf(smooth)
    edges.current = { left: sides.left as Xy[], right: sides.right as Xy[] }
    strokeZoom.current = NaN
    fill.setAttribute(
      'position',
      new THREE.BufferAttribute(ribbonPositions(smooth), 3),
    )
    fill.computeBoundingSphere()
  }, [track, fill])

  useLayoutEffect(() => {
    if (layer !== 'heatmap') return
    const smooth = resampleTrack(track, FILL_SPACING_M)
    const painted = paintMetricColors(
      smooth,
      track,
      palette,
      metric,
      traces,
      metricsSource,
      invert,
    )
    const mesh = ribbonHeatmap(smooth, painted.colors, painted.channels)
    heat.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    heat.setAttribute(
      'color',
      new THREE.BufferAttribute(mesh.colors, mesh.channels),
    )
    heat.computeBoundingSphere()
    heatPaintRef.current = {
      colors: painted.colors,
      channels: painted.channels,
      n: smooth.samples.length,
      overAsphalt: heatUsesAlpha(palette, traces),
    } satisfies HeatPaint
    edgeRgb.current =
      painted.channels === 3
        ? { colors: shadeRgb(painted.colors), channels: 3 }
        : null
    strokeZoom.current = NaN
  }, [
    track,
    layer,
    palette,
    metric,
    traces,
    metricsSource,
    invert,
    heat,
    heatPaintRef,
  ])

  useLayoutEffect(() => {
    if (layer !== 'sections') return
    const smooth = resampleTrack(track, FILL_SPACING_M)
    const count = Math.min(zones.length, MAX_SECTIONS)
    activeSections.current = count
    for (let s = 0; s < count; s++) {
      const z = zones[s]!
      sectionFills[s]!.setAttribute(
        'position',
        new THREE.BufferAttribute(
          ribbonArcPositions(smooth, z.from, z.to),
          3,
        ),
      )
      sectionFills[s]!.computeBoundingSphere()
    }
    for (let s = count; s < MAX_SECTIONS; s++) {
      sectionFills[s]!.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(0), 3),
      )
    }
    strokeZoom.current = NaN
  }, [track, layer, zones, sectionFills])

  useFrame(() => {
    const zoom = view.current.zoom || 1
    const side = edges.current
    if (!side) return
    if (
      Number.isFinite(strokeZoom.current) &&
      Math.abs(strokeZoom.current - zoom) / strokeZoom.current < 0.08
    ) {
      return
    }

    const half = strokePx(zoom, view.current.fit || zoom) / 2 / zoom
    const leftPts = offsetPolyline(side.left, half)
    const rightPts = offsetPolyline(side.right, -half)
    const edge =
      layer === 'heatmap' && !heatUsesAlpha(palette, traces)
        ? edgeRgb.current
        : null
    if (edge) {
      const L = strokeHeatmap(leftPts, half, 0.05, edge.colors, true, edge.channels)
      const R = strokeHeatmap(rightPts, half, 0.05, edge.colors, true, edge.channels)
      leftStroke.setAttribute('position', new THREE.BufferAttribute(L.positions, 3))
      leftStroke.setAttribute('color', new THREE.BufferAttribute(L.colors, L.channels))
      rightStroke.setAttribute('position', new THREE.BufferAttribute(R.positions, 3))
      rightStroke.setAttribute('color', new THREE.BufferAttribute(R.colors, R.channels))
    } else {
      leftStroke.setAttribute(
        'position',
        new THREE.BufferAttribute(strokePositions(leftPts, half, 0.05), 3),
      )
      rightStroke.setAttribute(
        'position',
        new THREE.BufferAttribute(strokePositions(rightPts, half, 0.05), 3),
      )
      leftStroke.deleteAttribute('color')
      rightStroke.deleteAttribute('color')
    }
    leftStroke.computeBoundingSphere()
    rightStroke.computeBoundingSphere()

    const a0 = side.left[0]
    const b0 = side.right[0]
    if (a0 && b0) {
      const checker = checkeredSegmentPositions(a0, b0, half, 0.08)
      startLine.setAttribute(
        'position',
        new THREE.BufferAttribute(checker.positions, 3),
      )
      startLine.setAttribute(
        'color',
        new THREE.BufferAttribute(checker.colors, 3),
      )
      startLine.computeBoundingSphere()
    }

    if (layer === 'sections') {
      const cuts = zones
        .slice(0, activeSections.current)
        .map((z) => z.to)
        .filter((t) => t > 1e-4 && t < 1 - 1e-4)
      const n = Math.min(cuts.length, MAX_SECTIONS)
      for (let i = 0; i < n; i++) {
        const t = cuts[i]!
        const a = edgeAt(side.left, t) as Xy
        const b = edgeAt(side.right, t) as Xy
        sectionLines[i]!.setAttribute(
          'position',
          new THREE.BufferAttribute(segmentPositions(a, b, half, 0.08), 3),
        )
        sectionLines[i]!.computeBoundingSphere()
      }
    }

    strokeZoom.current = zoom
  })

  const sectionCount = Math.min(zones.length, MAX_SECTIONS)
  const asphalt = light ? ROAD_LIGHT : ROAD
  const stroke = light ? STROKE_LIGHT : STROKE
  const strokeMode =
    layer === 'heatmap' && !heatUsesAlpha(palette, traces) ? 'c' : 's'
  const showHeat = layer === 'heatmap'
  const showSections = layer === 'sections'
  const alphaHeat = heatUsesAlpha(palette, traces)

  return (
    <group>
      <mesh
        geometry={fill}
        frustumCulled={false}
        renderOrder={9}
        visible={!showHeat || alphaHeat}
      >
        <meshBasicMaterial
          color={asphalt}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {zones.slice(0, sectionCount).map((z, i) => (
        <mesh
          key={z.id}
          geometry={sectionFills[i]}
          frustumCulled={false}
          renderOrder={10}
          visible={showSections}
        >
          <meshBasicMaterial
            color={z.color}
            side={THREE.DoubleSide}
            toneMapped={false}
            transparent
            opacity={SECTION_TINT}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ))}
      <mesh
        geometry={heat}
        frustumCulled={false}
        renderOrder={10}
        visible={showHeat}
      >
        <meshBasicMaterial
          vertexColors
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <mesh
        key={`stroke-l-${strokeMode}`}
        geometry={leftStroke}
        frustumCulled={false}
        renderOrder={11}
      >
        <meshBasicMaterial
          {...(strokeMode === 'c' ? { vertexColors: true } : { color: stroke })}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <mesh
        key={`stroke-r-${strokeMode}`}
        geometry={rightStroke}
        frustumCulled={false}
        renderOrder={11}
      >
        <meshBasicMaterial
          {...(strokeMode === 'c' ? { vertexColors: true } : { color: stroke })}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <mesh geometry={startLine} frustumCulled={false} renderOrder={12}>
        <meshBasicMaterial
          vertexColors
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={START_OPACITY}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {sectionLines.map((g, i) =>
        i < Math.max(0, sectionCount - 1) ? (
          <mesh
            key={i}
            geometry={g}
            frustumCulled={false}
            renderOrder={12}
            visible={showSections}
          >
            <meshBasicMaterial
              color={stroke}
              side={THREE.DoubleSide}
              toneMapped={false}
              transparent
              opacity={0.85}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        ) : null,
      )}
    </group>
  )
})
