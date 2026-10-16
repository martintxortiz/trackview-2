'use client'

/**
 * Track hover — probe, tip, and cross-track mark.
 * Hit tests the resampled ring so tip colors match ribbon verts.
 */
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { PaletteId } from '@/track/colormaps'
import type { Track, Xy } from '@/track/frame'
import {
  formatMetricValue,
  lapMetrics,
  metricDisplayRange,
  metricUnit,
  sampleSeries,
  seriesFor,
  type MetricId,
  type MetricsSourceId,
} from '@/track/lap-metrics'
import type { SectionZone } from '@/track/section-maps'
import { edgeAt, segmentPositions, sidesOf } from '@/track/ribbon'
import { resampleTrack } from '@/track/smooth'
import {
  FILL_SPACING_M,
  type HeatPaint,
  type LayerId,
  type TrackHoverInfo,
  type View,
} from '@/features/viewer/contracts'
import {
  heatUsesAlpha,
  metricRgbaAt,
  rotateCw,
} from '@/features/viewer/math'

const ROAD = '#45454e'
const ROAD_LIGHT = '#5b5b64'
const SECTION_TINT = 0.8
const HOVER_PX = 2

const ROAD_LINEAR = /*#__PURE__*/ (() => {
  const c = new THREE.Color(ROAD)
  return { r: c.r, g: c.g, b: c.b }
})()

const ROAD_LIGHT_LINEAR = /*#__PURE__*/ (() => {
  const c = new THREE.Color(ROAD_LIGHT)
  return { r: c.r, g: c.g, b: c.b }
})()

function zoneAt(zones: readonly SectionZone[], t: number): SectionZone | null {
  const u = ((t % 1) + 1) % 1
  for (const z of zones) {
    if (u >= z.from && u < z.to) return z
  }
  return zones[zones.length - 1] ?? null
}

/** Nearest point on the closed centerline — segment-projected. */
export function nearestOnTrack(
  track: Track,
  wx: number,
  wy: number,
): { t: number; x: number; y: number; dist: number; halfW: number } | null {
  const samples = track.samples
  const n = samples.length
  if (n < 2) return null
  let bestD2 = Infinity
  let bestT = 0
  let bestX = 0
  let bestY = 0
  let bestHalf = 0
  for (let i = 0; i < n; i++) {
    const a = samples[i]!
    const b = samples[(i + 1) % n]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby
    const u =
      len2 > 0
        ? Math.max(0, Math.min(1, ((wx - a.x) * abx + (wy - a.y) * aby) / len2))
        : 0
    const px = a.x + abx * u
    const py = a.y + aby * u
    const dx = wx - px
    const dy = wy - py
    const d2 = dx * dx + dy * dy
    if (d2 >= bestD2) continue
    bestD2 = d2
    bestX = px
    bestY = py
    bestT = (i + u) / n
    const left = a.left + (b.left - a.left) * u
    const right = a.right + (b.right - a.right) * u
    bestHalf = Math.max(left, right)
  }
  return {
    t: bestT % 1,
    x: bestX,
    y: bestY,
    dist: Math.sqrt(bestD2),
    halfW: bestHalf,
  }
}

function trackSwatchCss(
  r: number,
  g: number,
  b: number,
  a = 1,
  overAsphalt = true,
  light = false,
): string {
  const base = light ? ROAD_LIGHT_LINEAR : ROAD_LINEAR
  const aa = overAsphalt ? Math.min(1, Math.max(0, a)) : 1
  const cr = r * aa + base.r * (1 - aa)
  const cg = g * aa + base.g * (1 - aa)
  const cb = b * aa + base.b * (1 - aa)
  return `#${new THREE.Color().setRGB(cr, cg, cb).getHexString()}`
}

export function hoverPayload(
  layer: LayerId,
  source: Track,
  smooth: Track,
  palette: PaletteId,
  metric: MetricId,
  zones: readonly SectionZone[],
  t: number,
  traces: boolean,
  heatPaint: HeatPaint | null,
  metricsSource: MetricsSourceId,
  invert: boolean,
  light = false,
): { color: string; label: string } {
  const asphalt = light ? ROAD_LIGHT : ROAD
  if (layer === 'sections') {
    const z = zoneAt(zones, t)
    if (!z) return { color: asphalt, label: 'Section' }
    const c = new THREE.Color(z.color)
    return {
      color: trackSwatchCss(c.r, c.g, c.b, SECTION_TINT, true, light),
      label: z.name,
    }
  }
  if (layer === 'heatmap') {
    const series = seriesFor(lapMetrics(source, metricsSource), metric)
    const { min, max } = metricDisplayRange(metric, series)
    const n = smooth.samples.length
    if (n < 2) return { color: asphalt, label: 'Track' }
    const u = ((t % 1) + 1) % 1
    const f = u * n
    const i0 = Math.floor(f) % n
    const i1 = (i0 + 1) % n
    const s = f - Math.floor(f)

    let r: number
    let g: number
    let b: number
    let a: number
    const overAsphalt = heatUsesAlpha(palette, traces)
    if (heatPaint && heatPaint.n === n) {
      const ch = heatPaint.channels
      const col = heatPaint.colors
      const o0 = i0 * ch
      const o1 = i1 * ch
      r = col[o0]! + (col[o1]! - col[o0]!) * s
      g = col[o0 + 1]! + (col[o1 + 1]! - col[o0 + 1]!) * s
      b = col[o0 + 2]! + (col[o1 + 2]! - col[o0 + 2]!) * s
      a =
        ch === 4
          ? col[o0 + 3]! + (col[o1 + 3]! - col[o0 + 3]!) * s
          : 1
    } else {
      const c0 = metricRgbaAt(
        series,
        min,
        max,
        palette,
        metric,
        traces,
        invert,
        (i0 + 0.5) / n,
      )
      const c1 = metricRgbaAt(
        series,
        min,
        max,
        palette,
        metric,
        traces,
        invert,
        (i1 + 0.5) / n,
      )
      r = c0[0] + (c1[0] - c0[0]) * s
      g = c0[1] + (c1[1] - c0[1]) * s
      b = c0[2] + (c1[2] - c0[2]) * s
      a = c0[3] + (c1[3] - c0[3]) * s
    }

    const v0 = sampleSeries(series, (i0 + 0.5) / n)
    const v1 = sampleSeries(series, (i1 + 0.5) / n)
    const v = v0 + (v1 - v0) * s
    const color = trackSwatchCss(r, g, b, a, overAsphalt, light)
    if (metric === 'pedals') {
      const side = v < -0.05 ? 'Brake' : v > 0.05 ? 'Throttle' : 'Coast'
      return { color, label: `${side} ${formatMetricValue(metric, v)}` }
    }
    const unit = metricUnit(metric)
    return { color, label: `${formatMetricValue(metric, v)} ${unit}` }
  }
  return { color: asphalt, label: 'Track' }
}

function useCrossLine(
  track: Track,
  t: number,
  view: RefObject<View>,
  widthPx: number,
) {
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  const sides = useMemo(() => sidesOf(track), [track])
  const stamp = useRef({ t: NaN, half: NaN })

  useFrame(() => {
    const zoom = Math.max(view.current.zoom, 1e-6)
    const half = widthPx / 2 / zoom
    const s = stamp.current
    if (s.t === t && Math.abs(s.half - half) / Math.max(half, 1e-9) < 0.02) {
      return
    }
    s.t = t
    s.half = half
    const a = edgeAt(sides.left as Xy[], t) as Xy
    const b = edgeAt(sides.right as Xy[], t) as Xy
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(segmentPositions(a, b, half, 0.16), 3),
    )
    geometry.computeBoundingSphere()
  })

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  return geometry
}

/** Cross-track hover mark — ~2 px screen width, contrast stroke. */
export const HoverMark = memo(function HoverMark({
  track,
  t,
  color,
  view,
}: {
  track: Track
  t: number
  color: string
  view: RefObject<View>
}) {
  const geometry = useCrossLine(track, t, view, HOVER_PX)
  const matColor = useMemo(() => {
    const c = new THREE.Color(color)
    const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
    return new THREE.Color(lum < 0.35 ? '#ffffff' : '#000000')
  }, [color])

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={14}>
      <meshBasicMaterial
        color={matColor}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
        opacity={0.92}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
})

/** Pointer → nearest point on the rendered ring; tip color matches ribbon verts. */
export const TrackHoverProbe = memo(function TrackHoverProbe({
  enabled,
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
  onHover,
  spinCurrentRef,
}: {
  enabled: boolean
  track: Track
  view: RefObject<View>
  layer: LayerId
  palette: PaletteId
  metric: MetricId
  traces: boolean
  zones: readonly SectionZone[]
  heatPaintRef: RefObject<HeatPaint | null>
  metricsSource: MetricsSourceId
  invert: boolean
  light: boolean
  onHover: (info: TrackHoverInfo | null) => void
  /** Live spin above baked geometry — inverse-applied for hit tests. */
  spinCurrentRef?: RefObject<number>
}) {
  const gl = useThree((s) => s.gl)
  const smooth = useMemo(() => resampleTrack(track, FILL_SPACING_M), [track])

  useEffect(() => {
    if (!enabled) {
      onHover(null)
      return
    }
    const el = gl.domElement.parentElement ?? gl.domElement

    const update = (e: PointerEvent) => {
      if (e.buttons !== 0) {
        onHover(null)
        return
      }
      if (e.target instanceof Element && e.target.closest('[data-debug]')) {
        onHover(null)
        return
      }
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const v = view.current
      const px = e.clientX - rect.left - rect.width / 2
      const py = e.clientY - rect.top - rect.height / 2
      const worldX = v.x + px / v.zoom
      const worldZ = v.z + py / v.zoom
      const spin = spinCurrentRef?.current ?? 0
      // Screen world is spun; mesh is baked — unspin for the hit test.
      const [planarX, planarY] = rotateCw(worldX, -worldZ, -spin)
      const hit = nearestOnTrack(smooth, planarX, planarY)
      if (!hit) {
        onHover(null)
        return
      }
      const pad = 10 / Math.max(v.zoom, 1e-6)
      if (hit.dist > hit.halfW + pad) {
        onHover(null)
        return
      }
      const [hx, hy] = rotateCw(hit.x, hit.y, spin)
      const sx = (hx - v.x) * v.zoom + rect.width / 2
      const sy = (-hy - v.z) * v.zoom + rect.height / 2
      const cursorSx = e.clientX - rect.left
      const cursorSy = e.clientY - rect.top
      const { color, label } = hoverPayload(
        layer,
        track,
        smooth,
        palette,
        metric,
        zones,
        hit.t,
        traces,
        heatPaintRef.current,
        metricsSource,
        invert,
        light,
      )
      onHover({
        t: hit.t,
        x: hit.x,
        y: hit.y,
        sx,
        sy,
        cursorSx,
        cursorSy,
        edgePx: hit.halfW * v.zoom,
        color,
        label,
      })
    }

    const clear = () => onHover(null)
    el.addEventListener('pointermove', update)
    el.addEventListener('pointerleave', clear)
    el.addEventListener('pointerdown', clear)
    return () => {
      el.removeEventListener('pointermove', update)
      el.removeEventListener('pointerleave', clear)
      el.removeEventListener('pointerdown', clear)
      onHover(null)
    }
  }, [
    enabled,
    gl,
    track,
    smooth,
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
    onHover,
    spinCurrentRef,
  ])

  return null
})

/** Floating tip beside the cursor — sticky flip at viewport edges. */
export const TrackHoverTip = memo(function TrackHoverTip({
  info,
  hostW,
  hostH,
}: {
  info: TrackHoverInfo
  hostW: number
  hostH: number
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ w: 96, h: 28 })
  const sideRef = useRef<'right' | 'left'>('right')
  const placeRef = useRef({ hostW, hostH, info })
  useLayoutEffect(() => {
    placeRef.current = { hostW, hostH, info }
  }, [hostW, hostH, info])

  const placeTip = () => {
    const node = tipRef.current
    if (!node) return
    const { hostW: hw, hostH: hh, info: tip } = placeRef.current
    sizeRef.current = { w: node.offsetWidth, h: node.offsetHeight }
    const { w, h } = sizeRef.current
    const margin = 8
    const gap = 12
    const rightLeft = tip.cursorSx + gap
    const leftLeft = tip.cursorSx - gap - w
    const rightFits = rightLeft + w <= hw - margin
    const leftFits = leftLeft >= margin
    if (sideRef.current === 'right' && !rightFits && leftFits) {
      sideRef.current = 'left'
    } else if (sideRef.current === 'left' && !leftFits && rightFits) {
      sideRef.current = 'right'
    } else if (!rightFits && !leftFits) {
      sideRef.current = rightLeft < hw / 2 ? 'right' : 'left'
    }
    const left = Math.max(
      margin,
      Math.min(
        sideRef.current === 'right' ? rightLeft : leftLeft,
        Math.max(margin, hw - w - margin),
      ),
    )
    const top = Math.max(margin, Math.min(tip.cursorSy - h / 2, hh - h - margin))
    node.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }

  useLayoutEffect(() => {
    const node = tipRef.current
    if (!node) return
    placeTip()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(placeTip)
    observer.observe(node)
    return () => observer.disconnect()
  }, [info.label])

  useLayoutEffect(placeTip, [info, hostW, hostH])

  return (
    <div
      ref={tipRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 rounded-[4px] bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground shadow-[var(--shadow-floating)] will-change-transform"
    >
      <span
        className="size-2 shrink-0 rounded-[2px]"
        style={{ background: info.color }}
        aria-hidden
      />
      <span className="whitespace-nowrap text-foreground/80 tabular-nums">
        {info.label}
      </span>
    </div>
  )
})
