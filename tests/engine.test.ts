import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as e from '../game/engine.ts'

test('the same seed gives the same round; a different seed does not', () => {
  assert.deepEqual(e.createRound(7), e.createRound(7))
  assert.notDeepEqual(e.createRound(7).spawns, e.createRound(8).spawns)
})

test('spawns stay inside the round and get faster', () => {
  const { spawns } = e.createRound(42)
  assert.ok(spawns.length > 15)
  for (const s of spawns) assert.ok(s.at >= 0 && s.at < e.ROUND_MS && s.cell >= 0 && s.cell < e.GRID ** 2)
  assert.ok(spawns[0].life > spawns[spawns.length - 1].life)
})

const firstTarget = (round: e.Round) => round.spawns.find((s) => !s.decoy) as e.Spawn
const firstDecoy = (round: e.Round) => round.spawns.find((s) => s.decoy) as e.Spawn

test('a fast hit scores more than a slow hit', () => {
  const round = e.createRound(1)
  const t = firstTarget(round)
  const fast = e.startGame(round)
  const slow = e.startGame(round)
  assert.equal(e.click(fast, t.cell, t.at + 50), 'hit')
  assert.equal(e.click(slow, t.cell, t.at + t.life - 50), 'hit')
  assert.ok(fast.stats.score > slow.stats.score)
  assert.ok(slow.stats.score >= e.HIT_POINTS)
})

test('combo raises the multiplier up to the cap, and a miss resets it', () => {
  assert.equal(e.multiplier(0), 1)
  assert.equal(e.multiplier(10), 1.5)
  assert.equal(e.multiplier(100), e.COMBO_CAP)
  const round = e.createRound(3)
  const game = e.startGame(round)
  const targets = round.spawns.filter((s) => !s.decoy)
  e.click(game, targets[0].cell, targets[0].at + 100)
  e.click(game, targets[1].cell, targets[1].at + 100)
  assert.equal(game.stats.combo, 2)
  e.click(game, (targets[2].cell + 1) % 16 === targets[2].cell ? 0 : (targets[2].cell + 7) % 16, targets[2].at - 1)
  assert.equal(game.stats.combo, 0)
})

test('a decoy costs points and combo; the score never goes below zero', () => {
  const round = e.createRound(5)
  const d = firstDecoy(round)
  const game = e.startGame(round)
  assert.equal(e.click(game, d.cell, d.at + 10), 'decoy')
  assert.equal(game.stats.score, 0)
  assert.equal(game.stats.decoyHits, 1)
})

test('a target that expires is a miss; a decoy that expires is not', () => {
  const round = e.createRound(9)
  const game = e.startGame(round)
  const stats = e.finish(game)
  assert.equal(stats.misses, e.targetsInRound(round))
  assert.equal(stats.hits, 0)
})

test('the same spawn cannot be hit twice', () => {
  const round = e.createRound(11)
  const t = firstTarget(round)
  const game = e.startGame(round)
  assert.equal(e.click(game, t.cell, t.at + 100), 'hit')
  assert.equal(e.click(game, t.cell, t.at + 120), 'empty')
})

test('a perfect player earns sharpshooter and flawless', () => {
  const round = e.createRound(21)
  const game = e.startGame(round)
  for (const s of round.spawns) if (!s.decoy) e.click(game, s.cell, s.at + 150)
  const stats = e.finish(game)
  assert.equal(stats.misses, 0)
  assert.ok(stats.score >= 2000, `score ${stats.score}`)
  const ids = e.earnedAchievements(stats, true).map((a) => a.achievementId)
  assert.deepEqual(ids.sort(), ['ach_first_win', 'ach_flawless', 'ach_sharpshooter'])
})

test('the bot is deterministic and a stronger bot scores more', () => {
  const round = e.createRound(33)
  assert.deepEqual(e.playBot(round, 0.5, 1), e.playBot(round, 0.5, 1))
  assert.ok(e.playBot(round, 0.95, 1).score > e.playBot(round, 0.2, 1).score)
})

test('decide, coins and accuracy', () => {
  assert.equal(e.decide(10, 5).winner, 'player')
  assert.equal(e.decide(5, 10).winner, 'rival')
  assert.deepEqual(e.decide(7, 7), { winner: 'draw', playerPlacement: 1, rivalPlacement: 1 })
  assert.equal(e.coinsFor(1234, true), 22)
  assert.equal(e.accuracy({ ...e.emptyStats(), hits: 9, misses: 1 }), 0.9)
})

test('a starting combo (booster) scores more than no combo', () => {
  const round = e.createRound(2)
  const target = round.spawns.find((s) => !s.decoy) as e.Spawn
  const plain = e.startGame(round)
  const boosted = e.startGame(round, e.BOOSTER_COMBO)
  e.click(plain, target.cell, target.at + 200)
  e.click(boosted, target.cell, target.at + 200)
  assert.ok(boosted.stats.score > plain.stats.score)
})
