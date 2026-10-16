'use client'

/**
 * Playground shell — Canvas + ViewerScene + panels + hover overlay.
 * Not wired to /dashboard until U09; canvas remains the live runtime pin.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { Blocks } from 'loading-dev'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
  type MouseDebug,
  type View,
  type ViewerItem,
} from '@/features/viewer'
import { PlaygroundControls } from '@/features/playground/panels'
import {
  PlaygroundProvider,
  usePlayground,
  type Initial,
} from '@/features/playground/store'

const DOT = '#313138'
const DOT_LIGHT = '#cfceca'

/** Debug viewport / mouse probe — local to playground (not on viewer yet). */
const StateProbe = memo(function StateProbe({
  view,
  onViewport,
  onMouse,
}: {
  view: RefObject<View>
  onViewport: (x: number, y: number) => void
  onMouse: (m: MouseDebug | null) => void
}) {
  const gl = useThree((s) => s.gl)
  const lastView = useRef({ x: Infinity, y: Infinity })

  useFrame(() => {
    const v = view.current
    const x = Math.round(v.x * 10) / 10
    const y = Math.round(-v.z * 10) / 10
    const l = lastView.current
    if (x !== l.x || y !== l.y) {
      l.x = x
      l.y = y
      onViewport(x, y)
    }
  })

  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement
    let lastSent = ''
    const update = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-debug]')) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const v = view.current
      const px = e.clientX - rect.left - rect.width / 2
      const py = e.clientY - rect.top - rect.height / 2
      const rx = Math.round((v.x + px / v.zoom) * 10) / 10
      const ry = Math.round(-(v.z + py / v.zoom) * 10) / 10
      const sx = Math.round(e.clientX - rect.left)
      const sy = Math.round(e.clientY - rect.top)
      const key = `${sx},${sy},${rx},${ry}`
      if (key !== lastSent) {
        lastSent = key
        onMouse({ sx, sy, x: rx, y: ry })
      }
    }
    const clear = () => {
      if (lastSent === '__null__') return
      lastSent = '__null__'
      onMouse(null)
    }
    el.addEventListener('pointermove', update)
    el.addEventListener('pointerleave', clear)
    return () => {
      el.removeEventListener('pointermove', update)
      el.removeEventListener('pointerleave', clear)
    }
  }, [gl, view, onMouse])

  return null
})

function PlaygroundLoader() {
  const { state } = usePlayground()
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (state.isLoading) {
      setGone(false)
      return
    }
    const t = setTimeout(() => setGone(true), 600)
    return () => clearTimeout(t)
  }, [state.isLoading])

  if (gone) return null
  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center bg-background text-foreground transition-opacity duration-500 ${state.isLoading ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <Blocks size={24} className="opacity-40" />
    </div>
  )
}

function PlaygroundCanvas() {
  const { state, derived, dispatch } = usePlayground()
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const light = mounted && resolvedTheme === 'light'
  const dot = light ? DOT_LIGHT : DOT
  const { track, racePath, car2Path, follow, zones, view, sizeRef, heatPaintRef } =
    derived

  const onZoom = useCallback(
    (z: number) => dispatch({ type: 'setZoom', zoomAbs: z }),
    [dispatch],
  )
  const onFps = useCallback(
    (n: number) => dispatch({ type: 'setFps', fps: n }),
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
  const onViewport = useCallback(
    (x: number, y: number) => dispatch({ type: 'setViewport', x, y }),
    [dispatch],
  )
  const onMouse = useCallback(
    (mouse: MouseDebug | null) => dispatch({ type: 'setMouse', mouse }),
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
      <StateProbe view={view} onViewport={onViewport} onMouse={onMouse} />
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
        onFps={onFps}
        sizeRef={sizeRef}
        onSize={onSize}
        hoverEnabled={state.trackHover}
        hoverInfo={state.trackHover ? state.hoverInfo : null}
        onHover={onHover}
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
  )
}

function ShellBody({
  className,
  style,
  controls,
  children,
}: {
  className?: string
  style?: CSSProperties
  controls: boolean
  children?: ReactNode
}) {
  const { state } = usePlayground()
  return (
    <div className={className ?? 'absolute inset-0'} style={style}>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${state.isLoading ? 'opacity-0' : 'opacity-100'}`}
      >
        <PlaygroundCanvas />
      </div>
      {controls ? <PlaygroundControls /> : null}
      <ViewerHoverOverlay
        info={state.trackHover ? state.hoverInfo : null}
        hostW={state.hostSize.width}
        hostH={state.hostSize.height}
      />
      <PlaygroundLoader />
      {children}
    </div>
  )
}

/**
 * Drop-in playground shell. Fills its parent.
 * Route wiring (`/dashboard`) waits for U09.
 */
export function PlaygroundShell({
  className,
  style,
  controls = true,
  initial,
  children,
}: {
  className?: string
  style?: CSSProperties
  controls?: boolean
  initial?: Initial
  children?: ReactNode
}) {
  return (
    <PlaygroundProvider initial={initial}>
      <ShellBody className={className} style={style} controls={controls}>
        {children}
      </ShellBody>
    </PlaygroundProvider>
  )
}
