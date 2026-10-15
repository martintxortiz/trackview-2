/**
 * Lap channels for heatmaps.
 * Prefer real FastF1 car data when we have it for the track; otherwise a
 * curvature-limited point-mass estimate from the centerline.
 */
import type { Track } from '@/track/frame'
import { trackTelemetry } from '@/track/real-telemetry'
import { resampleTrack } from '@/track/smooth'

/** Dense equal-arc sampling (m) for curvature / envelope integration. */
const METRIC_SPACING = 1

export type MetricId =
  | 'speed'
  | 'brake'
  | 'throttle'
  | 'pedals'
  | 'battery'
  | 'tyres'

export const METRICS: { id: MetricId; name: string }[] = [
  { id: 'speed', name: 'Speed' },
  { id: 'brake', name: 'Brake' },
  { id: 'throttle', name: 'Throttle' },
  { id: 'pedals', name: 'Pedals' },
  { id: 'battery', name: 'Battery' },
  { id: 'tyres', name: 'Tyres' },
]

/**
 * Debug data feed for heatmaps / pedal sections.
 * Real F1 laps barely coast — Mistakes injects deliberate coast + errors.
 */
export type MetricsSourceId = 'auto' | 'physics' | 'mistakes'

export type LapMetrics = {
  /** m/s */
  speed: Float64Array
  /** 0–1 brake pressure */
  brake: Float64Array
  /** 0–1 throttle */
  throttle: Float64Array
  /** −1 brake … 0 coast … +1 throttle */
  pedals: Float64Array
  /** −1 harvest … 0 idle … +1 ERS deploy */
  battery: Float64Array
  /** Surface temp proxy °C */
  tyres: Float64Array
}

/**
 * Lateral grip with downforce: a_lat = A0 + B·v².
 * Corner limit: v² = A0 / (κ − B) when κ > B — so Eau Rouge–class bends
 * stay flat-out while hairpins still force a real brake zone.
 */
const A_LAT0 = 16
const A_LAT_DF = 0.0058
const A_ACCEL = 11
const A_BRAKE = 32
/** Soft top speed (m/s) ≈ 340 km/h. */
const V_MAX = 94.5
const KAPPA_EPS = 1e-5
/** Ignore tiny long-g so mid-corner noise stays coast, not brake. */
const COAST_BAND = 2.4
/** κ smooth window (samples @ 1 m). */
const KAPPA_WIN = 8
/** Longitudinal accel smooth window. */
const ACCEL_WIN = 5
/** Pedal / ERS / tyre temporal smooth. */
const OUT_WIN = 4

function cornerSpeedLimit(kappa: number): number {
  const denom = Math.max(kappa - A_LAT_DF, KAPPA_EPS)
  return Math.min(V_MAX, Math.sqrt(A_LAT0 / denom))
}

const cache = new WeakMap<Track, Map<MetricsSourceId, LapMetrics>>()

function unit(x: number, y: number): [number, number] {
  const len = Math.hypot(x, y) || 1
  return [x / len, y / len]
}

function boxSmooth(src: Float64Array, win: number): Float64Array {
  const n = src.length
  const out = new Float64Array(n)
  if (n === 0) return out
  const w = Math.max(0, Math.floor(win))
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let k = -w; k <= w; k++) sum += src[(i + k + n) % n]!
    out[i] = sum / (w * 2 + 1)
  }
  return out
}

/** Closed-ring curvature (1/m) via turning of unit tangent / ds. */
function curvature(track: Track): { kappa: Float64Array; ds: Float64Array } {
  const s = track.samples
  const n = s.length
  const kappa = new Float64Array(n)
  const ds = new Float64Array(n)
  if (n < 3) return { kappa, ds }

  for (let i = 0; i < n; i++) {
    const a = s[(i + n - 1) % n]!
    const b = s[i]!
    const c = s[(i + 1) % n]!
    const [tx0, ty0] = unit(b.x - a.x, b.y - a.y)
    const [tx1, ty1] = unit(c.x - b.x, c.y - b.y)
    const cross = tx0 * ty1 - ty0 * tx1
    const dot = Math.min(1, Math.max(-1, tx0 * tx1 + ty0 * ty1))
    const dTheta = Math.atan2(cross, dot)
    const seg = Math.hypot(c.x - b.x, c.y - b.y)
    const prev = Math.hypot(b.x - a.x, b.y - a.y)
    const span = 0.5 * (prev + seg) || 1
    kappa[i] = dTheta / span
    ds[i] = seg
  }
  return { kappa, ds }
}

function emptyMetrics(n: number): LapMetrics {
  return {
    speed: new Float64Array(n),
    brake: new Float64Array(n),
    throttle: new Float64Array(n),
    pedals: new Float64Array(n),
    battery: new Float64Array(n),
    tyres: new Float64Array(n),
  }
}

/** Real FastF1 lap → metric channels (speed m/s, pedals 0–1). */
function metricsFromReal(track: Track): LapMetrics | null {
  const pack = trackTelemetry(track.id)
  if (!pack) return null
  const tr = pack.a
  const n = tr.speed_kmh.length
  if (n < 3) return null

  const speed = new Float64Array(n)
  const brake = new Float64Array(n)
  const throttle = new Float64Array(n)
  const pedals = new Float64Array(n)
  const battery = new Float64Array(n)
  const tyreRaw = new Float64Array(n)

  // Geometry only for tyre / ERS proxies — pedals come from the car.
  const dense = resampleTrack(track, METRIC_SPACING)
  const { kappa } = curvature(dense)
  const kappaAbs = boxSmooth(
    Float64Array.from(kappa, (k) => Math.abs(k)),
    KAPPA_WIN,
  )
  const kn = kappaAbs.length || 1

  for (let i = 0; i < n; i++) {
    const vKmh = tr.speed_kmh[i]!
    const v = vKmh / 3.6
    let b = Math.min(1, Math.max(0, tr.brake[i]! / 100))
    let t = Math.min(1, Math.max(0, tr.throttle[i]! / 100))
    // Public Brake is often boolean — keep exclusive with throttle.
    if (b > 0.15 && t > 0.15) {
      if (b >= t) t = 0
      else b = 0
    }
    speed[i] = v
    brake[i] = b
    throttle[i] = t
    pedals[i] = t - b

    const k = kappaAbs[Math.floor((i / n) * kn) % kn]!
    const straight = Math.min(1, Math.max(0, 1 - k / 0.012))
    battery[i] = t * (0.35 + 0.65 * straight) - b

    const prev = tr.speed_kmh[Math.max(0, i - 1)]!
    const next = tr.speed_kmh[Math.min(n - 1, i + 1)]!
    const aApprox = ((next - prev) / 3.6) * (vKmh / 3.6) * 0.02
    const latG = (v * v * k) / 9.81
    const longG = Math.abs(aApprox) / 9.81
    const load = Math.min(1, latG / 4.2 + longG / 3.5 + b * 0.35)
    tyreRaw[i] = 78 + load * 38 + t * 4
  }

  const tyres = boxSmooth(tyreRaw, OUT_WIN + 2)
  const batterySmooth = boxSmooth(battery, OUT_WIN)
  for (let i = 0; i < n; i++) {
    battery[i] = Math.min(1, Math.max(-1, batterySmooth[i]!))
  }

  return { speed, brake, throttle, pedals, battery, tyres }
}

function buildMetrics(track: Track): LapMetrics {
  return metricsFromReal(track) ?? buildPhysics(track)
}

function cloneMetrics(m: LapMetrics): LapMetrics {
  return {
    speed: new Float64Array(m.speed),
    brake: new Float64Array(m.brake),
    throttle: new Float64Array(m.throttle),
    pedals: new Float64Array(m.pedals),
    battery: new Float64Array(m.battery),
    tyres: new Float64Array(m.tyres),
  }
}

/** Write exclusive pedals over a lap-fraction window (wraps allowed). */
function stampPedals(
  m: LapMetrics,
  from: number,
  to: number,
  brake: number,
  throttle: number,
  speedScale = 1,
) {
  const n = m.speed.length
  if (n < 2) return
  const u0 = ((from % 1) + 1) % 1
  const u1 = to > 1 ? to : ((to % 1) + 1) % 1
  const wrap = to > 1 || u1 <= u0
  const i0 = Math.floor(u0 * n)
  const i1 = wrap ? Math.floor(u1 * n) + n : Math.floor(u1 * n)
  for (let i = i0; i < i1; i++) {
    const idx = i % n
    m.brake[idx] = brake
    m.throttle[idx] = throttle
    m.pedals[idx] = throttle - brake
    if (speedScale !== 1) m.speed[idx]! *= speedScale
  }
}

/**
 * Deliberate coast + pedal mistakes on top of a clean lap so the pedals
 * heatmap / sections have something visible to paint (pros barely coast).
 */
function withMistakes(base: LapMetrics): LapMetrics {
  const m = cloneMetrics(base)
  // Coast on a straight — should be full throttle.
  stampPedals(m, 0.04, 0.1, 0, 0, 0.97)
  // Early brake into a zone that was still accelerating.
  stampPedals(m, 0.2, 0.26, 0.85, 0, 0.92)
  // Mid-corner coast (lift) instead of holding throttle.
  stampPedals(m, 0.38, 0.44, 0, 0, 0.95)
  // Late / soft throttle on exit.
  stampPedals(m, 0.55, 0.62, 0, 0.35)
  // Long coast before a brake zone (lift-and-coast).
  stampPedals(m, 0.72, 0.8, 0, 0, 0.96)
  // Trail-brake then full coast (neither pedal).
  stampPedals(m, 0.88, 0.93, 0.4, 0, 0.94)
  stampPedals(m, 0.93, 0.97, 0, 0, 0.97)
  return m
}

/** Curvature-limited point-mass lap — used when FastF1 is missing or forced. */
function buildPhysics(track: Track): LapMetrics {
  const dense = resampleTrack(track, METRIC_SPACING)
  const n = dense.samples.length
  if (n < 3) return emptyMetrics(n)

  const { kappa, ds } = curvature(dense)
  const kappaAbs = boxSmooth(
    Float64Array.from(kappa, (k) => Math.abs(k)),
    KAPPA_WIN,
  )

  // Local apex limit only — the backward pass places real brake points.
  // (Look-ahead min was wrongly scrubbing for Eau Rouge on the pit straight.)
  const vLimit = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    vLimit[i] = cornerSpeedLimit(kappaAbs[i]!)
  }

  const speed = new Float64Array(n)

  // Forward: acceleration-limited
  speed[0] = Math.min(vLimit[0]!, V_MAX * 0.7)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n
      const d = ds[i]!
      const next = Math.sqrt(speed[i]! * speed[i]! + 2 * A_ACCEL * d)
      speed[i1] = Math.min(vLimit[i1]!, next)
    }
  }

  // Backward: braking-limited into slow corners only
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const i0 = (i + n - 1) % n
      const d = ds[i0]!
      const prev = Math.sqrt(speed[i]! * speed[i]! + 2 * A_BRAKE * d)
      speed[i0] = Math.min(speed[i0]!, vLimit[i0]!, prev)
    }
  }

  const accel = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const d = ds[i]! || 1
    const v0 = speed[i]!
    const v1 = speed[(i + 1) % n]!
    accel[i] = (v1 * v1 - v0 * v0) / (2 * d)
  }
  const aSmooth = boxSmooth(accel, ACCEL_WIN)

  const brakeRaw = new Float64Array(n)
  const throttleRaw = new Float64Array(n)
  const batteryRaw = new Float64Array(n)
  const tyreRaw = new Float64Array(n)

  for (let i = 0; i < n; i++) {
    const a = aSmooth[i]!
    const v = speed[i]!
    const k = kappaAbs[i]!
    // Straightness: 0 in a hairpin, 1 on a straight.
    const straight = Math.min(1, Math.max(0, 1 - k / 0.012))

    // Exclusive pedals — brake OR throttle, intensity = how hard.
    if (a < -COAST_BAND) {
      brakeRaw[i] = Math.min(1, (-a - COAST_BAND) / (A_BRAKE - COAST_BAND))
      throttleRaw[i] = 0
    } else if (a > COAST_BAND) {
      throttleRaw[i] = Math.min(1, (a - COAST_BAND) / (A_ACCEL - COAST_BAND))
      brakeRaw[i] = 0
    } else if (straight > 0.45 || v > V_MAX * 0.82) {
      // Flat / high-speed bends: full throttle (Eau Rouge, Kemmel, etc.).
      throttleRaw[i] = 1
      brakeRaw[i] = 0
    } else {
      // Slow corner hold — partial throttle, never a fake brush of brake.
      throttleRaw[i] = Math.min(0.7, 0.35 + 0.45 * straight)
      brakeRaw[i] = 0
    }

    // ERS: harvest under braking, deploy on straight exits (throttle + low κ).
    const harvest = brakeRaw[i]!
    const deploy = throttleRaw[i]! * (0.35 + 0.65 * straight)
    batteryRaw[i] = deploy - harvest

    // Tyre temp proxy: lateral load + long load, base ~82 °C working window.
    const latG = (v * v * k) / 9.81
    const longG = Math.abs(a) / 9.81
    const load = Math.min(1, latG / 4.2 + longG / 3.5)
    tyreRaw[i] = 78 + load * 38 + throttleRaw[i]! * 4
  }

  const brake = boxSmooth(brakeRaw, OUT_WIN)
  const throttle = boxSmooth(throttleRaw, OUT_WIN)
  const battery = boxSmooth(batteryRaw, OUT_WIN)
  const tyres = boxSmooth(tyreRaw, OUT_WIN + 2)
  const pedals = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    // Re-clamp after smooth; keep exclusive-ish.
    const b = Math.min(1, Math.max(0, brake[i]!))
    const t = Math.min(1, Math.max(0, throttle[i]!))
    if (b > 0.08 && t > 0.08) {
      if (b >= t) {
        brake[i] = b
        throttle[i] = 0
      } else {
        throttle[i] = t
        brake[i] = 0
      }
    } else {
      brake[i] = b
      throttle[i] = t
    }
    pedals[i] = throttle[i]! - brake[i]!
    battery[i] = Math.min(1, Math.max(-1, battery[i]!))
  }

  return { speed, brake, throttle, pedals, battery, tyres }
}

function buildForSource(track: Track, source: MetricsSourceId): LapMetrics {
  switch (source) {
    case 'auto':
      return buildMetrics(track)
    case 'physics':
      return buildPhysics(track)
    case 'mistakes': {
      const base = metricsFromReal(track) ?? buildPhysics(track)
      return withMistakes(base)
    }
    default: {
      const _exhaustive: never = source
      return _exhaustive
    }
  }
}

export function lapMetrics(
  track: Track,
  source: MetricsSourceId = 'auto',
): LapMetrics {
  let bySource = cache.get(track)
  if (!bySource) {
    bySource = new Map()
    cache.set(track, bySource)
  }
  const hit = bySource.get(source)
  if (hit) return hit
  const built = buildForSource(track, source)
  bySource.set(source, built)
  return built
}

/** Linear sample of a closed per-sample series at normalized arc index `t`. */
export function sampleSeries(series: ArrayLike<number>, t: number): number {
  const n = series.length
  if (n === 0) return 0
  if (n === 1) return series[0]!
  const u = ((t % 1) + 1) % 1
  const f = u * n
  const i0 = Math.floor(f) % n
  const i1 = (i0 + 1) % n
  const s = f - Math.floor(f)
  return series[i0]! + (series[i1]! - series[i0]!) * s
}

export function metricRange(
  series: ArrayLike<number>,
): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < series.length; i++) {
    const v = series[i]!
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { min: 0, max: 1 }
  }
  return { min, max }
}

/** Heatmap/legend range — bipolar channels stay centered on zero. */
export function metricDisplayRange(
  id: MetricId,
  series: ArrayLike<number>,
): { min: number; max: number } {
  const r = metricRange(series)
  switch (id) {
    case 'pedals':
      // Fixed so coast sits in the middle: red ← dim → green.
      return { min: -1, max: 1 }
    case 'battery': {
      const m = Math.max(Math.abs(r.min), Math.abs(r.max), 0.35)
      return { min: -m, max: m }
    }
    case 'brake':
    case 'throttle':
      return { min: 0, max: Math.max(r.max, 0.4) }
    case 'speed':
    case 'tyres':
      return r
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}

export function seriesFor(metrics: LapMetrics, id: MetricId): Float64Array {
  switch (id) {
    case 'speed':
      return metrics.speed
    case 'brake':
      return metrics.brake
    case 'throttle':
      return metrics.throttle
    case 'pedals':
      return metrics.pedals
    case 'battery':
      return metrics.battery
    case 'tyres':
      return metrics.tyres
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}

/** Display units for a metric value. */
export function formatMetricValue(id: MetricId, value: number): string {
  switch (id) {
    case 'speed':
      return `${Math.round(value * 3.6)}`
    case 'brake':
    case 'throttle':
      return `${Math.round(value * 100)}`
    case 'pedals':
    case 'battery':
      return value >= 0 ? `+${Math.round(value * 100)}` : `${Math.round(value * 100)}`
    case 'tyres':
      return `${Math.round(value)}`
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}

export function metricUnit(id: MetricId): string {
  switch (id) {
    case 'speed':
      return 'km/h'
    case 'brake':
    case 'throttle':
      return '%'
    case 'pedals':
      return 'B / T'
    case 'battery':
      return 'H / D'
    case 'tyres':
      return '°C'
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}
