/**
 * Lazy track registry. Geometry JSON loads on first access per id.
 * Do not statically import all geometry at module top level.
 *
 * Source data: TUMFTM/racetrack-database (LGPL-3.0).
 * https://github.com/TUMFTM/racetrack-database
 */
import { parseTrack } from '@/track/domain'
import type { Track, Xy } from '@/track/frame'

/** Stable catalog order (matches former eager TRACKS). */
const TRACK_IDS = [
  'spa',
  'monza',
  'texas',
  'silverstone',
  'suzuka',
  'catalunya',
  'melbourne',
  'sepang',
  'shanghai',
  'sakhir',
  'montreal',
  'spielberg',
  'budapest',
  'saopaulo',
  'yasmarina',
  'sochi',
  'mexicocity',
  'hockenheim',
  'brandshatch',
  'moscow',
  'norisring',
  'nuerburgring',
  'oschersleben',
  'zandvoort',
  'ims',
] as const

export type KnownTrackId = (typeof TRACK_IDS)[number]

type Loaded = { track: Track; race: readonly Xy[] }

const cache = new Map<string, Loaded>()

const KNOWN = new Set<string>(TRACK_IDS)

function resolveAlias(trackId: string): string {
  if (trackId === 'mexico-city') return 'mexicocity'
  return trackId
}

/** Sync load. Bundler resolves the context; TS does not pull every JSON into the program. */
function loadRawGeometry(id: string): unknown {
  // Path must stay a template so the language service does not typecheck each file here.
  return require(`./data/geometry/${id}.json`)
}

function loadOne(id: string): Loaded | undefined {
  const key = resolveAlias(id)
  const hit = cache.get(key)
  if (hit) return hit
  if (!KNOWN.has(key)) return undefined
  const parsed = parseTrack(loadRawGeometry(key))
  if (!parsed.ok) {
    throw new Error(`Invalid geometry for ${key}: ${parsed.error.message}`)
  }
  cache.set(key, parsed.value)
  return parsed.value
}

/** All known track ids in catalog order. */
export function listTrackIds(): readonly string[] {
  return TRACK_IDS
}

/** Load one track by id. Returns undefined when the id is unknown. */
export function trackById(trackId: string): Track | undefined {
  return loadOne(trackId)?.track
}

/** Minimum-curvature raceline for a track id (shared origin with centerline). */
export function raceLineFor(trackId: string): readonly Xy[] | undefined {
  const loaded = loadOne(trackId)
  if (!loaded) return undefined
  return loaded.race.length > 0 ? loaded.race : undefined
}

function allTracks(): Track[] {
  return TRACK_IDS.map((id) => {
    const t = trackById(id)
    if (!t) throw new Error(`missing track ${id}`)
    return t
  })
}

/**
 * Back-compat array. Materializes every track on first method/index access,
 * not at catalog import time.
 */
export const TRACKS: readonly Track[] = new Proxy([] as Track[], {
  get(_target, prop, receiver) {
    const tracks = allTracks()
    const value = Reflect.get(tracks, prop, receiver)
    return typeof value === 'function' ? value.bind(tracks) : value
  },
  ownKeys() {
    return Reflect.ownKeys(allTracks())
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(allTracks(), prop)
  },
  has(_target, prop) {
    return Reflect.has(allTracks(), prop)
  },
})

/**
 * Back-compat raceline map. Loads a line on first key access.
 * Includes alias `"mexico-city"` → mexicocity.
 */
export const RACE_LINES: Record<string, readonly Xy[]> = new Proxy(
  {} as Record<string, readonly Xy[]>,
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return raceLineFor(prop)
    },
    has(_target, prop) {
      if (typeof prop !== 'string') return false
      return loadOne(prop) !== undefined
    },
    ownKeys() {
      return [...TRACK_IDS, 'mexico-city']
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined
      if (!loadOne(prop)) return undefined
      return {
        configurable: true,
        enumerable: true,
        writable: false,
        value: raceLineFor(prop),
      }
    },
  },
)
