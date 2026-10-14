export const SECTOR_GREEN = '#4ade4a'
export const SECTOR_RED = '#ff3b30'

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

export const SECTOR_TOTAL_FLEX = SECTORS.reduce(
  (sum, sector) => sum + sector.flex,
  0,
)

export const LAP_DURATION_MS = 86_243
export const PLAYBACK_STEP_MS = 100
export const PLAYBACK_JUMP_MS = 1_000

/** Sampled distance samples across one lap (for chart x-axis). */
export const CHART_POINT_COUNT = 250
export const CHART_Y_MIN = 60
export const CHART_Y_MAX = 330
export const SERIES_A_COLOR = '#c4c9cf'
/** Soft teal chart accent — pairs with the darker palette. */
export const SERIES_B_COLOR = '#7dd4bc'

/**
 * Corner profile for a synthetic speed trace:
 * apex at `at` (0–1 lap distance), floor speed, braking sharpness, exit sharpness.
 */
const CORNERS = [
  { at: 0.08, floor: 118, brake: 0.018, exit: 0.045 },
  { at: 0.18, floor: 92, brake: 0.014, exit: 0.038 },
  { at: 0.27, floor: 145, brake: 0.012, exit: 0.04 },
  { at: 0.36, floor: 78, brake: 0.016, exit: 0.042 },
  { at: 0.48, floor: 168, brake: 0.02, exit: 0.05 },
  { at: 0.58, floor: 105, brake: 0.013, exit: 0.036 },
  { at: 0.69, floor: 88, brake: 0.015, exit: 0.04 },
  { at: 0.78, floor: 132, brake: 0.017, exit: 0.044 },
  { at: 0.9, floor: 98, brake: 0.014, exit: 0.048 },
] as const

const TOP_SPEED = 318
const CRUISE = 286

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Build a lap speed (km/h) at normalized distance `t` in [0, 1]. */
function speedAt(t: number, bias: number): number {
  let speed = CRUISE + bias * 4

  // Long straight peaks between corner clusters
  const straightBoost =
    32 * Math.sin(Math.PI * smoothstep(0.38, 0.46, t)) *
      (1 - smoothstep(0.46, 0.52, t)) +
    26 * Math.sin(Math.PI * smoothstep(0.8, 0.86, t)) *
      (1 - smoothstep(0.86, 0.94, t))
  speed += straightBoost

  for (const corner of CORNERS) {
    const entry = corner.at - corner.brake
    const exit = corner.at + corner.exit
    if (t < entry || t > exit) continue

    const floor = corner.floor + bias * 6
    if (t <= corner.at) {
      const k = smoothstep(entry, corner.at, t)
      // Sharp braking into apex (slightly eased near the floor)
      const brakeCurve = k * k * (2 - k)
      speed = speed * (1 - brakeCurve) + floor * brakeCurve
    } else {
      const k = smoothstep(corner.at, exit, t)
      // Progressive exit acceleration
      const exitCurve = Math.sqrt(k)
      speed = floor * (1 - exitCurve) + speed * exitCurve
    }
  }

  // Small high-frequency wobble so the line isn't perfectly synthetic
  const wobble =
    Math.sin(t * 71.3) * 1.4 + Math.sin(t * 113.7 + bias) * 0.9
  return clamp(Math.round(speed + wobble), 70, TOP_SPEED)
}

function buildSeries(bias: number): number[] {
  const out: number[] = []
  for (let i = 0; i < CHART_POINT_COUNT; i++) {
    out.push(speedAt(i / (CHART_POINT_COUNT - 1), bias))
  }
  return out
}

export const CHART_POINTS = Array.from(
  { length: CHART_POINT_COUNT },
  (_, i) => i,
)
export const CHART_SERIES_A = buildSeries(3)
export const CHART_SERIES_B = buildSeries(-3)

export function formatDelta(delta: number) {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(3)}`
}

export function sampleSeries(series: readonly number[], ratio: number) {
  const maxIdx = series.length - 1
  if (maxIdx <= 0) return series[0] ?? 0
  const pos = Math.min(1, Math.max(0, ratio)) * maxIdx
  const i = Math.floor(pos)
  const t = pos - i
  const a = series[i]!
  const b = series[Math.min(i + 1, maxIdx)]!
  return a + (b - a) * t
}

export function formatLapTime(ms: number) {
  const totalSec = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec - minutes * 60
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`
}

export function sectorAccent(delta: number) {
  return delta <= 0 ? SECTOR_GREEN : SECTOR_RED
}

export function sectorAtRatio(ratio: number): Sector {
  const clamped = Math.min(1, Math.max(0, ratio))
  let acc = 0
  for (const sector of SECTORS) {
    acc += sector.flex / SECTOR_TOTAL_FLEX
    if (clamped <= acc) return sector
  }
  return SECTORS[SECTORS.length - 1]
}

export type VehicleState = {
  speed: number
  throttle: number
  brake: number
  gear: number
  rpm: number
  steerDeg: number
  abs: boolean
  tc: boolean
  fuelL: number
}

/** Chassis / handling metrics derived from the same lap sample. */
export type DynamicsState = {
  latG: number
  longG: number
  yawRate: number
  slipAngle: number
  rollDeg: number
}

const GEAR_TOPS = [0, 85, 120, 155, 195, 240, 280, TOP_SPEED] as const

function gearFromSpeed(speed: number) {
  for (let gear = 1; gear < GEAR_TOPS.length; gear++) {
    if (speed < GEAR_TOPS[gear]!) return gear
  }
  return 7
}

function rpmFromSpeed(speed: number, gear: number, throttle: number) {
  const lo = GEAR_TOPS[gear - 1] ?? 0
  const hi = GEAR_TOPS[gear] ?? TOP_SPEED
  const span = Math.max(1, hi - lo)
  const inGear = clamp((speed - lo) / span, 0, 1)
  const base = 4200 + inGear * 3000
  return Math.round(clamp(base + throttle * 6, 3800, 7800))
}

/** Instant vehicle inputs derived from the same synthetic lap as the chart. */
export function sampleVehicleState(
  ratio: number,
  bias: number,
  fuelStartL: number,
): VehicleState {
  const t = clamp(ratio, 0, 1)
  const speed = speedAt(t, bias)

  let brake = 0
  let throttle = 0
  let steerDeg = 0
  let inCorner = false

  for (let i = 0; i < CORNERS.length; i++) {
    const corner = CORNERS[i]!
    const entry = corner.at - corner.brake
    const exit = corner.at + corner.exit
    if (t < entry || t > exit) continue

    inCorner = true
    const sign = i % 2 === 0 ? -1 : 1
    const peakSteer = 18 + (180 - corner.floor) * 0.22

    if (t <= corner.at) {
      const k = smoothstep(entry, corner.at, t)
      const brakeCurve = k * k * (2 - k)
      brake = Math.round(28 + brakeCurve * 72)
      throttle = Math.round((1 - brakeCurve) * 12)
      steerDeg = Math.round(sign * peakSteer * (0.35 + brakeCurve * 0.65))
    } else {
      const k = smoothstep(corner.at, exit, t)
      const exitCurve = Math.sqrt(k)
      throttle = Math.round(35 + exitCurve * 65)
      brake = Math.round((1 - exitCurve) * 10)
      steerDeg = Math.round(sign * peakSteer * (1 - exitCurve * 0.85))
    }
    break
  }

  if (!inCorner) {
    const prev = speedAt(Math.max(0, t - 0.004), bias)
    const delta = speed - prev
    if (delta < -0.8) {
      brake = Math.round(clamp(-delta * 18, 8, 55))
      throttle = 0
    } else {
      throttle = Math.round(clamp(70 + delta * 10 + bias, 55, 100))
      brake = 0
    }
    steerDeg = Math.round(Math.sin(t * 36 + bias) * 3)
  }

  const gear = gearFromSpeed(speed)
  const rpm = rpmFromSpeed(speed, gear, throttle)
  const abs = brake >= 70
  const tc = throttle >= 80 && speed < 160 && inCorner
  const burn = 0.2 + bias * 0.01
  const fuelL = Math.max(0, fuelStartL * (1 - t * burn))

  return {
    speed,
    throttle,
    brake,
    gear,
    rpm,
    steerDeg,
    abs,
    tc,
    fuelL: Math.round(fuelL * 10) / 10,
  }
}

/** Instant handling loads derived from vehicle inputs at lap progress. */
export function sampleDynamicsState(
  ratio: number,
  bias: number,
  fuelStartL: number,
): DynamicsState {
  const state = sampleVehicleState(ratio, bias, fuelStartL)
  const speedMs = state.speed / 3.6
  const steerRad = (state.steerDeg * Math.PI) / 180

  const latG = clamp(
    (speedMs * speedMs * Math.tan(steerRad)) / 9.81 / 48 +
      Math.sin(ratio * 41 + bias) * 0.08,
    -2.4,
    2.4,
  )
  const longG = clamp(
    (state.throttle - state.brake) / 55 + Math.sin(ratio * 19) * 0.04,
    -1.8,
    1.4,
  )
  const yawRate = clamp(
    state.steerDeg * (0.35 + speedMs / 90) + Math.sin(ratio * 53) * 1.2,
    -55,
    55,
  )
  const slipAngle = clamp(
    state.steerDeg * 0.22 +
      (state.throttle > 70 ? (state.throttle - 70) * 0.08 : 0) -
      (state.brake > 50 ? (state.brake - 50) * 0.05 : 0) +
      bias * 0.15,
    -12,
    12,
  )
  const rollDeg = clamp(latG * 1.35 + Math.sin(ratio * 27) * 0.2, -4.5, 4.5)

  return {
    latG: Math.round(latG * 100) / 100,
    longG: Math.round(longG * 100) / 100,
    yawRate: Math.round(yawRate * 10) / 10,
    slipAngle: Math.round(slipAngle * 10) / 10,
    rollDeg: Math.round(rollDeg * 10) / 10,
  }
}
