/**
 * Pure viewer math — no Three.js scene graph, no physics.
 * Digests pinned against historical dashboard-canvas behavior.
 */
import * as THREE from 'three'
import { boundsOf, type Track, type Xy } from '@/track/frame'
import {
  paletteUsesAlpha,
  samplePalette,
  samplePaletteRgba,
  type PaletteId,
} from '@/track/colormaps'
import {
  lapMetrics,
  metricDisplayRange,
  sampleSeries,
  seriesFor,
  type MetricId,
  type MetricsSourceId,
} from '@/track/lap-metrics'
import type {
  RotateDeg,
  TrackOrientation,
  View,
} from '@/features/viewer/contracts'

/** Zoom relative to fit. */
export const ZOOM_OUT = 0.4
export const ZOOM_IN = 7.5
/** Wheel-zoom ceiling while a focus target is followed. */
export const ZOOM_IN_FOCUSED = 20

const ORIENT_IDENTITY: TrackOrientation = {
  rotate: 0,
  flipH: false,
  flipV: false,
}

/**
 * Preferred map framing per circuit — landscape so it fills the wide viewport.
 */
const TRACK_ORIENTATION: Record<string, TrackOrientation> = {
  spa: { rotate: 90, flipH: true, flipV: true },
  monza: { rotate: 90, flipH: true, flipV: true },
  texas: { rotate: 0, flipH: true, flipV: true },
  brandshatch: { rotate: 90, flipH: true, flipV: true },
  budapest: { rotate: 90, flipH: true, flipV: true },
  catalunya: { rotate: 90, flipH: true, flipV: true },
  hockenheim: { rotate: 0, flipH: false, flipV: false },
  ims: { rotate: 90, flipH: true, flipV: true },
  melbourne: { rotate: 90, flipH: true, flipV: true },
  mexicocity: { rotate: 0, flipH: false, flipV: false },
  montreal: { rotate: 90, flipH: true, flipV: true },
  moscow: { rotate: 0, flipH: false, flipV: false },
  norisring: { rotate: 0, flipH: false, flipV: false },
  nuerburgring: { rotate: 90, flipH: true, flipV: true },
  oschersleben: { rotate: 0, flipH: false, flipV: false },
  sakhir: { rotate: 90, flipH: true, flipV: true },
  saopaulo: { rotate: 90, flipH: true, flipV: true },
  sepang: { rotate: 0, flipH: false, flipV: false },
  shanghai: { rotate: 0, flipH: false, flipV: false },
  silverstone: { rotate: 90, flipH: true, flipV: true },
  sochi: { rotate: 0, flipH: false, flipV: false },
  spielberg: { rotate: 0, flipH: false, flipV: false },
  suzuka: { rotate: 0, flipH: false, flipV: false },
  yasmarina: { rotate: 90, flipH: true, flipV: true },
  zandvoort: { rotate: 0, flipH: false, flipV: false },
}

export function orientationFor(trackId: string): TrackOrientation {
  return TRACK_ORIENTATION[trackId] ?? ORIENT_IDENTITY
}

/** Recenter samples on bounds center (meters). */
export function centerTrack(track: Track): Track {
  const { cx, cy } = boundsOf(track.samples)
  return {
    ...track,
    samples: track.samples.map((s) => ({
      ...s,
      x: s.x - cx,
      y: s.y - cy,
    })),
  }
}

/** Clockwise degrees → point rotate matching the old 0/90/180/270 cases. */
export function rotateCw(x: number, y: number, deg: number): [number, number] {
  if (deg % 360 === 0) return [x, y]
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [x * c + y * s, -x * s + y * c]
}

/**
 * Keep the world point under the viewport center fixed while the track
 * rotates around the origin (same transform as orientTrack).
 */
export function compensateViewRotate(v: View, deltaDeg: number): void {
  if (deltaDeg % 360 === 0) return
  const [nx, ny] = rotateCw(v.x, -v.z, deltaDeg)
  v.x = v.tx = nx
  v.z = v.tz = -ny
  v.fly = null
  vClearAnchor(v)
}

/** Flip / rotate around the track bounds center. Reflections swap left/right. */
export function orientTrack(track: Track, o: TrackOrientation): Track {
  if (o.rotate % 360 === 0 && !o.flipH && !o.flipV) return track
  const b = boundsOf(track.samples)
  const { cx, cy } = b
  const swapSides = o.flipH !== o.flipV
  const samples = track.samples.map((s) => {
    let x = s.x - cx
    let y = s.y - cy
    if (o.flipH) x = -x
    if (o.flipV) y = -y
    const [rx, ry] = rotateCw(x, y, o.rotate)
    return {
      x: rx + cx,
      y: ry + cy,
      left: swapSides ? s.right : s.left,
      right: swapSides ? s.left : s.right,
    }
  })
  return { id: track.id, name: track.name, samples }
}

/**
 * Same framing as the displayed track for a raw raceline.
 * Recenter on raw track bounds, then flip/rotate around the origin.
 */
export function orientRacePoints(
  race: readonly Xy[],
  raw: Track,
  o: TrackOrientation,
): Xy[] {
  const b = boundsOf(raw.samples)
  return race.map(([x, y]) => {
    let px = x - b.cx
    let py = y - b.cy
    if (o.flipH) px = -px
    if (o.flipV) py = -py
    return rotateCw(px, py, o.rotate) as Xy
  })
}

/** Orthographic fit zoom so the track fills the viewport with ~20% pad. */
export function fitTrack(track: Track, width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    return NaN
  }
  const b = boundsOf(track.samples)
  const spanX = Math.max(b.maxX - b.minX, 1)
  const spanY = Math.max(b.maxY - b.minY, 1)
  return Math.min(width / (spanX * 1.2), height / (spanY * 1.2))
}

/** Lap fraction → pose on a closed path (evenly spaced points assumed). */
export function poseOnPath(
  path: readonly Xy[],
  t: number,
): { x: number; y: number; heading: number } {
  const n = path.length
  const first = path[0]
  if (!first || n < 2) return { x: first?.[0] ?? 0, y: first?.[1] ?? 0, heading: 0 }
  const u = ((t % 1) + 1) % 1
  const f = u * n
  const i0 = Math.floor(f) % n
  const i1 = (i0 + 1) % n
  const s = f - Math.floor(f)
  const a = path[i0] ?? first
  const b = path[i1] ?? a
  return {
    x: a[0] + (b[0] - a[0]) * s,
    y: a[1] + (b[1] - a[1]) * s,
    heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
  }
}

/** Place an orthographic camera from a View (Y-up scene). */
export function place(camera: THREE.OrthographicCamera, v: View): void {
  camera.position.set(v.x, 800, v.z)
  camera.up.set(0, 0, -1)
  camera.lookAt(v.x, 0, v.z)
  camera.zoom = v.zoom
  camera.updateProjectionMatrix()
}

export function newView(zoom = 1): View {
  return {
    x: 0,
    z: 0,
    zoom,
    tx: 0,
    tz: 0,
    tZoom: zoom,
    fit: zoom,
    ax: null,
    az: null,
    apx: 0,
    apy: 0,
    fly: null,
  }
}

export function vClearAnchor(v: View): void {
  v.ax = null
  v.az = null
}

/** Intensity heat with Traces on: peak hue × value-as-alpha over asphalt. */
export function heatUsesAlpha(palette: PaletteId, traces: boolean): boolean {
  return traces && paletteUsesAlpha(palette)
}

/**
 * One heatmap sample — shared by ribbon paint and hover tip.
 */
export function metricRgbaAt(
  series: ArrayLike<number>,
  min: number,
  max: number,
  palette: PaletteId,
  metric: MetricId,
  traces: boolean,
  invert: boolean,
  t: number,
): [number, number, number, number] {
  const span = max - min || 1
  const v = sampleSeries(series, t)
  let u = (v - min) / span
  if (invert && metric !== 'pedals') u = 1 - u
  if (heatUsesAlpha(palette, traces)) {
    if (metric === 'battery') {
      const peak = samplePaletteRgba(palette, 1)
      const intensity = Math.abs(u - 0.5) * 2
      const a = intensity * intensity * (3 - 2 * intensity)
      return [peak[0], peak[1], peak[2], a]
    }
    return samplePaletteRgba(palette, u)
  }
  const [r, g, b] = samplePalette(palette, u)
  return [r, g, b, 1]
}

/** Metric palette per sample — RGB or RGBA when Traces fades inactive zones. */
export function paintMetricColors(
  smooth: Track,
  source: Track,
  palette: PaletteId,
  metric: MetricId,
  traces: boolean,
  metricsSource: MetricsSourceId,
  invert: boolean,
): { colors: Float32Array; channels: 3 | 4 } {
  const series = seriesFor(lapMetrics(source, metricsSource), metric)
  const { min, max } = metricDisplayRange(metric, series)
  const n = smooth.samples.length
  const alpha = heatUsesAlpha(palette, traces)
  const channels: 3 | 4 = alpha ? 4 : 3
  const colors = new Float32Array(n * channels)
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = metricRgbaAt(
      series,
      min,
      max,
      palette,
      metric,
      traces,
      invert,
      (i + 0.5) / n,
    )
    if (alpha) {
      const o = i * 4
      colors[o] = r
      colors[o + 1] = g
      colors[o + 2] = b
      colors[o + 3] = a
    } else {
      const o = i * 3
      colors[o] = r
      colors[o + 1] = g
      colors[o + 2] = b
    }
  }
  return { colors, channels }
}

/** Darken heat RGB so curb edges stay readable on bright fills. */
export function shadeRgb(colors: Float32Array, factor = 0.38): Float32Array {
  const out = new Float32Array(colors.length)
  for (let i = 0; i < colors.length; i++) {
    out[i] = colors[i]! * factor
  }
  return out
}

export type { RotateDeg }
