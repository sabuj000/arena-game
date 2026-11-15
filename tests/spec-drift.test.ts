// The drift check passes when the spec copy matches arena-docs, and names what differs when it does not.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('..', import.meta.url).pathname
const spec = JSON.parse(readFileSync(join(root, 'openapi/arena.json'), 'utf8'))

function run(remote: unknown) {
  const file = join(mkdtempSync(join(tmpdir(), 'arena-drift-')), 'remote.json')
  writeFileSync(file, JSON.stringify(remote))
  return spawnSync('node', ['scripts/spec-drift.mjs'], { cwd: root, env: { ...process.env, SPEC_SOURCE: file }, encoding: 'utf8' })
}

// The same data with every object's keys in reverse order.
const reverseKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(reverseKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]))
      : value

test('passes when the spec matches, whatever the key order', () => {
  const result = run(reverseKeys(spec))
  assert.equal(result.status, 0, result.stderr)
})

test('fails and names a new error code', () => {
  const remote = JSON.parse(JSON.stringify(spec))
  remote.paths['/players'].post['x-error-codes'].push({ code: 'region_blocked', status: 403 })
  const result = run(remote)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /operation POST \/players differs/)
  assert.match(result.stderr, /npm run gen:sdk/)
})

test('fails and names an operation that arena-docs added', () => {
  const remote = JSON.parse(JSON.stringify(spec))
  remote.paths['/teams'] = { get: { summary: 'List teams' } }
  const result = run(remote)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /operation GET \/teams is in arena-docs but not here/)
})

test('fails when a schema changes', () => {
  const remote = JSON.parse(JSON.stringify(spec))
  remote.components.schemas.Player.properties.level = { type: 'integer' }
  const result = run(remote)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /schema Player differs/)
})

test('warns and passes when the source cannot be read', () => {
  const result = spawnSync('node', ['scripts/spec-drift.mjs'], { cwd: root, env: { ...process.env, SPEC_SOURCE: join(tmpdir(), 'does-not-exist.json') }, encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /::warning::/)
})
