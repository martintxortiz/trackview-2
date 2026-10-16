import { trackTelemetry } from '@/track/real-telemetry'

const GREEN = '#4ade4a'
const RED = '#ff3b30'

export const SECTORS = [
  { name: 'S1', delta: -0.142, flex: 1.2 },
  { name: 'S2', delta: 0.088, flex: 0.8 },
  { name: 'S3', delta: -0.056, flex: 1 },
  { name: 'S4', delta: -0.211, flex: 1.4 },
  { name: 'S5', delta: 0.134, flex: 1 },
  { name: 'S6', delta: -0.073, flex: 0.9 },
  { name: 'S7', delta: 0.095, flex: 1.1 },
  { name: 'S8', delta: -0.038, flex: 1 },
] as const

export type Sector = (typeof SECTORS)[number]

const TOTAL_FLEX = SECTORS.reduce((sum, s) => sum + s.flex, 0)

const SPA = trackTelemetry('spa')
if (!SPA) {
  throw new Error('Missing Spa FastF1 telemetry (src/track/data/spa-telemetry.json)')
}

/** Spa Q flying lap duration from FastF1 (series B / comparison). */
export const LAP_DURATION_MS = SPA.b.lap_ms
export const PLAYBACK_STEP_MS = 100
export const PLAYBACK_JUMP_MS = 1_000

export const PLAYBACK_RATES = [0.25, 0.5, 1, 2, 4] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

export const CHART_POINT_COUNT = SPA.a.speed_kmh.length
/** Reference trace (faster Q lap). */
export const SERIES_A_COLOR = '#c4c9cf'
/** Driven / comparison trace and the map highlight. */
export const SERIES_B_COLOR = '#349cff'

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

export const CHART_SERIES_A = SPA.a.speed_kmh
export const CHART_SERIES_B = SPA.b.speed_kmh
export const CHART_THROTTLE_A = SPA.a.throttle
export const CHART_THROTTLE_B = SPA.b.throttle
export const CHART_BRAKE_A = SPA.a.brake
export const CHART_BRAKE_B = SPA.b.brake

const N = CHART_POINT_COUNT
const speedA = CHART_SERIES_A
const speedB = CHART_SERIES_B

/**
 * Cumulative time along distance for the driven car (series B).
 * Index i ↔ distance i/(N-1); values normalized to [0, 1] lap time.
 */
const TIME_AT_DISTANCE = (() => {
  const acc = new Float64Array(N)
  for (let i = 1; i < N; i++) {
    const v0 = speedB[i - 1]!
    const v1 = speedB[i]!
    const avg = Math.max(1, (v0 + v1) / 2)
    // Δs ∝ 1/(N-1); Δt ∝ Δs / v — only relative shape matters before normalize.
    acc[i] = acc[i - 1]! + 1 / avg
  }
  const total = acc[N - 1]! || 1
  for (let i = 0; i < N; i++) acc[i]! /= total
  return acc
})()

function sampleTable(table: Float64Array, ratio: number) {
  const maxIdx = table.length - 1
  if (maxIdx <= 0) return table[0] ?? 0
  const pos = clamp(ratio, 0, 1) * maxIdx
  const i = Math.floor(pos)
  const a = table[i]!
  return a + ((table[Math.min(i + 1, maxIdx)]! - a) * (pos - i))
}

/** Distance fraction → lap-time fraction (driven car). */
export function distanceRatioToTime(distanceRatio: number) {
  return sampleTable(TIME_AT_DISTANCE, distanceRatio)
}

/** Lap-time fraction → distance fraction (driven car). */
export function timeRatioToDistance(timeRatio: number) {
  const target = clamp(timeRatio, 0, 1)
  if (target <= 0) return 0
  if (target >= 1) return 1

  let lo = 0
  let hi = N - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((TIME_AT_DISTANCE[mid] ?? 0) < target) lo = mid + 1
    else hi = mid
  }

  const i = Math.max(1, lo)
  const t0 = TIME_AT_DISTANCE[i - 1]!
  const t1 = TIME_AT_DISTANCE[i]!
  const span = t1 - t0 || 1
  const u = (target - t0) / span
  return (i - 1 + u) / (N - 1)
}

/** Total lap delta (s) — B relative to A from real lap times. */
const TOTAL_DELTA = (SPA.b.lap_ms - SPA.a.lap_ms) / 1000

/** Cumulative time delta of B relative to A, scaled to end on the lap total. */
function buildDelta(): number[] {
  const raw: number[] = [0]
  for (let i = 1; i < N; i++) {
    raw.push(raw[i - 1]! + 1 / speedB[i]! - 1 / speedA[i]!)
  }
  const end = raw[raw.length - 1]!
  const scale = end === 0 ? 0 : TOTAL_DELTA / end
  return raw.map((v) => Math.round(v * scale * 1000) / 1000)
}

export const CHART_DELTA = buildDelta()

/** Tick marks around the real delta range. */
export const CHART_DELTA_TICKS = (() => {
  const lo = Math.min(...CHART_DELTA, TOTAL_DELTA, 0)
  const hi = Math.max(...CHART_DELTA, TOTAL_DELTA, 0)
  const pad = Math.max(0.05, (hi - lo) * 0.15)
  const min = Math.floor((lo - pad) * 20) / 20
  const max = Math.ceil((hi + pad) * 20) / 20
  const step = Math.max(0.05, Math.round(((max - min) / 4) * 20) / 20)
  const ticks: number[] = []
  for (let v = min; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 100) / 100)
  }
  return ticks.length >= 3 ? ticks : [-0.1, -0.05, 0, 0.05, 0.1]
})()

export function formatDelta(delta: number) {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(3)}`
}

export function sampleSeries(series: readonly number[], ratio: number) {
  const maxIdx = series.length - 1
  if (maxIdx <= 0) return series[0] ?? 0
  const pos = clamp(ratio, 0, 1) * maxIdx
  const i = Math.floor(pos)
  const a = series[i]!
  return a + ((series[Math.min(i + 1, maxIdx)]! - a) * (pos - i))
}

export function formatLapTime(ms: number) {
  const totalSec = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSec / 60)
  return `${minutes}:${(totalSec - minutes * 60).toFixed(3).padStart(6, '0')}`
}

export function formatPlaybackRate(rate: number) {
  if (rate === 1) return '1×'
  if (Number.isInteger(rate)) return `${rate}×`
  return `${rate}×`
}

export function sectorAccent(delta: number) {
  return delta <= 0 ? GREEN : RED
}

export function sectorAtRatio(ratio: number): Sector {
  const clamped = clamp(ratio, 0, 1)
  let acc = 0
  for (const sector of SECTORS) {
    acc += sector.flex / TOTAL_FLEX
    if (clamped <= acc) return sector
  }
  return SECTORS[SECTORS.length - 1]!
}
