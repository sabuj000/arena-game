// Fails when openapi/arena.json here differs from the spec in arena-docs, which is the source of truth.
// Zero dependencies. Run: node scripts/spec-drift.mjs   (or: npm run check:spec-drift)
//
// SPEC_SOURCE overrides where the real spec comes from: an http(s) URL or a file path.
// If the source cannot be reached, the check warns and passes, so a network problem does not block a PR.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/sabuj000/arena-docs/main/openapi/arena.json'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const stable = (value) =>
  JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v))

// What changed, in words a reviewer can act on.
export function describeDrift(local, remote) {
  const problems = []
  const ops = (spec) =>
    new Map(Object.entries(spec.paths ?? {}).flatMap(([path, methods]) => Object.entries(methods).map(([m, op]) => [`${m.toUpperCase()} ${path}`, op])))
  const a = ops(local)
  const b = ops(remote)
  for (const key of b.keys()) if (!a.has(key)) problems.push(`operation ${key} is in arena-docs but not here`)
  for (const key of a.keys()) if (!b.has(key)) problems.push(`operation ${key} is here but not in arena-docs`)
  for (const [key, op] of a) if (b.has(key) && stable(op) !== stable(b.get(key))) problems.push(`operation ${key} differs`)
  const schemas = (spec) => spec.components?.schemas ?? {}
  for (const name of new Set([...Object.keys(schemas(local)), ...Object.keys(schemas(remote))])) {
    const l = schemas(local)[name]
    const r = schemas(remote)[name]
    if (!l) problems.push(`schema ${name} is in arena-docs but not here`)
    else if (!r) problems.push(`schema ${name} is here but not in arena-docs`)
    else if (stable(l) !== stable(r)) problems.push(`schema ${name} differs`)
  }
  if (problems.length === 0 && stable(local) !== stable(remote)) problems.push('other parts of the spec differ, such as info, servers or webhook events')
  return problems
}

async function loadSource(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return JSON.parse(await response.text())
  }
  return JSON.parse(readFileSync(source, 'utf8'))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.env.SPEC_SOURCE || DEFAULT_SOURCE
  const local = JSON.parse(readFileSync(join(root, 'openapi/arena.json'), 'utf8'))
  let remote
  try {
    remote = await loadSource(source)
  } catch (err) {
    console.log(`::warning::Could not read the spec from ${source} (${err.message}). Skipping the drift check.`)
    process.exit(0)
  }
  const problems = describeDrift(local, remote)
  if (problems.length === 0) {
    console.log('Spec matches arena-docs.')
  } else {
    console.error('openapi/arena.json differs from the spec in arena-docs:\n')
    for (const p of problems) console.error(`  - ${p}`)
    console.error('\nTo fix: copy openapi/arena.json from arena-docs, run `npm run gen:sdk`, and commit both.')
    console.error('If the arena-docs change is not merged yet, merge it first and re-run this check.')
    process.exit(1)
  }
}
