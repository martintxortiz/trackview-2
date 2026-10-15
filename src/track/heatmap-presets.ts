import type { PaletteId } from '@/track/colormaps'
import type { MetricId } from '@/track/lap-metrics'

export type HeatmapPresetId =
  | 'speed'
  | 'brake'
  | 'throttle'
  | 'pedals'
  | 'battery'
  | 'tyres'

export type HeatmapPreset = {
  id: HeatmapPresetId
  name: string
  metric: MetricId
  palette: PaletteId
}

/** Best palette + value pairing for each telemetry channel. */
export const HEATMAP_PRESETS: readonly HeatmapPreset[] = [
  { id: 'speed', name: 'Speed', metric: 'speed', palette: 'amber' },
  { id: 'brake', name: 'Brake', metric: 'brake', palette: 'red' },
  { id: 'throttle', name: 'Throttle', metric: 'throttle', palette: 'green' },
  { id: 'pedals', name: 'Pedals', metric: 'pedals', palette: 'pedals' },
  { id: 'battery', name: 'Battery', metric: 'battery', palette: 'cyan' },
  { id: 'tyres', name: 'Tyres', metric: 'tyres', palette: 'hot' },
] as const

/** Preset id, or `'custom'` when metric/palette don't match a named preset. */
export type HeatmapPresetSelection = HeatmapPresetId | 'custom'

export function presetFor(
  metric: MetricId,
  palette: PaletteId,
): HeatmapPresetSelection {
  const hit = HEATMAP_PRESETS.find((p) => p.metric === metric && p.palette === palette)
  return hit?.id ?? 'custom'
}

export function recommendedPalette(metric: MetricId): PaletteId {
  const hit = HEATMAP_PRESETS.find((p) => p.metric === metric)
  return hit?.palette ?? 'amber'
}
