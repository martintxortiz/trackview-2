/**
 * Closed-ring resample without a Three.js dependency.
 * Catmull-Rom (tension 0.5) + arc-length parameterization match
 * THREE.CatmullRomCurve3(…, true, 'catmullrom', 0.5) used previously.
 */
import type { Track, TrackSample } from '@/track/frame'

/** Default divisions for cumulative arc-length table (Three.js Curve default). */
const ARC_LENGTH_DIVISIONS = 200

/** Cache resampled rings per source track + spacing bucket. */
const resampleCache = new WeakMap<Track, Map<number, Track>>()

type Xy = { x: number; y: number }

/** Cubic Hermite coeffs for Catmull-Rom with uniform tension. */
function catmullRom1d(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
  tension: number,
): number {
  const t0 = tension * (p2 - p0)
  const t1 = tension * (p3 - p1)
  const c0 = p1
  const c1 = t0
  const c2 = -3 * p1 + 3 * p2 - 2 * t0 - t1
  const c3 = 2 * p1 - 2 * p2 + t0 + t1
  const t2 = t * t
  const t3 = t2 * t
  return c0 + c1 * t + c2 * t2 + c3 * t3
}

/** Parameter-space sample on a closed Catmull-Rom ring. `t` ∈ [0, 1]. */
function getPoint(points: readonly Xy[], t: number, tension: number): Xy {
  const l = points.length
  const p = l * t
  let intPoint = Math.floor(p)
  let weight = p - intPoint

  intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l

  const p0 = points[(intPoint - 1 + l) % l]!
  const p1 = points[intPoint % l]!
  const p2 = points[(intPoint + 1) % l]!
  const p3 = points[(intPoint + 2) % l]!

  return {
    x: catmullRom1d(p0.x, p1.x, p2.x, p3.x, weight, tension),
    y: catmullRom1d(p0.y, p1.y, p2.y, p3.y, weight, tension),
  }
}

/** Cumulative arc lengths with `divisions` parameter-space samples. */
function getLengths(points: readonly Xy[], tension: number, divisions: number): number[] {
  const cache: number[] = [0]
  let last = getPoint(points, 0, tension)
  let sum = 0
  for (let p = 1; p <= divisions; p++) {
    const current = getPoint(points, p / divisions, tension)
    sum += Math.hypot(current.x - last.x, current.y - last.y)
    cache.push(sum)
    last = current
  }
  return cache
}

/** Map arc-length fraction `u` ∈ [0, 1] to parameter `t` (Three.js Curve). */
function getUtoTmapping(arcLengths: readonly number[], u: number): number {
  const il = arcLengths.length
  const targetArcLength = u * arcLengths[il - 1]!

  let low = 0
  let high = il - 1
  let i = 0
  while (low <= high) {
    i = Math.floor(low + (high - low) / 2)
    const comparison = arcLengths[i]! - targetArcLength
    if (comparison < 0) low = i + 1
    else if (comparison > 0) high = i - 1
    else {
      high = i
      break
    }
  }

  i = high
  if (arcLengths[i] === targetArcLength) return i / (il - 1)

  const lengthBefore = arcLengths[i]!
  const lengthAfter = arcLengths[i + 1]!
  const segmentLength = lengthAfter - lengthBefore
  const segmentFraction = (targetArcLength - lengthBefore) / segmentLength
  return (i + segmentFraction) / (il - 1)
}

/** Closed Catmull-Rom resample — denser when `spacing` (meters) is smaller. */
export function resampleTrack(track: Track, spacing: number): Track {
  const src = track.samples
  const n = src.length
  if (n < 3) return track

  const key = Math.round(Math.max(spacing, 1e-3) * 1000)
  let bySpacing = resampleCache.get(track)
  if (!bySpacing) {
    bySpacing = new Map()
    resampleCache.set(track, bySpacing)
  }
  const hit = bySpacing.get(key)
  if (hit) return hit

  const points: Xy[] = src.map((s) => ({ x: s.x, y: s.y }))
  const tension = 0.5
  const arcLengths = getLengths(points, tension, ARC_LENGTH_DIVISIONS)
  const length = arcLengths[arcLengths.length - 1]!
  const count = Math.max(n, Math.ceil(length / Math.max(spacing, 1e-3)))
  const samples: TrackSample[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const u = i / count
    const t = getUtoTmapping(arcLengths, u)
    const pt = getPoint(points, t, tension)
    const f = u * n
    const i0 = Math.floor(f) % n
    const i1 = (i0 + 1) % n
    const frac = f - Math.floor(f)
    const a = src[i0]!
    const b = src[i1]!
    samples[i] = {
      x: pt.x,
      y: pt.y,
      left: a.left + (b.left - a.left) * frac,
      right: a.right + (b.right - a.right) * frac,
    }
  }

  const out: Track = { ...track, samples }
  bySpacing.set(key, out)
  return out
}
