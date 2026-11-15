// Quick Draw duel engine. Two sides wait for the signal, then press as fast as they can.
// The first to press after the signal wins the round. Pressing early loses it. First to 3 round wins takes the duel.
// Pure and seeded: delays and the system opponent depend only on the seed. No DOM, no clock.
import { rng } from '../common.ts'

export const WIN_ROUNDS = 3
export const MAX_ROUNDS = 7
/** After the signal, a side that has not pressed within this time has missed the round. */
export const REACT_WINDOW_MS = 1500
export const QUICK_MS = 250

export type Mode = 'solo' | 'versus'

// How long to wait before the signal, in ms. One per attempt.
export function delays(seed: number, count = MAX_ROUNDS + 3): number[] {
  const random = rng(seed)
  return Array.from({ length: count }, () => 1500 + Math.floor(random() * 3000))
}

export type Press = { kind: 'none' } | { kind: 'early' } | { kind: 'react'; ms: number }
export const NONE: Press = { kind: 'none' }
export const EARLY: Press = { kind: 'early' }
export const react = (ms: number): Press => ({ kind: 'react', ms })

export type RoundOutcome = { winner: 0 | 1 | 2; reason: 'faster' | 'false_start' | 'no_press' | 'tie' | 'both_false_start' }

// Side 1 is the first player. Side 2 is the second player, or the system.
export function resolveRound(a: Press, b: Press): RoundOutcome {
  if (a.kind === 'early' && b.kind === 'early') return { winner: 0, reason: 'both_false_start' }
  if (a.kind === 'early') return { winner: 2, reason: 'false_start' }
  if (b.kind === 'early') return { winner: 1, reason: 'false_start' }
  if (a.kind === 'none' && b.kind === 'none') return { winner: 0, reason: 'no_press' }
  if (a.kind === 'none') return { winner: 2, reason: 'no_press' }
  if (b.kind === 'none') return { winner: 1, reason: 'no_press' }
  if (a.ms === b.ms) return { winner: 0, reason: 'tie' }
  return { winner: a.ms < b.ms ? 1 : 2, reason: 'faster' }
}

// 100 for the round, plus up to 49 for a fast press: 49 at 0 ms, one less every 20 ms.
// The bonus is small enough that more round wins always means more points, so points and wins agree on the winner.
export const roundPoints = (press: Press) => 100 + (press.kind === 'react' ? Math.max(0, 49 - Math.floor(press.ms / 20)) : 0)

export type RoundRecord = { a: Press; b: Press; outcome: RoundOutcome }

export type Game = {
  seed: number
  mode: Mode
  waits: number[]
  /** How many rounds have been started, including replayed ones. It picks the wait and the system's press. */
  attempt: number
  rounds: RoundRecord[]
  wins: [number, number]
  score: [number, number]
  /** The fastest winning press of each side, in ms. */
  fastest: [number | null, number | null]
  /** False starts that are forgiven and replayed. A booster pack gives side 1 one. */
  forgive: [number, number]
}

export const startGame = (seed: number, mode: Mode, forgiveFirst = 0): Game => ({
  seed,
  mode,
  waits: delays(seed),
  attempt: 0,
  rounds: [],
  wins: [0, 0],
  score: [0, 0],
  fastest: [null, null],
  forgive: [forgiveFirst, 0],
})

export const isOver = (g: Game) => g.wins[0] >= WIN_ROUNDS || g.wins[1] >= WIN_ROUNDS || g.rounds.length >= MAX_ROUNDS

/** The wait before the next signal, in ms. */
export const nextWait = (g: Game) => g.waits[Math.min(g.attempt, g.waits.length - 1)]

// The system's press for an attempt. It reacts after about 250 to 450 ms, and sometimes presses early.
export function systemPress(seed: number, attempt: number, skill: number): Press {
  const random = rng(seed * 17 + attempt * 101 + 5)
  if (random() < 0.03 + 0.04 * (1 - skill)) return EARLY
  return react(Math.round((380 - 120 * skill) * (0.85 + random() * 0.4)))
}

export type Recorded = { replay: boolean; outcome?: RoundOutcome }

// Records one round. A forgiven false start is replayed and does not count.
export function record(g: Game, a: Press, b: Press): Recorded {
  g.attempt += 1
  for (const side of [0, 1] as const) {
    const press = side === 0 ? a : b
    if (press.kind === 'early' && g.forgive[side] > 0) {
      g.forgive[side] -= 1
      return { replay: true }
    }
  }
  const outcome = resolveRound(a, b)
  g.rounds.push({ a, b, outcome })
  if (outcome.winner !== 0) {
    const side = outcome.winner - 1
    const press = outcome.winner === 1 ? a : b
    g.wins[side] += 1
    g.score[side] += roundPoints(press)
    if (press.kind === 'react') g.fastest[side] = Math.min(g.fastest[side] ?? Infinity, press.ms)
  }
  return { replay: false, outcome }
}

// 1 or 2 for the winner, or 0 for a draw. Round wins first, then points.
export function winnerOf(g: Game): 0 | 1 | 2 {
  if (g.wins[0] !== g.wins[1]) return g.wins[0] > g.wins[1] ? 1 : 2
  if (g.score[0] !== g.score[1]) return g.score[0] > g.score[1] ? 1 : 2
  return 0
}

export function earnedAchievements(g: Game, side: 0 | 1): string[] {
  const out: string[] = []
  if (winnerOf(g) === side + 1) out.push('ach_first_win')
  const fastest = g.fastest[side]
  if (fastest !== null && fastest < QUICK_MS) out.push('ach_quick_draw')
  return out
}
