import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { GAMES } from '../game/registry.ts'
import { world } from './helpers.ts'

test('every game has unique ids and its two leaderboards exist in the API', async () => {
  const { arena } = world()
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length)
  const boards = GAMES.flatMap((g) => [g.boards.best, g.boards.total])
  assert.equal(new Set(boards).size, boards.length, 'two games share a leaderboard')
  for (const id of boards) assert.equal((await arena.leaderboards.retrieve(id)).id, id)
})

test('the best board keeps the highest score and the total board adds scores up', async () => {
  const { arena } = world()
  for (const g of GAMES) {
    assert.equal((await arena.leaderboards.retrieve(g.boards.best)).update_mode, 'best', g.id)
    assert.equal((await arena.leaderboards.retrieve(g.boards.total)).update_mode, 'sum', g.id)
  }
})

test('every game in the registry has a component in the hub', () => {
  const source = readFileSync(new URL('../components/games/index.ts', import.meta.url), 'utf8')
  for (const g of GAMES) assert.match(source, new RegExp(`\\b${g.id}:`), `no component for ${g.id}`)
})
