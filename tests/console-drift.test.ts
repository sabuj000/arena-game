// The console drift check passes when the published files match a fresh build, and names what is behind.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('..', import.meta.url).pathname

function build(): string {
  const dir = mkdtempSync(join(tmpdir(), 'arena-published-'))
  const result = spawnSync('node', ['--disable-warning=ExperimentalWarning', 'scripts/build-playground.mjs', dir], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return dir
}

function check(source: string) {
  return spawnSync('node', ['scripts/console-drift.mjs'], { cwd: root, env: { ...process.env, CONSOLE_SOURCE: source }, encoding: 'utf8' })
}

test('passes when the published console matches a fresh build', () => {
  const dir = build()
  const result = check(dir)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /matches this repo/)
})

test('names a file that is out of date', () => {
  const dir = build()
  appendFileSync(join(dir, 'server.js'), '\n// old\n')
  const result = check(dir)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /server\.js is out of date/)
})

test('names a file that is missing', () => {
  const dir = build()
  rmSync(join(dir, 'operations.js'))
  const result = check(dir)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /operations\.js is missing from the portfolio/)
})

test('warns and passes when the source cannot be reached', () => {
  const result = check('http://127.0.0.1:9/arena-sandbox')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Skipping the drift check/)
})
