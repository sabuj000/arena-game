import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as m from '../game/memory/engine.ts'

// Plays the pattern correctly for a number of levels.
function playLevels(game: m.Game, levels: number) {
  for (let l = 0; l < levels; l++) {
    const n = game.level
    for (let i = 0; i < n; i++) m.press(game, game.seq[i])
  }
}

test('the same seed gives the same pattern, and pads are on the grid', () => {
  assert.deepEqual(m.createSequence(5), m.createSequence(5))
  assert.notDeepEqual(m.createSequence(5), m.createSequence(6))
  assert.ok(m.createSequence(5).every((p) => p >= 0 && p < m.PADS))
  assert.equal(m.createSequence(5).length, m.MAX_LEVEL)
})

test('level n shows the first n pads, and a correct level adds 10 x level', () => {
  const g = m.startGame(1)
  assert.equal(m.shown(g).length, 1)
  assert.equal(m.press(g, g.seq[0]), 'level')
  assert.equal(g.score, 10)
  assert.equal(g.level, 2)
  assert.equal(m.press(g, g.seq[0]), 'correct')
  assert.equal(m.press(g, g.seq[1]), 'level')
  assert.equal(g.score, 10 + 20)
  assert.equal(g.completed, 2)
})

test('a wrong pad ends the game and keeps the score so far', () => {
  const g = m.startGame(2)
  playLevels(g, 3)
  assert.equal(g.score, 60)
  const wrong = (g.seq[0] + 1) % m.PADS
  assert.equal(m.press(g, wrong), 'over')
  assert.equal(g.over, true)
  assert.equal(m.press(g, g.seq[0]), 'ignored')
  assert.deepEqual(m.statsOf(g), { score: 60, completed: 3, mistakes: 1 })
})

test('a spare life repeats the level instead of ending the game, once', () => {
  const g = m.startGame(3, 1)
  playLevels(g, 2)
  assert.equal(m.press(g, (g.seq[0] + 1) % m.PADS), 'retry')
  assert.equal(g.over, false)
  assert.equal(g.entered, 0)
  assert.equal(g.level, 3)
  assert.equal(m.press(g, (g.seq[0] + 1) % m.PADS), 'over')
})

test('finishing the last level wins', () => {
  const g = m.startGame(4)
  playLevels(g, m.MAX_LEVEL)
  assert.equal(g.won, true)
  assert.equal(g.over, true)
  assert.equal(g.score, (10 * m.MAX_LEVEL * (m.MAX_LEVEL + 1)) / 2)
})

test('the pad speed rises with the level but never below the floor', () => {
  assert.ok(m.stepMs(1) > m.stepMs(10))
  assert.equal(m.stepMs(30), 280)
})

test('the bot is deterministic and ends in finite time', () => {
  assert.deepEqual(m.playBot(9, 0.6, 1), m.playBot(9, 0.6, 1))
  const scores = Array.from({ length: 50 }, (_, i) => m.playBot(i + 1, 0.6, i).score)
  assert.ok(scores.some((s) => s > 0))
  assert.ok(scores.every((s) => s <= 4650))
})

test('achievements: elephant needs level 10, a win gives first_win', () => {
  assert.deepEqual(m.earnedAchievements({ score: 550, completed: 10, mistakes: 0 }, true), ['ach_first_win', 'ach_elephant'])
  assert.deepEqual(m.earnedAchievements({ score: 450, completed: 9, mistakes: 1 }, false), [])
})
