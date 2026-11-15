import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rng } from '../game/common.ts'
import * as c from '../game/connect4/engine.ts'

const play = (cols: number[], spare = 0) => {
  const g = c.newGame(spare)
  for (const col of cols) assert.equal(c.drop(g, col), true, `column ${col} should be playable`)
  return g
}

test('a disc falls to the lowest empty row, and a full column refuses more', () => {
  const g = c.newGame()
  c.drop(g, 3)
  c.drop(g, 3)
  assert.equal(g.board[5 * c.COLS + 3], 1)
  assert.equal(g.board[4 * c.COLS + 3], 2)
  for (let i = 0; i < 4; i++) c.drop(g, 3)
  assert.equal(c.dropRow(g.board, 3), -1)
  assert.equal(c.drop(g, 3), false)
  assert.equal(c.drop(g, 7), false)
  assert.equal(c.drop(g, -1), false)
  assert.equal(c.legalColumns(g).includes(3), false)
})

test('turns alternate, and a refused move does not change the turn', () => {
  const g = c.newGame()
  c.drop(g, 0)
  assert.equal(g.turn, 1)
  for (let i = 0; i < 5; i++) c.drop(g, 0)
  const turn = g.turn
  c.drop(g, 0)
  assert.equal(g.turn, turn)
})

test('four across wins', () => {
  const g = play([0, 0, 1, 1, 2, 2, 3])
  assert.equal(g.status, 'won')
  assert.equal(g.winner, 0)
  assert.equal(g.direction, 'horizontal')
  assert.deepEqual(g.line, [35, 36, 37, 38])
  assert.equal(c.drop(g, 4), false, 'no moves after the game is over')
})

test('four down wins', () => {
  const g = play([0, 1, 0, 1, 0, 1, 0])
  assert.equal(g.status, 'won')
  assert.equal(g.direction, 'vertical')
})

test('four on a diagonal wins, and unlocks the diagonal achievement', () => {
  // Side 0 holds (bottom left) up to the fourth column: row 5 col 0, row 4 col 1, row 3 col 2, row 2 col 3.
  const g = play([0, 1, 1, 2, 2, 3, 3, 6, 2, 3, 3])
  assert.equal(g.status, 'won')
  assert.equal(g.winner, 0)
  assert.equal(g.direction, 'diagonal')
  assert.deepEqual(c.earnedAchievements(g, 0), ['ach_first_win', 'ach_diagonal'])
  assert.deepEqual(c.earnedAchievements(g, 1), [])
})

test('the other diagonal wins too, for the second side', () => {
  // Side 1 holds row 5 col 3, row 4 col 2, row 3 col 1 and row 2 col 0: a line going up to the left.
  const g = play([1, 3, 1, 4, 2, 3, 1, 0, 2, 1, 4, 2])
  assert.equal(g.status, 'won')
  assert.equal(g.winner, 1)
  assert.equal(g.direction, 'diagonal')
  assert.deepEqual(c.earnedAchievements(g, 1), ['ach_first_win', 'ach_diagonal'])
})

test('three in a row is not a win', () => {
  const g = play([0, 0, 1, 1, 2, 2])
  assert.equal(g.status, 'playing')
})

// A full board with no four in a row anywhere: the rows alternate between two patterns of pairs.
function fullBoardMissingOne(): c.Game {
  const odd = [1, 1, 2, 2, 1, 1, 2]
  const even = odd.map((v) => 3 - v)
  const g = c.newGame()
  for (let row = 0; row < c.ROWS; row++) for (let col = 0; col < c.COLS; col++) g.board[row * c.COLS + col] = (row % 2 === 1 ? odd : even)[col]
  g.board[0] = 0 // the top left cell, which side 1 plays last
  g.discs = [21, 20]
  g.turn = 1
  return g
}

test('a full board with no four is a draw, and scores 50 each', () => {
  const g = fullBoardMissingOne()
  assert.equal(c.drop(g, 0), true)
  assert.equal(g.status, 'draw')
  assert.equal(c.winnerOf(g), 0)
  assert.equal(c.scoreOf(g, 0), 50)
  assert.equal(c.scoreOf(g, 1), 50)
  assert.deepEqual(c.earnedAchievements(g, 0), [])
})

test('scores: a win beats any loss, and quicker wins score more', () => {
  const quick = play([0, 1, 0, 1, 0, 1, 0]) // side 0 wins with 4 discs
  assert.equal(c.scoreOf(quick, 0), 100 + 5 * (21 - 4))
  assert.equal(c.scoreOf(quick, 1), 2 * 3)
  const slow = play([0, 1, 1, 2, 2, 3, 3, 6, 2, 3, 3]) // side 0 wins with 6 discs
  assert.equal(c.scoreOf(slow, 0), 100 + 5 * (21 - 6))
  assert.ok(c.scoreOf(quick, 0) > c.scoreOf(slow, 0))
  const worstWin = 100 + 5 * (c.MAX_DISCS - c.MAX_DISCS)
  const worstLoss = 2 * c.MAX_DISCS
  assert.ok(worstWin > worstLoss)
  assert.equal(c.winnerOf(quick), 1)
})

test('a booster pack takes back one round, only on side 0 turn, only once', () => {
  const g = play([3, 3, 4, 4], 1)
  assert.equal(c.undoRound(g), true)
  assert.deepEqual(g.history, [3, 3])
  assert.equal(g.spare, 0)
  assert.equal(g.discs[0] + g.discs[1], 2)
  assert.equal(c.undoRound(g), false, 'the booster is used up')
  const noBooster = play([3, 3, 4, 4])
  assert.equal(c.undoRound(noBooster), false)
  const wrongTurn = play([3, 3, 4], 1)
  assert.equal(c.undoRound(wrongTurn), false, 'side 1 is to move')
  assert.equal(c.undoRound(play([3], 1)), false, 'nothing to take back yet')
})

test('the system takes a win when it has one', () => {
  // Side 1 has three across the bottom (columns 3 to 5) and is to move: column 2 or 6 finishes the row.
  const g = play([0, 3, 0, 4, 1, 5, 1])
  assert.ok([2, 6].includes(c.systemMove(g, rng(1))))
})

test('the system blocks the other side, but a win comes before a block', () => {
  // Side 0 has columns 0 to 2 across the bottom and side 1 is to move: it must block column 3.
  const block = play([0, 6, 1, 6, 2])
  assert.equal(c.systemMove(block, rng(2)), 3)
  // Side 1 can win down column 6 and side 0 threatens column 3: it takes the win.
  const both = play([0, 6, 1, 6, 2, 6, 0])
  assert.equal(c.systemMove(both, rng(3)), 6)
})

test('the system beats a random player most of the time, and always plays legal moves', () => {
  let systemWins = 0
  const games = 120
  for (let n = 0; n < games; n++) {
    const rand = rng(1000 + n)
    const g = c.newGame()
    while (g.status === 'playing') {
      const legal = c.legalColumns(g)
      const col = g.turn === 1 ? c.systemMove(g, rand) : legal[Math.floor(rand() * legal.length)]
      assert.ok(legal.includes(col), `illegal move ${col}`)
      c.drop(g, col)
    }
    if (g.winner === 1) systemWins++
  }
  assert.ok(systemWins >= games * 0.75, `the system won only ${systemWins} of ${games}`)
})

test('the system does not always win: a random player can beat it sometimes', () => {
  let playerWins = 0
  for (let n = 0; n < 300; n++) {
    const rand = rng(5000 + n)
    const g = c.newGame()
    while (g.status === 'playing') {
      const legal = c.legalColumns(g)
      c.drop(g, g.turn === 1 ? c.systemMove(g, rand) : legal[Math.floor(rand() * legal.length)])
    }
    if (g.winner === 0) playerWins++
  }
  assert.ok(playerWins > 0, 'the system is unbeatable, which is no fun')
})
