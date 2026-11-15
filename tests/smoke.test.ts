import assert from 'node:assert/strict'
import { test } from 'node:test'
import { world } from './helpers.ts'

test('a full ranked match works through the SDK', async () => {
  const { arena } = world()
  const a = await arena.players.create({ display_name: 'TestAlpha' })
  const b = await arena.players.create({ display_name: 'TestBravo' })
  const match = await arena.matches.create({ mode: 'ranked', max_players: 2, player_ids: [a.id, b.id] })
  assert.equal(match.status, 'pending')
  const started = await arena.matches.start(match.id)
  assert.equal(started.status, 'active')
  const ended = await arena.matches.end(match.id, { results: [{ player_id: a.id, placement: 1, score: 3000 }, { player_id: b.id, placement: 2, score: 1000 }] })
  assert.equal(ended.status, 'completed')
  const score = await arena.leaderboards.submitScore('weekly', { player_id: a.id, score: 3000, match_id: match.id })
  assert.equal(score.rank, 3) // NovaKnight 3400 and IronVale 3100 are ahead
})
