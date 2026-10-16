import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { trackById } from '@/track/catalog'
import { resampleTrack } from '@/track/smooth'
import pins from '@/track/__fixtures__/analysis-pins.json'

function digest(parts: unknown[]): string {
  const h = createHash('sha256')
  h.update(JSON.stringify(parts))
  return h.digest('hex').slice(0, 16)
}

describe('resampleTrack', () => {
  it('matches spa pin count and sample digest (no three)', () => {
    const spa = trackById('spa')!
    const smooth = resampleTrack(spa, 1)
    expect(smooth.samples.length).toBe(pins.spa.smoothN)
    const mid = Math.floor(smooth.samples.length / 2)
    const last = smooth.samples.length - 1
    expect(
      digest([
        [
          smooth.samples[0]!.x,
          smooth.samples[0]!.y,
          smooth.samples[0]!.left,
          smooth.samples[0]!.right,
        ],
        [
          smooth.samples[mid]!.x,
          smooth.samples[mid]!.y,
          smooth.samples[mid]!.left,
          smooth.samples[mid]!.right,
        ],
        [
          smooth.samples[last]!.x,
          smooth.samples[last]!.y,
          smooth.samples[last]!.left,
          smooth.samples[last]!.right,
        ],
      ]),
    ).toBe(pins.spa.smoothDigest)
  })

  it('densifies monza to the pinned sample count', () => {
    const monza = trackById('monza')!
    const smooth = resampleTrack(monza, 1)
    expect(smooth.samples.length).toBe(pins.monza.smoothN)
    // Mid-point may drift at float ulp vs historical three.js; count is the contract.
    expect(smooth.samples[0]!.x).toBeCloseTo(-0.32, 10)
    expect(smooth.samples[0]!.y).toBeCloseTo(1.09, 10)
  })

  it('returns the same object from cache', () => {
    const spa = trackById('spa')!
    expect(resampleTrack(spa, 1)).toBe(resampleTrack(spa, 1))
  })
})
