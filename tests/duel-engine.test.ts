import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as d from '../game/duel/engine.ts'

test('delays are seeded and between 1.5 and 4.5 seconds', () => {
  assert.deepEqual(d.delays(4), d.delays(4))
  assert.notDeepEqual(d.delays(4), d.delays(5))
  for (const w of d.delays(4, 200)) assert.ok(w >= 1500 && w < 4500)
})

test('resolveRound: faster wins, a false start loses, no press loses, ties and double faults are draws', () => {
  assert.deepEqual(d.resolveRound(d.react(200), d.react(300)), { winner: 1, reason: 'faster' })
  assert.deepEqual(d.resolveRound(d.react(320), d.react(300)), { winner: 2, reason: 'faster' })
  assert.deepEqual(d.resolveRound(d.EARLY, d.react(300)), { winner: 2, reason: 'false_start' })
  assert.deepEqual(d.resolveRound(d.react(300), d.EARLY), { winner: 1, reason: 'false_start' })
  assert.deepEqual(d.resolveRound(d.EARLY, d.NONE), { winner: 2, reason: 'false_start' })
  assert.deepEqual(d.resolveRound(d.NONE, d.react(900)), { winner: 2, reason: 'no_press' })
  assert.deepEqual(d.resolveRound(d.react(900), d.NONE), { winner: 1, reason: 'no_press' })
  assert.deepEqual(d.resolveRound(d.NONE, d.NONE), { winner: 0, reason: 'no_press' })
  assert.deepEqual(d.resolveRound(d.EARLY, d.EARLY), { winner: 0, reason: 'both_false_start' })
  assert.deepEqual(d.resolveRound(d.react(250), d.react(250)), { winner: 0, reason: 'tie' })
})

test('points: 100 plus up to 49 for speed', () => {
  assert.equal(d.roundPoints(d.react(0)), 149)
  assert.equal(d.roundPoints(d.react(300)), 134)
  assert.equal(d.roundPoints(d.react(1200)), 100)
  assert.equal(d.roundPoints(d.NONE), 100) // the other side false started or missed
})

test('first to 3 round wins ends the duel; points and fastest press are tracked', () => {
  const g = d.startGame(1, 'versus')
  d.record(g, d.react(200), d.react(300))
  d.record(g, d.react(400), d.react(300))
  d.record(g, d.react(210), d.react(500))
  assert.equal(d.isOver(g), false)
  d.record(g, d.react(230), d.react(300))
  assert.equal(d.isOver(g), true)
  assert.deepEqual(g.wins, [3, 1])
  assert.equal(g.score[0], 139 + 139 + 138) // 200, 210 and 230 ms presses
  assert.equal(g.score[1], d.roundPoints(d.react(300)))
  assert.deepEqual(g.fastest, [200, 300])
  assert.equal(d.winnerOf(g), 1)
})

test('drawn rounds count towards the 7 round limit, and the duel can end level', () => {
  const g = d.startGame(2, 'versus')
  for (let i = 0; i < d.MAX_ROUNDS; i++) d.record(g, d.NONE, d.NONE)
  assert.equal(d.isOver(g), true)
  assert.equal(d.winnerOf(g), 0)
})

test('a duel that reaches the limit is decided by round wins, then by points', () => {
  const g = d.startGame(3, 'versus')
  d.record(g, d.react(200), d.react(300)) // 1-0
  d.record(g, d.react(500), d.react(100)) // 1-1
  for (let i = 0; i < 5; i++) d.record(g, d.NONE, d.NONE)
  assert.equal(d.isOver(g), true)
  assert.deepEqual(g.wins, [1, 1])
  // Side 2 scored more points with a 100 ms press than side 1 with a 200 ms press.
  assert.equal(d.winnerOf(g), 2)
})

test('a forgiven false start replays the round without counting it, once', () => {
  const g = d.startGame(4, 'solo', 1)
  assert.deepEqual(d.record(g, d.EARLY, d.react(300)), { replay: true })
  assert.equal(g.rounds.length, 0)
  assert.equal(g.attempt, 1)
  assert.equal(g.forgive[0], 0)
  const second = d.record(g, d.EARLY, d.react(300))
  assert.equal(second.replay, false)
  assert.equal(second.outcome?.winner, 2)
})

test('the system presses are deterministic, near human speed, and sometimes early', () => {
  assert.deepEqual(d.systemPress(5, 2, 0.6), d.systemPress(5, 2, 0.6))
  let early = 0
  for (let i = 0; i < 2000; i++) {
    const p = d.systemPress(9, i, 0.6)
    if (p.kind === 'early') early++
    else {
      assert.equal(p.kind, 'react')
      assert.ok(p.kind === 'react' && p.ms >= 150 && p.ms <= 500, JSON.stringify(p))
    }
  }
  assert.ok(early > 20 && early < 160, `early presses: ${early}`)
})

test('achievements: win gives first_win, a winning press under 250 ms gives Quick draw', () => {
  const g = d.startGame(6, 'versus')
  d.record(g, d.react(240), d.react(300))
  d.record(g, d.react(240), d.react(300))
  d.record(g, d.react(300), d.react(240))
  d.record(g, d.react(240), d.react(300))
  assert.deepEqual(d.earnedAchievements(g, 0), ['ach_first_win', 'ach_quick_draw'])
  assert.deepEqual(d.earnedAchievements(g, 1), ['ach_quick_draw'])
})

test('more round wins always means more points, so a points comparison agrees with the winner', () => {
  // The best case for the loser: 2 wins at 0 ms against 3 wins at the slowest winning press.
  const loser = 2 * d.roundPoints(d.react(0))
  const winner = 3 * d.roundPoints(d.react(d.REACT_WINDOW_MS))
  assert.ok(winner > loser, `${winner} should beat ${loser}`)
})
