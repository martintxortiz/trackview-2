'use client'

/**
 * Racing line — screen-weight ribbon above asphalt.
 * With dimming on, solid ahead of the car and dim behind it.
 */
import { memo, useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Xy } from '@/track/frame'
import { strokeHeatmap } from '@/track/ribbon'
import type { View } from '@/features/viewer/contracts'
import { ZOOM_IN, ZOOM_OUT } from '@/features/viewer/math'

const RACING_LINE_PX_OUT = 1.3
const RACING_LINE_PX_IN = 3.25
const LINE_SOLID_ALPHA = 0.95
const LINE_DIM_ALPHA = 0.22
const LINE_FADE_REACH = 0.035

function racingPx(zoom: number, fit: number): number {
  const rel = zoom / Math.max(fit, 1e-6)
  const t = THREE.MathUtils.smoothstep(rel, ZOOM_OUT, ZOOM_IN)
  return THREE.MathUtils.lerp(RACING_LINE_PX_OUT, RACING_LINE_PX_IN, t)
}

function lineAlpha(
  faded: boolean,
  anchored: boolean,
  progress: number,
  t: number,
): number {
  if (!faded) return LINE_SOLID_ALPHA
  if (!anchored) return LINE_DIM_ALPHA
  const p = Math.min(1, Math.max(0, progress))
  if (p <= 0 || t >= p) return LINE_SOLID_ALPHA
  const behind = p - t
  const reach = Math.min(LINE_FADE_REACH, p)
  const u = Math.min(1, behind / reach)
  const s = u * u * (3 - 2 * u)
  return THREE.MathUtils.lerp(LINE_SOLID_ALPHA, LINE_DIM_ALPHA, s)
}

export const RacingLine = memo(function RacingLine({
  path,
  color,
  view,
  progressRef,
  faded,
}: {
  path: readonly Xy[]
  color: string
  view: RefObject<View>
  progressRef: RefObject<number> | null
  faded: boolean
}) {
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  const stamp = useRef<{
    path: readonly Xy[] | null
    zoom: number
    color: string
    faded: boolean
    progress: number
  }>({
    path: null,
    zoom: NaN,
    color: '',
    faded: false,
    progress: NaN,
  })
  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  useFrame(() => {
    const zoom = Math.max(view.current.zoom, 1e-6)
    const s = stamp.current
    const p = progressRef ? progressRef.current : 0
    const structural =
      s.path !== path ||
      !Number.isFinite(s.zoom) ||
      Math.abs(s.zoom - zoom) / s.zoom >= 0.08 ||
      s.color !== color ||
      s.faded !== faded
    const moved =
      progressRef != null &&
      !Number.isNaN(s.progress) &&
      Math.abs(p - s.progress) > 1e-4
    if (!structural && !moved) return
    const c = new THREE.Color(color)
    const n = Math.max(path.length, 1)
    if (structural) {
      const half = racingPx(zoom, view.current.fit || zoom) / 2 / zoom
      const rgba = new Float32Array(path.length * 4)
      for (let i = 0; i < path.length; i++) {
        const a = lineAlpha(faded, progressRef != null, p, i / n)
        rgba[i * 4] = c.r
        rgba[i * 4 + 1] = c.g
        rgba[i * 4 + 2] = c.b
        rgba[i * 4 + 3] = a
      }
      const painted = strokeHeatmap(path, half, 0.12, rgba, true, 4)
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(painted.positions, 3),
      )
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(painted.colors, 4),
      )
      geometry.computeBoundingSphere()
      s.path = path
      s.zoom = zoom
      s.color = color
      s.faded = faded
      s.progress = p
      return
    }
    const attr = geometry.getAttribute('color') as
      | THREE.BufferAttribute
      | undefined
    const pos = geometry.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined
    if (!attr || !pos) return
    const arr = attr.array as Float32Array
    const segs = Math.floor(pos.count / 6)
    let o = 0
    for (let k = 0; k < segs; k++) {
      const i = k % n
      const j = (k + 1) % n
      const ai = lineAlpha(faded, true, p, i / n)
      const aj = lineAlpha(faded, true, p, j / n)
      const pushes = [ai, ai, aj, ai, aj, aj]
      for (const a of pushes) {
        arr[o] = c.r
        arr[o + 1] = c.g
        arr[o + 2] = c.b
        arr[o + 3] = a
        o += 4
      }
    }
    attr.needsUpdate = true
    s.progress = p
  })

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={13}>
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
  )
})
