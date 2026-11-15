// Tile merge engine: a turn-based sliding puzzle. Slide the board; equal tiles that meet merge and score.
// Pure and seeded: new tiles depend only on the seed and how many tiles appeared so far,
// so the same seed and the same moves always give the same board. No DOM, no clock.
import { rng } from '../common.ts'

export const SIZE = 4
export type Dir = 'left' | 'right' | 'up' | 'down'
export const DIRS: Dir[] = ['left', 'right', 'up', 'down']

// Slides one line toward its start. Equal neighbours merge once per move.
export function slideLine(line: number[]): { line: number[]; gained: number } {
  const tiles = line.filter((v) => v !== 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      out.push(tiles[i] * 2)
      gained += tiles[i] * 2
      i += 1
    } else {
      out.push(tiles[i])
    }
  }
  while (out.length < line.length) out.push(0)
  return { line: out, gained }
}

const index = (row: number, col: number) => row * SIZE + col

// The cell indexes of line n, ordered from the side the tiles slide toward.
function lineCells(dir: Dir, n: number): number[] {
  const cells: number[] = []
  for (let i = 0; i < SIZE; i++) {
    if (dir === 'left') cells.push(index(n, i))
    else if (dir === 'right') cells.push(index(n, SIZE - 1 - i))
    else if (dir === 'up') cells.push(index(i, n))
    else cells.push(index(SIZE - 1 - i, n))
  }
  return cells
}

// What a move would do, without changing anything.
export function preview(board: number[], dir: Dir): { board: number[]; gained: number; moved: boolean } {
  const next = [...board]
  let gained = 0
  for (let n = 0; n < SIZE; n++) {
    const cells = lineCells(dir, n)
    const result = slideLine(cells.map((c) => board[c]))
    gained += result.gained
    cells.forEach((c, i) => {
      next[c] = result.line[i]
    })
  }
  return { board: next, gained, moved: next.some((v, i) => v !== board[i]) }
}

export const canMove = (board: number[]) => DIRS.some((d) => preview(board, d).moved)

type Snapshot = { board: number[]; score: number; spawned: number; moves: number }

export type Game = {
  seed: number
  board: number[]
  score: number
  /** How many tiles have appeared. It picks the next tile, so a replayed game matches. */
  spawned: number
  moves: number
  /** Undos left. A booster pack gives one. */
  spare: number
  undone: number
  previous: Snapshot | null
  over: boolean
}

// One tile from the seed and the count so far: 2 (9 times in 10) or 4, on an empty cell.
function spawn(game: Game): void {
  const empty = game.board.flatMap((v, i) => (v === 0 ? [i] : []))
  if (empty.length === 0) return
  const pick = rng(game.seed * 31 + game.spawned * 1009 + 1)()
  const kind = rng(game.seed * 31 + game.spawned * 1009 + 2)()
  game.board[empty[Math.floor(pick * empty.length)]] = kind < 0.9 ? 2 : 4
  game.spawned += 1
}

export function startGame(seed: number, spare = 0): Game {
  const game: Game = { seed, board: Array(SIZE * SIZE).fill(0), score: 0, spawned: 0, moves: 0, spare, undone: 0, previous: null, over: false }
  spawn(game)
  spawn(game)
  return game
}

export const maxTile = (board: number[]) => Math.max(...board)

export type MoveResult = 'moved' | 'blocked' | 'over'

export function move(game: Game, dir: Dir): MoveResult {
  if (game.over) return 'over'
  const result = preview(game.board, dir)
  if (!result.moved) return 'blocked'
  game.previous = { board: [...game.board], score: game.score, spawned: game.spawned, moves: game.moves }
  game.board = result.board
  game.score += result.gained
  game.moves += 1
  spawn(game)
  if (!canMove(game.board)) game.over = true
  return 'moved'
}

// Takes back the last move. It needs a spare undo and a move to take back.
export function undo(game: Game): boolean {
  if (game.spare <= 0 || !game.previous) return false
  Object.assign(game, game.previous)
  game.board = [...game.previous.board]
  game.previous = null
  game.spare -= 1
  game.undone += 1
  game.over = false
  return true
}

// The player may end the game at any time.
export function finish(game: Game): void {
  game.over = true
}

export type Stats = { score: number; maxTile: number; moves: number }
export const statsOf = (g: Game): Stats => ({ score: g.score, maxTile: maxTile(g.board), moves: g.moves })

export const MAX_BOT_MOVES = 400

// RivalBot plays the same tiles. With probability `skill` it takes the move that scores most, otherwise a random move.
export function playBot(seed: number, skill: number, botSeed: number): Stats {
  const random = rng(botSeed)
  const game = startGame(seed)
  while (!game.over && game.moves < MAX_BOT_MOVES) {
    let dir: Dir
    if (random() < skill) {
      const scored = DIRS.map((d) => ({ d, ...preview(game.board, d) })).filter((s) => s.moved)
      scored.sort((a, b) => b.gained - a.gained)
      dir = scored[0].d
    } else {
      dir = DIRS[Math.floor(random() * 4)]
    }
    move(game, dir)
  }
  return statsOf(game)
}

export const BIG_TILE = 256

export function earnedAchievements(stats: Stats, won: boolean): string[] {
  const out: string[] = []
  if (won) out.push('ach_first_win')
  if (stats.maxTile >= BIG_TILE) out.push('ach_big_tile')
  return out
}
