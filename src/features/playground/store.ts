'use client'

/**
 * Playground state machine — pure reducer + selectors + React provider.
 * Geometry lives in viewer helpers / track loaders; this file owns UI state only.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { listTrackIds, raceLineFor, trackById } from '@/track/catalog'
import type { PaletteId } from '@/track/colormaps'
import { HEATMAP_PRESETS, recommendedPalette } from '@/track/heatmap-presets'
import { lapMetrics, type MetricId, type MetricsSourceId } from '@/track/lap-metrics'
import { offsetPolyline } from '@/track/ribbon'
import {
  resolveSectionMap,
  type SectionMapId,
  type SectionZone,
} from '@/track/section-maps'
import { resampleTrack } from '@/track/smooth'
import type { Track, Xy } from '@/track/frame'
import {
  FILL_SPACING_M,
  FLY_S,
  ZOOM_IN,
  ZOOM_IN_FOCUSED,
  centerTrack,
  fitTrack,
  newView,
  orientRacePoints,
  orientTrack,
  orientationFor,
  poseOnPath,
  vClearAnchor,
  type FocusTarget,
  type HeatPaint,
  type LayerId,
  type MouseDebug,
  type RotateDeg,
  type TrackHoverInfo,
  type TrackOrientation,
  type View,
} from '@/features/viewer'

const CAR2_LATERAL_M = 1.5
const FOCUS_ZOOM = 8
const ITEM_DEFAULT_COLOR = '#ffea00'
const LOAD_MS = 500
const DEFAULT_TRACK_ID = listTrackIds()[0] ?? 'spa'

export type CarSlot = {
  color: string
  progress: number
  visible: boolean
  faded: boolean
}

export type LineSlot = {
  color: string
  visible: boolean
}

export type State = {
  trackId: string
  isLoading: boolean
  rotate: RotateDeg
  flipH: boolean
  flipV: boolean
  layer: LayerId
  palette: PaletteId
  metric: MetricId
  traces: boolean
  invert: boolean
  metricsSource: MetricsSourceId
  sectionMap: SectionMapId
  focus: FocusTarget
  showOrigin: boolean
  trackHover: boolean
  hoverInfo: TrackHoverInfo | null
  zoomFactor: number
  zoomAbs: number
  fps: number
  viewport: { x: number; y: number }
  mouse: MouseDebug | null
  hostSize: { width: number; height: number }
  car1: CarSlot
  car2: CarSlot
  line1: LineSlot
  line2: LineSlot
}

export type Initial = {
  car1Visible?: boolean
  car2Visible?: boolean
  line1Visible?: boolean
  line2Visible?: boolean
  loading?: boolean
  trackId?: string
}

export type Action =
  | { type: 'setTrack'; trackId: string }
  | { type: 'setRotate'; rotate: RotateDeg }
  | { type: 'toggleFlipH' }
  | { type: 'toggleFlipV' }
  | { type: 'setLayer'; layer: LayerId }
  | { type: 'setPalette'; palette: PaletteId }
  | { type: 'setMetric'; metric: MetricId }
  | { type: 'setPreset'; presetId: string }
  | { type: 'setSectionMap'; sectionMap: SectionMapId }
  | { type: 'setFocus'; focus: FocusTarget }
  | { type: 'toggleOrigin' }
  | { type: 'toggleHover' }
  | { type: 'toggleTraces' }
  | { type: 'toggleInvert' }
  | { type: 'setCar1Color'; color: string }
  | { type: 'setCar1Progress'; progress: number }
  | { type: 'toggleCar1Visible' }
  | { type: 'toggleCar1Faded' }
  | { type: 'setCar2Color'; color: string }
  | { type: 'setCar2Progress'; progress: number }
  | { type: 'toggleCar2Visible' }
  | { type: 'toggleCar2Faded' }
  | { type: 'setLine1Color'; color: string }
  | { type: 'toggleLine1Visible' }
  | { type: 'setLine2Color'; color: string }
  | { type: 'toggleLine2Visible' }
  | { type: 'setZoom'; zoomAbs: number }
  | { type: 'setFps'; fps: number }
  | { type: 'setViewport'; x: number; y: number }
  | { type: 'setMouse'; mouse: MouseDebug | null }
  | { type: 'setHostSize'; width: number; height: number }
  | { type: 'setHover'; info: TrackHoverInfo | null }
  | { type: 'setLoading'; isLoading: boolean }
  | { type: 'setZoomFactor'; zoomFactor: number }

function clampProgress(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function hoverReset(state: State): State {
  return state.hoverInfo === null ? state : { ...state, hoverInfo: null }
}

export function createInitialState(initial?: Initial): State {
  const trackId =
    initial?.trackId && trackById(initial.trackId) ? initial.trackId : DEFAULT_TRACK_ID
  const o = orientationFor(trackId)
  return {
    trackId,
    isLoading: initial?.loading ?? false,
    rotate: o.rotate,
    flipH: o.flipH,
    flipV: o.flipV,
    layer: 'normal',
    palette: recommendedPalette('speed'),
    metric: 'speed',
    traces: false,
    invert: true,
    metricsSource: 'auto',
    sectionMap: 'sectors',
    focus: 'free',
    showOrigin: false,
    trackHover: true,
    hoverInfo: null,
    zoomFactor: 1,
    zoomAbs: 1,
    fps: 0,
    viewport: { x: 0, y: 0 },
    mouse: null,
    hostSize: { width: 1, height: 1 },
    car1: {
      color: ITEM_DEFAULT_COLOR,
      progress: 0,
      visible: initial?.car1Visible ?? true,
      faded: true,
    },
    car2: {
      color: '#ff3df0',
      progress: 0.5,
      visible: initial?.car2Visible ?? false,
      faded: true,
    },
    line1: { color: '#a78bfa', visible: initial?.line1Visible ?? false },
    line2: { color: '#fbbf24', visible: initial?.line2Visible ?? false },
  }
}

/** Pure playground reducer — no geometry, no refs, no React. */
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setTrack': {
      if (!trackById(action.trackId)) return state
      const o = orientationFor(action.trackId)
      return hoverReset({
        ...state,
        trackId: action.trackId,
        rotate: o.rotate,
        flipH: o.flipH,
        flipV: o.flipV,
      })
    }
    case 'setRotate':
      return hoverReset({ ...state, rotate: action.rotate })
    case 'toggleFlipH':
      return hoverReset({ ...state, flipH: !state.flipH })
    case 'toggleFlipV':
      return hoverReset({ ...state, flipV: !state.flipV })
    case 'setLayer':
      return hoverReset({ ...state, layer: action.layer })
    case 'setPalette':
      return hoverReset({ ...state, palette: action.palette })
    case 'setMetric':
      return hoverReset({ ...state, metric: action.metric })
    case 'setPreset': {
      const preset = HEATMAP_PRESETS.find((p) => p.id === action.presetId)
      if (!preset) return state
      return hoverReset({
        ...state,
        metric: preset.metric,
        palette: preset.palette,
      })
    }
    case 'setSectionMap':
      return hoverReset({ ...state, sectionMap: action.sectionMap })
    case 'setFocus':
      return { ...state, focus: action.focus }
    case 'toggleOrigin':
      return { ...state, showOrigin: !state.showOrigin }
    case 'toggleHover': {
      const next = !state.trackHover
      return {
        ...state,
        trackHover: next,
        hoverInfo: next ? state.hoverInfo : null,
      }
    }
    case 'toggleTraces':
      return hoverReset({ ...state, traces: !state.traces })
    case 'toggleInvert':
      return hoverReset({ ...state, invert: !state.invert })
    case 'setCar1Color':
      return { ...state, car1: { ...state.car1, color: action.color } }
    case 'setCar1Progress':
      return {
        ...state,
        car1: { ...state.car1, progress: clampProgress(action.progress) },
      }
    case 'toggleCar1Visible': {
      const visible = !state.car1.visible
      return {
        ...state,
        car1: { ...state.car1, visible },
        focus: !visible && state.focus === 'car1' ? 'free' : state.focus,
      }
    }
    case 'toggleCar1Faded':
      return { ...state, car1: { ...state.car1, faded: !state.car1.faded } }
    case 'setCar2Color':
      return { ...state, car2: { ...state.car2, color: action.color } }
    case 'setCar2Progress':
      return {
        ...state,
        car2: { ...state.car2, progress: clampProgress(action.progress) },
      }
    case 'toggleCar2Visible': {
      const visible = !state.car2.visible
      return {
        ...state,
        car2: { ...state.car2, visible },
        focus: !visible && state.focus === 'car2' ? 'free' : state.focus,
      }
    }
    case 'toggleCar2Faded':
      return { ...state, car2: { ...state.car2, faded: !state.car2.faded } }
    case 'setLine1Color':
      return { ...state, line1: { ...state.line1, color: action.color } }
    case 'toggleLine1Visible':
      return { ...state, line1: { ...state.line1, visible: !state.line1.visible } }
    case 'setLine2Color':
      return { ...state, line2: { ...state.line2, color: action.color } }
    case 'toggleLine2Visible':
      return { ...state, line2: { ...state.line2, visible: !state.line2.visible } }
    case 'setZoom':
      return state.zoomAbs === action.zoomAbs
        ? state
        : { ...state, zoomAbs: action.zoomAbs }
    case 'setZoomFactor':
      return state.zoomFactor === action.zoomFactor
        ? state
        : { ...state, zoomFactor: action.zoomFactor }
    case 'setFps':
      return state.fps === action.fps ? state : { ...state, fps: action.fps }
    case 'setViewport':
      return state.viewport.x === action.x && state.viewport.y === action.y
        ? state
        : { ...state, viewport: { x: action.x, y: action.y } }
    case 'setMouse': {
      const next = action.mouse
      const prev = state.mouse
      if (!next && !prev) return state
      if (!next || !prev) return { ...state, mouse: next }
      if (
        prev.sx === next.sx &&
        prev.sy === next.sy &&
        prev.x === next.x &&
        prev.y === next.y
      ) {
        return state
      }
      return { ...state, mouse: next }
    }
    case 'setHostSize':
      return state.hostSize.width === action.width && state.hostSize.height === action.height
        ? state
        : { ...state, hostSize: { width: action.width, height: action.height } }
    case 'setHover': {
      const info = action.info
      const prev = state.hoverInfo
      if (!info && !prev) return state
      if (!info || !prev) return { ...state, hoverInfo: info }
      if (
        prev.t === info.t &&
        prev.label === info.label &&
        prev.color === info.color &&
        prev.sx === info.sx &&
        prev.sy === info.sy &&
        prev.cursorSx === info.cursorSx &&
        prev.cursorSy === info.cursorSy &&
        prev.edgePx === info.edgePx
      ) {
        return state
      }
      return { ...state, hoverInfo: info }
    }
    case 'setLoading':
      return state.isLoading === action.isLoading
        ? state
        : { ...state, isLoading: action.isLoading }
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}

export function selectOrientation(state: State): TrackOrientation {
  return { rotate: state.rotate, flipH: state.flipH, flipV: state.flipV }
}

/** Centered catalog track for the current id. */
export function selectSourceTrack(state: State): Track {
  const raw = trackById(state.trackId) ?? trackById(DEFAULT_TRACK_ID)
  if (!raw) throw new Error(`Unknown track: ${state.trackId}`)
  return centerTrack(raw)
}

/** Oriented track ready for the viewer. */
export function selectTrack(state: State): Track {
  return orientTrack(selectSourceTrack(state), selectOrientation(state))
}

export function selectRacePath(state: State): Xy[] {
  const orientation = selectOrientation(state)
  const race = raceLineFor(state.trackId)
  const raw = trackById(state.trackId)
  if (race && raw) return orientRacePoints(race, raw, orientation)
  const smooth = resampleTrack(selectTrack(state), FILL_SPACING_M)
  return smooth.samples.map((s) => [s.x, s.y] as Xy)
}

export function selectCar2Path(state: State): Xy[] {
  return offsetPolyline(selectRacePath(state), CAR2_LATERAL_M)
}

export function selectFollow(state: State): { x: number; z: number } | null {
  if (state.focus === 'car1') {
    const p = poseOnPath(selectRacePath(state), state.car1.progress)
    return { x: p.x, z: -p.y }
  }
  if (state.focus === 'car2') {
    const p = poseOnPath(selectCar2Path(state), state.car2.progress)
    return { x: p.x, z: -p.y }
  }
  if (state.focus === 'origin') return { x: 0, z: 0 }
  return null
}

export function selectZones(state: State): SectionZone[] {
  return resolveSectionMap(state.sectionMap, selectTrack(state), state.metricsSource)
}

export type Derived = {
  track: Track
  racePath: Xy[]
  car2Path: Xy[]
  follow: { x: number; z: number } | null
  zones: SectionZone[]
  view: RefObject<View>
  sizeRef: RefObject<{ width: number; height: number }>
  heatPaintRef: RefObject<HeatPaint | null>
  car1ProgressRef: RefObject<number>
  car2ProgressRef: RefObject<number>
}

export type PlaygroundContextValue = {
  state: State
  derived: Derived
  dispatch: (action: Action) => void
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null)

export function usePlayground(): PlaygroundContextValue {
  const ctx = useContext(PlaygroundContext)
  if (!ctx) throw new Error('usePlayground must be used inside <PlaygroundProvider>')
  return ctx
}

function applyFit(view: View, track: Track, width: number, height: number): boolean {
  const z = fitTrack(track, width, height)
  if (!Number.isFinite(z) || z <= 0) return false
  view.x = view.z = view.tx = view.tz = 0
  view.fit = z
  view.zoom = view.tZoom = z
  view.fly = null
  vClearAnchor(view)
  return true
}

function applyFocusFly(
  view: View,
  focus: FocusTarget,
  racePath: Xy[],
  car2Path: Xy[],
  car1Progress: number,
  car2Progress: number,
): void {
  const fit = view.fit || view.zoom
  if (focus === 'free') {
    view.fly = null
    view.tZoom = Math.min(view.tZoom, fit * ZOOM_IN)
    return
  }
  const p =
    focus === 'car1'
      ? poseOnPath(racePath, car1Progress)
      : focus === 'car2'
        ? poseOnPath(car2Path, car2Progress)
        : { x: 0, y: 0 }
  const ex = p.x
  const ez = -p.y
  const ezoom =
    focus === 'origin'
      ? view.zoom
      : Math.min(Math.max(view.tZoom, fit * FOCUS_ZOOM), fit * ZOOM_IN_FOCUSED)
  if (Math.hypot(ex - view.x, ez - view.z) < 1e-6 && Math.abs(ezoom - view.zoom) < 1e-4) {
    view.fly = null
    view.tZoom = ezoom
    return
  }
  view.fly = {
    t: 0,
    dur: FLY_S,
    sx: view.x,
    sz: view.z,
    szoom: view.zoom,
    ex,
    ez,
    ezoom,
  }
}

export function PlaygroundProvider({
  children,
  initial,
}: {
  children: ReactNode
  initial?: Initial
}) {
  const [state, baseDispatch] = useReducer(reducer, initial, createInitialState)
  const view = useRef<View>(newView())
  const sizeRef = useRef({ width: 1, height: 1 })
  const heatPaintRef = useRef<HeatPaint | null>(null)
  const car1ProgressRef = useRef(state.car1.progress)
  const car2ProgressRef = useRef(state.car2.progress)
  const framingRef = useRef(
    `${state.trackId}|${state.rotate}|${state.flipH}|${state.flipV}`,
  )

  useLayoutEffect(() => {
    car1ProgressRef.current = state.car1.progress
    car2ProgressRef.current = state.car2.progress
  }, [state.car1.progress, state.car2.progress])

  const track = useMemo(() => selectTrack(state), [state])
  const racePath = useMemo(() => selectRacePath(state), [state])
  const car2Path = useMemo(() => selectCar2Path(state), [state])
  const follow = useMemo(() => selectFollow(state), [state])
  const zones = useMemo(() => selectZones(state), [state])

  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === 'setFocus') {
        applyFocusFly(
          view.current,
          action.focus,
          racePath,
          car2Path,
          car1ProgressRef.current,
          car2ProgressRef.current,
        )
      }
      if (action.type === 'setZoom') {
        const fit = view.current.fit || action.zoomAbs
        const zoomFactor = Math.round((action.zoomAbs / fit) * 100) / 100
        baseDispatch({ type: 'setZoom', zoomAbs: action.zoomAbs })
        baseDispatch({ type: 'setZoomFactor', zoomFactor })
        return
      }
      baseDispatch(action)
    },
    [racePath, car2Path],
  )

  // Refit when track framing changes (track / rotate / flips).
  useEffect(() => {
    const framing = `${state.trackId}|${state.rotate}|${state.flipH}|${state.flipV}`
    const changed = framingRef.current !== framing
    framingRef.current = framing
    if (!changed) return
    const { width, height } = sizeRef.current
    if (applyFit(view.current, track, width, height)) {
      baseDispatch({ type: 'setZoomFactor', zoomFactor: 1 })
    }
  }, [state.trackId, state.rotate, state.flipH, state.flipV, track])

  // First valid host size (or resize before any fit) — pin the camera.
  useEffect(() => {
    const { width, height } = state.hostSize
    sizeRef.current = { width, height }
    const v = view.current
    if (width < 2 || height < 2) return
    if (Number.isFinite(v.fit) && v.fit > 0) return
    if (applyFit(v, track, width, height)) {
      baseDispatch({ type: 'setZoomFactor', zoomFactor: 1 })
    }
  }, [state.hostSize, track])

  useEffect(() => {
    if (!initial?.loading) return
    const t = setTimeout(() => baseDispatch({ type: 'setLoading', isLoading: false }), LOAD_MS)
    return () => clearTimeout(t)
  }, [initial?.loading])

  useEffect(() => {
    queueMicrotask(() => {
      lapMetrics(track, state.metricsSource)
    })
  }, [track, state.metricsSource])

  const derived = useMemo<Derived>(
    () => ({
      track,
      racePath,
      car2Path,
      follow,
      zones,
      view: view as RefObject<View>,
      sizeRef,
      heatPaintRef,
      car1ProgressRef,
      car2ProgressRef,
    }),
    [track, racePath, car2Path, follow, zones],
  )

  const value = useMemo<PlaygroundContextValue>(
    () => ({ state, derived, dispatch }),
    [state, derived, dispatch],
  )

  return createElement(PlaygroundContext.Provider, { value }, children)
}
