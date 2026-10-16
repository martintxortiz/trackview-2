import { toScene, type Track, type Xy } from '@/track/frame'

type Pt = readonly [number, number]

const MITER_LIMIT = 4

/** Unit tangent at sample i (closed ring). */
function tangentAt(
  samples: readonly { x: number; y: number }[],
  i: number,
): [number, number] {
  const n = samples.length
  const prev = samples[(i + n - 1) % n]!
  const next = samples[(i + 1) % n]!
  const tx = next.x - prev.x
  const ty = next.y - prev.y
  const len = Math.hypot(tx, ty) || 1
  return [tx / len, ty / len]
}

/**
 * Offset a closed polyline by `dist` along the left normal, with miter joins.
 * Positive dist = left of travel; negative = right.
 */
export function offsetPolyline(
  points: readonly Xy[],
  dist: number,
  closed = true,
): Xy[] {
  const n = points.length
  if (n < 2) return []
  const out: Xy[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const p = points[i]!
    const prev = points[closed ? (i + n - 1) % n : Math.max(0, i - 1)]!
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!

    let tx0 = p[0] - prev[0]
    let ty0 = p[1] - prev[1]
    let tx1 = next[0] - p[0]
    let ty1 = next[1] - p[1]
    const l0 = Math.hypot(tx0, ty0) || 1
    const l1 = Math.hypot(tx1, ty1) || 1
    tx0 /= l0
    ty0 /= l0
    tx1 /= l1
    ty1 /= l1

    // Left normals of incoming / outgoing segments.
    const nx0 = -ty0
    const ny0 = tx0
    const nx1 = -ty1
    const ny1 = tx1

    let mx = nx0 + nx1
    let my = ny0 + ny1
    const mLen = Math.hypot(mx, my)
    if (mLen < 1e-8) {
      // 180° fold — fall back to segment normal.
      out[i] = [p[0] + nx0 * dist, p[1] + ny0 * dist]
      continue
    }
    mx /= mLen
    my /= mLen
    // Scale so projected offset along either normal equals |dist|.
    const cos = Math.max(mx * nx0 + my * ny0, 1 / MITER_LIMIT)
    const scale = dist / cos
    out[i] = [p[0] + mx * scale, p[1] + my * scale]
  }

  return out
}

/** Left/right edges of a closed track, mitered for sharp corners. */
export function trackSides(track: Track): { left: Pt[]; right: Pt[] } {  const samples = track.samples
  const n = samples.length
  const left: Pt[] = new Array(n)
  const right: Pt[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const point = samples[i]!
    const [tx, ty] = tangentAt(samples, i)
    const nx = -ty
    const ny = tx

    // Miter from adjacent segment normals (same as offsetPolyline).
    const prev = samples[(i + n - 1) % n]!
    const next = samples[(i + 1) % n]!
    let tx0 = point.x - prev.x
    let ty0 = point.y - prev.y
    let tx1 = next.x - point.x
    let ty1 = next.y - point.y
    const l0 = Math.hypot(tx0, ty0) || 1
    const l1 = Math.hypot(tx1, ty1) || 1
    tx0 /= l0
    ty0 /= l0
    tx1 /= l1
    ty1 /= l1
    const nx0 = -ty0
    const ny0 = tx0
    const nx1 = -ty1
    const ny1 = tx1
    let mx = nx0 + nx1
    let my = ny0 + ny1
    const mLen = Math.hypot(mx, my)
    if (mLen < 1e-8) {
      left[i] = [point.x + nx * point.left, point.y + ny * point.left]
      right[i] = [point.x - nx * point.right, point.y - ny * point.right]
      continue
    }
    mx /= mLen
    my /= mLen
    const cos = Math.max(mx * nx0 + my * ny0, 1 / MITER_LIMIT)
    left[i] = [point.x + (mx * point.left) / cos, point.y + (my * point.left) / cos]
    right[i] = [
      point.x - (mx * point.right) / cos,
      point.y - (my * point.right) / cos,
    ]
  }

  return { left, right }
}

export type TrackSides = { left: Pt[]; right: Pt[] }

const sidesCache = new WeakMap<Track, TrackSides>()

/**
 * Cached edges for a track identity. Paint, strokes and hover share one
 * miter pass instead of recomputing it per consumer and per pointer move.
 */
export function sidesOf(track: Track): TrackSides {
  const hit = sidesCache.get(track)
  if (hit) return hit
  const built = trackSides(track)
  sidesCache.set(track, built)
  return built
}

function pushScene(pos: Float32Array, o: number, p: Pt, up: number): number {
  const [x, y, z] = toScene(p[0], p[1], up)
  pos[o] = x
  pos[o + 1] = y
  pos[o + 2] = z
  return o + 3
}

/** Triangle list in scene space for the asphalt. */
export function ribbonPositions(track: Track): Float32Array {
  const { left, right } = sidesOf(track)
  const n = left.length
  const pos = new Float32Array(n * 6 * 3)
  let o = 0

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ri = right[i]!
    const li = left[i]!
    const rj = right[j]!
    const lj = left[j]!
    o = pushScene(pos, o, ri, 0)
    o = pushScene(pos, o, li, 0)
    o = pushScene(pos, o, rj, 0)
    o = pushScene(pos, o, li, 0)
    o = pushScene(pos, o, lj, 0)
    o = pushScene(pos, o, rj, 0)
  }

  return pos
}

/**
 * Closed asphalt ribbon with per-sample colour.
 * `channels` is 3 (RGB) or 4 (RGBA). Left/right share the sample colour.
 */
export function ribbonHeatmap(
  track: Track,
  colorPerSample: ArrayLike<number>,
  channels: 3 | 4 = 3,
): { positions: Float32Array; colors: Float32Array; channels: 3 | 4 } {
  const { left, right } = sidesOf(track)
  const n = left.length
  const positions = new Float32Array(n * 6 * 3)
  const colors = new Float32Array(n * 6 * channels)
  let o = 0
  let c = 0

  const push = (p: Pt, sample: number) => {
    o = pushScene(positions, o, p, 0)
    const base = sample * channels
    for (let k = 0; k < channels; k++) {
      colors[c++] = colorPerSample[base + k] ?? (k === 3 ? 1 : 0)
    }
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    push(right[i]!, i)
    push(left[i]!, i)
    push(right[j]!, j)
    push(left[i]!, i)
    push(left[j]!, j)
    push(right[j]!, j)
  }

  return { positions, colors, channels }
}

/** Closed scene-space loops, lifted just above the asphalt. */
export function edgeLoops(track: Track): {
  left: [number, number, number][]
  right: [number, number, number][]
} {
  const { left, right } = sidesOf(track)
  const loop = (points: Pt[]) => {
    const scene = points.map(([x, y]) => toScene(x, y, 0.05))
    const first = scene[0]
    if (first) scene.push([first[0], first[1], first[2]])
    return scene
  }
  return { left: loop(left), right: loop(right) }
}

function strokeRibbon(
  points: readonly Xy[],
  halfWidth: number,
  up: number,
  closed: boolean,
  colorPerSample: ArrayLike<number> | null,
  channels: 3 | 4,
): { positions: Float32Array; colors: Float32Array | null; channels: 3 | 4 } {
  const n = points.length
  if (n < 2) {
    return {
      positions: new Float32Array(0),
      colors: colorPerSample ? new Float32Array(0) : null,
      channels,
    }
  }

  const left = offsetPolyline(points, halfWidth, closed)
  const right = offsetPolyline(points, -halfWidth, closed)
  const count = left.length
  const segs = closed ? count : Math.max(0, count - 1)
  const positions = new Float32Array(segs * 6 * 3)
  const colors = colorPerSample
    ? new Float32Array(segs * 6 * channels)
    : null
  let o = 0
  let c = 0

  const push = (p: Xy, sample: number) => {
    o = pushScene(positions, o, p, up)
    if (!colors || !colorPerSample) return
    const base = sample * channels
    for (let k = 0; k < channels; k++) {
      colors[c++] = colorPerSample[base + k] ?? (k === 3 ? 1 : 0)
    }
  }

  for (let i = 0; i < segs; i++) {
    const j = closed ? (i + 1) % count : i + 1
    push(right[i]!, i)
    push(left[i]!, i)
    push(right[j]!, j)
    push(left[i]!, i)
    push(left[j]!, j)
    push(right[j]!, j)
  }

  return { positions, colors, channels }
}

/**
 * Constant-width stroke in scene space.
 * `halfWidth` is meters to each side of the line.
 */
export function strokePositions(
  points: readonly Xy[],
  halfWidth: number,
  up: number,
  closed = true,
): Float32Array {
  return strokeRibbon(points, halfWidth, up, closed, null, 3).positions
}

/**
 * Constant-width stroke with per-sample colour (RGB or RGBA).
 * `colorPerSample` length is `points.length * channels`.
 */
export function strokeHeatmap(
  points: readonly Xy[],
  halfWidth: number,
  up: number,
  colorPerSample: ArrayLike<number>,
  closed = true,
  channels: 3 | 4 = 3,
): { positions: Float32Array; colors: Float32Array; channels: 3 | 4 } {
  const painted = strokeRibbon(points, halfWidth, up, closed, colorPerSample, channels)
  return {
    positions: painted.positions,
    colors: painted.colors ?? new Float32Array(0),
    channels: painted.channels,
  }
}

/** Edge point at normalized arc-length `t` (equal sample spacing assumed). */
export function edgeAt(points: readonly Pt[], t: number): Pt {
  const n = points.length
  const first = points[0]
  if (!first || n < 2) return first ?? [0, 0]
  const u = ((t % 1) + 1) % 1
  if (u === 0) return first
  const f = u * n
  const i0 = Math.floor(f) % n
  const i1 = (i0 + 1) % n
  const s = f - Math.floor(f)
  const a = points[i0] ?? first
  const b = points[i1] ?? a
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]
}

/**
 * Open asphalt ribbon for arc-length fraction `[t0, t1]` going forward
 * around the closed ring (`t1` may be 1 = lap end / start).
 */
export function ribbonArcPositions(track: Track, t0: number, t1: number): Float32Array {
  const { left, right } = sidesOf(track)
  const n = left.length
  if (n < 2) return new Float32Array(0)

  const start = ((t0 % 1) + 1) % 1
  let span = t1 - t0
  while (span <= 0) span += 1
  while (span > 1) span -= 1

  const startF = start * n
  const endF = startF + span * n
  const endT = (start + span) % 1

  const chainL: Pt[] = [edgeAt(left, start)]
  const chainR: Pt[] = [edgeAt(right, start)]

  const firstIdx = Math.floor(startF) + 1
  const lastIdx = Math.ceil(endF) - 1
  for (let i = firstIdx; i <= lastIdx; i++) {
    const idx = ((i % n) + n) % n
    chainL.push(left[idx]!)
    chainR.push(right[idx]!)
  }

  chainL.push(edgeAt(left, endT))
  chainR.push(edgeAt(right, endT))

  const count = chainL.length
  if (count < 2) return new Float32Array(0)

  const pos = new Float32Array((count - 1) * 6 * 3)
  let o = 0
  for (let i = 0; i < count - 1; i++) {
    o = pushScene(pos, o, chainR[i]!, 0)
    o = pushScene(pos, o, chainL[i]!, 0)
    o = pushScene(pos, o, chainR[i + 1]!, 0)
    o = pushScene(pos, o, chainL[i]!, 0)
    o = pushScene(pos, o, chainL[i + 1]!, 0)
    o = pushScene(pos, o, chainR[i + 1]!, 0)
  }

  return pos
}

/** One straight mark, `halfWidth` meters to each side of the segment. */
export function segmentPositions(
  a: Xy,
  b: Xy,
  halfWidth: number,
  up: number,
): Float32Array {
  let tx = b[0] - a[0]
  let ty = b[1] - a[1]
  const len = Math.hypot(tx, ty) || 1
  tx /= len
  ty /= len
  const nx = -ty * halfWidth
  const ny = tx * halfWidth
  const corners: Xy[] = [
    [a[0] + nx, a[1] + ny],
    [a[0] - nx, a[1] - ny],
    [b[0] - nx, b[1] - ny],
    [a[0] + nx, a[1] + ny],
    [b[0] - nx, b[1] - ny],
    [b[0] + nx, b[1] + ny],
  ]
  const pos = new Float32Array(corners.length * 3)
  let o = 0
  for (const corner of corners) {
    o = pushScene(pos, o, corner, up)
  }
  return pos
}

/**
 * Checkered start/finish stripe across `a` → `b`, `halfWidth` meters to each
 * side along the track. `cols` cells span the track width, `rows` span the
 * driving direction — 8×2 keeps the classic look without going thick.
 * White squares are 1,1,1 and dark squares 0,0,0 (both exact in sRGB and
 * linear, so no ColorManagement shift). Same winding-agnostic layout as
 * segmentPositions (material is DoubleSide).
 */
export function checkeredSegmentPositions(
  a: Xy,
  b: Xy,
  halfWidth: number,
  up: number,
  cols = 8,
  rows = 2,
): { positions: Float32Array; colors: Float32Array } {
  const colsN = Math.max(1, Math.floor(cols))
  const rowsN = Math.max(1, Math.floor(rows))
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * halfWidth
  const ny = (dx / len) * halfWidth
  const positions = new Float32Array(colsN * rowsN * 6 * 3)
  const colors = new Float32Array(colsN * rowsN * 6 * 3)
  let o = 0
  let c = 0
  const push = (x: number, y: number, v: number) => {
    const [sx, sy, sz] = toScene(x, y, up)
    positions[o++] = sx
    positions[o++] = sy
    positions[o++] = sz
    colors[c++] = v
    colors[c++] = v
    colors[c++] = v
  }
  for (let ci = 0; ci < colsN; ci++) {
    const t0 = ci / colsN
    const t1 = (ci + 1) / colsN
    for (let ri = 0; ri < rowsN; ri++) {
      const s0 = -1 + (2 * ri) / rowsN
      const s1 = -1 + (2 * (ri + 1)) / rowsN
      const p00x = a[0] + dx * t0 + nx * s0
      const p00y = a[1] + dy * t0 + ny * s0
      const p10x = a[0] + dx * t1 + nx * s0
      const p10y = a[1] + dy * t1 + ny * s0
      const p11x = a[0] + dx * t1 + nx * s1
      const p11y = a[1] + dy * t1 + ny * s1
      const p01x = a[0] + dx * t0 + nx * s1
      const p01y = a[1] + dy * t0 + ny * s1
      const v = (ci + ri) % 2 === 0 ? 1 : 0
      push(p00x, p00y, v)
      push(p10x, p10y, v)
      push(p11x, p11y, v)
      push(p00x, p00y, v)
      push(p11x, p11y, v)
      push(p01x, p01y, v)
    }
  }
  return { positions, colors }
}
