/**
 * Characterization pin for /dashboard track math.
 * Run before/after structural cleanups; stdout must match.
 *
 *   npx tsx scripts/pin-dashboard-contract.mts
 *
 * Spa-only load by default so the pin does not force full-catalog eager import.
 */
import { createHash } from 'node:crypto'
import { listTrackIds, trackById } from '../src/track/catalog'
import { boundsOf } from '../src/track/frame'
import { lapMetrics, seriesFor } from '../src/track/lap-metrics'
import { resolveSectionMap } from '../src/track/section-maps'
import { offsetPolyline, sidesOf } from '../src/track/ribbon'
import { resampleTrack } from '../src/track/smooth'
import { presetFor, recommendedPalette } from '../src/track/heatmap-presets'

function digest(parts: unknown[]): string {
  const h = createHash('sha256')
  h.update(JSON.stringify(parts))
  return h.digest('hex').slice(0, 16)
}

const spa = trackById('spa')
if (!spa) throw new Error('spa missing from catalog')

const b = boundsOf(spa.samples)
const smooth = resampleTrack(spa, 1)
const metrics = lapMetrics(spa, 'auto')
const speed = seriesFor(metrics, 'speed')
const zones = resolveSectionMap('sectors', spa, 'auto')
const sides = sidesOf(smooth)
const offset = offsetPolyline(
  smooth.samples.map((s) => [s.x, s.y] as const),
  1.5,
)

const pin = {
  tracks: listTrackIds().length,
  spaSamples: spa.samples.length,
  bounds: {
    cx: round(b.cx),
    cy: round(b.cy),
    spanX: round(b.maxX - b.minX),
    spanY: round(b.maxY - b.minY),
  },
  smoothN: smooth.samples.length,
  speedDigest: digest([
    speed.length,
    speed[0],
    speed[Math.floor(speed.length / 2)],
    speed[speed.length - 1],
  ]),
  zonesN: zones.length,
  zonesDigest: digest(zones.map((z) => [z.id, z.from, z.to, z.color])),
  sidesDigest: digest([sides.left.length, sides.right.length, sides.left[0], sides.right[0]]),
  offsetDigest: digest([offset.length, offset[0], offset[Math.floor(offset.length / 2)]]),
  presetSpeedAmber: presetFor('speed', 'amber'),
  presetCustom: presetFor('speed', 'viridis'),
  recommendedBrake: recommendedPalette('brake'),
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

process.stdout.write(`${JSON.stringify(pin, null, 2)}\n`)
