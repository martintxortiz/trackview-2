'use client'

/**
 * Camera + grid + size probe — the non-road scene rig.
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
import { toScene } from '@/track/frame'
import type { MouseDebug, View } from '@/features/viewer/contracts'
import {
  place,
  vClearAnchor,
  ZOOM_IN,
  ZOOM_IN_FOCUSED,
  ZOOM_OUT,
} from '@/features/viewer/math'

const DOT_OPACITY = 0.5
const ORIGIN = '#ff0000'
const STEP_PX = 32
const MAX_DOTS = 16_384
const SMOOTH = 14
const FLY_S = 0.9

function softDot(): THREE.DataTexture {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  const mid = (n - 1) / 2
  const inner = mid - 1.25
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - mid, y - mid)
      let a = 0
      if (d <= inner) a = 255
      else if (d < mid) a = Math.round(((mid - d) / (mid - inner)) * 255)
      const i = (y * n + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = a
    }
  }
  const tex = new THREE.DataTexture(data, n, n)
  tex.needsUpdate = true
  tex.magFilter = tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return tex
}

const DOT_MAP = softDot()

function spacingFor(zoom: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(STEP_PX / zoom, 1e-6)))
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export const Grid = memo(function Grid({
  showOrigin,
  view,
  dot,
}: {
  showOrigin: boolean
  view: RefObject<View>
  dot: string
}) {
  const { width, height } = useThree((s) => s.size)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const attr = new THREE.BufferAttribute(new Float32Array(MAX_DOTS * 3), 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', attr)
    g.setDrawRange(0, 0)
    return g
  }, [])
  const origin = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(toScene(0, 0)), 3),
    )
    return g
  }, [])
  const stamp = useRef({ x: NaN, z: NaN, step: NaN, w: 0, h: 0 })

  useEffect(
    () => () => {
      geometry.dispose()
      origin.dispose()
    },
    [geometry, origin],
  )

  useFrame(() => {
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = attr.array as Float32Array
    const v = view.current
    if (width < 2 || height < 2) return
    const zoom = v.zoom
    if (!Number.isFinite(zoom) || zoom <= 0) return
    let step = spacingFor(zoom)
    if (!Number.isFinite(step) || step <= 0) return
    const pad = step * 2
    const prev = stamp.current
    if (
      step === prev.step &&
      width === prev.w &&
      height === prev.h &&
      Math.abs(v.x - prev.x) < pad &&
      Math.abs(v.z - prev.z) < pad
    ) {
      return
    }

    const margin = step * 4
    const halfW = width / zoom / 2 + margin
    const halfH = height / zoom / 2 + margin
    if (!Number.isFinite(halfW) || !Number.isFinite(halfH)) return
    for (let guard = 0; guard < 8; guard++) {
      const nx = Math.floor((2 * halfW) / step) + 1
      const ny = Math.floor((2 * halfH) / step) + 1
      if (nx * ny <= MAX_DOTS) break
      step *= 2
    }
    const x0 = Math.floor((v.x - halfW) / step) * step
    const x1 = Math.ceil((v.x + halfW) / step) * step
    const n0 = Math.floor((-v.z - halfH) / step) * step
    const n1 = Math.ceil((-v.z + halfH) / step) * step

    let i = 0
    for (let n = n0; n <= n1 && i < MAX_DOTS; n += step) {
      for (let e = x0; e <= x1 && i < MAX_DOTS; e += step) {
        if (e === 0 && n === 0) continue
        const [x, y, z] = toScene(e, n)
        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
        i++
      }
    }

    attr.needsUpdate = true
    geometry.setDrawRange(0, i)
    geometry.computeBoundingSphere()
    stamp.current = { x: v.x, z: v.z, step, w: width, h: height }
  })

  return (
    <group>
      <points geometry={geometry} frustumCulled={false} renderOrder={0}>
        <pointsMaterial
          map={DOT_MAP}
          color={dot}
          opacity={DOT_OPACITY}
          transparent
          size={3}
          sizeAttenuation={false}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </points>
      {showOrigin ? (
        <points geometry={origin} frustumCulled={false} renderOrder={12}>
          <pointsMaterial
            map={DOT_MAP}
            color={ORIGIN}
            transparent
            size={8}
            sizeAttenuation={false}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </points>
      ) : null}
    </group>
  )
})

export const Camera = memo(function Camera({
  view,
  onZoom,
  onFps,
  follow,
}: {
  view: RefObject<View>
  onZoom: (z: number) => void
  onFps?: (fps: number) => void
  follow: { x: number; z: number } | null
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const gl = useThree((s) => s.gl)
  const lastShown = useRef(1)
  const fpsAcc = useRef({ frames: 0, time: 0, last: 0 })
  const followRef = useRef(follow)
  useLayoutEffect(() => {
    followRef.current = follow
  }, [follow])

  /* eslint-disable react-hooks/immutability -- imperative R3F view/DOM */
  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement
    let drag: number | null = null
    let lx = 0
    let ly = 0

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const v = view.current
      v.fly = null
      const f = followRef.current
      if (f) {
        v.ax = f.x
        v.az = f.z
        v.apx = 0
        v.apy = 0
      } else {
        const px = e.clientX - rect.left - rect.width / 2
        const py = e.clientY - rect.top - rect.height / 2
        v.ax = v.x + px / v.zoom
        v.az = v.z + py / v.zoom
        v.apx = px
        v.apy = py
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      const delta = THREE.MathUtils.clamp(e.deltaY * unit, -120, 120)
      const fit = v.fit || v.zoom
      const maxIn = f ? ZOOM_IN_FOCUSED : ZOOM_IN
      const lo = Math.max(fit * ZOOM_OUT, 1e-6)
      const hi = Math.max(fit * maxIn, lo * 2)
      v.tZoom = THREE.MathUtils.clamp(
        v.tZoom * Math.exp(-delta * 0.0022),
        lo,
        hi,
      )
    }

    const onDown = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        (e.target instanceof Element && e.target.closest('[data-debug]'))
      )
        return
      if (followRef.current) return
      e.preventDefault()
      drag = e.pointerId
      lx = e.clientX
      ly = e.clientY
      vClearAnchor(view.current)
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }

    const onMove = (e: PointerEvent) => {
      if (drag == null || e.pointerId !== drag) return
      const v = view.current
      v.tx -= (e.clientX - lx) / v.zoom
      v.tz -= (e.clientY - ly) / v.zoom
      lx = e.clientX
      ly = e.clientY
      vClearAnchor(v)
    }

    const onUp = (e: PointerEvent) => {
      if (drag == null || e.pointerId !== drag) return
      drag = null
      el.style.cursor = ''
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* released */
      }
    }

    el.style.touchAction = 'none'
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.style.cursor = ''
      el.style.touchAction = ''
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [gl, view])

  useFrame((_, dt) => {
    if (onFps && dt > 0 && dt <= 0.25) {
      const a = fpsAcc.current
      a.frames++
      a.time += dt
      if (a.time >= 0.5) {
        const next = Math.round(a.frames / a.time)
        if (next !== a.last) {
          a.last = next
          onFps(next)
        }
        a.frames = 0
        a.time = 0
      }
    }
    const v = view.current
    const k = 1 - Math.exp(-SMOOTH * Math.min(dt, 0.05))

    if (v.fly) {
      const fly = v.fly
      fly.t += Math.min(dt, 0.05) / fly.dur
      const tt = Math.min(1, fly.t)
      const e = easeInOutCubic(tt)
      v.x = v.tx = fly.sx + (fly.ex - fly.sx) * e
      v.z = v.tz = fly.sz + (fly.ez - fly.sz) * e
      v.zoom = v.tZoom =
        fly.szoom * Math.pow(fly.ezoom / Math.max(fly.szoom, 1e-6), e)
      vClearAnchor(v)
      if (tt >= 1) v.fly = null
    } else {
      v.zoom += (v.tZoom - v.zoom) * k
      if (follow) {
        v.tx = follow.x
        v.tz = follow.z
      }
      if (v.ax != null && v.az != null) {
        v.x = v.ax - v.apx / v.zoom
        v.z = v.az - v.apy / v.zoom
        v.tx = v.x
        v.tz = v.z
        if (Math.abs(v.tZoom - v.zoom) < 1e-4) {
          v.zoom = v.tZoom
          vClearAnchor(v)
        }
      } else {
        v.x += (v.tx - v.x) * k
        v.z += (v.tz - v.z) * k
      }
    }

    place(camera, v)
    const shown = Math.round(v.zoom * 20) / 20
    if (shown !== lastShown.current) {
      lastShown.current = shown
      onZoom(shown)
    }
  })
  /* eslint-enable react-hooks/immutability */

  return null
})

export const SizeProbe = memo(function SizeProbe({
  sizeRef,
  onSize,
}: {
  sizeRef: RefObject<{ width: number; height: number }>
  onSize?: (width: number, height: number) => void
}) {
  const size = useThree((s) => s.size)
  const onSizeRef = useRef(onSize)
  useLayoutEffect(() => {
    onSizeRef.current = onSize
    sizeRef.current = size
    onSizeRef.current?.(size.width, size.height)
  }, [size, sizeRef, onSize])
  return null
})

export { FLY_S }
export type { MouseDebug }
