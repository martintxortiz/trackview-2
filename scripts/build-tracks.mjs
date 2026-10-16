/**
 * Build track geometry JSON from TUMFTM racetrack-database CSVs (meters, LGPL-3.0).
 * Source: https://github.com/TUMFTM/racetrack-database
 * Tracks live in scripts/tumftm/tracks/<Name>.csv, racelines in
 * scripts/tumftm/racelines/<Name>.csv. Run: node scripts/build-tracks.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scripts = path.join(root, 'scripts')
const tumTracks = path.join(scripts, 'tumftm', 'tracks')
const tumRacelines = path.join(scripts, 'tumftm', 'racelines')
const outDir = path.join(root, 'src', 'track', 'data', 'geometry')

const SOURCE =
  'TUMFTM racetrack-database (LGPL-3.0), https://github.com/TUMFTM/racetrack-database'

function stripBom(t) {
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t
}

function loopLength(pts) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return s
}

function readTrackCsv(absPath) {
  const csv = stripBom(fs.readFileSync(absPath, 'utf8'))
  const samples = []
  for (const line of csv.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('x_m')) continue
    const [x, y, right, left] = t.split(',').map(Number)
    if (![x, y, left, right].every(Number.isFinite)) continue
    samples.push([
      Number(x.toFixed(2)),
      Number(y.toFixed(2)),
      Number(left.toFixed(2)),
      Number(right.toFixed(2)),
    ])
  }
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (
    first &&
    last &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05
  ) {
    samples.pop()
  }
  return samples
}

function readRacelineCsv(absPath) {
  const csv = stripBom(fs.readFileSync(absPath, 'utf8'))
  const pts = []
  for (const line of csv.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('x_m')) continue
    const [x, y] = t.split(',').map(Number)
    if (![x, y].every(Number.isFinite)) continue
    pts.push([Number(x.toFixed(2)), Number(y.toFixed(2))])
  }
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (
    first &&
    last &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05
  ) {
    pts.pop()
  }
  return pts
}

function writeFromCsv({ csvFile, raceFile, id, name }) {
  const trackPath = path.join(tumTracks, csvFile)
  const samples = readTrackCsv(trackPath)
  let race = []
  if (raceFile) {
    const racePath = path.join(tumRacelines, raceFile)
    if (fs.existsSync(racePath)) race = readRacelineCsv(racePath)
  }

  /** @type {{ id: string, name: string, source: string, samples: number[][], race?: number[][] }} */
  const body = {
    id,
    name,
    source: SOURCE,
    samples,
  }
  if (race.length > 0) body.race = race

  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${id}.json`)
  fs.writeFileSync(outPath, `${JSON.stringify(body)}\n`)
  console.log(
    `wrote ${id}.json  samples=${samples.length} race=${race.length} length≈${loopLength(samples).toFixed(0)} m`,
  )
}

// Every track in TUMFTM/racetrack-database (LGPL-3.0). Austin maps to the
// existing `texas` id so FastF1 telemetry + saved state keep working.
const TRACK_JOBS = [
  { csvFile: 'Austin.csv', raceFile: 'Austin.csv', id: 'texas', name: 'Circuit of the Americas' },
  { csvFile: 'BrandsHatch.csv', raceFile: 'BrandsHatch.csv', id: 'brandshatch', name: 'Brands Hatch' },
  { csvFile: 'Budapest.csv', raceFile: 'Budapest.csv', id: 'budapest', name: 'Hungaroring' },
  { csvFile: 'Catalunya.csv', raceFile: 'Catalunya.csv', id: 'catalunya', name: 'Barcelona-Catalunya' },
  { csvFile: 'Hockenheim.csv', raceFile: 'Hockenheim.csv', id: 'hockenheim', name: 'Hockenheimring' },
  { csvFile: 'IMS.csv', raceFile: 'IMS.csv', id: 'ims', name: 'Indianapolis' },
  { csvFile: 'Melbourne.csv', raceFile: 'Melbourne.csv', id: 'melbourne', name: 'Albert Park' },
  { csvFile: 'MexicoCity.csv', raceFile: 'MexicoCity.csv', id: 'mexicocity', name: 'Mexico City' },
  { csvFile: 'Montreal.csv', raceFile: 'Montreal.csv', id: 'montreal', name: 'Montreal' },
  { csvFile: 'Monza.csv', raceFile: 'Monza.csv', id: 'monza', name: 'Monza' },
  { csvFile: 'MoscowRaceway.csv', raceFile: 'MoscowRaceway.csv', id: 'moscow', name: 'Moscow Raceway' },
  { csvFile: 'Norisring.csv', raceFile: 'Norisring.csv', id: 'norisring', name: 'Norisring' },
  { csvFile: 'Nuerburgring.csv', raceFile: 'Nuerburgring.csv', id: 'nuerburgring', name: 'Nuerburgring' },
  { csvFile: 'Oschersleben.csv', raceFile: 'Oschersleben.csv', id: 'oschersleben', name: 'Oschersleben' },
  { csvFile: 'Sakhir.csv', raceFile: 'Sakhir.csv', id: 'sakhir', name: 'Sakhir' },
  { csvFile: 'SaoPaulo.csv', raceFile: 'SaoPaulo.csv', id: 'saopaulo', name: 'Sao Paulo' },
  { csvFile: 'Sepang.csv', raceFile: 'Sepang.csv', id: 'sepang', name: 'Sepang' },
  { csvFile: 'Shanghai.csv', raceFile: 'Shanghai.csv', id: 'shanghai', name: 'Shanghai' },
  { csvFile: 'Silverstone.csv', raceFile: 'Silverstone.csv', id: 'silverstone', name: 'Silverstone' },
  { csvFile: 'Sochi.csv', raceFile: 'Sochi.csv', id: 'sochi', name: 'Sochi' },
  { csvFile: 'Spa.csv', raceFile: 'Spa.csv', id: 'spa', name: 'Spa-Francorchamps' },
  { csvFile: 'Spielberg.csv', raceFile: 'Spielberg.csv', id: 'spielberg', name: 'Spielberg' },
  { csvFile: 'Suzuka.csv', raceFile: 'Suzuka.csv', id: 'suzuka', name: 'Suzuka' },
  { csvFile: 'YasMarina.csv', raceFile: 'YasMarina.csv', id: 'yasmarina', name: 'Yas Marina' },
  { csvFile: 'Zandvoort.csv', raceFile: 'Zandvoort.csv', id: 'zandvoort', name: 'Zandvoort' },
]

for (const job of TRACK_JOBS) writeFromCsv(job)
