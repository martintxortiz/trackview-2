import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { trackById } from '@/track/catalog'
import { resampleTrack } from '@/track/smooth'
import {
  edgeAt,
  offsetPolyline,
  ribbonPositions,
  segmentPositions,
  sidesOf,
} from '@/track/ribbon'
import pins from '@/track/__fixtures__/ribbon-pins.json'

function digest(parts: unknown[]): string {
  const h = createHash('sha256')
  h.update(JSON.stringify(parts))
  return h.digest('hex').slice(0, 16)
}

function f32Digest(arr: Float32Array, picks: number[]): string {
  return digest([arr.length, ...picks.map((i) => arr[i])])
}

describe('ribbon', () => {
  for (const id of ['spa', 'monza'] as const) {
    it(`pins ${id} sides / offset / ribbon / segment digests`, () => {
      const track = trackById(id)!
      const smooth = resampleTrack(track, 1)
      const sides = sidesOf(smooth)
      const pin = pins[id]
      const mid = Math.floor(sides.left.length / 2)
      const offset = offsetPolyline(
        smooth.samples.map((s) => [s.x, s.y] as const),
        1.5,
      )
      const ribbon = ribbonPositions(smooth)
      const a = edgeAt(sides.left, 0)
      const b = edgeAt(sides.right, 0)
      const seg = segmentPositions(a, b, 0.5, 0.16)

      expect(smooth.samples.length).toBe(pin.smoothN)
      expect(sides.left.length).toBe(pin.sidesN)
      expect(
        digest([
          sides.left.length,
          sides.right.length,
          sides.left[0],
          sides.right[0],
          sides.left[mid],
          sides.right[mid],
        ]),
      ).toBe(pin.sidesDigest)
      expect(
        digest([
          offset.length,
          offset[0],
          offset[Math.floor(offset.length / 2)],
          offset[offset.length - 1],
        ]),
      ).toBe(pin.offsetDigest)
      expect(
        f32Digest(ribbon, [
          0,
          1,
          2,
          Math.floor(ribbon.length / 2),
          ribbon.length - 3,
          ribbon.length - 2,
          ribbon.length - 1,
        ]),
      ).toBe(pin.ribbonDigest)
      expect(f32Digest(seg, [0, 1, 2, seg.length - 1])).toBe(pin.segDigest)
    })
  }

  it('caches sidesOf by track identity', () => {
    const spa = trackById('spa')!
    const smooth = resampleTrack(spa, 1)
    expect(sidesOf(smooth)).toBe(sidesOf(smooth))
  })
})
