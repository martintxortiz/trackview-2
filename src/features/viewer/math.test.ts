import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { trackById, raceLineFor } from '@/track/catalog'
import { boundsOf } from '@/track/frame'
import { resampleTrack } from '@/track/smooth'
import { ribbonPositions } from '@/track/ribbon'
import {
  centerTrack,
  fitTrack,
  orientRacePoints,
  orientTrack,
  orientationFor,
  paintMetricColors,
  poseOnPath,
} from '@/features/viewer/math'
import { FILL_SPACING_M } from '@/features/viewer/contracts'

function digest(parts: unknown[]): string {
  const h = createHash('sha256')
  h.update(JSON.stringify(parts))
  return h.digest('hex').slice(0, 16)
}

describe('viewer math', () => {
  it('pins spa fit + orient bounds + car pose', () => {
    const raw = trackById('spa')!
    const centered = centerTrack(raw)
    const o = orientationFor('spa')
    const track = orientTrack(centered, o)
    const b = boundsOf(track.samples)
    const fit = fitTrack(track, 1280, 720)
    const race = raceLineFor('spa')!
    const path = orientRacePoints(race, raw, o)
    const pose = poseOnPath(path, 0.25)

    expect(o).toEqual({ rotate: 90, flipH: true, flipV: true })
    expect(fit).toBeCloseTo(0.4724818685082961, 10)
    expect(
      digest([
        Math.round(b.cx * 1e6) / 1e6,
        Math.round(b.cy * 1e6) / 1e6,
        Math.round((b.maxX - b.minX) * 1e6) / 1e6,
        Math.round((b.maxY - b.minY) * 1e6) / 1e6,
      ]),
    ).toBe('d00913c7bae8c334')
    expect(
      digest([
        Math.round(pose.x * 1e4) / 1e4,
        Math.round(pose.y * 1e4) / 1e4,
        Math.round(pose.heading * 1e4) / 1e4,
      ]),
    ).toBe('2b47793ed1e8ac7a')
  })

  it('pins spa asphalt ribbon length and heatmap sample digest', () => {
    const raw = trackById('spa')!
    const track = orientTrack(centerTrack(raw), orientationFor('spa'))
    const smooth = resampleTrack(track, FILL_SPACING_M)
    const asphalt = ribbonPositions(smooth)
    const painted = paintMetricColors(
      smooth,
      track,
      'amber',
      'speed',
      true,
      'auto',
      false,
    )
    expect(asphalt.length).toBe(125514)
    expect(painted.channels).toBe(4)
    expect(painted.colors.length).toBe(smooth.samples.length * 4)
    const mid = Math.floor(painted.colors.length / 2)
    expect(
      digest([
        painted.colors.length,
        painted.colors[0],
        painted.colors[mid],
        painted.colors[painted.colors.length - 1],
      ]),
    ).toBe('ab231c5ecbf285c4')
  })

  it('poseOnPath wraps and interpolates', () => {
    const path = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const
    const a = poseOnPath(path, 0)
    const b = poseOnPath(path, 0.125)
    expect(a.x).toBeCloseTo(0, 10)
    expect(a.y).toBeCloseTo(0, 10)
    expect(b.x).toBeGreaterThan(0)
    expect(b.x).toBeLessThan(10)
  })
})
