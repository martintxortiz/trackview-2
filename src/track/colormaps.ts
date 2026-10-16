/**
 * Heatmap palette sampler.
 * Scientific LUTs live in `data/palettes.json`; intensity / tyre ramps are
 * built in-process so speed / tyre metrics stay readable at a glance.
 */
import tables from '@/track/data/palettes.json'

export type PaletteId =
  | 'amber'
  | 'red'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'yellow'
  | 'pedals'
  | 'hot'
  | 'cold'
  | 'thermal'
  | 'viridis'
  | 'plasma'
  | 'inferno'
  | 'magma'
  | 'cividis'
  | 'turbo'
  | 'coolwarm'
  | 'Spectral'

export type PaletteGroup = 'intensity' | 'tyre' | 'scientific'

export const PALETTES: { id: PaletteId; name: string; group: PaletteGroup }[] = [
  { id: 'amber', name: 'Amber', group: 'intensity' },
  { id: 'red', name: 'Red', group: 'intensity' },
  { id: 'blue', name: 'Blue', group: 'intensity' },
  { id: 'cyan', name: 'Cyan', group: 'intensity' },
  { id: 'green', name: 'Green', group: 'intensity' },
  { id: 'yellow', name: 'Yellow', group: 'intensity' },
  { id: 'pedals', name: 'Pedals', group: 'intensity' },
  { id: 'hot', name: 'Hot', group: 'tyre' },
  { id: 'cold', name: 'Cold', group: 'tyre' },
  { id: 'thermal', name: 'Thermal', group: 'tyre' },
  { id: 'viridis', name: 'Viridis', group: 'scientific' },
  { id: 'plasma', name: 'Plasma', group: 'scientific' },
  { id: 'inferno', name: 'Inferno', group: 'scientific' },
  { id: 'magma', name: 'Magma', group: 'scientific' },
  { id: 'cividis', name: 'Cividis', group: 'scientific' },
  { id: 'turbo', name: 'Turbo', group: 'scientific' },
  { id: 'coolwarm', name: 'Coolwarm', group: 'scientific' },
  { id: 'Spectral', name: 'Spectral', group: 'scientific' },
]

export const PALETTE_GROUPS: { id: PaletteGroup; name: string }[] = [
  { id: 'intensity', name: 'Intensity' },
  { id: 'tyre', name: 'Tyre / thermal' },
  { id: 'scientific', name: 'Scientific' },
]

type Rgb = readonly [number, number, number]
type Lut = readonly Rgb[]

function isRgb(v: unknown): v is Rgb {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Number.isFinite(v[2])
  )
}

function isLut(v: unknown): v is Lut {
  return Array.isArray(v) && v.length >= 2 && v.every(isRgb)
}

/** Wide JSON → typed LUT map (invalid keys skipped). */
function parseScientificTables(raw: unknown): ReadonlyMap<string, Lut> {
  const map = new Map<string, Lut>()
  if (raw === null || typeof raw !== 'object') return map
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isLut(value)) map.set(key, value)
  }
  return map
}

const SCIENTIFIC = parseScientificTables(tables)

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function sampleStops(stops: readonly Rgb[], t: number): Rgb {
  const n = stops.length
  if (n < 2) return stops[0] ?? [0, 0, 0]
  const u = Math.min(1, Math.max(0, t)) * (n - 1)
  const i0 = Math.floor(u)
  const i1 = Math.min(n - 1, i0 + 1)
  return mix(stops[i0]!, stops[i1]!, u - i0)
}

/** Smoothstep 0…1 for opacity knees. */
function smooth01(t: number): number {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

/**
 * Dim → saturated peak — no bleach to white.
 * Used as the solid-color peek for intensity→alpha palettes and as
 * opaque ramps when Traces is off.
 */
function monoRamp(peak: Rgb, soft = 0.08): Lut {
  const dark: Rgb = [peak[0] * soft, peak[1] * soft, peak[2] * soft]
  const hi: Rgb = [
    Math.min(1, peak[0] * 1.12 + 0.08),
    Math.min(1, peak[1] * 1.12 + 0.08),
    Math.min(1, peak[2] * 1.12 + 0.08),
  ]
  const out: Rgb[] = []
  const n = 256
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    out.push(
      t < 0.82
        ? mix(dark, peak, t / 0.82)
        : mix(peak, hi, (t - 0.82) / 0.18),
    )
  }
  return out
}

function fromStops(stops: readonly Rgb[], n = 256): Lut {
  const out: Rgb[] = []
  for (let i = 0; i < n; i++) out.push(sampleStops(stops, i / (n - 1)))
  return out
}

const HOT = fromStops([
  [0.04, 0.02, 0.02],
  [0.35, 0.04, 0.02],
  [0.85, 0.12, 0.04],
  [0.98, 0.45, 0.05],
  [1, 0.85, 0.2],
  [1, 0.97, 0.88],
])

const COLD = fromStops([
  [0.02, 0.04, 0.1],
  [0.05, 0.18, 0.45],
  [0.08, 0.45, 0.78],
  [0.35, 0.82, 0.95],
  [0.88, 0.96, 1],
])

const THERMAL = fromStops([
  [0.05, 0.1, 0.55],
  [0.05, 0.55, 0.85],
  [0.1, 0.75, 0.35],
  [0.95, 0.85, 0.1],
  [0.9, 0.15, 0.05],
])

const PEDALS = fromStops([
  [0.847, 0.294, 0.259],
  [0.5, 0.25, 0.24],
  [0.16, 0.16, 0.18],
  [0.2, 0.44, 0.27],
  [0.208, 0.627, 0.361],
])

/**
 * Peaks matching the section tint hues — authored rich because intensity
 * heat composites over asphalt, which lands them muted on screen.
 */
const PEAKS: Partial<Record<PaletteId, Rgb>> = {
  amber: [0.851, 0.651, 0.18],
  red: [0.847, 0.294, 0.259],
  blue: [0.239, 0.545, 0.867],
  cyan: [0.165, 0.71, 0.675],
  green: [0.208, 0.627, 0.361],
  yellow: [0.851, 0.651, 0.18],
}

const PROCEDURAL: Partial<Record<PaletteId, Lut>> = {
  amber: monoRamp(PEAKS.amber!),
  red: monoRamp(PEAKS.red!),
  blue: monoRamp(PEAKS.blue!),
  cyan: monoRamp(PEAKS.cyan!),
  green: monoRamp(PEAKS.green!),
  yellow: monoRamp(PEAKS.yellow!, 0.08),
  pedals: PEDALS,
  hot: HOT,
  cold: COLD,
  thermal: THERMAL,
}

function lutFor(id: PaletteId): Lut {
  return PROCEDURAL[id] ?? SCIENTIFIC.get(id) ?? PROCEDURAL.amber!
}

/** Intensity palettes paint peak hue × value-as-alpha (asphalt shows through). */
export function paletteUsesAlpha(id: PaletteId): boolean {
  const group = PALETTES.find((p) => p.id === id)?.group
  return group === 'intensity'
}

/** Sample a palette with linear RGB interpolation between stops. */
export function samplePalette(
  id: PaletteId,
  t: number,
): [number, number, number] {
  const lut = lutFor(id)
  const n = lut.length
  if (n < 2) return [0, 0, 0]
  const u = Math.min(1, Math.max(0, t)) * (n - 1)
  const i0 = Math.floor(u)
  const i1 = Math.min(n - 1, i0 + 1)
  const s = u - i0
  const a = lut[i0]!
  const b = lut[i1]!
  return [
    a[0] + (b[0] - a[0]) * s,
    a[1] + (b[1] - a[1]) * s,
    a[2] + (b[2] - a[2]) * s,
  ]
}

/**
 * RGBA sample. Intensity group: fixed peak hue, alpha = value
 * (pedals: hue from LUT, alpha from |value − coast|).
 * Other groups: opaque LUT colour.
 */
export function samplePaletteRgba(
  id: PaletteId,
  t: number,
): [number, number, number, number] {
  const u = Math.min(1, Math.max(0, t))
  if (!paletteUsesAlpha(id)) {
    const [r, g, b] = samplePalette(id, u)
    return [r, g, b, 1]
  }
  if (id === 'pedals') {
    const [r, g, b] = samplePalette(id, u)
    const intensity = Math.abs(u - 0.5) * 2
    return [r, g, b, smooth01(intensity)]
  }
  const peak = PEAKS[id] ?? samplePalette(id, 1)
  // Slightly earlier knee so mid values punch through asphalt.
  return [peak[0], peak[1], peak[2], smooth01(Math.min(1, u * 1.12))]
}
