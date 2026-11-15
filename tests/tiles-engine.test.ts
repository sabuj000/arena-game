import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as t from '../game/tiles/engine.ts'

test('slideLine slides, merges equal neighbours once per move, and scores the merge', () => {
  assert.deepEqual(t.slideLine([0, 2, 0, 2]), { line: [4, 0, 0, 0], gained: 4 })
  assert.deepEqual(t.slideLine([2, 2, 2, 2]), { line: [4, 4, 0, 0], gained: 8 })
  assert.deepEqual(t.slideLine([2, 2, 2, 0]), { line: [4, 2, 0, 0], gained: 4 })
  assert.deepEqual(t.slideLine([4, 2, 2, 8]), { line: [4, 4, 8, 0], gained: 4 })
  assert.deepEqual(t.slideLine([2, 4, 8, 16]), { line: [2, 4, 8, 16], gained: 0 })
})

test('preview moves in every direction without changing the board', () => {
  const board = [
    2, 0, 0, 2,
    0, 0, 0, 0,
    0, 4, 0, 0,
    0, 4, 0, 0,
  ]
  const copy = [...board]
  assert.deepEqual(t.preview(board, 'left').board.slice(0, 4), [4, 0, 0, 0])
  assert.deepEqual(t.preview(board, 'right').board.slice(0, 4), [0, 0, 0, 4])
  const down = t.preview(board, 'down')
  assert.deepEqual([down.board[1], down.board[5], down.board[9], down.board[13]], [0, 0, 0, 8])
  assert.equal(down.gained, 8)
  const up = t.preview(board, 'up')
  assert.deepEqual([up.board[1], up.board[5], up.board[9], up.board[13]], [8, 0, 0, 0])
  assert.deepEqual(board, copy)
})

test('a new game has two tiles of 2 or 4, and the same seed gives the same game', () => {
  const g = t.startGame(7)
  assert.equal(g.board.filter((v) => v !== 0).length, 2)
  assert.ok(g.board.every((v) => v === 0 || v === 2 || v === 4))
  assert.deepEqual(t.startGame(7).board, g.board)
  assert.notDeepEqual(t.startGame(8).board, g.board)
})

test('a move that changes the board adds a tile and counts; a blocked move does not', () => {
  const g = t.startGame(3)
  g.board = [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  assert.equal(t.move(g, 'up'), 'blocked')
  assert.equal(g.moves, 0)
  const spawned = g.spawned
  assert.equal(t.move(g, 'down'), 'moved')
  assert.equal(g.moves, 1)
  assert.equal(g.spawned, spawned + 1)
  assert.equal(g.board.filter((v) => v !== 0).length, 5)
})

test('the same moves on the same seed always give the same game', () => {
  const play = () => {
    const g = t.startGame(21)
    for (const d of ['left', 'up', 'right', 'down', 'left', 'up', 'left', 'down'] as t.Dir[]) t.move(g, d)
    return g
  }
  assert.deepEqual(play().board, play().board)
  assert.equal(play().score, play().score)
})

test('the game is over when no move changes the board', () => {
  const g = t.startGame(1)
  // After a move right the last row is [x, 8, 16, 4], where the new tile x is 2 or 4. Neither 2 nor 4 can merge.
  g.board = [2, 4, 2, 4, 4, 2, 4, 2, 32, 4, 2, 8, 8, 16, 4, 0]
  assert.equal(t.canMove(g.board), true)
  assert.equal(t.move(g, 'right'), 'moved')
  assert.equal(g.over, true)
  assert.equal(t.move(g, 'left'), 'over')
})

test('undo restores the board, score and tile count, needs a spare undo, and works once per spare', () => {
  const none = t.startGame(5)
  t.move(none, 'left')
  assert.equal(t.undo(none), false)
  const g = t.startGame(5, 1)
  const start = [...g.board]
  const dir = t.DIRS.find((d) => t.preview(g.board, d).moved) as t.Dir
  t.move(g, dir)
  assert.equal(t.undo(g), true)
  assert.deepEqual(g.board, start)
  assert.equal(g.moves, 0)
  assert.equal(g.spare, 0)
  assert.equal(t.undo(g), false)
  // The replayed game matches the one played without an undo.
  const again = t.startGame(5)
  t.move(again, dir)
  t.move(g, dir)
  assert.deepEqual(g.board, again.board)
})

test('the bot is deterministic and finishes', () => {
  assert.deepEqual(t.playBot(9, 0.5, 1), t.playBot(9, 0.5, 1))
  const s = t.playBot(9, 0.5, 1)
  assert.ok(s.score > 0 && s.moves <= t.MAX_BOT_MOVES)
})

test('achievements: a 256 tile gives Big tile', () => {
  assert.deepEqual(t.earnedAchievements({ score: 3000, maxTile: 256, moves: 150 }, true), ['ach_first_win', 'ach_big_tile'])
  assert.deepEqual(t.earnedAchievements({ score: 900, maxTile: 128, moves: 90 }, false), [])
})
