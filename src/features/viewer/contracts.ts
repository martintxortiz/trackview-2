/**
 * Viewer public contracts — types and catalogs matching dashboard-canvas exports.
 * U05/U06 depend on these; the canvas remains the runtime pin until U09.
 */
import type { RefObject } from 'react'
import type { PaletteId } from '@/track/colormaps'
import type { MetricId, MetricsSourceId } from '@/track/lap-metrics'
import type { SectionMapId, SectionZone } from '@/track/section-maps'
import type { Track } from '@/track/frame'

/** Camera focus — free pan/zoom, the track origin, or following one of the cars. */
export type FocusTarget = 'free' | 'origin' | 'car1' | 'car2'

/**
 * Clockwise screen degrees.
 * Discrete UI presets use 0/90/180/270; compass drag is continuous.
 */
export type RotateDeg = number

export type TrackOrientation = {
  rotate: RotateDeg
  flipH: boolean
  flipV: boolean
}

export type LayerId = 'normal' | 'sections' | 'heatmap'

/** One smooth camera move: pan + zoom together over a fixed duration. */
export type FlyState = {
  t: number
  dur: number
  sx: number
  sz: number
  szoom: number
  ex: number
  ez: number
  ezoom: number
}

export type View = {
  x: number
  z: number
  zoom: number
  tx: number
  tz: number
  tZoom: number
  fit: number
  /** Pixel offset from view center; with world (ax, az) pins zoom under the cursor. */
  ax: number | null
  az: number | null
  apx: number
  apy: number
  /** Eased fly-to transition (focus select) — overrides the chase while active. */
  fly: FlyState | null
}

export type TrackHoverInfo = {
  /** Lap fraction 0–1 at the hit. */
  t: number
  /** Planar track frame (m). */
  x: number
  y: number
  /** Screen px of the centerline hit. */
  sx: number
  sy: number
  cursorSx: number
  cursorSy: number
  /** Asphalt half-width in screen px. */
  edgePx: number
  color: string
  label: string
}

export type MouseDebug = { sx: number; sy: number; x: number; y: number }

/** Shared heatmap paint buffer for hover tip sync. */
export type HeatPaint = {
  colors: Float32Array
  channels: 3 | 4
  n: number
  overAsphalt: boolean
}

export const LAYERS: { id: LayerId; name: string }[] = [
  { id: 'normal', name: 'Normal' },
  { id: 'sections', name: 'Sections' },
  { id: 'heatmap', name: 'Heatmap' },
]

export const ITEM_COLORS = [
  { id: 'yellow', value: '#ffea00' },
  { id: 'magenta', value: '#ff3df0' },
  { id: 'cyan', value: '#2ee6ff' },
  { id: 'orange', value: '#ff9500' },
  { id: 'lime', value: '#b6ff00' },
  { id: 'white', value: '#ffffff' },
] as const

export const ROTATE_OPTIONS: { id: RotateDeg; name: string }[] = [
  { id: 0, name: '0°' },
  { id: 90, name: '90°' },
  { id: 180, name: '180°' },
  { id: 270, name: '270°' },
]

export const FOCUS_OPTIONS: { id: FocusTarget; name: string }[] = [
  { id: 'free', name: 'Free' },
  { id: 'origin', name: 'Origin' },
  { id: 'car1', name: 'Car 1' },
  { id: 'car2', name: 'Car 2' },
]

/** Props for the composed road ribbon (matches canvas `Road`). */
export type RoadProps = {
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
}

/** Fixed asphalt sample spacing (m). */
export const FILL_SPACING_M = 1
