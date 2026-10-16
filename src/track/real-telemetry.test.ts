import { describe, expect, it } from 'vitest'
import { loadTelemetry, trackTelemetry } from '@/track/real-telemetry'

describe('loadTelemetry', () => {
  it('loads spa pack through Result', () => {
    const result = loadTelemetry('spa')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.trackId).toBe('spa')
      expect(result.value.a.speed_kmh.length).toBeGreaterThan(10)
      expect(result.value.b.driver).toBeTruthy()
    }
  })

  it('returns not_found for unknown track', () => {
    const result = loadTelemetry('nope')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not_found')
  })

  it('keeps trackTelemetry sync null API', () => {
    expect(trackTelemetry('spa')).not.toBeNull()
    expect(trackTelemetry('missing')).toBeNull()
  })
})
