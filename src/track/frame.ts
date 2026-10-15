/**
 * Shared planar frame for every track, line, and car.
 * +x east, +y north, meters. Each track picks its own origin.
 * Three.js is Y-up, so the view maps this to (x, up, -y) and looks down.
 * An Assetto Corsa extract only has to land in this frame; the view stays put.
 */

export type Xy = readonly [number, number]

export type TrackSample = {
  readonly x: number
  readonly y: number
  /** Meters from the reference line to each edge, along the driving direction. */
  readonly left: number
  readonly right: number
}

export type Track = {
  readonly id: string
  readonly name: string
  /** Closed ring. The first sample is not repeated at the end. */
  readonly samples: readonly TrackSample[]
}

export type Pose = {
  readonly x: number
  readonly y: number
  /** Radians from +x toward +y. */
  readonly heading: number
}

export type Bounds = {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly cx: number
  readonly cy: number
}

const arcLengths = new WeakMap<readonly Xy[], Float64Array>()

/** Meters → Three.js Y-up. */
export function toScene(x: number, y: number, up = 0): [number, number, number] {
  return [x, up, -y]
}

export function boundsOf(points: readonly { x: number; y: number }[]): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

function cumulative(points: readonly Xy[]): Float64Array {
  const cached = arcLengths.get(points)
  if (cached) return cached
  const n = points.length
  const acc = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    if (!a || !b) continue
    acc[i + 1] = acc[i] + Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  arcLengths.set(points, acc)
  return acc
}

/**
 * `t` is normalized arc length, 0 and 1 both the start of a closed ring.
 * Playback converts lap time → distance before calling this.
 */
export function samplePath(points: readonly Xy[], t: number): Pose {
  const n = points.length
  const first = points[0]
  if (!first || n < 2) return { x: first?.[0] ?? 0, y: first?.[1] ?? 0, heading: 0 }

  const acc = cumulative(points)
  const total = acc[n] ?? 0
  if (total <= 0) return { x: first[0], y: first[1], heading: 0 }

  const dist = (((t % 1) + 1) % 1) * total
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((acc[mid + 1] ?? 0) < dist) lo = mid + 1
    else hi = mid
  }

  const span = (acc[lo + 1] ?? 0) - (acc[lo] ?? 0) || 1
  const u = (dist - (acc[lo] ?? 0)) / span
  const a = points[lo] ?? first
  const b = points[(lo + 1) % n] ?? a
  return {
    x: a[0] + (b[0] - a[0]) * u,
    y: a[1] + (b[1] - a[1]) * u,
    heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
  }
}
