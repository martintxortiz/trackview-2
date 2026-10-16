import { describe, expect, it } from 'vitest'
import {
  listTrackIds,
  raceLineFor,
  trackById,
  TRACKS,
} from '@/track/catalog'
import { parseTrack } from '@/track/domain'

describe('catalog', () => {
  it('lists 25 track ids without requiring TRACKS materialization first', () => {
    expect(listTrackIds()).toHaveLength(25)
    expect(listTrackIds()[0]).toBe('spa')
  })

  it('loads spa on demand with samples and raceline', () => {
    const spa = trackById('spa')
    expect(spa).toBeDefined()
    expect(spa!.id).toBe('spa')
    expect(spa!.samples.length).toBeGreaterThan(100)
    const race = raceLineFor('spa')
    expect(race).toBeDefined()
    expect(race!.length).toBeGreaterThan(100)
  })

  it('resolves mexico-city alias', () => {
    expect(trackById('mexico-city')?.id).toBe('mexicocity')
    expect(raceLineFor('mexico-city')).toEqual(raceLineFor('mexicocity'))
  })

  it('TRACKS back-compat reports 25 entries', () => {
    expect(TRACKS.length).toBe(25)
    expect(TRACKS.find((t) => t.id === 'spa')?.name).toContain('Spa')
  })
})

describe('parseTrack', () => {
  it('accepts geometry JSON shape', () => {
    const raw = {
      id: 'test',
      name: 'Test',
      samples: [
        [0, 0, 5, 5],
        [10, 0, 5, 5],
        [10, 10, 5, 5],
      ],
      race: [
        [1, 0],
        [9, 1],
      ],
    }
    const result = parseTrack(raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.track.samples).toHaveLength(3)
      expect(result.value.race).toHaveLength(2)
    }
  })

  it('rejects empty samples', () => {
    const result = parseTrack({ id: 'x', name: 'X', samples: [] })
    expect(result.ok).toBe(false)
  })
})
