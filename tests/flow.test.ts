import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as e from '../game/engine.ts'
import { buy, closeMatch, findRival, loadBoard, loadProfile, openMatch } from '../game/flow.ts'
import { world } from './helpers.ts'

function perfect(seed: number) {
  const round = e.createRound(seed)
  const game = e.startGame(round)
  for (const s of round.spawns) if (!s.decoy) e.click(game, s.cell, s.at + 150)
  return { round, mine: e.finish(game) }
}

test('a won ranked round runs the whole API flow', async () => {
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Tester' })
  const rival = await findRival(arena)
  assert.equal(rival.display_name, 'RivalBot')
  const match = await openMatch(arena, player, rival)
  assert.equal(match.status, 'active')
  const { round, mine } = perfect(21)
  const theirs = e.playBot(round, 0.3, 1)
  const done = await closeMatch(arena, match, player, rival, mine, theirs)
  assert.equal(done.won, true)
  assert.equal(done.match.status, 'completed')
  assert.deepEqual(done.newAchievements.sort(), ['ach_first_win', 'ach_flawless', 'ach_sharpshooter'])
  const profile = await loadProfile(arena, player)
  assert.equal(profile.inventory.find((i) => i.item_id === 'itm_coin')?.quantity, done.coins)
  assert.equal(profile.achievements.filter((a) => a.unlockedAt).length, 3)
  assert.ok((await loadBoard(arena, 'weekly')).some((r) => r.player_id === player.id))
})

test('achievements are awarded once, and a lost round still counts for the leaderboard', async () => {
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Tester' })
  const rival = await findRival(arena)
  const { round, mine } = perfect(21)
  const strong = e.playBot(round, 0.95, 1)
  const first = await closeMatch(arena, await openMatch(arena, player, rival), player, rival, mine, e.playBot(round, 0.3, 1))
  assert.equal(first.newAchievements.length, 3)
  const second = await closeMatch(arena, await openMatch(arena, player, rival), player, rival, mine, { ...strong, score: mine.score + 1 })
  assert.equal(second.won, false)
  assert.deepEqual(second.newAchievements, [])
  const lifetime = await arena.leaderboards.playerEntry('lifetime', player.id)
  assert.equal(lifetime.score, mine.score * 2)
})

test('shop: a declined card is an error and grants nothing; a good card grants the item', async () => {
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Shopper' })
  await assert.rejects(buy(arena, player, 'itm_arena_skin', 'tok_test_declined'), (err: any) => err.code === 'payment_declined')
  assert.deepEqual((await loadProfile(arena, player)).skins, [])
  await buy(arena, player, 'itm_arena_skin', 'tok_test_success')
  assert.deepEqual((await loadProfile(arena, player)).skins, ['itm_arena_skin'])
})
