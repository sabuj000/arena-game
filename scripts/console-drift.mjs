// Fails when the browser console in the portfolio runs an older sandbox than this repo.
// The portfolio holds generated copies of the sandbox (sabuj000/Portfolio, arena-sandbox/). This builds
// fresh copies from this repo and compares them with the published ones.
// Zero dependencies. Run: node scripts/console-drift.mjs   (or: npm run check:console-drift)
//
// CONSOLE_SOURCE overrides where the published copies come from: an http(s) base URL or a directory path.
// If the source cannot be reached, the check warns and passes, so a network problem does not raise a false alarm.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/sabuj000/Portfolio/main/arena-sandbox'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const fresh = mkdtempSync(join(tmpdir(), 'arena-console-'))
const build = spawnSync('node', ['--disable-warning=ExperimentalWarning', 'scripts/build-playground.mjs', fresh], { cwd: root, encoding: 'utf8' })
if (build.status !== 0) {
  console.error(build.stderr || build.stdout)
  process.exit(1)
}

const source = process.env.CONSOLE_SOURCE || DEFAULT_SOURCE
const problems = []
try {
  for (const name of readdirSync(fresh).sort()) {
    const expected = readFileSync(join(fresh, name), 'utf8')
    let published
    if (/^https?:\/\//.test(source)) {
      const response = await fetch(`${source}/${name}`, { signal: AbortSignal.timeout(15000) })
      if (response.status === 404) {
        problems.push(`${name} is missing from the portfolio`)
        continue
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${name}`)
      published = await response.text()
    } else {
      try {
        published = readFileSync(join(source, name), 'utf8')
      } catch {
        problems.push(`${name} is missing from the portfolio`)
        continue
      }
    }
    if (published !== expected) problems.push(`${name} is out of date`)
  }
} catch (err) {
  console.log(`::warning::Could not read the published console files from ${source} (${err.message}). Skipping the drift check.`)
  process.exit(0)
}

if (problems.length === 0) {
  console.log('The browser console in the portfolio matches this repo.')
} else {
  console.error('The browser console in the portfolio is behind this repo:\n')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nTo fix: run `node scripts/build-playground.mjs <path to Portfolio>/arena-sandbox`, then commit and merge it in sabuj000/Portfolio.')
  process.exit(1)
}
