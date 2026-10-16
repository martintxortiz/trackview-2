'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { RACE_LINES, TRACKS } from '@/track/catalog'
import { HEATMAP_PRESETS, recommendedPalette } from '@/track/heatmap-presets'
import { lapMetrics } from '@/track/lap-metrics'
import { resolveSectionMap } from '@/track/section-maps'
import { offsetPolyline } from '@/track/ribbon'
import { resampleTrack } from '@/track/smooth'
import type { Xy } from '@/track/frame'
import {
  CATALOG,
  newView,
  orientRacePoints,
  orientTrack,
  orientationFor,
  poseOnPath,
  type FocusTarget,
  type LayerId,
  type MouseDebug,
  type RotateDeg,
  type TrackHoverInfo,
  type TrackOrientation,
  type View,
} from '@/components/dashboard-canvas'
import type {
  DashboardActions,
  DashboardContextValue,
  DashboardInitial,
  DashboardState,
} from '@/components/dashboard/types'

const FILL_SPACING = 1
const CAR2_LATERAL_M = 1.5
const FOCUS_ZOOM = 8
const ZOOM_IN_FOCUSED = 20
const ZOOM_IN = 7.5
const FLY_S = 0.9
const ITEM_DEFAULT_COLOR = '#ffea00'
/** Loader gate — covers first paint until the scene settles. Later this flips on real data. */
const LOAD_MS = 500

function vClearAnchor(v: View) {
  v.ax = null
  v.az = null
}

function fitTrackLocal(track: Parameters<typeof orientTrack>[0], width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    return NaN
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const s of track.samples) {
    if (s.x < minX) minX = s.x
    if (s.x > maxX) maxX = s.x
    if (s.y < minY) minY = s.y
    if (s.y > maxY) maxY = s.y
  }
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  return Math.min(width / (spanX * 1.2), height / (spanY * 1.2))
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>')
  return ctx
}

export function DashboardProvider({
  children,
  initial,
}: {
  children: ReactNode
  initial?: DashboardInitial
}) {
  const [showOrigin, setShowOrigin] = useState(false)
  const [trackHover, setTrackHover] = useState(true)
  const [hoverInfo, setHoverInfo] = useState<TrackHoverInfo | null>(null)
  const [trackId, setTrackId] = useState(CATALOG[0]!.id)
  const [rotate, setRotate] = useState<RotateDeg>(() => orientationFor(CATALOG[0]!.id).rotate)
  const [flipH, setFlipH] = useState(() => orientationFor(CATALOG[0]!.id).flipH)
  const [flipV, setFlipV] = useState(() => orientationFor(CATALOG[0]!.id).flipV)
  const [layer, setLayer] = useState<LayerId>('normal')
  const [palette, setPalette] = useState(() => recommendedPalette('speed'))
  const [metric, setMetric] = useState<'speed'>('speed')
  const [traces, setTraces] = useState(false)
  const [invert, setInvert] = useState(true)
  const metricsSource = 'auto' as const
  const [sectionMap, setSectionMap] = useState<'sectors'>('sectors')
  const [zoomFactor, setZoomFactor] = useState(1)
  const [zoomAbs, setZoomAbs] = useState(1)
  const [fps, setFps] = useState(0)
  const [viewport, setViewport] = useState({ x: 0, y: 0 })
  const [mouse, setMouse] = useState<MouseDebug | null>(null)
  const [hostSize, setHostSize] = useState({ width: 1, height: 1 })
  const [car1Color, setCar1Color] = useState<string>(ITEM_DEFAULT_COLOR)
  const [car1Progress, setCar1Progress] = useState(0)
  const [car1Visible, setCar1Visible] = useState(initial?.car1Visible ?? true)
  const [car1Faded, setCar1Faded] = useState(true)
  const [car2Color, setCar2Color] = useState<string>('#ff3df0')
  const [car2Progress, setCar2Progress] = useState(0.5)
  const [car2Visible, setCar2Visible] = useState(initial?.car2Visible ?? false)
  const [car2Faded, setCar2Faded] = useState(true)
  const [line1Color, setLine1Color] = useState<string>('#a78bfa')
  const [line1Visible, setLine1Visible] = useState(initial?.line1Visible ?? false)
  const [line2Color, setLine2Color] = useState<string>('#fbbf24')
  const [line2Visible, setLine2Visible] = useState(initial?.line2Visible ?? false)
  const [focus, setFocus] = useState<FocusTarget>('free')
  const [isLoading, setIsLoading] = useState(initial?.loading ?? false)

  useEffect(() => {
    if (!initial?.loading) return
    const t = setTimeout(() => setIsLoading(false), LOAD_MS)
    return () => clearTimeout(t)
  }, [initial?.loading])

  const view = useRef<View>(newView())
  const sizeRef = useRef({ width: 1, height: 1 })
  const heatPaintRef = useRef(null)
  const car1ProgressRef = useRef(car1Progress)
  const car2ProgressRef = useRef(car2Progress)
  useLayoutEffect(() => {
    car1ProgressRef.current = car1Progress
    car2ProgressRef.current = car2Progress
  }, [car1Progress, car2Progress])

  const source = CATALOG.find((t) => t.id === trackId) ?? CATALOG[0]!
  const orientation = useMemo<TrackOrientation>(
    () => ({ rotate, flipH, flipV }),
    [rotate, flipH, flipV],
  )
  const track = useMemo(() => orientTrack(source, orientation), [source, orientation])
  const smooth = useMemo(() => resampleTrack(track, FILL_SPACING), [track])
  const racePath = useMemo<Xy[]>(() => {
    const race = RACE_LINES[trackId]
    if (!race) return smooth.samples.map((s) => [s.x, s.y] as Xy)
    const raw = TRACKS.find((t) => t.id === trackId) ?? source
    return orientRacePoints(race, raw, orientation)
  }, [trackId, source, orientation, smooth])
  const car2Path = useMemo<Xy[]>(() => offsetPolyline(racePath, CAR2_LATERAL_M), [racePath])
  const follow = useMemo<{ x: number; z: number } | null>(() => {
    if (focus === 'car1') {
      const p = poseOnPath(racePath, car1Progress)
      return { x: p.x, z: -p.y }
    }
    if (focus === 'car2') {
      const p = poseOnPath(car2Path, car2Progress)
      return { x: p.x, z: -p.y }
    }
    if (focus === 'origin') return { x: 0, z: 0 }
    return null
  }, [focus, racePath, car1Progress, car2Path, car2Progress])
  const zones = useMemo(
    () => resolveSectionMap(sectionMap, track, metricsSource),
    [sectionMap, track],
  )

  const hoverResetKey = [
    layer,
    trackId,
    rotate,
    flipH,
    flipV,
    sectionMap,
    metric,
    palette,
    traces,
    invert,
  ].join('|')
  const [hoverClearedFor, setHoverClearedFor] = useState(hoverResetKey)
  if (hoverClearedFor !== hoverResetKey) {
    setHoverClearedFor(hoverResetKey)
    setHoverInfo(null)
  }

  const onToggleOrigin = useCallback(() => setShowOrigin((v) => !v), [])
  const onToggleHover = useCallback(() => {
    setTrackHover((v) => {
      if (v) setHoverInfo(null)
      return !v
    })
  }, [])
  const onToggleTraces = useCallback(() => setTraces((v) => !v), [])
  const onToggleInvert = useCallback(() => setInvert((v) => !v), [])
  const onToggleCar1Visible = useCallback(() => {
    if (focus === 'car1') setFocus('free')
    setCar1Visible((v) => !v)
  }, [focus])
  const onToggleCar2Visible = useCallback(() => {
    if (focus === 'car2') setFocus('free')
    setCar2Visible((v) => !v)
  }, [focus])
  const onToggleLine1Visible = useCallback(() => setLine1Visible((v) => !v), [])
  const onToggleLine2Visible = useCallback(() => setLine2Visible((v) => !v), [])
  const onToggleCar1Faded = useCallback(() => setCar1Faded((v) => !v), [])
  const onToggleCar2Faded = useCallback(() => setCar2Faded((v) => !v), [])

  const onFocus = useCallback(
    (f: FocusTarget) => {
      setFocus(f)
      const v = view.current
      const fit = v.fit || v.zoom
      if (f === 'free') {
        v.fly = null
        v.tZoom = Math.min(v.tZoom, fit * ZOOM_IN)
        return
      }
      const p =
        f === 'car1'
          ? poseOnPath(racePath, car1ProgressRef.current)
          : f === 'car2'
            ? poseOnPath(car2Path, car2ProgressRef.current)
            : { x: 0, y: 0 }
      const ex = p.x
      const ez = -p.y
      const ezoom =
        f === 'origin'
          ? v.zoom
          : Math.min(Math.max(v.tZoom, fit * FOCUS_ZOOM), fit * ZOOM_IN_FOCUSED)
      if (Math.hypot(ex - v.x, ez - v.z) < 1e-6 && Math.abs(ezoom - v.zoom) < 1e-4) {
        v.fly = null
        v.tZoom = ezoom
        return
      }
      v.fly = { t: 0, dur: FLY_S, sx: v.x, sz: v.z, szoom: v.zoom, ex, ez, ezoom }
    },
    [racePath, car2Path],
  )

  const onMetric = useCallback((id: string) => {
    setMetric(id as 'speed')
  }, [])

  const onPreset = useCallback((id: string) => {
    const preset = HEATMAP_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setMetric(preset.metric as 'speed')
    setPalette(preset.palette)
  }, [])

  const applyFit = useCallback(
    (next: typeof track, width: number, height: number) => {
      const z = fitTrackLocal(next, width, height)
      if (!Number.isFinite(z) || z <= 0) return
      const v = view.current
      v.x = v.z = v.tx = v.tz = 0
      v.fit = z
      v.zoom = v.tZoom = z
      v.fly = null
      vClearAnchor(v)
      setZoomFactor(1)
    },
    [],
  )

  const fitOriented = useCallback(
    (base: typeof track, orient: TrackOrientation, width: number, height: number) => {
      applyFit(orientTrack(base, orient), width, height)
    },
    [applyFit],
  )

  const onTrack = useCallback(
    (id: string) => {
      setTrackId(id)
      const next = CATALOG.find((t) => t.id === id)
      if (!next) return
      const preferred = orientationFor(id)
      setRotate(preferred.rotate)
      setFlipH(preferred.flipH)
      setFlipV(preferred.flipV)
      fitOriented(next, preferred, sizeRef.current.width, sizeRef.current.height)
      queueMicrotask(() => {
        lapMetrics(orientTrack(next, preferred), metricsSource)
      })
    },
    [fitOriented],
  )

  const onRotate = useCallback(
    (deg: RotateDeg) => {
      setRotate(deg)
      fitOriented(source, { rotate: deg, flipH, flipV }, sizeRef.current.width, sizeRef.current.height)
    },
    [fitOriented, source, flipH, flipV],
  )

  const onToggleFlipH = useCallback(() => {
    const next = !flipH
    setFlipH(next)
    fitOriented(source, { rotate, flipH: next, flipV }, sizeRef.current.width, sizeRef.current.height)
  }, [fitOriented, source, rotate, flipH, flipV])

  const onToggleFlipV = useCallback(() => {
    const next = !flipV
    setFlipV(next)
    fitOriented(source, { rotate, flipH, flipV: next }, sizeRef.current.width, sizeRef.current.height)
  }, [fitOriented, source, rotate, flipH, flipV])

  const onZoom = useCallback((z: number) => {
    setZoomAbs((prev) => (prev === z ? prev : z))
    const fit = view.current.fit || z
    const next = Math.round((z / fit) * 100) / 100
    setZoomFactor((prev) => (prev === next ? prev : next))
  }, [])

  const onFps = useCallback((next: number) => {
    setFps((prev) => (prev === next ? prev : next))
  }, [])

  const onViewport = useCallback((x: number, y: number) => {
    setViewport((prev) => (prev.x === x && prev.y === y ? prev : { x, y }))
  }, [])

  const onMouse = useCallback((next: MouseDebug | null) => {
    setMouse((prev) => {
      if (!next && !prev) return prev
      if (!next || !prev) return next
      return prev.sx === next.sx && prev.sy === next.sy && prev.x === next.x && prev.y === next.y
        ? prev
        : next
    })
  }, [])

  const onSize = useCallback((width: number, height: number) => {
    setHostSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    )
  }, [])

  const onHover = useCallback((info: TrackHoverInfo | null) => {
    setHoverInfo((prev) => {
      if (!info && !prev) return prev
      if (!info || !prev) return info
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
        return prev
      }
      return info
    })
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      lapMetrics(track, metricsSource)
    })
  }, [track])

  useEffect(() => {
    const v = view.current
    if (hostSize.width >= 2 && hostSize.height >= 2 && (!Number.isFinite(v.fit) || v.fit <= 0)) {
      applyFit(track, hostSize.width, hostSize.height)
    }
  }, [hostSize, track, applyFit])

  const state: DashboardState = {
    trackId,
    isLoading,
    rotate,
    flipH,
    flipV,
    layer,
    palette,
    metric,
    traces,
    invert,
    metricsSource,
    sectionMap,
    focus,
    showOrigin,
    trackHover,
    hoverInfo,
    zoomFactor,
    zoomAbs,
    fps,
    viewport,
    mouse,
    hostSize,
    car1: { color: car1Color, progress: car1Progress, visible: car1Visible, faded: car1Faded },
    car2: { color: car2Color, progress: car2Progress, visible: car2Visible, faded: car2Faded },
    line1: { color: line1Color, visible: line1Visible },
    line2: { color: line2Color, visible: line2Visible },
  }

  const derived = {
    track,
    smooth,
    racePath,
    car2Path,
    follow,
    zones,
    view: view as RefObject<View>,
    sizeRef,
    heatPaintRef,
    car1ProgressRef,
    car2ProgressRef,
  }

  const actions: DashboardActions = {
    onTrack,
    onRotate,
    onToggleFlipH,
    onToggleFlipV,
    onLayer: setLayer,
    onPalette: setPalette,
    onMetric,
    onPreset,
    onSectionMap: setSectionMap as DashboardActions['onSectionMap'],
    onFocus,
    onToggleOrigin,
    onToggleHover,
    onToggleTraces,
    onToggleInvert,
    onCar1Color: setCar1Color,
    onCar1Progress: setCar1Progress,
    onToggleCar1Visible,
    onToggleCar1Faded,
    onCar2Color: setCar2Color,
    onCar2Progress: setCar2Progress,
    onToggleCar2Visible,
    onToggleCar2Faded,
    onLine1Color: setLine1Color,
    onToggleLine1Visible,
    onLine2Color: setLine2Color,
    onToggleLine2Visible,
    onZoom,
    onFps,
    onViewport,
    onMouse,
    onSize,
    onHover,
  }

  const value: DashboardContextValue = useMemo(
    () => ({ state, derived, actions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      trackId, isLoading, rotate, flipH, flipV, layer, palette, metric, traces, invert, sectionMap,
      focus, showOrigin, trackHover, hoverInfo, zoomFactor, zoomAbs, fps, viewport, mouse,
      hostSize, car1Color, car1Progress, car1Visible, car1Faded, car2Color, car2Progress,
      car2Visible, car2Faded, line1Color, line1Visible, line2Color, line2Visible,
      track, smooth, racePath, car2Path, follow, zones,
    ],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}
