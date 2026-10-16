'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from 'next-themes'
import { useMapFocus } from '@/components/map-focus'
import { SECTORS } from '@/lib/telemetry'
import {
  boundsOf,
  samplePath,
  type Bounds,
  type Track,
  type Xy,
} from '@/track/frame'
import {
  ribbonPositions,
  segmentPositions,
  strokePositions,
  trackSides,
} from '@/track/ribbon'

export type TrackLine = {
  id: string
  points: readonly Xy[]
  color: string
}

const STAGE = '#080808'
const ROAD = '#3a3a3e'
const EDGE = '#a8a8b0'
/** Edge stroke in light mode — darker so it reads against the light stage. */
const EDGE_LIGHT = '#5f6065'
const TICK = '#7a7a80'
const HIGHLIGHT = '#349cff'

/** Screen pixels — constant width as the camera zooms. */
const LINE_PX = 1.75
const EDGE_PX = 1.5
const TICK_PX = 1
const TICK_LEN_PX = 8
/** Zoom relative to the fit-to-track level. */
const ZOOM_OUT = 0.35
const ZOOM_IN = 80

const DOTTED_STAGE =
  `radial-gradient(circle, color-mix(in srgb, white 8%, transparent) 1px, transparent 1px), ${STAGE}`
const DOTTED_STAGE_SIZE = '16px 16px'
/** Light stage — token-driven so it follows the theme without JS color math. */
const DOTTED_STAGE_LIGHT =
  `radial-gradient(circle, color-mix(in srgb, var(--foreground) 12%, transparent) 1px, transparent 1px), var(--background)`

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const hitA = new THREE.Vector3()
const hitB = new THREE.Vector3()

function groundAt(camera: THREE.Camera, ndcX: number, ndcY: number, out: THREE.Vector3) {
  pointer.set(ndcX, ndcY)
  raycaster.setFromCamera(pointer, camera)
  return raycaster.ray.intersectPlane(ground, out)
}

/** Soft pan limits — keep a sliver of the track on screen, never hard-center. */
function applyView(
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
  bounds: Bounds,
  size: { width: number; height: number },
) {
  const zoom = camera.zoom || 1
  const halfW = size.width / zoom / 2
  const halfH = size.height / zoom / 2
  const trackW = Math.max(bounds.maxX - bounds.minX, 1)
  const trackH = Math.max(bounds.maxY - bounds.minY, 1)
  const keep = 0.08

  let x = target.x
  let y = -target.z
  x = THREE.MathUtils.clamp(
    x,
    bounds.minX + trackW * keep - halfW,
    bounds.maxX - trackW * keep + halfW,
  )
  y = THREE.MathUtils.clamp(
    y,
    bounds.minY + trackH * keep - halfH,
    bounds.maxY - trackH * keep + halfH,
  )

  target.set(x, 0, -y)
  camera.position.set(x, 800, -y)
  camera.up.set(0, 0, -1)
  camera.lookAt(x, 0, -y)
}

function zoomRange(fit: number) {
  const floor = Math.max(fit, 1e-6)
  return { min: floor * ZOOM_OUT, max: floor * ZOOM_IN }
}

function StageColor() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => {
    scene.background = null
    gl.setClearColor(0x000000, 0)
  }, [gl, scene])
  return null
}

function Fit({
  bounds,
  target,
  fitZoom,
}: {
  bounds: Bounds
  target: RefObject<THREE.Vector3>
  fitZoom: RefObject<number>
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const { locked, toggle } = useMapFocus()
  const lockedRef = useRef(locked)
  const fitted = useRef(false)
  lockedRef.current = locked

  const width = size.width
  const height = size.height

  const fit = useMemo(() => {
    return () => {
      if (width < 2 || height < 2) return
      const spanX = Math.max(bounds.maxX - bounds.minX, 1)
      const spanY = Math.max(bounds.maxY - bounds.minY, 1)
      const zoom = Math.min(width / (spanX * 1.12), height / (spanY * 1.12))
      fitZoom.current = zoom
      camera.zoom = zoom
      camera.near = 1
      camera.far = 5000
      camera.updateProjectionMatrix()
      target.current.set(bounds.cx, 0, -bounds.cy)
      applyView(camera, target.current, bounds, { width, height })
      fitted.current = true
    }
  }, [bounds, camera, fitZoom, height, target, width])

  // First size / new track only — later resizes must not jump under the chrome.
  useLayoutEffect(() => {
    fitted.current = false
  }, [bounds])

  useLayoutEffect(() => {
    if (width < 2 || height < 2) return
    const spanX = Math.max(bounds.maxX - bounds.minX, 1)
    const spanY = Math.max(bounds.maxY - bounds.minY, 1)
    const floor = Math.min(width / (spanX * 1.12), height / (spanY * 1.12))
    fitZoom.current = floor
    if (!fitted.current) {
      fit()
      return
    }
    const { min, max } = zoomRange(floor)
    camera.zoom = THREE.MathUtils.clamp(camera.zoom, min, max)
    camera.updateProjectionMatrix()
    applyView(camera, target.current, bounds, { width, height })
  }, [bounds, camera, fit, fitZoom, height, target, width])

  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement
    const onDbl = (event: MouseEvent) => {
      event.preventDefault()
      if (lockedRef.current) {
        lockedRef.current = false
        toggle()
      }
      fit()
    }
    el.addEventListener('dblclick', onDbl)
    return () => el.removeEventListener('dblclick', onDbl)
  }, [fit, gl, toggle])

  return null
}

function ViewControl({
  bounds,
  target,
  fitZoom,
}: {
  bounds: Bounds
  target: RefObject<THREE.Vector3>
  fitZoom: RefObject<number>
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const { locked, toggle } = useMapFocus()
  const lockedRef = useRef(locked)
  const sizeRef = useRef(size)
  const draggingRef = useRef(false)
  lockedRef.current = locked
  sizeRef.current = size

  useEffect(() => {
    // Parent stage, not only the canvas — same hit target as the dotted backdrop.
    const el = gl.domElement.parentElement ?? gl.domElement
    let dragId: number | null = null
    let lastX = 0
    let lastY = 0

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1
      const before = groundAt(camera, ndcX, ndcY, hitA)
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
      // Normalize trackpads (small deltas) and mouse wheels (large spikes).
      const delta = THREE.MathUtils.clamp(event.deltaY * unit, -120, 120)
      const { min, max } = zoomRange(fitZoom.current || camera.zoom)
      const next = THREE.MathUtils.clamp(
        camera.zoom * Math.exp(-delta * 0.0022),
        min,
        max,
      )
      if (Math.abs(next - camera.zoom) < 1e-6) return
      camera.zoom = next
      camera.updateProjectionMatrix()
      if (!lockedRef.current && before) {
        const after = groundAt(camera, ndcX, ndcY, hitB)
        if (after) {
          target.current.x += before.x - after.x
          target.current.z += before.z - after.z
        }
      }
      if (!lockedRef.current) applyView(camera, target.current, bounds, sizeRef.current)
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      // Ignore presses that started on overlaid chrome.
      if (event.target instanceof Element && event.target.closest('[data-tv-chrome]')) return
      event.preventDefault()
      dragId = event.pointerId
      draggingRef.current = true
      lastX = event.clientX
      lastY = event.clientY
      el.setPointerCapture(event.pointerId)
      el.style.cursor = 'grabbing'
      if (lockedRef.current) {
        lockedRef.current = false
        toggle()
      }
    }

    const onMove = (event: PointerEvent) => {
      if (dragId == null || event.pointerId !== dragId) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      if (dx === 0 && dy === 0) return
      const zoom = camera.zoom || 1
      target.current.x -= dx / zoom
      target.current.z -= dy / zoom
      applyView(camera, target.current, bounds, sizeRef.current)
    }

    const endDrag = (event: PointerEvent) => {
      if (dragId == null || event.pointerId !== dragId) return
      dragId = null
      draggingRef.current = false
      el.style.cursor = 'grab'
      try {
        el.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
    }

    el.style.cursor = 'grab'
    el.style.touchAction = 'none'
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('lostpointercapture', endDrag)
    return () => {
      el.style.cursor = ''
      el.style.touchAction = ''
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('lostpointercapture', endDrag)
    }
  }, [bounds, camera, fitZoom, gl, target, toggle])

  useFrame(() => {
    // Skip while dragging — handlers already placed the camera.
    if (draggingRef.current) return
    applyView(camera, target.current, bounds, sizeRef.current)
  })

  return null
}

/** World-space ribbon kept at a constant pixel width as the camera zooms. */
function PixelStroke({
  points,
  px,
  color,
  up,
}: {
  points: readonly Xy[]
  px: number
  color: string
  up: number
}) {
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ camera }) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1
    const prev = geometry.userData.zoom as number | undefined
    if (prev != null && Math.abs(prev - zoom) / prev < 0.01) return
    const half = px / 2 / zoom
    const pos = strokePositions(points, half, up)
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.computeBoundingSphere()
    geometry.userData.zoom = zoom
  })

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial color={color} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function SectorTicks({ points }: { points: readonly Xy[] }) {
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ camera }) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1
    const prev = geometry.userData.zoom as number | undefined
    if (prev != null && Math.abs(prev - zoom) / prev < 0.01) return
    const half = TICK_LEN_PX / 2 / zoom
    const thick = TICK_PX / 2 / zoom
    const total = SECTORS.reduce((sum, sector) => sum + sector.flex, 0)
    let acc = 0
    const parts: Float32Array[] = []
    for (let i = 0; i < SECTORS.length - 1; i++) {
      acc += SECTORS[i]!.flex / total
      const pose = samplePath(points, acc)
      const nx = -Math.sin(pose.heading)
      const ny = Math.cos(pose.heading)
      parts.push(
        segmentPositions(
          [pose.x - nx * half, pose.y - ny * half],
          [pose.x + nx * half, pose.y + ny * half],
          thick,
          0.1,
        ),
      )
    }
    const count = parts.reduce((sum, part) => sum + part.length, 0)
    const merged = new Float32Array(count)
    let offset = 0
    for (const part of parts) {
      merged.set(part, offset)
      offset += part.length
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(merged, 3))
    geometry.computeBoundingSphere()
    geometry.userData.zoom = zoom
  })

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial color={TICK} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function Road({ track }: { track: Track }) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(ribbonPositions(track), 3))
    geom.computeBoundingSphere()
    return geom
  }, [track])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial color={ROAD} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function RoadEdges({ track, color }: { track: Track; color: string }) {
  const { left, right } = useMemo(() => trackSides(track), [track])
  return (
    <>
      <PixelStroke points={left} px={EDGE_PX} color={color} up={0.08} />
      <PixelStroke points={right} px={EDGE_PX} color={color} up={0.08} />
    </>
  )
}

function TrackLines({ track, lines, edge }: { track: Track; lines: readonly TrackLine[]; edge: string }) {
  const samples = useMemo(
    () => track.samples.map((sample) => [sample.x, sample.y] as const),
    [track],
  )

  return (
    <>
      <Road track={track} />
      <RoadEdges track={track} color={edge} />
      {lines.map((line) => (
        <PixelStroke
          key={line.id}
          points={line.points}
          px={LINE_PX}
          color={line.color || HIGHLIGHT}
          up={0.16}
        />
      ))}
      <SectorTicks points={samples} />
    </>
  )
}

export function TrackCanvas({
  track,
  lines,
}: {
  track: Track
  lines: readonly TrackLine[]
}) {
  const fitZoom = useRef(1)
  const bounds = useMemo(() => boundsOf(track.samples), [track])
  const target = useRef(new THREE.Vector3(bounds.cx, 0, -bounds.cy))
  const { resolvedTheme } = useTheme()
  // False during SSR/hydration — same client-only pattern as TimelineScrubber.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  // Default theme is dark — match it pre-hydration to avoid a flash.
  const light = mounted && resolvedTheme === 'light'

  return (
    <div
      className="absolute inset-0"
      style={{
        background: light ? DOTTED_STAGE_LIGHT : DOTTED_STAGE,
        backgroundSize: DOTTED_STAGE_SIZE,
      }}
    >
      <Canvas
        orthographic
        camera={{
          position: [bounds.cx, 800, -bounds.cy],
          up: [0, 0, -1],
          zoom: 1,
          near: 1,
          far: 5000,
        }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', inset: 0, background: 'transparent', touchAction: 'none', cursor: 'grab' }}
        onCreated={({ camera, gl }) => {
          camera.up.set(0, 0, -1)
          camera.lookAt(bounds.cx, 0, -bounds.cy)
          gl.setClearColor(0x000000, 0)
        }}
      >
        <StageColor />
        <Fit bounds={bounds} target={target} fitZoom={fitZoom} />
        <ViewControl bounds={bounds} target={target} fitZoom={fitZoom} />
        <TrackLines track={track} lines={lines} edge={light ? EDGE_LIGHT : EDGE} />
      </Canvas>
    </div>
  )
}
