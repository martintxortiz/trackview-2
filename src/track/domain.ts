/**
 * Shared domain contracts for track geometry, telemetry, and lap metrics.
 * Units are documented on each field. Brands are compile-time only.
 */

import { err, ok, type Result } from '@/lib/result'
import type { Track, TrackSample, Xy } from '@/track/frame'

/** Opaque track identifier (e.g. `"spa"`). */
export type TrackId = string & { readonly __brand: 'TrackId' }

/** Length in meters. */
export type Meters = number & { readonly __brand: 'Meters' }

/** Duration in seconds. */
export type Seconds = number & { readonly __brand: 'Seconds' }

/** Normalized lap position in [0, 1]. */
export type LapFraction = number & { readonly __brand: 'LapFraction' }

export type { Track, TrackSample, Xy }

/**
 * JSON boundary shape for centerline + optional raceline.
 * `samples` are `[x, y, left, right]` meters (+x east, +y north).
 * `race` is `[x, y]` meters when present.
 */
export type TrackFile = {
  readonly id: string
  readonly name: string
  readonly samples: readonly (readonly [number, number, number, number])[]
  readonly race?: readonly (readonly [number, number])[]
  /** TUMFTM attribution. */
  readonly source?: string
}

/** Metric channel identifiers used by heatmaps and series selectors. */
export type MetricId =
  | 'speed'
  | 'brake'
  | 'throttle'
  | 'pedals'
  | 'battery'
  | 'tyres'

/**
 * Equal-distance lap channels. Array length matches resampled path samples.
 * Units: speed m/s; brake/throttle 0–1; pedals/battery −1…+1; tyres °C proxy.
 */
export type LapMetrics = {
  readonly speed: Float64Array
  readonly brake: Float64Array
  readonly throttle: Float64Array
  readonly pedals: Float64Array
  readonly battery: Float64Array
  readonly tyres: Float64Array
}

/** Lap-fraction band with display color. */
export type SectionZone = {
  readonly id: string
  readonly name: string
  /** Lap fraction [0, 1). */
  readonly from: number
  /** Lap fraction (0, 1]. */
  readonly to: number
  readonly color: string
}

export type DomainError = {
  readonly code: 'parse' | 'not_found' | 'invalid'
  readonly message: string
}

export function asTrackId(id: string): TrackId {
  return id as TrackId
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function isSampleTuple(
  v: unknown,
): v is readonly [number, number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1]) &&
    isFiniteNumber(v[2]) &&
    isFiniteNumber(v[3])
  )
}

function isXyTuple(v: unknown): v is readonly [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1])
  )
}

/** Parse geometry JSON into a `Track` plus optional raceline. */
export function parseTrack(
  raw: unknown,
): Result<{ track: Track; race: readonly Xy[] }, DomainError> {
  if (raw === null || typeof raw !== 'object') {
    return err({ code: 'parse', message: 'TrackFile must be an object' })
  }
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id.length === 0) {
    return err({ code: 'parse', message: 'TrackFile.id must be a non-empty string' })
  }
  if (typeof o.name !== 'string' || o.name.length === 0) {
    return err({ code: 'parse', message: 'TrackFile.name must be a non-empty string' })
  }
  if (!Array.isArray(o.samples) || o.samples.length < 2) {
    return err({
      code: 'parse',
      message: 'TrackFile.samples must be an array of at least 2 tuples',
    })
  }
  const samples: TrackSample[] = []
  for (let i = 0; i < o.samples.length; i++) {
    const row = o.samples[i]
    if (!isSampleTuple(row)) {
      return err({
        code: 'parse',
        message: `TrackFile.samples[${i}] must be [x, y, left, right] numbers`,
      })
    }
    samples.push({ x: row[0], y: row[1], left: row[2], right: row[3] })
  }

  let race: Xy[] = []
  if (o.race !== undefined) {
    if (!Array.isArray(o.race)) {
      return err({ code: 'parse', message: 'TrackFile.race must be an array' })
    }
    for (let i = 0; i < o.race.length; i++) {
      const row = o.race[i]
      if (!isXyTuple(row)) {
        return err({
          code: 'parse',
          message: `TrackFile.race[${i}] must be [x, y] numbers`,
        })
      }
      race.push([row[0], row[1]])
    }
  }

  return ok({
    track: { id: o.id, name: o.name, samples },
    race,
  })
}

/** Equal-distance FastF1-style trace. */
export type TelemetryTrace = {
  /** km/h */
  speed_kmh: number[]
  /** 0–100 */
  throttle: number[]
  /** 0–100 */
  brake: number[]
  lap_ms: number
  driver: string
  team: string
  distance_m: number
}

export type TrackTelemetry = {
  readonly trackId: string
  readonly source: string
  /** Faster / reference lap */
  readonly a: TelemetryTrace
  /** Comparison lap */
  readonly b: TelemetryTrace
}

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every(isFiniteNumber)
}

function parseTrace(
  raw: unknown,
  label: string,
): Result<TelemetryTrace, DomainError> {
  if (raw === null || typeof raw !== 'object') {
    return err({ code: 'parse', message: `${label} must be an object` })
  }
  const o = raw as Record<string, unknown>
  if (!isNumberArray(o.speed_kmh)) {
    return err({ code: 'parse', message: `${label}.speed_kmh must be number[]` })
  }
  if (!isNumberArray(o.throttle)) {
    return err({ code: 'parse', message: `${label}.throttle must be number[]` })
  }
  if (!isNumberArray(o.brake)) {
    return err({ code: 'parse', message: `${label}.brake must be number[]` })
  }
  if (!isFiniteNumber(o.lap_ms)) {
    return err({ code: 'parse', message: `${label}.lap_ms must be a number` })
  }
  if (typeof o.driver !== 'string') {
    return err({ code: 'parse', message: `${label}.driver must be a string` })
  }
  if (typeof o.team !== 'string') {
    return err({ code: 'parse', message: `${label}.team must be a string` })
  }
  if (!isFiniteNumber(o.distance_m)) {
    return err({ code: 'parse', message: `${label}.distance_m must be a number` })
  }
  return ok({
    speed_kmh: o.speed_kmh,
    throttle: o.throttle,
    brake: o.brake,
    lap_ms: o.lap_ms,
    driver: o.driver,
    team: o.team,
    distance_m: o.distance_m,
  })
}

/** Parse telemetry JSON at the data boundary. */
export function parseTelemetry(raw: unknown): Result<TrackTelemetry, DomainError> {
  if (raw === null || typeof raw !== 'object') {
    return err({ code: 'parse', message: 'TrackTelemetry must be an object' })
  }
  const o = raw as Record<string, unknown>
  if (typeof o.trackId !== 'string' || o.trackId.length === 0) {
    return err({ code: 'parse', message: 'trackId must be a non-empty string' })
  }
  if (typeof o.source !== 'string') {
    return err({ code: 'parse', message: 'source must be a string' })
  }
  const a = parseTrace(o.a, 'a')
  if (!a.ok) return a
  const b = parseTrace(o.b, 'b')
  if (!b.ok) return b
  return ok({
    trackId: o.trackId,
    source: o.source,
    a: a.value,
    b: b.value,
  })
}
