// A practice round must not touch the real sandbox: it runs in its own in-memory world.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPracticeClient } from '../game/client.ts'

test('a practice client has its own world', async () => {
  const a = createPracticeClient([0, 0])
  const b = createPracticeClient([0, 0])
  const player = await a.arena.players.create({ display_name: 'Practice' })
  assert.equal((await a.arena.players.retrieve(player.id)).display_name, 'Practice')
  await assert.rejects(() => b.arena.players.retrieve(player.id), { code: 'player_not_found' })
})

test('a practice client is seeded, so a game can find a rival and a leaderboard', async () => {
  const c = createPracticeClient([0, 0])
  const board = await c.arena.leaderboards.entries('weekly', { limit: 3 })
  assert.ok(board.data.length > 0)
})
