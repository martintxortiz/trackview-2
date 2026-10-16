'use client'

/**
 * Comparison viewer composition — Canvas + ViewerScene with route defaults.
 * controls={false} / car1Visible:false live on the shell + store initial.
 * Car 2 path is a lateral raceline offset (not telemetry lap b).
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { Canvas } from '@react-three/fiber'
import { useTheme } from 'next-themes'
import * as THREE from 'three'
import '@/lib/quiet-three-clock-warning'
import {
  RacingLine,
  ViewerHoverOverlay,
  ViewerScene,
  fitTrack,
  place,
  vClearAnchor,
  type ViewerItem,
} from '@/features/viewer'
import { useComparison } from '@/features/lap-comparison/store'

const DOT = '#313138'
const DOT_LIGHT = '#cfceca'

export function ComparisonScene() {
  const { state, derived, dispatch } = useComparison()
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const light = mounted && resolvedTheme === 'light'
  const dot = light ? DOT_LIGHT : DOT
  const {
    track,
    racePath,
    car2Path,
    follow,
    zones,
    view,
    sizeRef,
    heatPaintRef,
    spinTargetRef,
    spinCurrentRef,
  } = derived

  const onZoom = useCallback(
    (z: number) => dispatch({ type: 'setZoom', zoomAbs: z }),
    [dispatch],
  )
  const onSize = useCallback(
    (width: number, height: number) =>
      dispatch({ type: 'setHostSize', width, height }),
    [dispatch],
  )
  const onHover = useCallback(
    (info: typeof state.hoverInfo) => dispatch({ type: 'setHover', info }),
    [dispatch],
  )

  const carItems = useMemo<ViewerItem[]>(() => {
    const out: ViewerItem[] = []
    if (state.car1.visible) {
      out.push({
        id: 'car1',
        path: racePath,
        progress: state.car1.progress,
        color: state.car1.color,
        progressRef: derived.car1ProgressRef,
        faded: state.car1.faded,
      })
    }
    if (state.car2.visible) {
      out.push({
        id: 'car2',
        path: car2Path,
        progress: state.car2.progress,
        color: state.car2.color,
        progressRef: derived.car2ProgressRef,
        faded: state.car2.faded,
      })
    }
    return out
  }, [
    state.car1,
    state.car2,
    racePath,
    car2Path,
    derived.car1ProgressRef,
    derived.car2ProgressRef,
  ])

  return (
    <>
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
          sizeRef.current = size
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
        <ViewerScene
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
          showOrigin={state.showOrigin}
          gridDot={dot}
          items={carItems}
          follow={follow}
          onZoom={onZoom}
          sizeRef={sizeRef}
          onSize={onSize}
          hoverEnabled={state.trackHover}
          hoverInfo={state.trackHover ? state.hoverInfo : null}
          onHover={onHover}
          spinTargetRef={spinTargetRef}
          spinCurrentRef={spinCurrentRef}
        >
          {state.line1.visible ? (
            <RacingLine
              path={racePath}
              color={state.line1.color}
              view={view}
              progressRef={null}
              faded={false}
            />
          ) : null}
          {state.line2.visible ? (
            <RacingLine
              path={car2Path}
              color={state.line2.color}
              view={view}
              progressRef={null}
              faded={false}
            />
          ) : null}
        </ViewerScene>
      </Canvas>
      <ViewerHoverOverlay
        info={state.trackHover ? state.hoverInfo : null}
        hostW={state.hostSize.width}
        hostH={state.hostSize.height}
      />
    </>
  )
}
