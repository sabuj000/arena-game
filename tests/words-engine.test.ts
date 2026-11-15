import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as w from '../game/words/engine.ts'

test('the word list is clean: lowercase letters, 4 to 7 long, no duplicates', () => {
  assert.ok(w.WORDS.length >= 100)
  assert.equal(new Set(w.WORDS).size, w.WORDS.length)
  for (const word of w.WORDS) assert.match(word, /^[a-z]{4,7}$/, word)
})

test('the same seed gives the same puzzles; scrambles use the same letters but never equal the word', () => {
  assert.deepEqual(w.createPuzzles(3), w.createPuzzles(3))
  assert.notDeepEqual(w.createPuzzles(3), w.createPuzzles(4))
  const puzzles = w.createPuzzles(11, 100)
  assert.equal(new Set(puzzles.map((p) => p.word)).size, puzzles.length)
  for (const p of puzzles) {
    assert.notEqual(p.letters, p.word)
    assert.equal(p.letters.split('').sort().join(''), p.word.split('').sort().join(''))
  }
})

test('a guess is accepted if it is the word or another listed word with the same letters', () => {
  const puzzle = { word: 'stare', letters: 'rates' }
  assert.equal(w.accepts(puzzle, 'stare'), true)
  assert.equal(w.accepts(puzzle, ' STARE '), true)
  assert.equal(w.accepts(puzzle, 'tears'), true) // another word in the list
  assert.equal(w.accepts(puzzle, 'aster'), false) // same letters, but not in the list
  assert.equal(w.accepts(puzzle, 'stars'), false)
  assert.equal(w.accepts(puzzle, ''), false)
})

test('scoring: 10 per letter plus a speed bonus, times a streak multiplier', () => {
  assert.equal(w.speedBonus(0), 10)
  assert.equal(w.speedBonus(999), 10)
  assert.equal(w.speedBonus(3500), 7)
  assert.equal(w.speedBonus(20_000), 0)
  assert.equal(w.multiplier(0), 1)
  assert.equal(w.multiplier(3), 1.3)
  assert.equal(w.multiplier(50), 1.5)
  const g = w.startGame(1)
  const word = w.current(g)!.word
  assert.equal(w.submit(g, word, 500), 'correct')
  assert.equal(g.score, 10 * word.length + 10)
  const second = w.current(g)!.word
  assert.equal(w.submit(g, second, 500 + 5000), 'correct')
  assert.equal(g.score, 10 * word.length + 10 + Math.round((10 * second.length + 5) * 1.1))
})

test('a wrong guess and a skip break the streak; neither costs points', () => {
  const g = w.startGame(2)
  w.submit(g, w.current(g)!.word, 1000)
  assert.equal(g.streak, 1)
  const before = g.score
  assert.equal(w.submit(g, 'zzzz', 2000), 'wrong')
  assert.equal(g.streak, 0)
  assert.equal(g.wrong, 1)
  w.submit(g, w.current(g)!.word, 3000)
  w.skip(g, 4000)
  assert.equal(g.streak, 0)
  assert.equal(g.skipped, 1)
  assert.ok(g.score > before)
})

test('nothing counts after time is up, and a booster adds time', () => {
  const g = w.startGame(3)
  assert.equal(w.submit(g, w.current(g)!.word, w.ROUND_MS), 'over')
  assert.equal(g.score, 0)
  const boosted = w.startGame(3, w.BOOSTER_MS)
  assert.equal(w.submit(boosted, w.current(boosted)!.word, w.ROUND_MS + 1000), 'correct')
})

test('the bot is deterministic, and a stronger bot scores more', () => {
  assert.deepEqual(w.playBot(5, 0.6, 1), w.playBot(5, 0.6, 1))
  assert.ok(w.playBot(5, 0.9, 1).score > w.playBot(5, 0.3, 1).score)
})

test('achievements: wordsmith needs 12 solved words', () => {
  assert.deepEqual(w.earnedAchievements({ score: 900, solved: 12, skipped: 0, wrong: 0, bestStreak: 12 }, true), ['ach_first_win', 'ach_wordsmith'])
  assert.deepEqual(w.earnedAchievements({ score: 500, solved: 11, skipped: 0, wrong: 0, bestStreak: 5 }, false), [])
})
