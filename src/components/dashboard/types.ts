import type { Track, Xy } from '@/track/frame'
import type { PaletteId } from '@/track/colormaps'
import type { MetricId, MetricsSourceId } from '@/track/lap-metrics'
import type { SectionMapId, SectionZone } from '@/track/section-maps'
import type {
  FocusTarget,
  LayerId,
  MouseDebug,
  RotateDeg,
  TrackHoverInfo,
  TrackOrientation,
  View,
} from '@/components/dashboard-canvas'

export type {
  FocusTarget,
  LayerId,
  MouseDebug,
  RotateDeg,
  TrackHoverInfo,
  TrackOrientation,
  View,
}

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

export type DashboardState = {
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

export type DashboardDerived = {
  track: Track
  smooth: Track
  racePath: Xy[]
  car2Path: Xy[]
  follow: { x: number; z: number } | null
  zones: SectionZone[]
  view: React.RefObject<View>
}

export type DashboardActions = {
  onTrack: (id: string) => void
  onRotate: (deg: RotateDeg) => void
  onToggleFlipH: () => void
  onToggleFlipV: () => void
  onLayer: (id: LayerId) => void
  onPalette: (id: PaletteId) => void
  onMetric: (id: MetricId) => void
  onPreset: (id: string) => void
  onSectionMap: (id: SectionMapId) => void
  onFocus: (f: FocusTarget) => void
  onToggleOrigin: () => void
  onToggleHover: () => void
  onToggleTraces: () => void
  onToggleInvert: () => void
  onCar1Color: (c: string) => void
  onCar1Progress: (p: number) => void
  onToggleCar1Visible: () => void
  onToggleCar1Faded: () => void
  onCar2Color: (c: string) => void
  onCar2Progress: (p: number) => void
  onToggleCar2Visible: () => void
  onToggleCar2Faded: () => void
  onLine1Color: (c: string) => void
  onToggleLine1Visible: () => void
  onLine2Color: (c: string) => void
  onToggleLine2Visible: () => void
  onZoom: (z: number) => void
  onFps: (n: number) => void
  onViewport: (x: number, y: number) => void
  onMouse: (m: MouseDebug | null) => void
  onSize: (w: number, h: number) => void
  onHover: (info: TrackHoverInfo | null) => void
}

export type DashboardContextValue = {
  state: DashboardState
  derived: DashboardDerived
  actions: DashboardActions
}

/** Initial visibility overrides for the dashboard scene slots. */
export type DashboardInitial = {
  car1Visible?: boolean
  car2Visible?: boolean
  line1Visible?: boolean
  line2Visible?: boolean
  /** Show the loader gate on mount. Off for now, kept for real data loading later. */
  loading?: boolean
}
