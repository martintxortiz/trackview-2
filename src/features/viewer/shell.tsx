'use client'

/**
 * Viewer scene shell — composes road, rig, racing lines, cars, and hover.
 * Playground/app store owns React state; this mounts R3F pieces only.
 * Full playground Canvas chrome stays on dashboard-canvas until U09.
 */
import { memo, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { PaletteId } from '@/track/colormaps'
import type { Track, Xy } from '@/track/frame'
import type { MetricId, MetricsSourceId } from '@/track/lap-metrics'
import type { SectionMapId, SectionZone } from '@/track/section-maps'
import { resampleTrack } from '@/track/smooth'
import {
  FILL_SPACING_M,
  type HeatPaint,
  type LayerId,
  type TrackHoverInfo,
  type View,
} from '@/features/viewer/contracts'
import { compensateViewRotate } from '@/features/viewer/math'
import {
  HoverMark,
  TrackHoverProbe,
  TrackHoverTip,
} from '@/features/viewer/hover-probe'
import { ItemCar } from '@/features/viewer/item-car'
import { RacingLine } from '@/features/viewer/racing-line'
import { Camera, Grid, SizeProbe } from '@/features/viewer/rig'
import { Road } from '@/features/viewer/road'

/** Same damping as the camera rig — spin eases toward its target every frame. */
const SPIN_SMOOTH = 14

/**
 * Live clockwise degrees on top of baked track geometry.
 * Current eases to target; camera pan compensates so the viewport center holds.
 */
function SpinLayer({
  spinTargetRef,
  spinCurrentRef,
  view,
  children,
}: {
  spinTargetRef: RefObject<number>
  spinCurrentRef: RefObject<number>
  view: RefObject<View>
  children: ReactNode
}) {
  const group = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const target = spinTargetRef.current
    let current = spinCurrentRef.current
    const k = 1 - Math.exp(-SPIN_SMOOTH * Math.min(dt, 0.05))
    const next = current + (target - current) * k
    const settled = Math.abs(target - next) < 0.01
    const applied = settled ? target : next
    const delta = applied - current
    spinCurrentRef.current = applied
    if (Math.abs(delta) > 1e-6) compensateViewRotate(view.current, delta)
    g.rotation.y = (-applied * Math.PI) / 180
  })
  return <group ref={group}>{children}</group>
}

export type ViewerItem = {
  id: string
  path: readonly Xy[]
  progress: number
  color: string
  /** When set, racing line dims behind this progress. */
  progressRef?: RefObject<number> | null
  faded?: boolean
}

export type ViewerSceneProps = {
  track: Track
  view: RefObject<View>
  layer: LayerId
  palette: PaletteId
  metric: MetricId
  traces: boolean
  sectionMap: SectionMapId
  zones: SectionZone[]
  heatPaintRef: RefObject<HeatPaint | null>
  metricsSource: MetricsSourceId
  invert: boolean
  light: boolean
  showOrigin: boolean
  gridDot: string
  items: readonly ViewerItem[]
  follow: { x: number; z: number } | null
  onZoom: (z: number) => void
  onFps?: (fps: number) => void
  sizeRef: RefObject<{ width: number; height: number }>
  onSize?: (width: number, height: number) => void
  hoverEnabled: boolean
  hoverInfo: TrackHoverInfo | null
  onHover: (info: TrackHoverInfo | null) => void
  hostW: number
  hostH: number
  /** Smoothed spin above baked catalog rotate (deg CW). */
  spinTargetRef?: RefObject<number>
  spinCurrentRef?: RefObject<number>
  children?: ReactNode
}

/** R3F scene graph for the track viewer (place inside a Canvas). */
export const ViewerScene = memo(function ViewerScene({
  track,
  view,
  layer,
  palette,
  metric,
  traces,
  sectionMap,
  zones,
  heatPaintRef,
  metricsSource,
  invert,
  light,
  showOrigin,
  gridDot,
  items,
  follow,
  onZoom,
  onFps,
  sizeRef,
  onSize,
  hoverEnabled,
  hoverInfo,
  onHover,
  spinTargetRef,
  spinCurrentRef,
  children,
}: Omit<ViewerSceneProps, 'hostW' | 'hostH'>) {
  const smooth = useMemo(() => resampleTrack(track, FILL_SPACING_M), [track])
  const trackLayer = (
    <>
      <Road
        track={track}
        view={view}
        layer={layer}
        palette={palette}
        metric={metric}
        traces={traces}
        sectionMap={sectionMap}
        zones={zones}
        heatPaintRef={heatPaintRef}
        metricsSource={metricsSource}
        invert={invert}
        light={light}
      />
      {items.map((item) => (
        <group key={item.id}>
          <RacingLine
            path={item.path}
            color={item.color}
            view={view}
            progressRef={item.progressRef ?? null}
            faded={item.faded ?? false}
          />
          <ItemCar
            path={item.path}
            progress={item.progress}
            color={item.color}
            view={view}
          />
        </group>
      ))}
      {hoverInfo ? (
        <HoverMark
          track={smooth}
          t={hoverInfo.t}
          color={hoverInfo.color}
          view={view}
        />
      ) : null}
      <TrackHoverProbe
        enabled={hoverEnabled}
        track={track}
        view={view}
        layer={layer}
        palette={palette}
        metric={metric}
        traces={traces}
        zones={zones}
        heatPaintRef={heatPaintRef}
        metricsSource={metricsSource}
        invert={invert}
        light={light}
        onHover={onHover}
        spinCurrentRef={spinCurrentRef}
      />
      {children}
    </>
  )
  return (
    <>
      <SizeProbe sizeRef={sizeRef} onSize={onSize} />
      <Camera view={view} onZoom={onZoom} onFps={onFps} follow={follow} />
      <Grid showOrigin={showOrigin} view={view} dot={gridDot} />
      {spinTargetRef && spinCurrentRef ? (
        <SpinLayer
          spinTargetRef={spinTargetRef}
          spinCurrentRef={spinCurrentRef}
          view={view}
        >
          {trackLayer}
        </SpinLayer>
      ) : (
        trackLayer
      )}
    </>
  )
})

/** DOM overlay tip — sibling of Canvas, not inside R3F. */
export const ViewerHoverOverlay = memo(function ViewerHoverOverlay({
  info,
  hostW,
  hostH,
}: {
  info: TrackHoverInfo | null
  hostW: number
  hostH: number
}) {
  if (!info) return null
  return <TrackHoverTip info={info} hostW={hostW} hostH={hostH} />
})
