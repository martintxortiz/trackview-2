import { describe, expect, it } from 'vitest'
import {
  paletteUsesAlpha,
  samplePalette,
  samplePaletteRgba,
  type PaletteId,
} from '@/track/colormaps'
import pins from '@/track/__fixtures__/palette-pins.json'

const IDS = Object.keys(pins) as PaletteId[]

function expectRgb(
  actual: readonly number[],
  expected: readonly number[],
): void {
  expect(actual).toHaveLength(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 10)
  }
}

describe('colormaps', () => {
  it('pins samplePalette / samplePaletteRgba for key palettes', () => {
    for (const id of IDS) {
      const pin = pins[id as keyof typeof pins]
      expect(paletteUsesAlpha(id)).toBe(pin.usesAlpha)
      expectRgb(samplePalette(id, 0), pin.at0)
      expectRgb(samplePalette(id, 0.5), pin.at05)
      expectRgb(samplePalette(id, 1), pin.at1)
      expectRgb(samplePaletteRgba(id, 0.5), pin.rgba05)
    }
  })

  it('reads scientific tables from palettes.json (viridis length)', () => {
    // Mid sample between two LUT stops proves JSON path is live.
    const [r] = samplePalette('viridis', 0.5)
    expect(r).toBeCloseTo(0.1281485, 10)
  })
})
