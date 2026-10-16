'use client'

/**
 * Lap-comparison state — thinner than playground, product-focused.
 * Car 2 path is a lateral raceline offset, not telemetry lap `b`.
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
import { recommendedPalette } from '@/track/heatmap-presets'
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
  ZOOM_IN,
  ZOOM_OUT,
  centerTrack,
  fitTrack,
  newView,
  orientRacePoints,
  orientTrack,
  orientationFor,
  poseOnPath,
  rotateCw,
  vClearAnchor,
  type FocusTarget,
  type HeatPaint,
  type LayerId,
  type RotateDeg,
  type TrackHoverInfo,
  type TrackOrientation,
  type View,
} from '@/features/viewer'

/** Lateral offset (m) for car 2 / line 2 — visual twin, not telemetry lap b. */
export const CAR2_LATERAL_M = 1.5

const ITEM_DEFAULT_COLOR = '#ffea00'
/** Brief hold so the canvas can paint under the cover before the fade. */
const LOAD_MS = 350
const DEFAULT_TRACK_ID = listTrackIds()[0] ?? 'spa'
/** Button zoom step relative to current tZoom (chrome +/-). */
const ZOOM_STEP = 1.25

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
  | { type: 'setLayer'; layer: LayerId }
  | { type: 'setFocus'; focus: FocusTarget }
  | { type: 'setRotate'; rotate: RotateDeg }
  | { type: 'resetOrientation' }
  | { type: 'toggleHover' }
  | { type: 'setCar1Progress'; progress: number }
  | { type: 'toggleCar1Visible' }
  | { type: 'setCar2Progress'; progress: number }
  | { type: 'toggleCar2Visible' }
  | { type: 'toggleLine1Visible' }
  | { type: 'toggleLine2Visible' }
  | { type: 'setZoom'; zoomAbs: number }
  | { type: 'setZoomFactor'; zoomFactor: number }
  | { type: 'setHostSize'; width: number; height: number }
  | { type: 'setHover'; info: TrackHoverInfo | null }
  | { type: 'setLoading'; isLoading: boolean }

/** Normalize to [0, 360) so framing keys stay stable. */
export function normalizeRotate(deg: number): RotateDeg {
  const n = ((deg % 360) + 360) % 360
  return Math.round(n * 10) / 10
}

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
    hostSize: { width: 1, height: 1 },
    car1: {
      color: ITEM_DEFAULT_COLOR,
      progress: 0,
      // Route parity: comparison opens without car 1 on the map.
      visible: initial?.car1Visible ?? false,
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

/** Pure comparison reducer — no geometry, no refs, no React. */
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
    case 'setLayer':
      return hoverReset({ ...state, layer: action.layer })
    case 'setFocus':
      return { ...state, focus: action.focus }
    case 'setRotate': {
      const rotate = normalizeRotate(action.rotate)
      return state.rotate === rotate ? state : hoverReset({ ...state, rotate })
    }
    case 'resetOrientation': {
      const o = orientationFor(state.trackId)
      if (
        state.rotate === o.rotate &&
        state.flipH === o.flipH &&
        state.flipV === o.flipV
      ) {
        return state
      }
      return hoverReset({
        ...state,
        rotate: o.rotate,
        flipH: o.flipH,
        flipV: o.flipV,
      })
    }
    case 'toggleHover': {
      const next = !state.trackHover
      return {
        ...state,
        trackHover: next,
        hoverInfo: next ? state.hoverInfo : null,
      }
    }
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
    case 'toggleLine1Visible':
      return { ...state, line1: { ...state.line1, visible: !state.line1.visible } }
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

/**
 * Baked mesh orientation — catalog rotate + current flips.
 * Live `state.rotate` is applied smoothly via SpinLayer (no remesh).
 */
export function selectOrientation(state: State): TrackOrientation {
  const catalog = orientationFor(state.trackId)
  return { rotate: catalog.rotate, flipH: state.flipH, flipV: state.flipV }
}

/** Degrees CW on top of the baked catalog rotate. */
export function selectSpinOffset(state: State): number {
  return state.rotate - orientationFor(state.trackId).rotate
}

export function selectSourceTrack(state: State): Track {
  const raw = trackById(state.trackId) ?? trackById(DEFAULT_TRACK_ID)
  if (!raw) throw new Error(`Unknown track: ${state.trackId}`)
  return centerTrack(raw)
}

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

/** Car 2 path = raceline offset laterally. Not telemetry lap `b`. */
export function selectCar2Path(state: State): Xy[] {
  return offsetPolyline(selectRacePath(state), CAR2_LATERAL_M)
}

export function selectFollow(state: State): { x: number; z: number } | null {
  const spin = selectSpinOffset(state)
  if (state.focus === 'car1') {
    const p = poseOnPath(selectRacePath(state), state.car1.progress)
    const [x, y] = rotateCw(p.x, p.y, spin)
    return { x, z: -y }
  }
  if (state.focus === 'car2') {
    const p = poseOnPath(selectCar2Path(state), state.car2.progress)
    const [x, y] = rotateCw(p.x, p.y, spin)
    return { x, z: -y }
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
  /** Smoothed spin offset target / current (deg CW above catalog bake). */
  spinTargetRef: RefObject<number>
  spinCurrentRef: RefObject<number>
}

/** Compass spin — sets a target; SpinLayer eases current like the camera. */
export type ComparisonSpin = {
  begin: () => void
  /** Finger delta from begin (absolute rotate = startRotate + delta). */
  preview: (deltaDeg: number) => void
  /** Persist absolute rotate; mesh stays put, target already matches. */
  commit: (rotate: RotateDeg) => void
  /** Ease back to catalog north. */
  reset: () => void
}

export type ComparisonChrome = {
  zoomIn: () => void
  zoomOut: () => void
  locate: () => void
}

export type ComparisonContextValue = {
  state: State
  derived: Derived
  dispatch: (action: Action) => void
  chrome: ComparisonChrome
  spin: ComparisonSpin
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null)

export function useComparison(): ComparisonContextValue {
  const ctx = useContext(ComparisonContext)
  if (!ctx) throw new Error('useComparison must be used inside <ComparisonProvider>')
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

function clampChromeZoom(view: View, next: number): number {
  const fit = view.fit || view.zoom || 1
  const lo = Math.max(fit * ZOOM_OUT, 1e-6)
  const hi = Math.max(fit * ZOOM_IN, lo * 2)
  return Math.min(hi, Math.max(lo, next))
}

export function ComparisonProvider({
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
  const spinTargetRef = useRef(selectSpinOffset(state))
  const spinCurrentRef = useRef(selectSpinOffset(state))
  const spinDrag = useRef<{ startRotate: number } | null>(null)
  const orientRef = useRef({
    rotate: state.rotate,
    flipH: state.flipH,
    flipV: state.flipV,
  })
  const trackIdRef = useRef(state.trackId)
  const stateRef = useRef(state)

  useLayoutEffect(() => {
    car1ProgressRef.current = state.car1.progress
    car2ProgressRef.current = state.car2.progress
  }, [state.car1.progress, state.car2.progress])

  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const track = useMemo(() => selectTrack(state), [state])
  const racePath = useMemo(() => selectRacePath(state), [state])
  const car2Path = useMemo(() => selectCar2Path(state), [state])
  const follow = useMemo(() => selectFollow(state), [state])
  const zones = useMemo(() => selectZones(state), [state])

  const dispatch = useCallback((action: Action) => {
    if (action.type === 'setZoom') {
      const fit = view.current.fit || action.zoomAbs
      const zoomFactor = Math.round((action.zoomAbs / fit) * 100) / 100
      baseDispatch({ type: 'setZoom', zoomAbs: action.zoomAbs })
      baseDispatch({ type: 'setZoomFactor', zoomFactor })
      return
    }
    baseDispatch(action)
  }, [])

  const zoomIn = useCallback(() => {
    const v = view.current
    v.fly = null
    vClearAnchor(v)
    v.tZoom = clampChromeZoom(v, v.tZoom * ZOOM_STEP)
  }, [])

  const zoomOut = useCallback(() => {
    const v = view.current
    v.fly = null
    vClearAnchor(v)
    v.tZoom = clampChromeZoom(v, v.tZoom / ZOOM_STEP)
  }, [])

  const locate = useCallback(() => {
    const { width, height } = sizeRef.current
    if (applyFit(view.current, track, width, height)) {
      baseDispatch({ type: 'setZoomFactor', zoomFactor: 1 })
    }
  }, [track])

  // Track switch only — never refit/zoom on rotate.
  useLayoutEffect(() => {
    if (trackIdRef.current === state.trackId) return
    trackIdRef.current = state.trackId
    const offset = selectSpinOffset(state)
    spinTargetRef.current = offset
    spinCurrentRef.current = offset
    spinDrag.current = null
    orientRef.current = {
      rotate: state.rotate,
      flipH: state.flipH,
      flipV: state.flipV,
    }
    const { width, height } = sizeRef.current
    if (applyFit(view.current, track, width, height)) {
      baseDispatch({ type: 'setZoomFactor', zoomFactor: 1 })
    }
  }, [state.trackId, state.rotate, state.flipH, state.flipV, track])

  // Keep spin target in sync with state.rotate (SpinLayer eases current → target).
  useLayoutEffect(() => {
    if (spinDrag.current) return
    spinTargetRef.current = selectSpinOffset(state)
    orientRef.current = {
      ...orientRef.current,
      rotate: state.rotate,
    }
  }, [state.rotate, state.trackId])

  // Flips remesh geometry — refresh fit limits only (no zoom jump).
  useLayoutEffect(() => {
    const prev = orientRef.current
    if (prev.flipH === state.flipH && prev.flipV === state.flipV) return
    orientRef.current = {
      rotate: state.rotate,
      flipH: state.flipH,
      flipV: state.flipV,
    }
    const { width, height } = sizeRef.current
    const z = fitTrack(track, width, height)
    if (Number.isFinite(z) && z > 0) view.current.fit = z
  }, [state.flipH, state.flipV, state.rotate, track])

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

  const spin = useMemo<ComparisonSpin>(() => {
    const begin = () => {
      // Start from the *displayed* angle so a new drag doesn't jump mid-ease.
      const catalog = orientationFor(stateRef.current.trackId).rotate
      spinDrag.current = { startRotate: catalog + spinCurrentRef.current }
    }
    const preview = (deltaDeg: number) => {
      const drag = spinDrag.current
      if (!drag) return
      const abs = drag.startRotate + deltaDeg
      const catalog = orientationFor(stateRef.current.trackId).rotate
      spinTargetRef.current = abs - catalog
    }
    const commit = (rotate: RotateDeg) => {
      const next = normalizeRotate(rotate)
      const catalog = orientationFor(stateRef.current.trackId).rotate
      spinTargetRef.current = next - catalog
      spinDrag.current = null
      orientRef.current = { ...orientRef.current, rotate: next }
      baseDispatch({ type: 'setRotate', rotate: next })
    }
    const reset = () => {
      spinDrag.current = null
      const target = orientationFor(stateRef.current.trackId)
      // Shortest ease back to catalog (target offset 0).
      let curN = ((spinCurrentRef.current % 360) + 360) % 360
      if (curN > 180) curN -= 360
      spinCurrentRef.current = curN
      spinTargetRef.current = 0
      orientRef.current = {
        rotate: target.rotate,
        flipH: target.flipH,
        flipV: target.flipV,
      }
      baseDispatch({ type: 'resetOrientation' })
    }
    return { begin, preview, commit, reset }
  }, [])

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
      spinTargetRef,
      spinCurrentRef,
    }),
    [track, racePath, car2Path, follow, zones],
  )

  const chrome = useMemo<ComparisonChrome>(
    () => ({ zoomIn, zoomOut, locate }),
    [zoomIn, zoomOut, locate],
  )

  const value = useMemo<ComparisonContextValue>(
    () => ({ state, derived, dispatch, chrome, spin }),
    [state, derived, dispatch, chrome, spin],
  )

  return createElement(ComparisonContext.Provider, { value }, children)
}
