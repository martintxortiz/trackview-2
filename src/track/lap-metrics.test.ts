import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { trackById } from '@/track/catalog'
import {
  buildLapMetrics,
  formatMetricValue,
  lapMetrics,
  metricRange,
  seriesFor,
} from '@/track/lap-metrics'
import pins from '@/track/__fixtures__/analysis-pins.json'

function digest(parts: unknown[]): string {
  const h = createHash('sha256')
  h.update(JSON.stringify(parts))
  return h.digest('hex').slice(0, 16)
}

function speedDigest(speed: Float64Array): string {
  return digest([
    speed.length,
    speed[0],
    speed[Math.floor(speed.length / 2)],
    speed[speed.length - 1],
  ])
}

describe('lapMetrics / buildLapMetrics', () => {
  it('pins spa auto + physics digests', () => {
    const spa = trackById('spa')!
    const auto = lapMetrics(spa, 'auto')
    const physics = buildLapMetrics(spa, 'physics')
    const speed = seriesFor(auto, 'speed')
    const pedals = seriesFor(auto, 'pedals')

    expect(speed.length).toBe(pins.spa.speedLen)
    expect(speedDigest(speed)).toBe(pins.spa.speedDigest)
    expect(
      digest([
        pedals.length,
        pedals[0],
        pedals[Math.floor(pedals.length / 2)],
        pedals[pedals.length - 1],
      ]),
    ).toBe(pins.spa.pedalsDigest)
    expect(physics.speed.length).toBe(pins.spa.physicsSpeedLen)
    expect(speedDigest(physics.speed)).toBe(pins.spa.physicsSpeedDigest)

    const range = metricRange(speed)
    expect(range.min).toBeCloseTo(pins.spa.speedMin, 10)
    expect(range.max).toBeCloseTo(pins.spa.speedMax, 10)
    expect(formatMetricValue('speed', speed[0]!)).toBe(pins.spa.formatSpeed0)
  })

  it('pins monza auto + physics digests', () => {
    const monza = trackById('monza')!
    const auto = lapMetrics(monza, 'auto')
    const physics = buildLapMetrics(monza, 'physics')
    const speed = seriesFor(auto, 'speed')
    const pedals = seriesFor(auto, 'pedals')

    expect(speed.length).toBe(pins.monza.speedLen)
    expect(speedDigest(speed)).toBe(pins.monza.speedDigest)
    expect(
      digest([
        pedals.length,
        pedals[0],
        pedals[Math.floor(pedals.length / 2)],
        pedals[pedals.length - 1],
      ]),
    ).toBe(pins.monza.pedalsDigest)
    expect(physics.speed.length).toBe(pins.monza.physicsSpeedLen)
    expect(speedDigest(physics.speed)).toBe(pins.monza.physicsSpeedDigest)
    expect(formatMetricValue('speed', speed[0]!)).toBe(pins.monza.formatSpeed0)
  })

  it('caches by track + source', () => {
    const spa = trackById('spa')!
    expect(lapMetrics(spa, 'auto')).toBe(lapMetrics(spa, 'auto'))
    expect(lapMetrics(spa, 'physics')).not.toBe(lapMetrics(spa, 'auto'))
  })
})
