'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  memo,
  type ReactNode,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import { useTheme } from 'next-themes'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { boundsOf, toScene, type Track, type Xy } from '@/track/frame'
import { RACE_LINES, TRACKS } from '@/track/catalog'
import {
  PALETTE_GROUPS,
  PALETTES,
  paletteUsesAlpha,
  samplePalette,
  samplePaletteRgba,
  type PaletteId,
} from '@/track/colormaps'
import {
  HEATMAP_PRESETS,
  presetFor,
  recommendedPalette,
  type HeatmapPresetId,
  type HeatmapPresetSelection,
} from '@/track/heatmap-presets'
import {
  formatMetricValue,
  lapMetrics,
  METRICS,
  metricDisplayRange,
  metricUnit,
  sampleSeries,
  seriesFor,
  type MetricId,
  type MetricsSourceId,
} from '@/track/lap-metrics'
import {
  resolveSectionMap,
  SECTION_MAPS,
  sectionLegend,
  type SectionMapId,
  type SectionZone,
} from '@/track/section-maps'
import {
  edgeAt,
  offsetPolyline,
  ribbonArcPositions,
  ribbonHeatmap,
  ribbonPositions,
  segmentPositions,
  sidesOf,
  strokeHeatmap,
  strokePositions,
} from '@/track/ribbon'
import { resampleTrack } from '@/track/smooth'
/** Asphalt fill — a touch darker so heat / edges read clearer. */
const ROAD = '#45454e'
/**
 * Section tint strength over asphalt. Sections keep the dark ribbon
 * underneath and tint it instead of replacing it with a flat opaque sticker
 * — that lost depth is what made the old red/green look cheap. Lower = more
 * asphalt showing through (calmer); higher = louder zones.
 */
const SECTION_TINT = 0.8
/** Edge stroke — same on normal / sections / heatmap. */
const STROKE = '#787886'
const START_OPACITY = 0.7
/** Overlay crossfade rate — opacity damping, settled in ~250 ms. */
const BLEND_LAMBDA = 9
/** Track fade-in rate after a geometry swap. */
const MASTER_IN_LAMBDA = 7
/** Track fade-out rate before the old geometry is swapped away. */
const MASTER_OUT_LAMBDA = 14
/** Heat / edge colour morph duration (s) — blue fades into green directly. */
const MORPH_S = 0.3
/** Edge weight in screen px — thin far out so asphalt stays readable. */
const STROKE_PX_OUT = 1.5
/** Edge weight in screen px — a touch heavier when zoomed in. */
const STROKE_PX_IN = 3.25
/** Hover mark width in screen px — held constant every frame. */
const HOVER_PX = 2
/**
 * Fixed asphalt sample spacing (m). Independent of zoom so fills/heatmaps
 * are not rebuilt every frame while the camera lerps.
 */
const FILL_SPACING = 1
/** Max discrete section ribbons / dividers allocated once. */
const MAX_SECTIONS = 16
const DOT = '#313138'
/** Grid dots in light mode — darker than the page so they read as subtle. */
const DOT_LIGHT = '#cfceca'
const DOT_OPACITY = 1
const ORIGIN = '#ff0000'

/**
 * Items (cars) — one marker per item, each following its own path.
 * Highlighter-bright on purpose: the old mid-tones (blue/red/green) sat
 * almost on top of the section hues (harvest blue, brake red, throttle
 * green) and the black swatch vanished on dark asphalt entirely.
 */
const ITEM_COLORS = [
  { id: 'yellow', value: '#ffea00' },
  { id: 'magenta', value: '#ff3df0' },
  { id: 'cyan', value: '#2ee6ff' },
  { id: 'orange', value: '#ff9500' },
  { id: 'lime', value: '#b6ff00' },
  { id: 'white', value: '#ffffff' },
] as const
const ITEM_DEFAULT_COLOR = '#ffea00'
/** Dark halo around the car glyph so it reads on bright sections and heat. */
const CAR_HALO = '#101014'
/** Racing line weight in screen px — slim on overview, bold when zoomed in. */
const RACING_LINE_PX_OUT = 2
const RACING_LINE_PX_IN = 5

/** Screen px for the racing line: thin far out, much easier to see close in. */
function racingPx(zoom: number, fit: number) {
  const rel = zoom / Math.max(fit, 1e-6)
  const t = THREE.MathUtils.smoothstep(rel, ZOOM_OUT, ZOOM_IN)
  return THREE.MathUtils.lerp(RACING_LINE_PX_OUT, RACING_LINE_PX_IN, t)
}
/** Racing-line alpha — solid paths match the previous flat opacity. */
const LINE_SOLID_ALPHA = 0.95
/** Standalone racing lines toggled to dimmed. */
const LINE_DIM_ALPHA = 0.3
/** Trail floor (× solid) — deliberately subtle. */
const LINE_TRAIL_FLOOR = 0.6
/** Trail length cap (lap fraction) — grows with progress up to this. */
const LINE_TRAIL_LEN = 0.15

/**
 * Per-sample line alpha. Progress reveal: everything ahead of the car runs
 * solid; behind it a short trail falls off linearly from the tail, so the
 * dimming starts exactly at the car with no flat disconnected stretch. The
 * trail grows with progress up to a cap, and the floor stays subtle.
 */
function lineAlpha(
  faded: boolean,
  anchored: boolean,
  progress: number,
  t: number,
): number {
  if (!faded) return LINE_SOLID_ALPHA
  if (!anchored) return LINE_DIM_ALPHA
  const p = Math.min(1, Math.max(0, progress))
  if (t >= p || p <= 0) return LINE_SOLID_ALPHA
  const w = Math.min(LINE_TRAIL_LEN, p)
  const a = 1 - (p - t) / w
  return LINE_SOLID_ALPHA * Math.max(LINE_TRAIL_FLOOR, a)
}
/** Minimum-curvature racelines by track — full TUMFTM catalog (see @/track/catalog). */
/**
 * Car length in world meters — deliberately larger than a real ~5.6 m F1 car
 * so the marker reads at map scales. Constant world size, like the track.
 */
const CAR_LENGTH_M = 9
/**
 * Overview floor so the car stays readable when zoomed out. Hands over to the
 * world size early while zooming in instead of staying a dot on the track.
 */
const CAR_MIN_PX = 24
/** Progress nudge per −/+ click — 0.01% of a lap for fine placement. */
const PROGRESS_NUDGE = 0.0001
/** Car 2's line — the raceline shifted sideways by this many meters. */
const CAR2_LATERAL_M = 1.5
/** Cursor-up glyph (24×24 viewBox) used as the car marker. */
const CAR_CURSOR_PATH =
  'M19.87,19.21l-6-15.92a2,2,0,0,0-3.74,0l-6,15.92a2,2,0,0,0,.65,2.3A2.21,2.21,0,0,0,6.17,22a2.24,2.24,0,0,0,1.23-.37L12,18.57l4.6,3.06a2.22,2.22,0,0,0,2.62-.12A2,2,0,0,0,19.87,19.21Z'

type LayerId = 'normal' | 'sections' | 'heatmap'
const LAYERS: { id: LayerId; name: string }[] = [
  { id: 'normal', name: 'Normal' },
  { id: 'sections', name: 'Sections' },
  { id: 'heatmap', name: 'Heatmap' },
]

/** Intensity heat with Traces on: peak hue × value-as-alpha over asphalt. */
function heatUsesAlpha(palette: PaletteId, traces: boolean): boolean {
  return traces && paletteUsesAlpha(palette)
}

/**
 * One heatmap sample — shared by the ribbon paint and the hover tip so the
 * swatch can never disagree with the pixels under the cursor.
 */
function metricRgbaAt(
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
  // Pedals keep brake → throttle order; everything else follows Invert.
  if (invert && metric !== 'pedals') u = 1 - u
  if (heatUsesAlpha(palette, traces)) {
    if (metric === 'battery') {
      // Idle → none; |deploy/harvest| → opaque peak hue.
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
function paintMetricColors(
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
function shadeRgb(colors: Float32Array, factor = 0.38): Float32Array {
  const out = new Float32Array(colors.length)
  for (let i = 0; i < colors.length; i++) {
    out[i] = colors[i]! * factor
  }
  return out
}

/** What a heat paint was built from — buffers are reused on exact matches. */
type HeatSig = {
  track: Track
  palette: PaletteId
  metric: MetricId
  traces: boolean
  ms: MetricsSourceId
  invert: boolean
}

/** One in-flight vertex-colour blend toward `to` at full opacity. */
type ColorMorphJob = {
  geo: THREE.BufferGeometry
  from: Float32Array
  to: Float32Array
}

type ColorMorph = { t: number; jobs: ColorMorphJob[] }

/**
 * Start blending a geometry's `color` attribute toward `to` without touching
 * opacity — this is what makes blue turn into green instead of dipping
 * through grey. No-op when layouts differ (caller swaps instantly instead).
 */
function enqueueColorMorph(
  morph: ColorMorph,
  geo: THREE.BufferGeometry,
  to: Float32Array,
  channels: number,
): boolean {
  const prev = geo.getAttribute('color') as THREE.BufferAttribute | undefined
  if (
    !prev ||
    prev.itemSize !== channels ||
    (prev.array as Float32Array).length !== to.length
  ) {
    return false
  }
  morph.jobs = morph.jobs.filter((j) => j.geo !== geo)
  morph.jobs.push({
    geo,
    from: (prev.array as Float32Array).slice(),
    to: to.slice(),
  })
  morph.t = 0
  return true
}

/** Drop pending blends for a geometry (its paint was swapped instantly). */
function dropColorMorph(morph: ColorMorph, geo: THREE.BufferGeometry) {
  morph.jobs = morph.jobs.filter((j) => j.geo !== geo)
  if (morph.jobs.length === 0) morph.t = 1
}

/** Screen px for edges: thin far out, a little thicker close in. */
function strokePx(zoom: number, fit: number) {
  const rel = zoom / Math.max(fit, 1e-6)
  const t = THREE.MathUtils.smoothstep(rel, ZOOM_OUT, ZOOM_IN)
  return THREE.MathUtils.lerp(STROKE_PX_OUT, STROKE_PX_IN, t)
}
const STEP_PX = 32
const MAX_DOTS = 16_384
/** Zoom relative to fit. */
const ZOOM_OUT = 0.4
const ZOOM_IN = 7.5
/** Wheel-zoom ceiling while a focus target is followed — gets you onto the car. */
const ZOOM_IN_FOCUSED = 20
/** Auto close-up when a car focus is picked (× fit). */
const FOCUS_ZOOM = 8
const SMOOTH = 14

type View = {
  x: number
  z: number
  zoom: number
  tx: number
  tz: number
  tZoom: number
  fit: number
  /** Pixel offset from view center; with world (ax, az) pins zoom under the cursor. */
  ax: number | null
  az: number | null
  apx: number
  apy: number
  /** Eased fly-to transition (focus select) — overrides the chase while active. */
  fly: FlyState | null
}

/** One smooth camera move: pan + zoom together over a fixed duration. */
type FlyState = {
  t: number
  dur: number
  sx: number
  sz: number
  szoom: number
  ex: number
  ez: number
  ezoom: number
}

/** Fixed 0.9 s so every focus jump feels equally controlled. */
const FLY_S = 0.9

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function centerTrack(track: Track): Track {
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

const CATALOG = TRACKS.map(centerTrack)

function softDot() {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  const mid = (n - 1) / 2
  const inner = mid - 1.25
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - mid, y - mid)
      let a = 0
      if (d <= inner) a = 255
      else if (d < mid) a = Math.round(((mid - d) / (mid - inner)) * 255)
      const i = (y * n + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = a
    }
  }
  const tex = new THREE.DataTexture(data, n, n)
  tex.needsUpdate = true
  tex.magFilter = tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return tex
}

const DOT_MAP = softDot()

function place(camera: THREE.OrthographicCamera, v: View) {
  camera.position.set(v.x, 800, v.z)
  camera.up.set(0, 0, -1)
  camera.lookAt(v.x, 0, v.z)
  camera.zoom = v.zoom
  camera.updateProjectionMatrix()
}

function spacingFor(zoom: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(STEP_PX / zoom, 1e-6)))
}

type TrackHoverInfo = {
  /** Lap fraction 0–1 at the hit. */
  t: number
  /** Planar track frame. */
  x: number
  y: number
  /** Screen px of the centerline hit. */
  sx: number
  sy: number
  /** Pointer screen px — tip Y tracks the cursor; X used for top fallback. */
  cursorSx: number
  cursorSy: number
  /** Asphalt half-width in screen px — tip clears this horizontally. */
  edgePx: number
  color: string
  label: string
}

function zoneAt(zones: readonly SectionZone[], t: number): SectionZone | null {
  const u = ((t % 1) + 1) % 1
  for (const z of zones) {
    if (u >= z.from && u < z.to) return z
  }
  // t ≈ 1 lands on the last zone that ends at 1.
  return zones[zones.length - 1] ?? null
}

/** Nearest point on the closed centerline — segment-projected, not sample-snapped. */
function nearestOnTrack(
  track: Track,
  wx: number,
  wy: number,
): { t: number; x: number; y: number; dist: number; halfW: number } | null {
  const samples = track.samples
  const n = samples.length
  if (n < 2) return null
  // Squared distances until the end — one sqrt for the winner. Ordering and
  // ties match the hypot comparison exactly.
  let bestD2 = Infinity
  let bestT = 0
  let bestX = 0
  let bestY = 0
  let bestHalf = 0
  for (let i = 0; i < n; i++) {
    const a = samples[i]!
    const b = samples[(i + 1) % n]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((wx - a.x) * abx + (wy - a.y) * aby) / len2)) : 0
    const px = a.x + abx * u
    const py = a.y + aby * u
    const dx = wx - px
    const dy = wy - py
    const d2 = dx * dx + dy * dy
    if (d2 >= bestD2) continue
    bestD2 = d2
    bestX = px
    bestY = py
    // Matches edgeAt: sample i sits at i/n, then lerp toward i+1.
    bestT = (i + u) / n
    const left = a.left + (b.left - a.left) * u
    const right = a.right + (b.right - a.right) * u
    bestHalf = Math.max(left, right)
  }
  return {
    t: bestT % 1,
    x: bestX,
    y: bestY,
    dist: Math.sqrt(bestD2),
    halfW: bestHalf,
  }
}

/**
 * Asphalt in Three *working* (linear) space — `color={ROAD}` is parsed as sRGB
 * then converted. Vertex heat blends against this, not the raw hex bytes.
 */
const ROAD_LINEAR = /*#__PURE__*/ (() => {
  const c = new THREE.Color(ROAD)
  return { r: c.r, g: c.g, b: c.b }
})()

/**
 * Tip swatch that matches the canvas pixel: blend in linear (same as GL),
 * then encode to sRGB for CSS. Raw LUT bytes-as-CSS was lying under
 * ColorManagement.
 * @param overAsphalt — Traces/alpha heat composites over ROAD; opaque heat does not.
 */
function trackSwatchCss(
  r: number,
  g: number,
  b: number,
  a = 1,
  overAsphalt = true,
): string {
  const aa = overAsphalt ? Math.min(1, Math.max(0, a)) : 1
  const cr = r * aa + ROAD_LINEAR.r * (1 - aa)
  const cg = g * aa + ROAD_LINEAR.g * (1 - aa)
  const cb = b * aa + ROAD_LINEAR.b * (1 - aa)
  return `#${new THREE.Color().setRGB(cr, cg, cb).getHexString()}`
}

/** Same floats the heat mesh uploaded — tip reads these, never repaints. */
type HeatPaint = {
  colors: Float32Array
  channels: 3 | 4
  n: number
  overAsphalt: boolean
}

/**
 * Tip payload at lap fraction `t` on the *rendered* (resampled) ring.
 * Heat RGBA comes from the live paint buffer (GPU verts), lerped the same way.
 */
function hoverPayload(
  layer: LayerId,
  source: Track,
  smooth: Track,
  palette: PaletteId,
  metric: MetricId,
  zones: readonly SectionZone[],
  t: number,
  traces: boolean,
  heatPaint: HeatPaint | null,
  metricsSource: MetricsSourceId,
  invert: boolean,
): { color: string; label: string } {
  if (layer === 'sections') {
    const z = zoneAt(zones, t)
    if (!z) return { color: ROAD, label: 'Section' }
    // Tip swatch must match the rendered pixel: tint blended over asphalt.
    const c = new THREE.Color(z.color)
    return {
      color: trackSwatchCss(c.r, c.g, c.b, SECTION_TINT, true),
      label: z.name,
    }
  }
  if (layer === 'heatmap') {
    const series = seriesFor(lapMetrics(source, metricsSource), metric)
    const { min, max } = metricDisplayRange(metric, series)
    const n = smooth.samples.length
    if (n < 2) return { color: ROAD, label: 'Track' }
    const u = ((t % 1) + 1) % 1
    const f = u * n
    const i0 = Math.floor(f) % n
    const i1 = (i0 + 1) % n
    const s = f - Math.floor(f)

    let r: number
    let g: number
    let b: number
    let a: number
    const overAsphalt = heatUsesAlpha(palette, traces)
    if (heatPaint && heatPaint.n === n) {
      const ch = heatPaint.channels
      const col = heatPaint.colors
      const o0 = i0 * ch
      const o1 = i1 * ch
      r = col[o0]! + (col[o1]! - col[o0]!) * s
      g = col[o0 + 1]! + (col[o1 + 1]! - col[o0 + 1]!) * s
      b = col[o0 + 2]! + (col[o1 + 2]! - col[o0 + 2]!) * s
      a =
        ch === 4
          ? col[o0 + 3]! + (col[o1 + 3]! - col[o0 + 3]!) * s
          : 1
    } else {
      // Fallback before first paint — same authoring as the ribbon.
      const c0 = metricRgbaAt(series, min, max, palette, metric, traces, invert, (i0 + 0.5) / n)
      const c1 = metricRgbaAt(series, min, max, palette, metric, traces, invert, (i1 + 0.5) / n)
      r = c0[0] + (c1[0] - c0[0]) * s
      g = c0[1] + (c1[1] - c0[1]) * s
      b = c0[2] + (c1[2] - c0[2]) * s
      a = c0[3] + (c1[3] - c0[3]) * s
    }

    const v0 = sampleSeries(series, (i0 + 0.5) / n)
    const v1 = sampleSeries(series, (i1 + 0.5) / n)
    const v = v0 + (v1 - v0) * s
    const color = trackSwatchCss(r, g, b, a, overAsphalt)
    if (metric === 'pedals') {
      const side = v < -0.05 ? 'Brake' : v > 0.05 ? 'Throttle' : 'Coast'
      return { color, label: `${side} ${formatMetricValue(metric, v)}` }
    }
    const unit = metricUnit(metric)
    return { color, label: `${formatMetricValue(metric, v)} ${unit}` }
  }
  return { color: ROAD, label: 'Track' }
}

/**
 * Cross-track line geometry, rebuilt every frame (cheap single quad) so the
 * mark holds its screen width while the camera lerps — a layout-effect
 * snapshot would grow, shrink and alias as the zoom moves underneath it.
 */
function useCrossLine(
  track: Track,
  t: number,
  view: RefObject<View>,
  widthPx: number,
) {
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  const sides = useMemo(() => sidesOf(track), [track])
  const stamp = useRef({ t: NaN, half: NaN })

  useFrame(() => {
    const zoom = Math.max(view.current.zoom, 1e-6)
    const half = widthPx / 2 / zoom
    const s = stamp.current
    if (s.t === t && Math.abs(s.half - half) / Math.max(half, 1e-9) < 0.02) {
      return
    }
    s.t = t
    s.half = half
    const a = edgeAt(sides.left as Xy[], t) as Xy
    const b = edgeAt(sides.right as Xy[], t) as Xy
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(segmentPositions(a, b, half, 0.16), 3),
    )
    geometry.computeBoundingSphere()
  })

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  return geometry
}

/** Cross-track hover mark — constant ~2 px on screen, black or white for contrast. */
const HoverMark = memo(function HoverMark({
  track,
  t,
  color,
  view,
}: {
  track: Track
  t: number
  color: string
  view: RefObject<View>
}) {
  const geometry = useCrossLine(track, t, view, HOVER_PX)
  const matColor = useMemo(() => {
    const c = new THREE.Color(color)
    // Binary contrast switch on the color under the cursor.
    const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
    return new THREE.Color(lum < 0.35 ? '#ffffff' : '#000000')
  }, [color])

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={14}>
      <meshBasicMaterial
        color={matColor}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
        opacity={0.92}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
})

function carTexture(fill: string) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const path = new Path2D(CAR_CURSOR_PATH)
  ctx.translate(size / 2, size / 2)
  ctx.scale(size / 32, size / 32)
  ctx.translate(-12, -12)
  ctx.lineJoin = 'round'
  // Dark halo first — at overview sizes the old 2px color stroke shrank to
  // sub-pixel and the grey body melted into asphalt / coast sections.
  ctx.strokeStyle = CAR_HALO
  ctx.lineWidth = 3
  ctx.stroke(path)
  ctx.fillStyle = fill
  ctx.fill(path)
  // Crisp inner edge on the bright fill.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke(path)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Lap fraction → pose on a closed path (evenly spaced points assumed). */
function poseOnPath(path: readonly Xy[], t: number): { x: number; y: number; heading: number } {
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

/**
 * Item marker (car) — cursor-up glyph riding the racing line at progress `t`.
 * Bright item-color body with a dark halo, so it pops off both dark asphalt
 * and bright sections. World-sized (grows as you zoom) with a px floor.
 */
const ItemCar = memo(function ItemCar({
  path,
  progress,
  color,
  view,
}: {
  path: readonly Xy[]
  progress: number
  color: string
  view: RefObject<View>
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const texture = useMemo(() => carTexture(color), [color])
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useEffect(
    () => () => {
      texture.dispose()
      geometry.dispose()
    },
    [geometry, texture],
  )

  useFrame(() => {
    const current = mesh.current
    if (!current) return
    const pose = poseOnPath(path, progress)
    const zoom = Math.max(view.current.zoom, 1e-6)
    current.position.set(pose.x, 1, -pose.y)
    current.rotation.order = 'YXZ'
    current.rotation.y = pose.heading - Math.PI / 2
    current.rotation.x = -Math.PI / 2
    const px = Math.max(CAR_LENGTH_M * zoom, CAR_MIN_PX)
    current.scale.setScalar(px / zoom)
  })

  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={15}>
      <meshBasicMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </mesh>
  )
})

/** Racing line — screen-weight ribbon, above the asphalt. Car lines dissolve
 * over the driven stretch (bright at the car, dim toward the start) and run
 * solid ahead; standalone lines are always solid. Same vertex order as
 * strokeHeatmap. */
const RacingLine = memo(function RacingLine({
  path,
  color,
  view,
  progressRef,
  faded,
}: {
  path: readonly Xy[]
  color: string
  view: RefObject<View>
  /** Null → no car anchor (uniform dim/solid only). */
  progressRef: RefObject<number> | null
  faded: boolean
}) {
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  const stamp = useRef<{
    path: readonly Xy[] | null
    zoom: number
    color: string
    faded: boolean
    progress: number
  }>({
    path: null,
    zoom: NaN,
    color: '',
    faded: false,
    progress: NaN,
  })
  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  useFrame(() => {
    const zoom = Math.max(view.current.zoom, 1e-6)
    const s = stamp.current
    const p = progressRef ? progressRef.current : 0
    const structural =
      s.path !== path ||
      !Number.isFinite(s.zoom) ||
      Math.abs(s.zoom - zoom) / s.zoom >= 0.08 ||
      s.color !== color ||
      s.faded !== faded
    const moved =
      progressRef != null && !Number.isNaN(s.progress) && Math.abs(p - s.progress) > 1e-4
    if (!structural && !moved) return
    const c = new THREE.Color(color)
    const n = Math.max(path.length, 1)
    if (structural) {
      const half = racingPx(zoom, view.current.fit || zoom) / 2 / zoom
      const rgba = new Float32Array(path.length * 4)
      for (let i = 0; i < path.length; i++) {
        const a = lineAlpha(faded, progressRef != null, p, i / n)
        rgba[i * 4] = c.r
        rgba[i * 4 + 1] = c.g
        rgba[i * 4 + 2] = c.b
        rgba[i * 4 + 3] = a
      }
      const painted = strokeHeatmap(path, half, 0.12, rgba, true, 4)
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(painted.positions, 3),
      )
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(painted.colors, 4),
      )
      geometry.computeBoundingSphere()
      s.path = path
      s.zoom = zoom
      s.color = color
      s.faded = faded
      s.progress = p
      return
    }
    // Progress-only: rewrite alphas in place ([i,i,j,i,j,j] vertex order).
    const attr = geometry.getAttribute('color') as
      | THREE.BufferAttribute
      | undefined
    const pos = geometry.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined
    if (!attr || !pos) return
    const arr = attr.array as Float32Array
    const segs = Math.floor(pos.count / 6)
    let o = 0
    for (let k = 0; k < segs; k++) {
      const i = k % n
      const j = (k + 1) % n
      const ai = lineAlpha(faded, true, p, i / n)
      const aj = lineAlpha(faded, true, p, j / n)
      const pushes = [ai, ai, aj, ai, aj, aj]
      for (const a of pushes) {
        arr[o] = c.r
        arr[o + 1] = c.g
        arr[o + 2] = c.b
        arr[o + 3] = a
        o += 4
      }
    }
    attr.needsUpdate = true
    s.progress = p
  })

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={13}>
      <meshBasicMaterial
        vertexColors
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
        opacity={1}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
})

/** Pointer → nearest point on the *rendered* ring; tip color matches ribbon verts. */
const TrackHoverProbe = memo(function TrackHoverProbe({
  enabled,
  track,
  view,
  layer,
  palette,
  metric,
  traces,
  zones,
  heatPaintRef,
  metricsSource,
  invert,
  onHover,
}: {
  enabled: boolean
  track: Track
  view: RefObject<View>
  layer: LayerId
  palette: PaletteId
  metric: MetricId
  traces: boolean
  zones: readonly SectionZone[]
  heatPaintRef: RefObject<HeatPaint | null>
  metricsSource: MetricsSourceId
  invert: boolean
  onHover: (info: TrackHoverInfo | null) => void
}) {
  const gl = useThree((s) => s.gl)
  // Same resample as Road — hit `t` must live in painted-sample space.
  const smooth = useMemo(() => resampleTrack(track, FILL_SPACING), [track])

  useEffect(() => {
    if (!enabled) {
      onHover(null)
      return
    }
    const el = gl.domElement.parentElement ?? gl.domElement

    const update = (e: PointerEvent) => {
      if (e.buttons !== 0) {
        onHover(null)
        return
      }
      if (e.target instanceof Element && e.target.closest('[data-debug]')) {
        onHover(null)
        return
      }
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const v = view.current
      const px = e.clientX - rect.left - rect.width / 2
      const py = e.clientY - rect.top - rect.height / 2
      const worldX = v.x + px / v.zoom
      const worldZ = v.z + py / v.zoom
      const planarX = worldX
      const planarY = -worldZ
      const hit = nearestOnTrack(smooth, planarX, planarY)
      if (!hit) {
        onHover(null)
        return
      }
      // Grab within asphalt + a small screen-space pad (~10 px).
      const pad = 10 / Math.max(v.zoom, 1e-6)
      if (hit.dist > hit.halfW + pad) {
        onHover(null)
        return
      }
      const sx = (hit.x - v.x) * v.zoom + rect.width / 2
      const sy = (-hit.y - v.z) * v.zoom + rect.height / 2
      const cursorSx = e.clientX - rect.left
      const cursorSy = e.clientY - rect.top
      const { color, label } = hoverPayload(
        layer,
        track,
        smooth,
        palette,
        metric,
        zones,
        hit.t,
        traces,
        heatPaintRef.current,
        metricsSource,
        invert,
      )
      onHover({
        t: hit.t,
        x: hit.x,
        y: hit.y,
        sx,
        sy,
        cursorSx,
        cursorSy,
        edgePx: hit.halfW * v.zoom,
        color,
        label,
      })
    }

    const clear = () => onHover(null)
    el.addEventListener('pointermove', update)
    el.addEventListener('pointerleave', clear)
    el.addEventListener('pointerdown', clear)
    return () => {
      el.removeEventListener('pointermove', update)
      el.removeEventListener('pointerleave', clear)
      el.removeEventListener('pointerdown', clear)
      onHover(null)
    }
  }, [
    enabled,
    gl,
    track,
    smooth,
    view,
    layer,
    palette,
    metric,
    traces,
    zones,
    heatPaintRef,
    metricsSource,
    invert,
    onHover,
  ])

  return null
})

const TrackHoverTip = memo(function TrackHoverTip({
  info,
  hostW,
  hostH,
}: {
  info: TrackHoverInfo
  hostW: number
  hostH: number
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ w: 96, h: 28 })
  const sideRef = useRef<'right' | 'left'>('right')
  const placeRef = useRef({ hostW, hostH, info })
  useLayoutEffect(() => {
    placeRef.current = { hostW, hostH, info }
  }, [hostW, hostH, info])

  const place = () => {
    const node = tipRef.current
    if (!node) return
    const { hostW: hw, hostH: hh, info: tip } = placeRef.current
    sizeRef.current = { w: node.offsetWidth, h: node.offsetHeight }
    const { w, h } = sizeRef.current
    const margin = 8
    const gap = 12
    // Prefer beside the cursor; sticky flip so it doesn't chatter at the edge.
    const rightLeft = tip.cursorSx + gap
    const leftLeft = tip.cursorSx - gap - w
    const rightFits = rightLeft + w <= hw - margin
    const leftFits = leftLeft >= margin
    if (sideRef.current === 'right' && !rightFits && leftFits) sideRef.current = 'left'
    else if (sideRef.current === 'left' && !leftFits && rightFits) sideRef.current = 'right'
    else if (!rightFits && !leftFits) {
      sideRef.current = rightLeft < hw / 2 ? 'right' : 'left'
    }
    const left = Math.max(
      margin,
      Math.min(
        sideRef.current === 'right' ? rightLeft : leftLeft,
        Math.max(margin, hw - w - margin),
      ),
    )
    const top = Math.max(margin, Math.min(tip.cursorSy - h / 2, hh - h - margin))
    node.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }

  useLayoutEffect(() => {
    const node = tipRef.current
    if (!node) return
    place()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(place)
    observer.observe(node)
    return () => observer.disconnect()
  }, [info.label])

  useLayoutEffect(place, [info, hostW, hostH])

  return (
    <div
      ref={tipRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 rounded-[4px] bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground shadow-[var(--shadow-floating)] will-change-transform"
    >
      <span
        className="size-2 shrink-0 rounded-[2px]"
        style={{ background: info.color }}
        aria-hidden
      />
      <span className="whitespace-nowrap text-foreground/80 tabular-nums">{info.label}</span>
    </div>
  )
})

/**
 * Stable content identity for a track — O(1) probe of id, length and three
 * spread samples. A fresh object with identical samples (HMR re-execution,
 * parent churn) must NOT replay the swap fade; flips/rotations move the
 * probes, so real geometry changes still fade.
 */
function trackSignature(track: Track): string {
  const s = track.samples
  const n = s.length
  const q = (v: number) => (Math.round(v * 1000) / 1000).toString()
  const p = (i: number) => {
    const sm = s[((i % n) + n) % n]
    return sm ? `${q(sm.x)},${q(sm.y)},${q(sm.left)},${q(sm.right)}` : '0,0,0,0'
  }
  return `${track.id}|${n}|${p(0)}|${p(n >> 1)}|${p(n - 1)}`
}

/** Stable content identity for section zones — same HMR-proofing as tracks. */
function zonesSignature(zones: readonly SectionZone[]): string {
  return zones
    .map(
      (z) =>
        `${z.id}:${Math.round(z.from * 1e4)},${Math.round(z.to * 1e4)},${z.color}`,
    )
    .join(';')
}

const Road = memo(function Road({
  track,
  view,
  layer,
  palette,
  metric,
  traces,
  sectionMap,
  zones,
  heatPaintRef,
  metricsSource,
  invert,
}: {
  track: Track
  view: RefObject<View>
  layer: LayerId
  palette: PaletteId
  metric: MetricId
  traces: boolean
  sectionMap: SectionMapId
  zones: SectionZone[]
  heatPaintRef: RefObject<HeatPaint | null>
  metricsSource: MetricsSourceId
  invert: boolean
}) {
  const fill = useMemo(() => new THREE.BufferGeometry(), [])
  const heat = useMemo(() => new THREE.BufferGeometry(), [])
  const sectionFills = useMemo(
    () => Array.from({ length: MAX_SECTIONS }, () => new THREE.BufferGeometry()),
    [],
  )
  const leftStroke = useMemo(() => new THREE.BufferGeometry(), [])
  const rightStroke = useMemo(() => new THREE.BufferGeometry(), [])
  const startLine = useMemo(() => new THREE.BufferGeometry(), [])
  const sectionLines = useMemo(
    () => Array.from({ length: MAX_SECTIONS }, () => new THREE.BufferGeometry()),
    [],
  )
  const edges = useRef<{ left: Xy[]; right: Xy[] } | null>(null)
  /** Opaque heatmap edge colours (null when intensity→alpha or non-heatmap). */
  const edgeRgb = useRef<{ colors: Float32Array; channels: 3 | 4 } | null>(null)
  const activeSections = useRef(0)
  const strokeZoom = useRef(NaN)

  // ---- Layer transitions (imperative: zero React churn per frame) ----
  // All layer meshes stay mounted; a single useFrame damps material opacities
  // toward their targets and flips `visible` once faded, so hidden layers
  // cost no draw calls while switches still crossfade smoothly.
  const groupRef = useRef<THREE.Group | null>(null)
  const asphaltMesh = useRef<THREE.Mesh | null>(null)
  const asphaltMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const heatMesh = useRef<THREE.Mesh | null>(null)
  const heatMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const sectionMeshes = useRef<Array<THREE.Mesh | null>>([])
  const sectionMats = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const strokeLMesh = useRef<THREE.Mesh | null>(null)
  const strokeLMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const strokeRMesh = useRef<THREE.Mesh | null>(null)
  const strokeRMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const startMesh = useRef<THREE.Mesh | null>(null)
  const startMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const dividerMeshes = useRef<Array<THREE.Mesh | null>>([])
  const dividerMats = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const anim = useRef({
    phase: 'in' as 'in' | 'idle' | 'out',
    master: 0,
    heat: 0,
    heatFull: 0,
    sections: 0,
    fillFull: 0,
    pending: null as Track | null,
    pendingSig: null as string | null,
    settled: false,
  })
  /** Last paint the heat mesh holds (null until the first build). */
  const heatSig = useRef<HeatSig | null>(null)
  /** Vertex-colour blends — heat fill and edge strokes morph together. */
  const colorMorph = useRef<ColorMorph>({ t: 1, jobs: [] })
  /** Bumped on every heat paint build; the stroke frame consumes it so edge
   * colours can never lag behind the fill. */
  const heatBuildSeq = useRef(0)
  const strokeHeatSeq = useRef(0)
  const [displayed, setDisplayed] = useState(track)
  const [displayedZones, setDisplayedZones] = useState(zones)
  const displayedRef = useRef(displayed)
  // Fresh props for the imperative frame loop (refs avoid stale closures).
  const live = useRef({ track, zones, layer, palette, traces })
  useLayoutEffect(() => {
    live.current = { track, zones, layer, palette, traces }
  }, [track, zones, layer, palette, traces])

  useEffect(
    () => () => {
      fill.dispose()
      heat.dispose()
      for (const g of sectionFills) g.dispose()
      leftStroke.dispose()
      rightStroke.dispose()
      startLine.dispose()
      for (const g of sectionLines) g.dispose()
    },
    [fill, heat, sectionFills, leftStroke, rightStroke, startLine, sectionLines],
  )

  // Content identity of the displayed ribbon — guards the swap fade below.
  // Initialized from state (same object the ref holds), never from a ref.
  const displayedSig = useRef(trackSignature(displayed))
  const displayedZonesSig = useRef(zonesSignature(displayedZones))
  // A new `track` identity (track switch / rotate / flip) fades the old
  // ribbon out first; the frame loop swaps geometry once master hits ~0.
  // Identity alone is not enough: HMR and parent churn can hand us a fresh
  // object with identical samples, which must be adopted silently — never
  // replaying the fade. Late arrivals while fading update `pending` so the
  // swap always lands on the newest content instead of going stale.
  useLayoutEffect(() => {
    const sig = trackSignature(track)
    if (sig === displayedSig.current) {
      // Same content, fresh identity — point the refs at it and move on.
      // Deliberately no setState: the buffers already hold these exact
      // samples, so there is nothing to rebuild and nothing to fade.
      if (track !== displayedRef.current) displayedRef.current = track
      displayedZonesSig.current = zonesSignature(live.current.zones)
      // Content snapped back mid-fade (A→B→A) — cancel, fade back in.
      if (anim.current.phase === 'out') {
        anim.current.phase = 'in'
        anim.current.pending = null
        anim.current.pendingSig = null
        anim.current.settled = false
      }
      return
    }
    anim.current.pending = track
    anim.current.pendingSig = sig
    anim.current.settled = false
    if (anim.current.phase !== 'out') anim.current.phase = 'out'
  }, [track])

  // Section preset flips (same track) follow immediately — only a track
  // swap freezes the old zones until the fade-out completes. Same
  // content-identity rule: identical zones never rebuild the cascade.
  useLayoutEffect(() => {
    if (
      trackSignature(track) === displayedSig.current &&
      zonesSignature(zones) !== displayedZonesSig.current
    ) {
      displayedZonesSig.current = zonesSignature(zones)
      setDisplayedZones(zones)
    }
  }, [track, zones])
  // Asphalt rebuilds only when the *displayed* track swaps — never on layer
  // switches, so the base ribbon never pops underneath a crossfade.
  useLayoutEffect(() => {
    const smooth = resampleTrack(displayed, FILL_SPACING)
    const sides = sidesOf(smooth)
    edges.current = { left: sides.left as Xy[], right: sides.right as Xy[] }
    strokeZoom.current = NaN
    fill.setAttribute('position', new THREE.BufferAttribute(ribbonPositions(smooth), 3))
    fill.computeBoundingSphere()
    anim.current.fillFull = (
      fill.getAttribute('position') as THREE.BufferAttribute
    ).count
    anim.current.settled = false
  }, [displayed, fill])

  const buildHeat = useCallback(
    (sig: HeatSig, morph: boolean) => {
      const smooth = resampleTrack(sig.track, FILL_SPACING)
      const painted = paintMetricColors(
        smooth,
        sig.track,
        sig.palette,
        sig.metric,
        sig.traces,
        sig.ms,
        sig.invert,
      )
      const mesh = ribbonHeatmap(smooth, painted.colors, painted.channels)
      if (morph) {
        enqueueColorMorph(colorMorph.current, heat, mesh.colors, mesh.channels)
      } else {
        dropColorMorph(colorMorph.current, heat)
      }
      heat.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
      heat.setAttribute(
        'color',
        new THREE.BufferAttribute(mesh.colors, mesh.channels),
      )
      heat.computeBoundingSphere()
      anim.current.heatFull = (
        heat.getAttribute('position') as THREE.BufferAttribute
      ).count
      heatSig.current = sig
      heatPaintRef.current = {
        colors: painted.colors,
        channels: painted.channels,
        n: smooth.samples.length,
        overAsphalt: heatUsesAlpha(sig.palette, sig.traces),
      }
      // Dark curbs over bright fills — lifted/white edges vanish on white heat.
      edgeRgb.current =
        painted.channels === 3
          ? { colors: shadeRgb(painted.colors), channels: 3 }
          : null
      heatBuildSeq.current++
      anim.current.settled = false
    },
    [heat, heatPaintRef],
  )

  // One decision site for heat paint. Same-track repaints (palette / metric /
  // traces / invert) morph colours in place at full opacity; anything
  // structural (track swap, entering the layer) swaps instantly under an
  // opacity fade.
  const syncHeat = useCallback(() => {
    if (layer !== 'heatmap') return
    const sig: HeatSig = {
      track: displayed,
      palette,
      metric,
      traces,
      ms: metricsSource,
      invert,
    }
    const cur = heatSig.current
    if (
      cur !== null &&
      cur.track === sig.track &&
      cur.palette === sig.palette &&
      cur.metric === sig.metric &&
      cur.traces === sig.traces &&
      cur.ms === sig.ms &&
      cur.invert === sig.invert
    ) {
      return
    }
    const morph =
      cur !== null && cur.track === sig.track && anim.current.heat > 0.02
    buildHeat(sig, morph)
  }, [displayed, palette, metric, traces, metricsSource, layer, invert, buildHeat])
  useLayoutEffect(() => {
    syncHeat()
  }, [syncHeat])

  const buildSections = useCallback(() => {
    const shown = displayedRef.current
    const smooth = resampleTrack(shown, FILL_SPACING)
    const list = live.current.zones
    const count = Math.min(list.length, MAX_SECTIONS)
    activeSections.current = count
    for (let s = 0; s < count; s++) {
      const z = list[s]!
      const g = sectionFills[s]!
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(ribbonArcPositions(smooth, z.from, z.to), 3),
      )
      g.computeBoundingSphere()
    }
    for (let s = count; s < MAX_SECTIONS; s++) {
      sectionFills[s]!.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(0), 3),
      )
    }
    // Fresh tints cascade in instead of popping.
    if (live.current.layer === 'sections') anim.current.sections = 0
    anim.current.settled = false
  }, [sectionFills])

  useLayoutEffect(() => {
    if (live.current.layer === 'sections') buildSections()
  }, [displayed, displayedZones, sectionMap, buildSections])
  useLayoutEffect(() => {
    if (layer === 'sections') buildSections()
  }, [layer, buildSections])

  const strokeLayer = useRef<LayerId>(layer)
  // Opaque-heat edges carry vertex colours; everything else is flat STROKE.
  // Read from props (not refs) so the stroke meshes remount on mode flips.
  const strokeMode = layer === 'heatmap' && !heatUsesAlpha(palette, traces) ? 'c' : 's'
  useLayoutEffect(() => {
    anim.current.settled = false
  }, [strokeMode])

  // ---- Transition driver: one cheap frame callback, no React state ----
  // First appearance sweeps + scales in once; everything after that (track
  // swaps, layer switches, heat repaints) is a pure opacity transition over
  // the persistent asphalt. Settles to zero per-frame work.
  useFrame((_, rawDt) => {
    const a = anim.current
    const L = live.current
    const dt = Math.min(rawDt, 0.05)

    if (a.phase === 'out') {
      a.master = THREE.MathUtils.damp(a.master, 0, MASTER_OUT_LAMBDA, dt)
      if (a.master < 0.02) {
        const next = a.pending ?? L.track
        const nextSig = a.pendingSig ?? trackSignature(L.track)
        a.pending = null
        a.pendingSig = null
        a.master = 0
        a.phase = 'in'
        a.settled = false
        // Content snapped back while fading — nothing to swap, fade back in.
        if (nextSig === displayedSig.current) return
        displayedRef.current = next
        displayedSig.current = nextSig
        setDisplayed(next)
        setDisplayedZones(L.zones)
        displayedZonesSig.current = zonesSignature(L.zones)
        return
      }
    } else if (a.phase === 'in') {
      a.master = THREE.MathUtils.damp(a.master, 1, MASTER_IN_LAMBDA, dt)
      if (a.master > 0.999) {
        a.master = 1
        a.phase = 'idle'
      }
    } else {
      a.master = THREE.MathUtils.damp(a.master, 1, MASTER_IN_LAMBDA, dt)
      if (a.master > 0.996) a.master = 1
    }

    const heatTarget = L.layer === 'heatmap' ? 1 : 0
    const secTarget = L.layer === 'sections' ? 1 : 0
    a.heat = THREE.MathUtils.damp(a.heat, heatTarget, BLEND_LAMBDA, dt)
    if (Math.abs(a.heat - heatTarget) < 0.002) a.heat = heatTarget
    a.sections = THREE.MathUtils.damp(a.sections, secTarget, BLEND_LAMBDA, dt)
    if (Math.abs(a.sections - secTarget) < 0.002) a.sections = secTarget

    // Vertex-colour morph — blue turns into green directly, at full opacity.
    const cm = colorMorph.current
    if (cm.t < 1 && cm.jobs.length > 0) {
      cm.t = Math.min(1, cm.t + dt / MORPH_S)
      const tt =
        cm.t < 0.5
          ? 4 * cm.t * cm.t * cm.t
          : 1 - Math.pow(-2 * cm.t + 2, 3) / 2
      for (const job of cm.jobs) {
        const attr = job.geo.getAttribute('color') as
          | THREE.BufferAttribute
          | undefined
        if (!attr || attr.array.length !== job.from.length) continue
        const arr = attr.array as Float32Array
        if (cm.t >= 1) {
          arr.set(job.to)
        } else {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = job.from[i]! + (job.to[i]! - job.from[i]!) * tt
          }
        }
        attr.needsUpdate = true
      }
      if (cm.t >= 1) cm.jobs = []
    }

    // Fully settled → skip all writes until something changes.
    if (
      a.settled &&
      a.phase === 'idle' &&
      a.master === 1 &&
      a.heat === heatTarget &&
      a.sections === secTarget &&
      cm.t >= 1
    ) {
      return
    }

    const m = a.master

    if (asphaltMat.current) asphaltMat.current.opacity = m
    if (asphaltMesh.current) {
      const alphaH = L.layer === 'heatmap' && heatUsesAlpha(L.palette, L.traces)
      // Opaque heat covers the asphalt once faded in — hide it to save fill.
      asphaltMesh.current.visible =
        m > 0.02 &&
        a.fillFull > 0 &&
        (L.layer !== 'heatmap' || alphaH || a.heat < 0.98)
    }
    const hOp = m * a.heat
    if (heatMat.current) heatMat.current.opacity = hOp
    if (heatMesh.current) heatMesh.current.visible = hOp > 0.02 && a.heatFull > 0

    const shownCount = Math.min(displayedZones.length, MAX_SECTIONS)
    for (let i = 0; i < MAX_SECTIONS; i++) {
      // Staggered cascade — later zones trail the global blend slightly.
      const g = Math.min(1, Math.max(0, a.sections * 1.35 - i * 0.05))
      const sOp = m * g * SECTION_TINT
      const mesh = sectionMeshes.current[i]
      const mat = sectionMats.current[i]
      if (mat) mat.opacity = sOp
      if (mesh) mesh.visible = i < shownCount && sOp > 0.02
      const dMesh = dividerMeshes.current[i]
      const dMat = dividerMats.current[i]
      if (dMat) dMat.opacity = m * g * 0.85
      if (dMesh) dMesh.visible = i < Math.max(0, shownCount - 1) && m * g > 0.03
    }

    if (strokeLMat.current) strokeLMat.current.opacity = m
    if (strokeRMat.current) strokeRMat.current.opacity = m
    if (strokeLMesh.current) strokeLMesh.current.visible = m > 0.02
    if (strokeRMesh.current) strokeRMesh.current.visible = m > 0.02
    if (startMat.current) startMat.current.opacity = m * START_OPACITY
    if (startMesh.current) startMesh.current.visible = m > 0.02

    if (groupRef.current) {
      groupRef.current.scale.setScalar(1)
    }

    if (
      a.phase === 'idle' &&
      a.master === 1 &&
      a.heat === heatTarget &&
      a.sections === secTarget &&
      cm.t >= 1
    ) {
      a.settled = true
    }
  })

  useFrame(() => {
    const zoom = view.current.zoom || 1
    const side = edges.current
    if (!side) return

    // Coarse hysteresis — zoom lerp must not thrash stroke allocations.
    // Layer flips and heat repaints force one rebuild each, so edge colours
    // follow the fill immediately instead of lagging until the next zoom.
    const layerNow = live.current.layer
    if (
      strokeLayer.current === layerNow &&
      strokeHeatSeq.current === heatBuildSeq.current &&
      Number.isFinite(strokeZoom.current) &&
      Math.abs(strokeZoom.current - zoom) / strokeZoom.current < 0.08
    ) {
      return
    }
    strokeLayer.current = layerNow
    strokeHeatSeq.current = heatBuildSeq.current

    const half = strokePx(zoom, view.current.fit || zoom) / 2 / zoom
    // Sit the curb just outside the asphalt ribbon.
    const leftPts = offsetPolyline(side.left, half)
    const rightPts = offsetPolyline(side.right, -half)
    const edge =
      live.current.layer === 'heatmap' &&
      !heatUsesAlpha(live.current.palette, live.current.traces)
        ? edgeRgb.current
        : null
    if (edge) {
      const L = strokeHeatmap(leftPts, half, 0.05, edge.colors, true, edge.channels)
      const R = strokeHeatmap(rightPts, half, 0.05, edge.colors, true, edge.channels)
      // Repaints morph edge colours together with the fill — same timing,
      // so the curbs never lag a palette switch.
      if (strokeHeatSeq.current !== heatBuildSeq.current) {
        const cmorph = colorMorph.current
        const okL = enqueueColorMorph(cmorph, leftStroke, L.colors, L.channels)
        const okR = enqueueColorMorph(cmorph, rightStroke, R.colors, R.channels)
        if (okL || okR) anim.current.settled = false
      }
      leftStroke.setAttribute('position', new THREE.BufferAttribute(L.positions, 3))
      leftStroke.setAttribute(
        'color',
        new THREE.BufferAttribute(L.colors, L.channels),
      )
      rightStroke.setAttribute('position', new THREE.BufferAttribute(R.positions, 3))
      rightStroke.setAttribute(
        'color',
        new THREE.BufferAttribute(R.colors, R.channels),
      )
    } else {
      dropColorMorph(colorMorph.current, leftStroke)
      dropColorMorph(colorMorph.current, rightStroke)
      leftStroke.setAttribute(
        'position',
        new THREE.BufferAttribute(strokePositions(leftPts, half, 0.05), 3),
      )
      rightStroke.setAttribute(
        'position',
        new THREE.BufferAttribute(strokePositions(rightPts, half, 0.05), 3),
      )
      leftStroke.deleteAttribute('color')
      rightStroke.deleteAttribute('color')
    }
    leftStroke.computeBoundingSphere()
    rightStroke.computeBoundingSphere()

    const a0 = side.left[0]
    const b0 = side.right[0]
    if (a0 && b0) {
      startLine.setAttribute(
        'position',
        new THREE.BufferAttribute(segmentPositions(a0, b0, half, 0.08), 3),
      )
      startLine.computeBoundingSphere()
    }

    if (live.current.layer === 'sections') {
      const cuts = live.current.zones
        .slice(0, activeSections.current)
        .map((z) => z.to)
        .filter((t) => t > 1e-4 && t < 1 - 1e-4)
      const n = Math.min(cuts.length, MAX_SECTIONS)
      for (let i = 0; i < n; i++) {
        const t = cuts[i]!
        const a = edgeAt(side.left, t) as Xy
        const b = edgeAt(side.right, t) as Xy
        sectionLines[i]!.setAttribute(
          'position',
          new THREE.BufferAttribute(segmentPositions(a, b, half, 0.08), 3),
        )
        sectionLines[i]!.computeBoundingSphere()
      }
    }

    strokeZoom.current = zoom
  })

  const sectionCount = Math.min(displayedZones.length, MAX_SECTIONS)

  return (
    <group ref={groupRef}>
      <mesh ref={asphaltMesh} geometry={fill} frustumCulled={false} renderOrder={9}>
        <meshBasicMaterial
          ref={asphaltMat}
          color={ROAD}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {displayedZones.slice(0, sectionCount).map((z, i) => (
        <mesh
          key={z.id}
          ref={(n) => {
            sectionMeshes.current[i] = n
          }}
          geometry={sectionFills[i]}
          frustumCulled={false}
          renderOrder={10}
          visible={false}
        >
          <meshBasicMaterial
            ref={(m) => {
              sectionMats.current[i] = m
            }}
            color={z.color}
            side={THREE.DoubleSide}
            toneMapped={false}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ))}
      <mesh
        ref={heatMesh}
        geometry={heat}
        frustumCulled={false}
        renderOrder={10}
        visible={false}
      >
        <meshBasicMaterial
          ref={heatMat}
          vertexColors
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <mesh
        key={`stroke-l-${strokeMode}`}
        ref={strokeLMesh}
        geometry={leftStroke}
        frustumCulled={false}
        renderOrder={11}
      >
        <meshBasicMaterial
          ref={strokeLMat}
          {...(strokeMode === 'c' ? { vertexColors: true } : { color: STROKE })}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <mesh
        key={`stroke-r-${strokeMode}`}
        ref={strokeRMesh}
        geometry={rightStroke}
        frustumCulled={false}
        renderOrder={11}
      >
        <meshBasicMaterial
          ref={strokeRMat}
          {...(strokeMode === 'c' ? { vertexColors: true } : { color: STROKE })}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <mesh
        ref={startMesh}
        geometry={startLine}
        frustumCulled={false}
        renderOrder={12}
      >
        <meshBasicMaterial
          ref={startMat}
          color={STROKE}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          opacity={START_OPACITY}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {sectionLines.map((g, i) =>
        i < Math.max(0, sectionCount - 1) ? (
          <mesh
            key={i}
            ref={(n) => {
              dividerMeshes.current[i] = n
            }}
            geometry={g}
            frustumCulled={false}
            renderOrder={12}
            visible={false}
          >
            <meshBasicMaterial
              ref={(m) => {
                dividerMats.current[i] = m
              }}
              color={STROKE}
              side={THREE.DoubleSide}
              toneMapped={false}
              transparent
              opacity={0}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        ) : null,
      )}
    </group>
  )
})

const Grid = memo(function Grid({ showOrigin, view, dot }: { showOrigin: boolean; view: RefObject<View>; dot: string }) {
  const { width, height } = useThree((s) => s.size)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const attr = new THREE.BufferAttribute(new Float32Array(MAX_DOTS * 3), 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', attr)
    g.setDrawRange(0, 0)
    return g
  }, [])
  const origin = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(toScene(0, 0)), 3))
    return g
  }, [])
  const stamp = useRef({ x: NaN, z: NaN, step: NaN, w: 0, h: 0 })

  useEffect(
    () => () => {
      geometry.dispose()
      origin.dispose()
    },
    [geometry, origin],
  )

  useFrame(() => {
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = attr.array as Float32Array
    const v = view.current
    if (width < 2 || height < 2) return
    // Degenerate camera (zero-size fit, NaN zoom) — keep the last good
    // field instead of clearing the grid to zero dots.
    const zoom = v.zoom
    if (!Number.isFinite(zoom) || zoom <= 0) return
    let step = spacingFor(zoom)
    if (!Number.isFinite(step) || step <= 0) return
    const pad = step * 2
    const prev = stamp.current
    if (
      step === prev.step &&
      width === prev.w &&
      height === prev.h &&
      Math.abs(v.x - prev.x) < pad &&
      Math.abs(v.z - prev.z) < pad
    ) {
      return
    }

    const margin = step * 4
    const halfW = width / zoom / 2 + margin
    const halfH = height / zoom / 2 + margin
    if (!Number.isFinite(halfW) || !Number.isFinite(halfH)) return
    // Coarsen instead of clipping: if the field would overflow the fixed
    // buffer, halve the density until full coverage fits. Clipping drops
    // the far corner of the grid, which reads as dots disappearing.
    for (let guard = 0; guard < 8; guard++) {
      const nx = Math.floor((2 * halfW) / step) + 1
      const ny = Math.floor((2 * halfH) / step) + 1
      if (nx * ny <= MAX_DOTS) break
      step *= 2
    }
    const x0 = Math.floor((v.x - halfW) / step) * step
    const x1 = Math.ceil((v.x + halfW) / step) * step
    const n0 = Math.floor((-v.z - halfH) / step) * step
    const n1 = Math.ceil((-v.z + halfH) / step) * step

    let i = 0
    for (let n = n0; n <= n1 && i < MAX_DOTS; n += step) {
      for (let e = x0; e <= x1 && i < MAX_DOTS; e += step) {
        if (e === 0 && n === 0) continue
        const [x, y, z] = toScene(e, n)
        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
        i++
      }
    }

    attr.needsUpdate = true
    geometry.setDrawRange(0, i)
    // Sphere must track the rebuilt field — stale bounds cull the grid when zoomed in.
    geometry.computeBoundingSphere()
    stamp.current = { x: v.x, z: v.z, step, w: width, h: height }
  })

  return (
    <group>
      <points geometry={geometry} frustumCulled={false} renderOrder={0}>
        <pointsMaterial
          map={DOT_MAP}
          color={dot}
          opacity={DOT_OPACITY}
          transparent
          size={3}
          sizeAttenuation={false}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </points>
      {showOrigin ? (
        <points geometry={origin} frustumCulled={false} renderOrder={12}>
          <pointsMaterial
            map={DOT_MAP}
            color={ORIGIN}
            transparent
            size={8}
            sizeAttenuation={false}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </points>
      ) : null}
    </group>
  )
})

const Camera = memo(function Camera({
  view,
  onZoom,
  onFps,
  follow,
}: {
  view: RefObject<View>
  onZoom: (z: number) => void
  onFps?: (fps: number) => void
  /** World-space follow target — null when the camera is free. */
  follow: { x: number; z: number } | null
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const gl = useThree((s) => s.gl)
  const lastShown = useRef(1)
  const fpsAcc = useRef({ frames: 0, time: 0, last: 0 })
  const followRef = useRef(follow)
  useLayoutEffect(() => {
    followRef.current = follow
  }, [follow])

  /* eslint-disable react-hooks/immutability -- imperative R3F view/DOM */
  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement
    let drag: number | null = null
    let lx = 0
    let ly = 0

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const v = view.current
      // Scrolling takes over — a focus fly-to never fights the wheel.
      v.fly = null
      const f = followRef.current
      if (f) {
        // Focused — zoom relative to the followed point, pinned at screen center.
        v.ax = f.x
        v.az = f.z
        v.apx = 0
        v.apy = 0
      } else {
        const px = e.clientX - rect.left - rect.width / 2
        const py = e.clientY - rect.top - rect.height / 2
        // Screen +x → world +x, screen +y (down) → world +z with up=(0,0,-1).
        v.ax = v.x + px / v.zoom
        v.az = v.z + py / v.zoom
        v.apx = px
        v.apy = py
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      const delta = THREE.MathUtils.clamp(e.deltaY * unit, -120, 120)
      const fit = v.fit || v.zoom
      // Focused cameras may push much closer to the followed point.
      // Floored so a degenerate fit can never pin the zoom at/below zero.
      const maxIn = f ? ZOOM_IN_FOCUSED : ZOOM_IN
      const lo = Math.max(fit * ZOOM_OUT, 1e-6)
      const hi = Math.max(fit * maxIn, lo * 2)
      v.tZoom = THREE.MathUtils.clamp(
        v.tZoom * Math.exp(-delta * 0.0022),
        lo,
        hi,
      )
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest('[data-debug]'))) return
      // Focused (following) — pan is locked, only zoom stays manual.
      if (followRef.current) return
      e.preventDefault()
      drag = e.pointerId
      lx = e.clientX
      ly = e.clientY
      vClearAnchor(view.current)
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }

    const onMove = (e: PointerEvent) => {
      if (drag == null || e.pointerId !== drag) return
      const v = view.current
      v.tx -= (e.clientX - lx) / v.zoom
      v.tz -= (e.clientY - ly) / v.zoom
      lx = e.clientX
      ly = e.clientY
      vClearAnchor(v)
    }

    const onUp = (e: PointerEvent) => {
      if (drag == null || e.pointerId !== drag) return
      drag = null
      // Hand cursor back to React (grab / crosshair via the Canvas style).
      el.style.cursor = ''
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* released */
      }
    }

    el.style.touchAction = 'none'
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.style.cursor = ''
      el.style.touchAction = ''
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [gl, view])
  /* eslint-enable react-hooks/immutability */

  /* eslint-disable react-hooks/immutability -- imperative R3F view/DOM */
  useFrame((_, dt) => {
    if (onFps && dt > 0 && dt <= 0.25) {
      const a = fpsAcc.current
      a.frames++
      a.time += dt
      if (a.time >= 0.5) {
        const next = Math.round(a.frames / a.time)
        if (next !== a.last) {
          a.last = next
          onFps(next)
        }
        a.frames = 0
        a.time = 0
      }
    }
    const v = view.current
    const k = 1 - Math.exp(-SMOOTH * Math.min(dt, 0.05))

    // Fly-to transition — eased pan + zoom together, overrides the chase.
    // Zoom rides in log-space under the SAME easing as pan, so the two stay
    // perceptually locked: at any instant both are equally far through.
    if (v.fly) {
      const fly = v.fly
      fly.t += Math.min(dt, 0.05) / fly.dur
      const tt = Math.min(1, fly.t)
      const e = easeInOutCubic(tt)
      v.x = v.tx = fly.sx + (fly.ex - fly.sx) * e
      v.z = v.tz = fly.sz + (fly.ez - fly.sz) * e
      v.zoom = v.tZoom =
        fly.szoom * Math.pow(fly.ezoom / Math.max(fly.szoom, 1e-6), e)
      vClearAnchor(v)
      if (tt >= 1) v.fly = null
    } else {
      v.zoom += (v.tZoom - v.zoom) * k

      // Following — steer the pan target at the car every frame, zoom stays manual.
      if (follow) {
        v.tx = follow.x
        v.tz = follow.z
      }

      if (v.ax != null && v.az != null) {
        v.x = v.ax - v.apx / v.zoom
        v.z = v.az - v.apy / v.zoom
        v.tx = v.x
        v.tz = v.z
        if (Math.abs(v.tZoom - v.zoom) < 1e-4) {
          v.zoom = v.tZoom
          vClearAnchor(v)
        }
      } else {
        v.x += (v.tx - v.x) * k
        v.z += (v.tz - v.z) * k
      }
    }

    place(camera, v)
    // Coarse UI readout — avoid React updates every lerp tick.
    const shown = Math.round(v.zoom * 20) / 20
    if (shown !== lastShown.current) {
      lastShown.current = shown
      onZoom(shown)
    }
  })
  /* eslint-enable react-hooks/immutability */

  return null
})

function vClearAnchor(v: View) {
  v.ax = null
  v.az = null
}

/** Debug readouts — viewport center + pointer, both in track frame (m). */
type MouseDebug = { sx: number; sy: number; x: number; y: number }

const StateProbe = memo(function StateProbe({
  view,
  onViewport,
  onMouse,
}: {
  view: RefObject<View>
  onViewport: (x: number, y: number) => void
  onMouse: (m: MouseDebug | null) => void
}) {
  const gl = useThree((s) => s.gl)
  const lastView = useRef({ x: Infinity, y: Infinity })

  useFrame(() => {
    const v = view.current
    // Track frame: planar x = world x, planar y = -world z.
    const x = Math.round(v.x * 10) / 10
    const y = Math.round(-v.z * 10) / 10
    const l = lastView.current
    if (x !== l.x || y !== l.y) {
      l.x = x
      l.y = y
      onViewport(x, y)
    }
  })

  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement
    let lastSent = ''
    const update = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-debug]')) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const v = view.current
      const px = e.clientX - rect.left - rect.width / 2
      const py = e.clientY - rect.top - rect.height / 2
      const rx = Math.round((v.x + px / v.zoom) * 10) / 10
      const ry = Math.round((-(v.z + py / v.zoom)) * 10) / 10
      const sx = Math.round(e.clientX - rect.left)
      const sy = Math.round(e.clientY - rect.top)
      const key = `${sx},${sy},${rx},${ry}`
      if (key !== lastSent) {
        lastSent = key
        onMouse({ sx, sy, x: rx, y: ry })
      }
    }
    const clear = () => {
      if (lastSent === '__null__') return
      lastSent = '__null__'
      onMouse(null)
    }
    el.addEventListener('pointermove', update)
    el.addEventListener('pointerleave', clear)
    return () => {
      el.removeEventListener('pointermove', update)
      el.removeEventListener('pointerleave', clear)
    }
  }, [gl, view, onMouse])

  return null
})

function fitTrack(track: Track, width: number, height: number) {
  // A zero-size first layout must never poison the camera: callers ignore
  // non-finite results and keep the previous view instead.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    return NaN
  }
  const b = boundsOf(track.samples)
  const spanX = Math.max(b.maxX - b.minX, 1)
  const spanY = Math.max(b.maxY - b.minY, 1)
  return Math.min(width / (spanX * 1.2), height / (spanY * 1.2))
}

/** Clockwise screen degrees — matches “rotate right” in the debug panel. */
type RotateDeg = 0 | 90 | 180 | 270

type TrackOrientation = {
  rotate: RotateDeg
  flipH: boolean
  flipV: boolean
}

const ROTATE_OPTIONS: { id: RotateDeg; name: string }[] = [
  { id: 0, name: '0°' },
  { id: 90, name: '90°' },
  { id: 180, name: '180°' },
  { id: 270, name: '270°' },
]

/** Camera focus — free pan/zoom, the track origin, or following one of the cars. */
type FocusTarget = 'free' | 'origin' | 'car1' | 'car2'

const FOCUS_OPTIONS: { id: FocusTarget; name: string }[] = [
  { id: 'free', name: 'Free' },
  { id: 'origin', name: 'Origin' },
  { id: 'car1', name: 'Car 1' },
  { id: 'car2', name: 'Car 2' },
]

const ORIENT_IDENTITY: TrackOrientation = {
  rotate: 0,
  flipH: false,
  flipV: false,
}

/**
 * Preferred map framing per circuit — every track landscape so it fills the
 * wide viewport. Raw TUMFTM bounds measured from the CSVs: portrait tracks
 * (h > w) get rotate 90; landscape tracks stay as-is. The 90° entries follow
 * the spa/monza convention (both flips, i.e. orientation-preserving).
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

function orientationFor(trackId: string): TrackOrientation {
  return TRACK_ORIENTATION[trackId] ?? ORIENT_IDENTITY
}

/** Flip / rotate around the track bounds center. Reflections swap left/right. */
function orientTrack(track: Track, o: TrackOrientation): Track {
  if (o.rotate === 0 && !o.flipH && !o.flipV) return track
  const b = boundsOf(track.samples)
  const { cx, cy } = b
  // One axis flip is a reflection; both is orientation-preserving.
  const swapSides = o.flipH !== o.flipV
  const samples = track.samples.map((s) => {
    let x = s.x - cx
    let y = s.y - cy
    if (o.flipH) x = -x
    if (o.flipV) y = -y
    let rx = x
    let ry = y
    switch (o.rotate) {
      case 0:
        break
      case 90:
        rx = y
        ry = -x
        break
      case 180:
        rx = -x
        ry = -y
        break
      case 270:
        rx = -y
        ry = x
        break
      default: {
        const _exhaustive: never = o.rotate
        void _exhaustive
        break
      }
    }
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
 * Same framing as the displayed track for a raw raceline (shared origin with
 * the centerline): recenter on the raw track bounds, then flip/rotate around
 * the origin — mirrors centerTrack + orientTrack so the line overlays exactly.
 */
function orientRacePoints(
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
    switch (o.rotate) {
      case 90:
        return [py, -px] as Xy
      case 180:
        return [-px, -py] as Xy
      case 270:
        return [-py, px] as Xy
      default:
        return [px, py] as Xy
    }
  })
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={[
        'relative h-4 w-7 shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        checked ? 'bg-primary' : 'bg-input',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'absolute top-0.5 left-0.5 size-3 rounded-full bg-white transition-transform duration-100 ease-out',
          checked ? 'translate-x-3' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function DebugRow({
  label,
  dark = false,
  children,
}: {
  label: string
  dark?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={[
        'flex h-7 items-center justify-between gap-3 px-2',
        dark ? 'bg-muted/80' : 'bg-transparent',
      ].join(' ')}
    >
      <span className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  )
}

/**
 * Map scale bar for the absolute ortho zoom (screen px per meter).
 * Picks a 1/2/5 nice distance close to ~80 px wide.
 */
function scaleFor(zoom: number): { label: string; px: number } {
  if (!Number.isFinite(zoom) || zoom <= 0) return { label: '—', px: 0 }
  const raw = 80 / zoom
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1
  const meters = nice * mag
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
  return { label, px: Math.max(8, Math.round(meters * zoom)) }
}

function paletteGradient(
  palette: PaletteId,
  traces: boolean,
  invert: boolean,
  metric: MetricId,
): string {
  const stops: string[] = []
  const alpha = heatUsesAlpha(palette, traces)
  // Pedals keep brake → throttle order; everything else follows Invert.
  const flip = invert && metric !== 'pedals'
  for (let i = 0; i <= 8; i++) {
    const t = flip ? 1 - i / 8 : i / 8
    if (alpha) {
      const [r, g, b, a] = samplePaletteRgba(palette, t)
      stops.push(
        `rgba(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${a.toFixed(3)})`,
      )
    } else {
      const [r, g, b] = samplePalette(palette, t)
      stops.push(
        `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`,
      )
    }
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

const HeatmapLegend = memo(function HeatmapLegend({
  track,
  palette,
  metric,
  traces,
  metricsSource,
  invert,
  dark,
}: {
  track: Track
  palette: PaletteId
  metric: MetricId
  traces: boolean
  metricsSource: MetricsSourceId
  invert: boolean
  dark?: boolean
}) {
  const { min, max } = useMemo(() => {
    const series = seriesFor(lapMetrics(track, metricsSource), metric)
    return metricDisplayRange(metric, series)
  }, [track, metric, metricsSource])
  const name = METRICS.find((m) => m.id === metric)?.name ?? metric
  const unit = metricUnit(metric)
  const lo =
    metric === 'pedals' ? 'Brake' : formatMetricValue(metric, min)
  const hi =
    metric === 'pedals' ? 'Throttle' : formatMetricValue(metric, max)
  const gradient = useMemo(
    () => paletteGradient(palette, traces, invert, metric),
    [palette, traces, invert, metric],
  )

  return (
    <div
      className={[
        'flex flex-col gap-1.5 px-2 py-1.5',
        dark ? 'bg-muted/80' : 'bg-transparent',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">Legend</span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {name}
          {metric === 'pedals' ? '' : ` · ${unit}`}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-[2px] bg-secondary"
        style={{ backgroundImage: gradient }}
        aria-hidden
      />
      <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-foreground/80">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  )
})

const SectionLegend = memo(function SectionLegend({
  zones,
  dark = false,
}: {
  zones: SectionZone[]
  dark?: boolean
}) {
  const items = sectionLegend(zones)
  return (
    <div
      className={[
        'flex flex-col gap-1 px-2 py-1.5',
        dark ? 'bg-muted/80' : 'bg-transparent',
      ].join(' ')}
    >
      <span className="text-[11px] text-muted-foreground">Legend</span>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: item.color }}
              aria-hidden
            />
            <span className="truncate text-[11px] text-foreground/80">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

/**
 * One debug group: dark title band, then rows striped light/dark/light…
 * from scratch — so headers can never glue two same-tone rows together.
 * Every direct child (DebugRow or legend block, one fragment level
 * flattened) gets its `dark` injected by position.
 */
function DebugSection({ title, children }: { title?: string; children: ReactNode }) {
  const rows: ReactNode[] = []
  Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') return
    if (isValidElement(child) && child.type === Fragment) {
      Children.forEach(
        (child.props as { children?: ReactNode }).children,
        (grand) => {
          if (grand != null && typeof grand !== 'boolean') rows.push(grand)
        },
      )
      return
    }
    rows.push(child)
  })
  return (
    <>
      {title ? (
        <p className="flex h-7 items-center bg-muted/80 px-2 text-[9px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </p>
      ) : null}
      {rows.map((row, i) =>
        isValidElement<{ dark?: boolean }>(row)
          ? cloneElement(row, { dark: i % 2 === 1, key: row.key ?? i })
          : row,
      )}
    </>
  )
}

/** Compact dropdown for debug values — shadcn style, mono value text. */
function DebugSelect({
  value,
  onValueChange,
  label,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  label: string
  children: ReactNode
}) {
  return (
    <Select value={value} onValueChange={(v) => v != null && onValueChange(v)}>
      <SelectTrigger
        aria-label={label}
        className="h-5 max-w-36 gap-1 rounded-[3px] border-0 bg-secondary px-1.5 font-mono text-[11px] tabular-nums text-secondary-foreground focus-visible:ring-ring/50"
      >
        <SelectValue className="block truncate" />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}

/**
 * Light/dark toggle — next-themes flips .light/.dark on <html>, so every
 * token-driven surface (chrome, charts, canvas stage) follows this one switch.
 */
function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  // False during SSR/hydration — same client-only pattern as TimelineScrubber.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  // Default theme is dark — match it pre-hydration to avoid a flash.
  const dark = mounted ? resolvedTheme !== 'light' : true
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {dark ? 'Dark' : 'Light'}
      </span>
      <Switch
        checked={dark}
        onChange={() => setTheme(dark ? 'light' : 'dark')}
        label="Toggle light mode"
      />
    </div>
  )
}

/** Clamp lap progress to [0, 1]. */
function clampProgress(v: number) {
  return Math.min(1, Math.max(0, v))
}

/** Right-side panel for items (cars) — mirrors the debug panel styling. */
const ItemsPanel = memo(function ItemsPanel({
  car1Color,
  car1Progress,
  car1Visible,
  car2Color,
  car2Progress,
  car2Visible,
  onCar1Color,
  onCar1Progress,
  onToggleCar1Visible,
  onCar2Color,
  onCar2Progress,
  onToggleCar2Visible,
  car1Faded,
  car2Faded,
  onToggleCar1Faded,
  onToggleCar2Faded,
  line1Color,
  line1Visible,
  line2Color,
  line2Visible,
  onLine1Color,
  onToggleLine1Visible,
  onLine2Color,
  onToggleLine2Visible,
}: {
  car1Color: string
  car1Progress: number
  car1Visible: boolean
  car2Color: string
  car2Progress: number
  car2Visible: boolean
  onCar1Color: (color: string) => void
  onCar1Progress: (progress: number) => void
  onToggleCar1Visible: () => void
  onCar2Color: (color: string) => void
  onCar2Progress: (progress: number) => void
  onToggleCar2Visible: () => void
  car1Faded: boolean
  car2Faded: boolean
  onToggleCar1Faded: () => void
  onToggleCar2Faded: () => void
  line1Color: string
  line1Visible: boolean
  line2Color: string
  line2Visible: boolean
  onLine1Color: (color: string) => void
  onToggleLine1Visible: () => void
  onLine2Color: (color: string) => void
  onToggleLine2Visible: () => void
}) {
  const car1Pct = Math.round(car1Progress * 1000) / 10
  const car2Pct = Math.round(car2Progress * 1000) / 10
  return (
    <aside
      data-debug
      className="absolute top-3 right-3 z-10 w-56 overflow-hidden rounded-[4px] border border-border/55 bg-card/85 text-card-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
    >
      <p className="flex h-7 items-center bg-muted/80 px-2 text-[9px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Items
      </p>
      <div className="flex flex-col pb-0.5">
        <DebugSection title="Car 1">
          <DebugRow label="Color">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Car 1 color">
              {ITEM_COLORS.map((c) => {
                const active = c.value === car1Color
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${c.id} car 1`}
                    title={c.id}
                    onClick={() => onCar1Color(c.value)}
                    className={[
                      'size-5 cursor-pointer rounded-[3px] border-0 p-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      active ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : 'opacity-70 hover:opacity-100',
                    ].join(' ')}
                    style={{ background: c.value }}
                  />
                )
              })}
            </div>
          </DebugRow>
          <DebugRow label="Progress">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[11px] tabular-nums text-foreground/80">
                {car1Pct}%
              </span>
              <button
                type="button"
                aria-label="Nudge car 1 backward"
                onClick={() => onCar1Progress(clampProgress(car1Progress - PROGRESS_NUDGE))}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Nudge car 1 forward"
                onClick={() => onCar1Progress(clampProgress(car1Progress + PROGRESS_NUDGE))}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                +
              </button>
            </div>
          </DebugRow>
          <DebugRow label="Visible">
            <Switch checked={car1Visible} onChange={onToggleCar1Visible} label="Toggle car 1 visibility" />
          </DebugRow>
          <DebugRow label="Dimmed">
            <Switch checked={car1Faded} onChange={onToggleCar1Faded} label="Fade car 1 line behind the car" />
          </DebugRow>
        </DebugSection>
        <div className="px-2 py-1.5">
          <input
            type="range"
            min={0}
            max={100000}
            value={Math.round(car1Progress * 100000)}
            onChange={(e) => onCar1Progress(Number(e.target.value) / 100000)}
            aria-label="Car 1 progress along lap"
            className="w-full cursor-pointer"
            style={{ accentColor: car1Color }}
          />
          <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
        <DebugSection title="Car 2">
          <DebugRow label="Color">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Car 2 color">
              {ITEM_COLORS.map((c) => {
                const active = c.value === car2Color
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${c.id} car 2`}
                    title={c.id}
                    onClick={() => onCar2Color(c.value)}
                    className={[
                      'size-5 cursor-pointer rounded-[3px] border-0 p-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      active ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : 'opacity-70 hover:opacity-100',
                    ].join(' ')}
                    style={{ background: c.value }}
                  />
                )
              })}
            </div>
          </DebugRow>
          <DebugRow label="Progress">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[11px] tabular-nums text-foreground/80">
                {car2Pct}%
              </span>
              <button
                type="button"
                aria-label="Nudge car 2 backward"
                onClick={() => onCar2Progress(clampProgress(car2Progress - PROGRESS_NUDGE))}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Nudge car 2 forward"
                onClick={() => onCar2Progress(clampProgress(car2Progress + PROGRESS_NUDGE))}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                +
              </button>
            </div>
          </DebugRow>
          <DebugRow label="Visible">
            <Switch checked={car2Visible} onChange={onToggleCar2Visible} label="Toggle car 2 visibility" />
          </DebugRow>
          <DebugRow label="Dimmed">
            <Switch checked={car2Faded} onChange={onToggleCar2Faded} label="Fade car 2 line behind the car" />
          </DebugRow>
        </DebugSection>
        <div className="px-2 py-1.5">
          <input
            type="range"
            min={0}
            max={100000}
            value={Math.round(car2Progress * 100000)}
            onChange={(e) => onCar2Progress(Number(e.target.value) / 100000)}
            aria-label="Car 2 progress along lap"
            className="w-full cursor-pointer"
            style={{ accentColor: car2Color }}
          />
          <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
        <DebugSection title="Racing line 1">
          <DebugRow label="Color">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Racing line 1 color">
              {ITEM_COLORS.map((c) => {
                const active = c.value === line1Color
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${c.id} racing line 1`}
                    title={c.id}
                    onClick={() => onLine1Color(c.value)}
                    className={[
                      'size-5 cursor-pointer rounded-[3px] border-0 p-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      active ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : 'opacity-70 hover:opacity-100',
                    ].join(' ')}
                    style={{ background: c.value }}
                  />
                )
              })}
            </div>
          </DebugRow>
          <DebugRow label="Visible">
            <Switch checked={line1Visible} onChange={onToggleLine1Visible} label="Toggle racing line 1 visibility" />
          </DebugRow>
        </DebugSection>
        <DebugSection title="Racing line 2">
          <DebugRow label="Color">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Racing line 2 color">
              {ITEM_COLORS.map((c) => {
                const active = c.value === line2Color
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${c.id} racing line 2`}
                    title={c.id}
                    onClick={() => onLine2Color(c.value)}
                    className={[
                      'size-5 cursor-pointer rounded-[3px] border-0 p-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      active ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : 'opacity-70 hover:opacity-100',
                    ].join(' ')}
                    style={{ background: c.value }}
                  />
                )
              })}
            </div>
          </DebugRow>
          <DebugRow label="Visible">
            <Switch checked={line2Visible} onChange={onToggleLine2Visible} label="Toggle racing line 2 visibility" />
          </DebugRow>
        </DebugSection>
      </div>
    </aside>
  )
})

const DebugPanel = memo(function DebugPanel({
  showOrigin,
  trackHover,
  zoom,
  zoomAbs,
  fps,
  viewport,
  mouse,
  track,
  rotate,
  flipH,
  flipV,
  layer,
  palette,
  metric,
  traces,
  metricsSource,
  invert,
  sectionMap,
  zones,
  onToggleOrigin,
  onToggleHover,
  onToggleTraces,
  onToggleInvert,
  onTrack,
  onRotate,
  onToggleFlipH,
  onToggleFlipV,
  onLayer,
  onPalette,
  onMetric,
  onPreset,
  onSectionMap,
  focus,
  onFocus,
}: {
  showOrigin: boolean
  trackHover: boolean
  focus: FocusTarget
  zoom: number
  /** Absolute ortho zoom (screen px per meter) — drives the scale bar. */
  zoomAbs: number
  fps: number
  viewport: { x: number; y: number }
  mouse: MouseDebug | null
  track: Track
  rotate: RotateDeg
  flipH: boolean
  flipV: boolean
  layer: LayerId
  palette: PaletteId
  metric: MetricId
  traces: boolean
  metricsSource: MetricsSourceId
  invert: boolean
  sectionMap: SectionMapId
  zones: SectionZone[]
  onToggleOrigin: () => void
  onToggleHover: () => void
  onToggleTraces: () => void
  onToggleInvert: () => void
  onTrack: (id: string) => void
  onRotate: (deg: RotateDeg) => void
  onToggleFlipH: () => void
  onToggleFlipV: () => void
  onLayer: (id: LayerId) => void
  onPalette: (id: PaletteId) => void
  onMetric: (id: MetricId) => void
  onPreset: (id: HeatmapPresetId) => void
  onSectionMap: (id: SectionMapId) => void
  onFocus: (focus: FocusTarget) => void
}) {
  const preset: HeatmapPresetSelection = presetFor(metric, palette)
  const scale = useMemo(() => scaleFor(zoomAbs), [zoomAbs])
  return (
    <aside
      data-debug
      className="absolute top-3 left-3 z-10 w-56 overflow-hidden rounded-[4px] border border-border/55 bg-card/85 text-card-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
    >
      <p className="flex h-7 items-center bg-muted/80 px-2 text-[9px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Debug
      </p>
      <div className="flex flex-col pb-0.5">
        <DebugSection>
          <DebugRow label="Track">
            <DebugSelect value={track.id} onValueChange={onTrack} label="Track">
              {CATALOG.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          <DebugRow label="Rotate">
            <DebugSelect
              value={String(rotate)}
              onValueChange={(v) => onRotate(Number(v) as RotateDeg)}
              label="Track rotation"
            >
              {ROTATE_OPTIONS.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          <DebugRow label="Flip H">
            <Switch checked={flipH} onChange={onToggleFlipH} label="Flip horizontal" />
          </DebugRow>
          <DebugRow label="Flip V">
            <Switch checked={flipV} onChange={onToggleFlipV} label="Flip vertical" />
          </DebugRow>
        </DebugSection>
        <DebugSection title="Display">
          <DebugRow label="Theme">
            <ThemeSwitch />
          </DebugRow>
          <DebugRow label="Layer">
            <DebugSelect
              value={layer}
              onValueChange={(v) => onLayer(v as LayerId)}
              label="Layer"
            >
              {LAYERS.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          {layer === 'sections' ? (
            <>
              <DebugRow label="Preset">
              <DebugSelect
                value={sectionMap}
                onValueChange={(v) => onSectionMap(v as SectionMapId)}
                label="Preset"
              >
                {SECTION_MAPS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </DebugSelect>
            </DebugRow>
            <SectionLegend zones={zones} />
          </>
          ) : null}
          {layer === 'heatmap' ? (
            <>
              <DebugRow label="Preset">
              <DebugSelect
                value={preset}
                onValueChange={(v) => {
                  if (v === 'custom') return
                  onPreset(v as HeatmapPresetId)
                }}
                label="Preset"
              >
                {HEATMAP_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                {preset === 'custom' ? (
                  <SelectItem value="custom">Custom</SelectItem>
                ) : null}
              </DebugSelect>
            </DebugRow>
            <DebugRow label="Palette">
              <DebugSelect
                value={palette}
                onValueChange={(v) => onPalette(v as PaletteId)}
                label="Palette"
              >
                {PALETTE_GROUPS.map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel>{group.name}</SelectLabel>
                    {PALETTES.filter((p) => p.group === group.id).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </DebugSelect>
            </DebugRow>
            <DebugRow label="Value">
              <DebugSelect
                value={metric}
                onValueChange={(v) => onMetric(v as MetricId)}
                label="Value"
              >
                {METRICS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </DebugSelect>
            </DebugRow>
            <DebugRow label="Traces">
              <Switch checked={traces} onChange={onToggleTraces} label="Traces" />
            </DebugRow>
            <DebugRow label="Invert">
              <Switch checked={invert} onChange={onToggleInvert} label="Invert heatmap" />
            </DebugRow>
            <HeatmapLegend
              track={track}
              palette={palette}
              metric={metric}
              traces={traces}
              metricsSource={metricsSource}
              invert={invert}
            />
          </>
        ) : null}
        </DebugSection>
        <DebugSection title="View">
          <DebugRow label="Focus">
            <DebugSelect
              value={focus}
              onValueChange={(v) => onFocus(v as FocusTarget)}
              label="Camera focus"
            >
              {FOCUS_OPTIONS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          <DebugRow label="Zoom">
            <span className="font-mono text-[11px] tabular-nums text-foreground/80">
              {zoom.toFixed(2)}×
            </span>
          </DebugRow>
        <DebugRow label="FPS">
          <span className="font-mono text-[11px] tabular-nums text-foreground/80">
            {fps > 0 ? fps : '—'}
          </span>
        </DebugRow>
        <DebugRow label="Viewport">
          <span
            className="font-mono text-[11px] tabular-nums text-foreground/80"
            title="Viewport center in track frame (m)"
          >
            {viewport.x.toFixed(1)}, {viewport.y.toFixed(1)}
          </span>
        </DebugRow>
        <DebugRow label="Mouse">
          <span
            className="font-mono text-[11px] tabular-nums text-foreground/80"
            title={
              mouse ? `Screen ${mouse.sx}, ${mouse.sy} px · track frame (m)` : undefined
            }
          >
            {mouse ? `${mouse.x.toFixed(1)}, ${mouse.y.toFixed(1)}` : '—'}
          </span>
        </DebugRow>
        <DebugRow label="Scale">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] tabular-nums text-foreground/80">
              {scale.label}
            </span>
            <div
              aria-hidden
              className="h-[5px] border-r-2 border-b-2 border-l-2 border-muted-foreground"
              style={{ width: scale.px }}
            />
          </div>
        </DebugRow>
        <DebugRow label="Origin">
          <Switch checked={showOrigin} onChange={onToggleOrigin} label="Origin" />
        </DebugRow>
        <DebugRow label="Hover">
          <Switch checked={trackHover} onChange={onToggleHover} label="Track hover" />
        </DebugRow>
        </DebugSection>
      </div>
    </aside>
  )
})

function newView(zoom = 1): View {
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

export function DashboardCanvas() {
  const [showOrigin, setShowOrigin] = useState(false)
  const [trackHover, setTrackHover] = useState(true)
  const [hoverInfo, setHoverInfo] = useState<TrackHoverInfo | null>(null)
  const [trackId, setTrackId] = useState(CATALOG[0]!.id)
  const [rotate, setRotate] = useState<RotateDeg>(
    () => orientationFor(CATALOG[0]!.id).rotate,
  )
  const [flipH, setFlipH] = useState(
    () => orientationFor(CATALOG[0]!.id).flipH,
  )
  const [flipV, setFlipV] = useState(
    () => orientationFor(CATALOG[0]!.id).flipV,
  )
  const [layer, setLayer] = useState<LayerId>('normal')
  const [palette, setPalette] = useState<PaletteId>(() => recommendedPalette('speed'))
  const [metric, setMetric] = useState<MetricId>('speed')
  /** Intensity heat: fade inactive zones so asphalt shows through. */
  const [traces, setTraces] = useState(false)
  /** Flip heat direction — on by default; pedals always keep brake → throttle. */
  const [invert, setInvert] = useState(true)
  const metricsSource: MetricsSourceId = 'auto'
  const [sectionMap, setSectionMap] = useState<SectionMapId>('sectors')
  const [zoomFactor, setZoomFactor] = useState(1)
  const [zoomAbs, setZoomAbs] = useState(1)
  const [fps, setFps] = useState(0)
  const [viewport, setViewport] = useState({ x: 0, y: 0 })
  const [mouse, setMouse] = useState<MouseDebug | null>(null)
  const [hostSize, setHostSize] = useState({ width: 1, height: 1 })
  const [car1Color, setCar1Color] = useState<string>(ITEM_DEFAULT_COLOR)
  const [car1Progress, setCar1Progress] = useState(0)
  const [car1Visible, setCar1Visible] = useState(true)
  const [car1Faded, setCar1Faded] = useState(true)
  const [car2Color, setCar2Color] = useState<string>('#ff3df0')
  const [car2Progress, setCar2Progress] = useState(0.5)
  const [car2Visible, setCar2Visible] = useState(false)
  const [car2Faded, setCar2Faded] = useState(true)
  const [line1Color, setLine1Color] = useState<string>('#a78bfa')
  const [line1Visible, setLine1Visible] = useState(false)
  const [line2Color, setLine2Color] = useState<string>('#fbbf24')
  const [line2Visible, setLine2Visible] = useState(false)
  // Fresh progress for the line-fade frame loop (refs avoid stale closures).
  const car1ProgressRef = useRef(car1Progress)
  const car2ProgressRef = useRef(car2Progress)
  useLayoutEffect(() => {
    car1ProgressRef.current = car1Progress
    car2ProgressRef.current = car2Progress
  }, [car1Progress, car2Progress])
  const [focus, setFocus] = useState<FocusTarget>('free')
  const { resolvedTheme } = useTheme()
  // False during SSR/hydration — same client-only pattern as TimelineScrubber.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  /** Asphalt stays dark in both themes — only the grid dots flip with the page. */
  const dot = mounted && resolvedTheme === 'light' ? DOT_LIGHT : DOT
  const view = useRef<View>(newView())
  const source = CATALOG.find((t) => t.id === trackId) ?? CATALOG[0]!
  const orientation = useMemo<TrackOrientation>(
    () => ({ rotate, flipH, flipV }),
    [rotate, flipH, flipV],
  )
  const track = useMemo(
    () => orientTrack(source, orientation),
    [source, orientation],
  )
  /** Rendered ring — hover mark/tip must use this, not the sparse source. */
  const smooth = useMemo(() => resampleTrack(track, FILL_SPACING), [track])
  /** Racing line the car rides — raceline data framed like the track, else centerline. */
  const racePath = useMemo<Xy[]>(() => {
    const race = RACE_LINES[trackId]
    if (!race) return smooth.samples.map((s) => [s.x, s.y] as Xy)
    const raw = TRACKS.find((t) => t.id === trackId) ?? source
    return orientRacePoints(race, raw, orientation)
  }, [trackId, source, orientation, smooth])
  /** Car 2's own line — the raceline shifted slightly sideways. */
  const car2Path = useMemo<Xy[]>(
    () => offsetPolyline(racePath, CAR2_LATERAL_M),
    [racePath],
  )
  /** Camera follow target in world coords — null when the camera is free. */
  const follow = useMemo<{ x: number; z: number } | null>(() => {
    if (focus === 'car1') {
      const p = poseOnPath(racePath, car1Progress)
      return { x: p.x, z: -p.y }
    }
    if (focus === 'car2') {
      const p = poseOnPath(car2Path, car2Progress)
      return { x: p.x, z: -p.y }
    }
    if (focus === 'origin') return { x: 0, z: 0 }
    return null
  }, [focus, racePath, car1Progress, car2Path, car2Progress])
  const sizeRef = useRef({ width: 1, height: 1 })
  const heatPaintRef = useRef<HeatPaint | null>(null)
  const zones = useMemo(
    () => resolveSectionMap(sectionMap, track, metricsSource),
    [sectionMap, track, metricsSource],
  )

  const hoverResetKey = [
    layer,
    trackId,
    rotate,
    flipH,
    flipV,
    sectionMap,
    metric,
    palette,
    traces,
    invert,
  ].join('|')
  const [hoverClearedFor, setHoverClearedFor] = useState(hoverResetKey)
  if (hoverClearedFor !== hoverResetKey) {
    setHoverClearedFor(hoverResetKey)
    setHoverInfo(null)
  }

  // Stable callbacks — scene children are memoized, so a new closure per
  // render would defeat that and reconcile the scene on every hover tick.
  const onToggleOrigin = useCallback(() => setShowOrigin((v) => !v), [])
  const onToggleHover = useCallback(() => {
    setTrackHover((v) => {
      if (v) setHoverInfo(null)
      return !v
    })
  }, [])
  const onToggleTraces = useCallback(() => setTraces((v) => !v), [])
  const onToggleInvert = useCallback(() => setInvert((v) => !v), [])
  const onToggleCar1Visible = useCallback(() => {
    if (focus === 'car1') setFocus('free')
    setCar1Visible((v) => !v)
  }, [focus])
  const onToggleCar2Visible = useCallback(() => {
    if (focus === 'car2') setFocus('free')
    setCar2Visible((v) => !v)
  }, [focus])
  const onToggleLine1Visible = useCallback(() => setLine1Visible((v) => !v), [])
  const onToggleLine2Visible = useCallback(() => setLine2Visible((v) => !v), [])
  const onToggleCar1Faded = useCallback(() => setCar1Faded((v) => !v), [])
  const onToggleCar2Faded = useCallback(() => setCar2Faded((v) => !v), [])

  const onFocus = useCallback(
    (f: FocusTarget) => {
      setFocus(f)
      const v = view.current
      const fit = v.fit || v.zoom
      if (f === 'free') {
        v.fly = null
        // Back to the free-roam ceiling so the next scroll can't jump.
        v.tZoom = Math.min(v.tZoom, fit * ZOOM_IN)
        return
      }
      const p =
        f === 'car1'
          ? poseOnPath(racePath, car1Progress)
          : f === 'car2'
            ? poseOnPath(car2Path, car2Progress)
            : { x: 0, y: 0 }
      const ex = p.x
      const ez = -p.y
      // Frame a close-up — but never yank the camera back out.
      const ezoom =
        f === 'origin'
          ? v.zoom
          : Math.min(
              Math.max(v.tZoom, fit * FOCUS_ZOOM),
              fit * ZOOM_IN_FOCUSED,
            )
      // Tiny hop — snap instead of flying nowhere.
      if (
        Math.hypot(ex - v.x, ez - v.z) < 1e-6 &&
        Math.abs(ezoom - v.zoom) < 1e-4
      ) {
        v.fly = null
        v.tZoom = ezoom
        return
      }
      v.fly = {
        t: 0,
        dur: FLY_S,
        sx: v.x,
        sz: v.z,
        szoom: v.zoom,
        ex,
        ez,
        ezoom,
      }
    },
    [racePath, car1Progress, car2Path, car2Progress],
  )

  const onMetric = useCallback((id: MetricId) => {
    setMetric(id)
  }, [])

  const onPreset = useCallback((id: HeatmapPresetId) => {
    const preset = HEATMAP_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setMetric(preset.metric)
    setPalette(preset.palette)
  }, [])

  const applyFit = useCallback((next: Track, width: number, height: number) => {
    const z = fitTrack(next, width, height)
    // Ignore degenerate fits — a zero zoom blanks the track AND the grid
    // dots (Inf/NaN geometry) with no recovery path until the next switch.
    if (!Number.isFinite(z) || z <= 0) return
    const v = view.current
    v.x = v.z = v.tx = v.tz = 0
    v.fit = z
    v.zoom = v.tZoom = z
    v.fly = null
    vClearAnchor(v)
    setZoomFactor(1)
  }, [])

  const fitOriented = useCallback(
    (
      base: Track,
      orient: TrackOrientation,
      width: number,
      height: number,
    ) => {
      applyFit(orientTrack(base, orient), width, height)
    },
    [applyFit],
  )

  const onTrack = useCallback(
    (id: string) => {
      setTrackId(id)
      const next = CATALOG.find((t) => t.id === id)
      if (!next) return
      const preferred = orientationFor(id)
      setRotate(preferred.rotate)
      setFlipH(preferred.flipH)
      setFlipV(preferred.flipV)
      fitOriented(next, preferred, sizeRef.current.width, sizeRef.current.height)
      // Warm metrics cache off the critical paint path.
      queueMicrotask(() => {
        lapMetrics(orientTrack(next, preferred), metricsSource)
      })
    },
    [fitOriented],
  )

  const onRotate = useCallback(
    (deg: RotateDeg) => {
      setRotate(deg)
      fitOriented(
        source,
        { rotate: deg, flipH, flipV },
        sizeRef.current.width,
        sizeRef.current.height,
      )
    },
    [fitOriented, source, flipH, flipV],
  )

  const onToggleFlipH = useCallback(() => {
    const next = !flipH
    setFlipH(next)
    fitOriented(
      source,
      { rotate, flipH: next, flipV },
      sizeRef.current.width,
      sizeRef.current.height,
    )
  }, [fitOriented, source, rotate, flipH, flipV])

  const onToggleFlipV = useCallback(() => {
    const next = !flipV
    setFlipV(next)
    fitOriented(
      source,
      { rotate, flipH, flipV: next },
      sizeRef.current.width,
      sizeRef.current.height,
    )
  }, [fitOriented, source, rotate, flipH, flipV])

  const onZoom = useCallback((z: number) => {
    setZoomAbs((prev) => (prev === z ? prev : z))
    const fit = view.current.fit || z
    const next = Math.round((z / fit) * 100) / 100
    setZoomFactor((prev) => (prev === next ? prev : next))
  }, [])

  const onFps = useCallback((next: number) => {
    setFps((prev) => (prev === next ? prev : next))
  }, [])

  const onViewport = useCallback((x: number, y: number) => {
    setViewport((prev) => (prev.x === x && prev.y === y ? prev : { x, y }))
  }, [])

  const onMouse = useCallback((next: MouseDebug | null) => {
    setMouse((prev) => {
      if (!next && !prev) return prev
      if (!next || !prev) return next
      return prev.sx === next.sx &&
        prev.sy === next.sy &&
        prev.x === next.x &&
        prev.y === next.y
        ? prev
        : next
    })
  }, [])

  const onSize = useCallback((width: number, height: number) => {
    setHostSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    )
  }, [])

  const onHover = useCallback((info: TrackHoverInfo | null) => {
    setHoverInfo((prev) => {
      if (!info && !prev) return prev
      if (!info || !prev) return info
      // Skip only true no-ops — never quantize the mark into jumps.
      if (
        prev.t === info.t &&
        prev.label === info.label &&
        prev.color === info.color &&
        prev.sx === info.sx &&
        prev.sy === info.sy &&
        prev.cursorSx === info.cursorSx &&
        prev.cursorSy === info.cursorSy &&
        prev.edgePx === info.edgePx
      ) {
        return prev
      }
      return info
    })
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      lapMetrics(track, metricsSource)
    })
  }, [track])

  // Heal a degenerate camera (e.g. a zero-size first layout slipped
  // through before the guards above) as soon as a real size is known.
  useEffect(() => {
    const v = view.current
    if (
      hostSize.width >= 2 &&
      hostSize.height >= 2 &&
      (!Number.isFinite(v.fit) || v.fit <= 0)
    ) {
      applyFit(track, hostSize.width, hostSize.height)
    }
  }, [hostSize, track, applyFit])

  return (
    <div className="absolute inset-0">
      <DebugPanel
        showOrigin={showOrigin}
        trackHover={trackHover}
        zoom={zoomFactor}
        zoomAbs={zoomAbs}
        fps={fps}
        viewport={viewport}
        mouse={mouse}
        track={track}
        rotate={rotate}
        flipH={flipH}
        flipV={flipV}
        layer={layer}
        palette={palette}
        metric={metric}
        traces={traces}
        metricsSource={metricsSource}
        invert={invert}
        sectionMap={sectionMap}
        zones={zones}
        onToggleOrigin={onToggleOrigin}
        onToggleHover={onToggleHover}
        onToggleTraces={onToggleTraces}
        onToggleInvert={onToggleInvert}
        onTrack={onTrack}
        onRotate={onRotate}
        onToggleFlipH={onToggleFlipH}
        onToggleFlipV={onToggleFlipV}
        onLayer={setLayer}
        onPalette={setPalette}
        onMetric={onMetric}
        onPreset={onPreset}
          onSectionMap={setSectionMap}
          focus={focus}
          onFocus={onFocus}
        />
        <ItemsPanel
          car1Color={car1Color}
          car1Progress={car1Progress}
          car1Visible={car1Visible}
          car2Color={car2Color}
          car2Progress={car2Progress}
          car2Visible={car2Visible}
          onCar1Color={setCar1Color}
          onCar1Progress={setCar1Progress}
          onToggleCar1Visible={onToggleCar1Visible}
          onCar2Color={setCar2Color}
          onCar2Progress={setCar2Progress}
          onToggleCar2Visible={onToggleCar2Visible}
          line1Color={line1Color}
          line1Visible={line1Visible}
          line2Color={line2Color}
          line2Visible={line2Visible}
          car1Faded={car1Faded}
          car2Faded={car2Faded}
          onLine1Color={setLine1Color}
          onToggleLine1Visible={onToggleLine1Visible}
          onLine2Color={setLine2Color}
          onToggleLine2Visible={onToggleLine2Visible}
          onToggleCar1Faded={onToggleCar1Faded}
          onToggleCar2Faded={onToggleCar2Faded}
        />
        <Canvas
        orthographic
        dpr={[1, 2]}
        camera={{ position: [0, 800, 0], up: [0, 0, -1], zoom: 1, near: 1, far: 5000 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: false,
        }}
        style={{
          background: 'transparent',
          touchAction: 'none',
          cursor: hoverInfo ? 'crosshair' : 'grab',
        }}
        onCreated={({ gl, camera, size }) => {
          gl.setClearColor(0x000000, 0)
          gl.toneMapping = THREE.NoToneMapping
          gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
          camera.up.set(0, 0, -1)
          camera.lookAt(0, 0, 0)
          sizeRef.current = size
          applyFit(track, size.width, size.height)
          place(camera as THREE.OrthographicCamera, view.current)
        }}
      >
        <SizeProbe
          sizeRef={sizeRef}
          onSize={onSize}
        />
        <Camera
          view={view}
          onZoom={onZoom}
          onFps={onFps}
          follow={follow}
        />
        <StateProbe view={view} onViewport={onViewport} onMouse={onMouse} />
        <Grid showOrigin={showOrigin} view={view} dot={dot} />
        <Road
          track={track}
          view={view}
          layer={layer}
          palette={palette}
          metric={metric}
          traces={traces}
          sectionMap={sectionMap}
          zones={zones}
          heatPaintRef={heatPaintRef}
          metricsSource={metricsSource}
          invert={invert}
        />
        {car1Visible ? (
          <>
            <RacingLine
              path={racePath}
              color={car1Color}
              view={view}
              progressRef={car1ProgressRef}
              faded={car1Faded}
            />
            <ItemCar
              path={racePath}
              progress={car1Progress}
              color={car1Color}
              view={view}
            />
          </>
        ) : null}
        {car2Visible ? (
          <>
            <RacingLine
              path={car2Path}
              color={car2Color}
              view={view}
              progressRef={car2ProgressRef}
              faded={car2Faded}
            />
            <ItemCar
              path={car2Path}
              progress={car2Progress}
              color={car2Color}
              view={view}
            />
          </>
        ) : null}
        {line1Visible ? (
          <RacingLine
            path={racePath}
            color={line1Color}
            view={view}
            progressRef={null}
            faded={false}
          />
        ) : null}
        {line2Visible ? (
          <RacingLine
            path={car2Path}
            color={line2Color}
            view={view}
            progressRef={null}
            faded={false}
          />
        ) : null}
        <TrackHoverProbe
          enabled={trackHover}
          track={track}
          view={view}
          layer={layer}
          palette={palette}
          metric={metric}
          traces={traces}
          zones={zones}
          heatPaintRef={heatPaintRef}
          metricsSource={metricsSource}
          invert={invert}
          onHover={onHover}
        />
        {trackHover && hoverInfo ? (
          <HoverMark
            track={smooth}
            t={hoverInfo.t}
            color={hoverInfo.color}
            view={view}
          />
        ) : null}
      </Canvas>
      {trackHover && hoverInfo ? (
        <TrackHoverTip info={hoverInfo} hostW={hostSize.width} hostH={hostSize.height} />
      ) : null}
    </div>
  )
}

const SizeProbe = memo(function SizeProbe({
  sizeRef,
  onSize,
}: {
  sizeRef: RefObject<{ width: number; height: number }>
  onSize?: (width: number, height: number) => void
}) {
  const size = useThree((s) => s.size)
  const onSizeRef = useRef(onSize)
  useLayoutEffect(() => {
    onSizeRef.current = onSize
    sizeRef.current = size
    onSizeRef.current?.(size.width, size.height)
  }, [size, sizeRef, onSize])
  return null
})
