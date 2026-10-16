/**
 * Discrete lap sections — solid zones, not gradual heatmaps.
 * Timing sectors, ERS strategy windows, 2025/2026 deploy maps (test fixtures).
 */
import type { Track } from '@/track/frame'
import type { SectionZone } from '@/track/domain'
import {
  lapMetrics,
  type MetricsSourceId,
} from '@/track/lap-metrics'
import sectionFixtures from '@/track/data/section-fixtures.json'

export type { SectionZone }

export type SectionMapId =
  | 'sectors'
  | 'pedals-auto'
  | 'battery-auto'
  | 'battery-race'
  | 'battery-qualify'
  | 'ers-2025'
  | 'ers-2026'

export type SectionMapInfo = {
  id: SectionMapId
  name: string
  blurb: string
}

export const SECTION_MAPS: readonly SectionMapInfo[] = [
  { id: 'sectors', name: 'Sectors', blurb: 'Official S1 / S2 / S3' },
  {
    id: 'pedals-auto',
    name: 'Pedals (auto)',
    blurb: 'Brake / coast / throttle from lap data',
  },
  {
    id: 'battery-auto',
    name: 'Battery (auto)',
    blurb: 'Harvest / idle / deploy from lap model',
  },
  {
    id: 'battery-race',
    name: 'Battery (race)',
    blurb: 'Conservative ERS windows',
  },
  {
    id: 'battery-qualify',
    name: 'Battery (quali)',
    blurb: 'Aggressive deploy map',
  },
  {
    id: 'ers-2025',
    name: 'ERS 2025',
    blurb: 'Current hybrid deploy / harvest',
  },
  {
    id: 'ers-2026',
    name: 'ERS 2026',
    blurb: 'Next-gen heavier electrical map',
  },
] as const

/**
 * Authoring hues for section tints. The ribbon paints these translucent over
 * dark asphalt (see SECTION_TINT), so they are authored richer than the old
 * flat fills — the blend lands them muted against the dotted backdrop.
 */
const MODE = {
  harvest: { name: 'Harvest', color: '#3d8bdd' },
  idle: { name: 'Idle', color: '#6e6e78' },
  deploy: { name: 'Deploy', color: '#35a05c' },
  recharge: { name: 'Recharge', color: '#2ab5ac' },
  boost: { name: 'Boost', color: '#d9a62e' },
  brake: { name: 'Brake', color: '#d84b42' },
  coast: { name: 'Coast', color: '#b0b0b8' },
  throttle: { name: 'Throttle', color: '#35a05c' },
} as const

type ModeKey = keyof typeof MODE

function zone(
  id: string,
  mode: ModeKey,
  from: number,
  to: number,
): SectionZone {
  return {
    id,
    name: MODE[mode].name,
    from,
    to,
    color: MODE[mode].color,
  }
}

const SECTORS: SectionZone[] = sectionFixtures.sectors
const BATTERY_RACE: SectionZone[] = sectionFixtures['battery-race']
const BATTERY_QUALIFY: SectionZone[] = sectionFixtures['battery-qualify']
const ERS_2025: SectionZone[] = sectionFixtures['ers-2025']
const ERS_2026: SectionZone[] = sectionFixtures['ers-2026']

function modeFromBattery(v: number): ModeKey {
  if (v < -0.18) return 'harvest'
  if (v > 0.22) return 'deploy'
  return 'idle'
}

function modeFromPedals(v: number): ModeKey {
  if (v < -0.08) return 'brake'
  if (v > 0.08) return 'throttle'
  return 'coast'
}

function quantizeSeries(
  series: ArrayLike<number>,
  classify: (v: number) => ModeKey,
  prefix: string,
  emptyMode: ModeKey,
): SectionZone[] {
  const n = series.length
  if (n < 2) return [zone('empty', emptyMode, 0, 1)]

  const zones: SectionZone[] = []
  let start = 0
  let mode = classify(series[0]!)

  for (let i = 1; i <= n; i++) {
    const next = i === n ? null : classify(series[i]!)
    if (next === mode) continue
    zones.push(zone(`${prefix}-${zones.length}`, mode, start / n, i / n))
    if (next == null) break
    mode = next
    start = i
  }

  return mergeTiny(zones, 0.012)
}

/** Quantize the lap battery channel into solid harvest / idle / deploy bands. */
export function batteryAutoZones(
  track: Track,
  source: MetricsSourceId = 'auto',
): SectionZone[] {
  const { battery } = lapMetrics(track, source)
  return quantizeSeries(battery, modeFromBattery, 'auto', 'idle')
}

/** Quantize pedals into solid brake / coast / throttle bands. */
export function pedalsAutoZones(
  track: Track,
  source: MetricsSourceId = 'auto',
): SectionZone[] {
  const { pedals } = lapMetrics(track, source)
  return quantizeSeries(pedals, modeFromPedals, 'pedal', 'coast')
}

function mergeTiny(zones: SectionZone[], minSpan: number): SectionZone[] {
  if (zones.length < 2) return zones
  const out: SectionZone[] = []
  for (const z of zones) {
    const span = z.to - z.from
    const prev = out[out.length - 1]
    if (span < minSpan && prev) {
      out[out.length - 1] = { ...prev, to: z.to }
      continue
    }
    if (prev && prev.name === z.name && prev.color === z.color) {
      out[out.length - 1] = { ...prev, to: z.to }
      continue
    }
    out.push(z)
  }
  return out
}

/** Unique legend entries in map order. */
export function sectionLegend(zones: readonly SectionZone[]): {
  name: string
  color: string
}[] {
  const seen = new Set<string>()
  const out: { name: string; color: string }[] = []
  for (const z of zones) {
    if (seen.has(z.name)) continue
    seen.add(z.name)
    out.push({ name: z.name, color: z.color })
  }
  return out
}

const MAX_ZONES = 16

/** Collapse the shortest bands until we fit the ribbon budget. */
function capZones(zones: SectionZone[], max: number): SectionZone[] {
  let out = zones.slice()
  while (out.length > max) {
    let best = 1
    let bestSpan = Infinity
    for (let i = 1; i < out.length; i++) {
      const span = out[i]!.to - out[i]!.from
      if (span < bestSpan) {
        bestSpan = span
        best = i
      }
    }
    const into = best === 0 ? 1 : best - 1
    const keep = out[into]!
    const drop = out[best]!
    const merged: SectionZone = {
      ...keep,
      from: Math.min(keep.from, drop.from),
      to: Math.max(keep.to, drop.to),
    }
    out = out.filter((_, i) => i !== best && i !== into)
    out.splice(Math.min(into, best), 0, merged)
  }
  return out
}

/**
 * Pure resolver for section maps.
 * Prefer this in new code; `resolveSectionMap` is the compat alias.
 */
export function resolveSections(
  id: SectionMapId,
  track: Track,
  source: MetricsSourceId = 'auto',
): SectionZone[] {
  let zones: SectionZone[]
  switch (id) {
    case 'sectors':
      zones = SECTORS
      break
    case 'pedals-auto':
      zones = pedalsAutoZones(track, source)
      break
    case 'battery-auto':
      zones = batteryAutoZones(track, source)
      break
    case 'battery-race':
      zones = BATTERY_RACE
      break
    case 'battery-qualify':
      zones = BATTERY_QUALIFY
      break
    case 'ers-2025':
      zones = ERS_2025
      break
    case 'ers-2026':
      zones = ERS_2026
      break
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
  return capZones(zones, MAX_ZONES)
}

/** Compat alias — canvas, store, and pin import this name. */
export function resolveSectionMap(
  id: SectionMapId,
  track: Track,
  source: MetricsSourceId = 'auto',
): SectionZone[] {
  return resolveSections(id, track, source)
}
