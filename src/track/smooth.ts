import * as THREE from 'three'
import type { Track, TrackSample } from '@/track/frame'

const scratch = new THREE.Vector3()

/** Cache resampled rings per source track + spacing bucket. */
const resampleCache = new WeakMap<Track, Map<number, Track>>()

/** Closed Catmull-Rom resample — denser when `spacing` (meters) is smaller. */
export function resampleTrack(track: Track, spacing: number): Track {
  const src = track.samples
  const n = src.length
  if (n < 3) return track

  const key = Math.round(Math.max(spacing, 1e-3) * 1000)
  let bySpacing = resampleCache.get(track)
  if (!bySpacing) {
    bySpacing = new Map()
    resampleCache.set(track, bySpacing)
  }
  const hit = bySpacing.get(key)
  if (hit) return hit

  const points = src.map((s) => new THREE.Vector3(s.x, s.y, 0))
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5)
  const length = curve.getLength()
  const count = Math.max(n, Math.ceil(length / Math.max(spacing, 1e-3)))
  const samples: TrackSample[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const t = i / count
    curve.getPointAt(t, scratch)
    const f = t * n
    const i0 = Math.floor(f) % n
    const i1 = (i0 + 1) % n
    const u = f - Math.floor(f)
    const a = src[i0]!
    const b = src[i1]!
    samples[i] = {
      x: scratch.x,
      y: scratch.y,
      left: a.left + (b.left - a.left) * u,
      right: a.right + (b.right - a.right) * u,
    }
  }

  const out: Track = { ...track, samples }
  bySpacing.set(key, out)
  return out
}
