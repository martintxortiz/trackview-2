'use client'

/**
 * Item marker (car) — cursor-up glyph on a path at lap progress `t`.
 */
import { memo, useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Xy } from '@/track/frame'
import type { View } from '@/features/viewer/contracts'
import { poseOnPath } from '@/features/viewer/math'

/** Dark halo around the car glyph so it reads on bright sections and heat. */
const CAR_HALO = '#101014'
/** Car length in world meters. */
const CAR_LENGTH_M = 9
/** Overview floor so the car stays readable when zoomed out. */
const CAR_MIN_PX = 24
const CAR_CURSOR_PATH =
  'M19.87,19.21l-6-15.92a2,2,0,0,0-3.74,0l-6,15.92a2,2,0,0,0,.65,2.3A2.21,2.21,0,0,0,6.17,22a2.24,2.24,0,0,0,1.23-.37L12,18.57l4.6,3.06a2.22,2.22,0,0,0,2.62-.12A2,2,0,0,0,19.87,19.21Z'

function carTexture(fill: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const path = new Path2D(CAR_CURSOR_PATH)
  ctx.translate(size / 2, size / 2)
  ctx.scale(size / 32, size / 32)
  ctx.translate(-12, -12)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = CAR_HALO
  ctx.lineWidth = 2.5
  ctx.stroke(path)
  ctx.fillStyle = fill
  ctx.fill(path)
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 1
  ctx.stroke(path)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

export const ItemCar = memo(function ItemCar({
  path,
  progress,
  color,
  view,
}: {
  path: readonly Xy[]
  progress: number
  color: string
  view: RefObject<View>
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const texture = useMemo(() => carTexture(color), [color])
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useEffect(
    () => () => {
      texture.dispose()
      geometry.dispose()
    },
    [geometry, texture],
  )

  useFrame(() => {
    const current = mesh.current
    if (!current) return
    const pose = poseOnPath(path, progress)
    const zoom = Math.max(view.current.zoom, 1e-6)
    current.position.set(pose.x, 1, -pose.y)
    current.rotation.order = 'YXZ'
    current.rotation.y = pose.heading - Math.PI / 2
    current.rotation.x = -Math.PI / 2
    const px = Math.max(CAR_LENGTH_M * zoom, CAR_MIN_PX)
    current.scale.setScalar(px / zoom)
  })

  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={15}>
      <meshBasicMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </mesh>
  )
})
