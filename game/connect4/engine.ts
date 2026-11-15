// Connect Four engine. Two sides take turns dropping a disc into one of 7 columns.
// The first to get four in a row, across, down or diagonally, wins. A full board is a draw.
// Pure functions on plain data, so the rules can be tested without a screen.

export const COLS = 7
export const ROWS = 6
export const CONNECT = 4
export type Side = 0 | 1
export type Mode = 'solo' | 'versus'
export type Direction = 'horizontal' | 'vertical' | 'diagonal'

export type Game = {
  /** Row by row from the top. 0 is empty, 1 is a disc of side 0 and 2 is a disc of side 1. */
  board: number[]
  turn: Side
  /** How many discs each side has played. */
  discs: [number, number]
  /** Every column played so far, in order. */
  history: number[]
  status: 'playing' | 'won' | 'draw'
  winner: Side | null
  /** The cells of the winning line, as board indexes. */
  line: number[]
  direction: Direction | null
  /** Undos left for side 0. A booster pack gives one. */
  spare: number
}

export const newGame = (spare = 0): Game => ({
  board: Array(ROWS * COLS).fill(0),
  turn: 0,
  discs: [0, 0],
  history: [],
  status: 'playing',
  winner: null,
  line: [],
  direction: null,
  spare,
})

const DIRECTIONS: Array<[number, number, Direction]> = [
  [0, 1, 'horizontal'],
  [1, 0, 'vertical'],
  [1, 1, 'diagonal'],
  [1, -1, 'diagonal'],
]

/** The row a disc dropped in this column lands on, or -1 when the column is full. */
export function dropRow(board: number[], col: number): number {
  if (col < 0 || col >= COLS) return -1
  for (let row = ROWS - 1; row >= 0; row--) if (board[row * COLS + col] === 0) return row
  return -1
}

export const legalColumns = (g: Game): number[] =>
  g.status === 'playing' ? Array.from({ length: COLS }, (_, c) => c).filter((c) => dropRow(g.board, c) >= 0) : []

// The longest line of `who` discs through one cell, counting the cell itself.
function bestRun(board: number[], row: number, col: number, who: number): { cells: number[]; direction: Direction } {
  let best: { cells: number[]; direction: Direction } = { cells: [row * COLS + col], direction: 'horizontal' }
  for (const [dr, dc, direction] of DIRECTIONS) {
    const cells = [row * COLS + col]
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === who) {
        cells.push(r * COLS + c)
        r += dr * sign
        c += dc * sign
      }
    }
    if (cells.length > best.cells.length) best = { cells, direction }
  }
  return best
}

/** Plays a disc for the side whose turn it is. Returns false if the move is not allowed. */
export function drop(g: Game, col: number): boolean {
  if (g.status !== 'playing') return false
  const row = dropRow(g.board, col)
  if (row < 0) return false
  const who = g.turn + 1
  g.board[row * COLS + col] = who
  g.discs[g.turn] += 1
  g.history.push(col)
  const run = bestRun(g.board, row, col, who)
  if (run.cells.length >= CONNECT) {
    g.status = 'won'
    g.winner = g.turn
    g.line = run.cells.sort((a, b) => a - b)
    g.direction = run.direction
  } else if (g.discs[0] + g.discs[1] === ROWS * COLS) {
    g.status = 'draw'
  } else {
    g.turn = g.turn === 0 ? 1 : 0
  }
  return true
}

/** A booster pack lets side 0 take back their last move and the reply to it, once, on their own turn. */
export function undoRound(g: Game): boolean {
  if (g.status !== 'playing' || g.turn !== 0 || g.spare < 1 || g.history.length < 2) return false
  const moves = g.history.slice(0, -2)
  const fresh = newGame(g.spare - 1)
  for (const col of moves) drop(fresh, col)
  Object.assign(g, fresh)
  return true
}

function wouldWin(board: number[], col: number, who: number): boolean {
  const row = dropRow(board, col)
  if (row < 0) return false
  const copy = board.slice()
  copy[row * COLS + col] = who
  return bestRun(copy, row, col, who).cells.length >= CONNECT
}

/**
 * The system's move. It wins when it can and blocks when it must. Otherwise it avoids moves that hand
 * the other side a win, and prefers the centre and moves that extend its own lines, with some luck.
 * It does not plan ahead, so a player who builds two threats at once can beat it.
 */
export function systemMove(g: Game, rand: () => number): number {
  const legal = legalColumns(g)
  if (legal.length === 0) return -1
  const me = g.turn + 1
  const them = g.turn === 0 ? 2 : 1
  const win = legal.find((c) => wouldWin(g.board, c, me))
  if (win !== undefined) return win
  const block = legal.find((c) => wouldWin(g.board, c, them))
  if (block !== undefined) return block

  const weighted = legal.map((c) => {
    const row = dropRow(g.board, c)
    const after = g.board.slice()
    after[row * COLS + c] = me
    // Playing here lets the other side win on top of this disc.
    const gives = row > 0 && wouldWin(after, c, them)
    const run = bestRun(after, row, c, me).cells.length
    const centre = COLS - 1 - Math.abs(c - (COLS - 1) / 2) * 2
    return { c, weight: gives ? 0.05 : 1 + centre + run * run }
  })
  const total = weighted.reduce((sum, w) => sum + w.weight, 0)
  let pick = rand() * total
  for (const w of weighted) {
    pick -= w.weight
    if (pick <= 0) return w.c
  }
  return weighted[weighted.length - 1].c
}

// ---- Scoring ----
// A win scores 100 plus 5 for each disc the winner did not need, so quicker wins score more.
// A loss scores 2 for each disc played, so a win always scores more than a loss. A draw scores 50 for both.
export const WIN_BASE = 100
export const WIN_BONUS = 5
export const MAX_DISCS = (ROWS * COLS) / 2
export const DRAW_SCORE = 50
export const LOSS_PER_DISC = 2

export function scoreOf(g: Game, side: Side): number {
  if (g.status === 'draw') return DRAW_SCORE
  if (g.status === 'won' && g.winner === side) return WIN_BASE + WIN_BONUS * (MAX_DISCS - g.discs[side])
  return LOSS_PER_DISC * g.discs[side]
}

/** 1 or 2 for the winner, or 0 for a draw or an unfinished game. */
export const winnerOf = (g: Game): 0 | 1 | 2 => (g.status === 'won' && g.winner !== null ? ((g.winner + 1) as 1 | 2) : 0)

export function earnedAchievements(g: Game, side: Side): string[] {
  const out: string[] = []
  if (g.status === 'won' && g.winner === side) {
    out.push('ach_first_win')
    if (g.direction === 'diagonal') out.push('ach_diagonal')
  }
  return out
}
