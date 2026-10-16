'use client'

/* eslint-disable react-hooks/immutability, react-hooks/refs -- R3F imperative scene: stable refs mutated in onCreated/useFrame, same pattern as dashboard-canvas. */

import { useSyncExternalStore } from 'react'
import '@/lib/quiet-three-clock-warning'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from 'next-themes'
import {
  Camera,
  Grid,
  HoverMark,
  ItemCar,
  RacingLine,
  Road,
  SizeProbe,
  StateProbe,
  TrackHoverProbe,
  TrackHoverTip,
  fitTrack,
  place,
  type HeatPaint,
} from '@/components/dashboard-canvas'
import { useDashboard } from '@/components/dashboard/store'

const DOT = '#313138'
const DOT_LIGHT = '#cfceca'

function vClearAnchor(v: { ax: number | null; az: number | null }) {
  v.ax = null
  v.az = null
}

/**
 * Place-anywhere 3D scene. Renders the track canvas with cars, lines,
 * hover and grid. Needs a <DashboardProvider> above it.
 */
export function DashboardScene() {
  const { state, derived, actions } = useDashboard()
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const dot = mounted && resolvedTheme === 'light' ? DOT_LIGHT : DOT
  const light = mounted && resolvedTheme === 'light'
  const { track, smooth, racePath, car2Path, follow, zones, view } = derived
  const sizeRef = (derived as { sizeRef?: React.RefObject<{ width: number; height: number }> }).sizeRef
  const heatPaintRef = (
    derived as { heatPaintRef?: React.RefObject<HeatPaint | null> }
  ).heatPaintRef ?? { current: null }
  const car1ProgressRef = (
    derived as { car1ProgressRef?: React.RefObject<number> }
  ).car1ProgressRef ?? { current: state.car1.progress }
  const car2ProgressRef = (
    derived as { car2ProgressRef?: React.RefObject<number> }
  ).car2ProgressRef ?? { current: state.car2.progress }

  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      camera={{ position: [0, 800, 0], up: [0, 0, -1], zoom: 1, near: 1, far: 5000 }}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: false,
      }}
      style={{
        background: 'transparent',
        touchAction: 'none',
        cursor: state.hoverInfo ? 'crosshair' : 'grab',
      }}
      onCreated={({ gl, camera, size }) => {
        gl.setClearColor(0x000000, 0)
        gl.toneMapping = THREE.NoToneMapping
        gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        camera.up.set(0, 0, -1)
        camera.lookAt(0, 0, 0)
        if (sizeRef) sizeRef.current = size
        const z = fitTrack(track, size.width, size.height)
        if (Number.isFinite(z) && z > 0) {
          const v = view.current
          v.x = v.z = v.tx = v.tz = 0
          v.fit = z
          v.zoom = v.tZoom = z
          v.fly = null
          vClearAnchor(v)
        }
        place(camera as THREE.OrthographicCamera, view.current)
      }}
    >
      {sizeRef ? <SizeProbe sizeRef={sizeRef} onSize={actions.onSize} /> : null}
      <Camera view={view} onZoom={actions.onZoom} onFps={actions.onFps} follow={follow} />
      <StateProbe view={view} onViewport={actions.onViewport} onMouse={actions.onMouse} />
      <Grid showOrigin={state.showOrigin} view={view} dot={dot} />
      <Road
        track={track}
        view={view}
        layer={state.layer}
        palette={state.palette}
        metric={state.metric}
        traces={state.traces}
        sectionMap={state.sectionMap}
        zones={zones}
        heatPaintRef={heatPaintRef}
        metricsSource={state.metricsSource}
        invert={state.invert}
        light={light}
      />
      {state.car1.visible ? (
        <>
          <RacingLine
            path={racePath}
            color={state.car1.color}
            view={view}
            progressRef={car1ProgressRef}
            faded={state.car1.faded}
          />
          <ItemCar path={racePath} progress={state.car1.progress} color={state.car1.color} view={view} />
        </>
      ) : null}
      {state.car2.visible ? (
        <>
          <RacingLine
            path={car2Path}
            color={state.car2.color}
            view={view}
            progressRef={car2ProgressRef}
            faded={state.car2.faded}
          />
          <ItemCar path={car2Path} progress={state.car2.progress} color={state.car2.color} view={view} />
        </>
      ) : null}
      {state.line1.visible ? (
        <RacingLine path={racePath} color={state.line1.color} view={view} progressRef={null} faded={false} />
      ) : null}
      {state.line2.visible ? (
        <RacingLine path={car2Path} color={state.line2.color} view={view} progressRef={null} faded={false} />
      ) : null}
      <TrackHoverProbe
        enabled={state.trackHover}
        track={track}
        view={view}
        layer={state.layer}
        palette={state.palette}
        metric={state.metric}
        traces={state.traces}
        zones={zones}
        heatPaintRef={heatPaintRef}
        metricsSource={state.metricsSource}
        invert={state.invert}
        light={light}
        onHover={actions.onHover}
      />
      {state.trackHover && state.hoverInfo ? (
        <HoverMark track={smooth} t={state.hoverInfo.t} color={state.hoverInfo.color} view={view} />
      ) : null}
    </Canvas>
  )
}

/**
 * Floating hover tooltip. Place inside the same positioned parent as the scene.
 */
export function DashboardHoverTip() {
  const { state } = useDashboard()
  if (!state.trackHover || !state.hoverInfo) return null
  return (
    <TrackHoverTip
      info={state.hoverInfo}
      hostW={state.hostSize.width}
      hostH={state.hostSize.height}
    />
  )
}
