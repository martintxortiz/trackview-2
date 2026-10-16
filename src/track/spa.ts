/**
 * Thin re-export for legacy `track-view-app.tsx`.
 * Geometry lives in `data/geometry/spa.json` — do not restore literal bodies.
 */
import { raceLineFor, trackById } from '@/track/catalog'
import type { Track, Xy } from '@/track/frame'

const loaded = trackById('spa')
if (!loaded) throw new Error('spa geometry missing')

export const spa: Track = loaded
export const spaRace: readonly Xy[] = raceLineFor('spa') ?? []
