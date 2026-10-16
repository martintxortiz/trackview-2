import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { trackById } from '@/track/catalog'
import {
  batteryAutoZones,
  pedalsAutoZones,
  resolveSectionMap,
  resolveSections,
} from '@/track/sections'
import { resolveSectionMap as resolveFromShim } from '@/track/section-maps'
import pins from '@/track/__fixtures__/analysis-pins.json'

function digest(parts: unknown[]): string {
  const h = createHash('sha256')
  h.update(JSON.stringify(parts))
  return h.digest('hex').slice(0, 16)
}

describe('resolveSections', () => {
  it('pins spa / monza sector + auto zone digests', () => {
    for (const id of ['spa', 'monza'] as const) {
      const track = trackById(id)!
      const pin = pins[id]
      const sectors = resolveSections('sectors', track)
      const pedalZones = pedalsAutoZones(track, 'auto')
      const battZones = batteryAutoZones(track, 'auto')

      expect(sectors.length).toBe(pin.sectorsN)
      expect(
        digest(sectors.map((z) => [z.id, z.from, z.to, z.color])),
      ).toBe(pin.sectorsDigest)
      expect(pedalZones.length).toBe(pin.pedalZonesN)
      expect(
        digest(pedalZones.map((z) => [z.id, z.from, z.to, z.name])),
      ).toBe(pin.pedalZonesDigest)
      expect(battZones.length).toBe(pin.battZonesN)
      expect(
        digest(battZones.map((z) => [z.id, z.from, z.to, z.name])),
      ).toBe(pin.battZonesDigest)
    }
  })

  it('keeps resolveSectionMap as a compat alias', () => {
    const spa = trackById('spa')!
    expect(resolveSectionMap('sectors', spa)).toEqual(
      resolveSections('sectors', spa),
    )
    expect(resolveFromShim('sectors', spa)).toEqual(
      resolveSections('sectors', spa),
    )
  })
})
