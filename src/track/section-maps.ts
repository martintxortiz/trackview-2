/**
 * Discrete lap sections — solid zones, not gradual heatmaps.
 * Timing sectors, ERS strategy windows, 2025/2026 deploy maps (test fixtures).
 */
import type { Track } from '@/track/frame'
import {
  lapMetrics,
  type MetricsSourceId,
} from '@/track/lap-metrics'

export type SectionZone = {
  /** Stable key for React lists. */
  id: string
  name: string
  /** Lap fraction [0, 1). */
  from: number
  /** Lap fraction (0, 1], exclusive end except when wrapping. */
  to: number
  color: string
}

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
 * Sectors reuse the same brake / deploy / harvest hues, not a second set.
 */
const MODE = {
  harvest: { name: 'Harvest', color: '#3d8bdd' },
  idle: { name: 'Idle', color: '#6e6e78' },
  deploy: { name: 'Deploy', color: '#35a05c' },
  recharge: { name: 'Recharge', color: '#2ab5ac' },
  boost: { name: 'Boost', color: '#d9a62e' },
  brake: { name: 'Brake', color: '#d84b42' },
  /** Light grey — distinct from idle/road without the old near-white glare. */
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

/** Classic F1 timing sectors — same red / green / blue as the modes. */
const SECTORS: SectionZone[] = [
  { id: 's1', name: 'Sector 1', from: 0, to: 1 / 3, color: '#d84b42' },
  { id: 's2', name: 'Sector 2', from: 1 / 3, to: 2 / 3, color: '#35a05c' },
  { id: 's3', name: 'Sector 3', from: 2 / 3, to: 1, color: '#3d8bdd' },
]

/**
 * Race-leaning strategy fixture — short deploy on exits, harvest into slows.
 * Fractions are generic so they work on Spa / Monza / COTA for display tests.
 */
const BATTERY_RACE: SectionZone[] = [
  zone('r0', 'deploy', 0.0, 0.06),
  zone('r1', 'idle', 0.06, 0.1),
  zone('r2', 'harvest', 0.1, 0.16),
  zone('r3', 'deploy', 0.16, 0.28),
  zone('r4', 'idle', 0.28, 0.34),
  zone('r5', 'harvest', 0.34, 0.42),
  zone('r6', 'deploy', 0.42, 0.55),
  zone('r7', 'idle', 0.55, 0.62),
  zone('r8', 'harvest', 0.62, 0.72),
  zone('r9', 'deploy', 0.72, 0.88),
  zone('r10', 'idle', 0.88, 0.93),
  zone('r11', 'harvest', 0.93, 1.0),
]

/** Quali — longer / hotter deploy, less idle. */
const BATTERY_QUALIFY: SectionZone[] = [
  zone('q0', 'boost', 0.0, 0.1),
  zone('q1', 'deploy', 0.1, 0.22),
  zone('q2', 'harvest', 0.22, 0.28),
  zone('q3', 'boost', 0.28, 0.4),
  zone('q4', 'deploy', 0.4, 0.55),
  zone('q5', 'harvest', 0.55, 0.62),
  zone('q6', 'boost', 0.62, 0.78),
  zone('q7', 'deploy', 0.78, 0.92),
  zone('q8', 'harvest', 0.92, 1.0),
]

/** 2025 V6 hybrid-style ERS windows (test fixture). */
const ERS_2025: SectionZone[] = [
  zone('25a', 'deploy', 0.0, 0.08),
  zone('25b', 'idle', 0.08, 0.14),
  zone('25c', 'harvest', 0.14, 0.2),
  zone('25d', 'deploy', 0.2, 0.32),
  zone('25e', 'idle', 0.32, 0.4),
  zone('25f', 'harvest', 0.4, 0.48),
  zone('25g', 'deploy', 0.48, 0.62),
  zone('25h', 'idle', 0.62, 0.7),
  zone('25i', 'harvest', 0.7, 0.78),
  zone('25j', 'deploy', 0.78, 0.9),
  zone('25k', 'recharge', 0.9, 1.0),
]

/**
 * 2026 heavier electrical map — more deploy / boost, recharge banks.
 * Purely illustrative for UI / colour testing.
 */
const ERS_2026: SectionZone[] = [
  zone('26a', 'boost', 0.0, 0.12),
  zone('26b', 'deploy', 0.12, 0.2),
  zone('26c', 'harvest', 0.2, 0.26),
  zone('26d', 'boost', 0.26, 0.38),
  zone('26e', 'deploy', 0.38, 0.48),
  zone('26f', 'recharge', 0.48, 0.55),
  zone('26g', 'boost', 0.55, 0.68),
  zone('26h', 'deploy', 0.68, 0.8),
  zone('26i', 'harvest', 0.8, 0.86),
  zone('26j', 'boost', 0.86, 0.96),
  zone('26k', 'recharge', 0.96, 1.0),
]

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

  // Merge tiny speckles (< ~1% lap) into neighbours for readable sections.
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

export function resolveSectionMap(
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
