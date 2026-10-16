/**
 * Wrap `tsc --extendedDiagnostics --incremental false` for freeze benchmarks.
 * Usage: node scripts/measure-tsc.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(root, 'docs', 'tsc-measure-latest.txt')

const result = spawnSync(
  'npx',
  [
    'tsc',
    '--project',
    'tsconfig.measure.json',
    '--noEmit',
    '--extendedDiagnostics',
    '--incremental',
    'false',
  ],
  {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  },
)

const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, text)
process.stdout.write(text)
process.exit(result.status ?? 1)
