// Arena Reflex engine. Pure and deterministic: the same seed gives the same round.
// No DOM, no clock, no network. The UI feeds it clicks and times.
import { rng } from '../common.ts'

export const ROUND_MS = 20_000
export const GRID = 4 // 4 x 4 cells

export type Spawn = { id: number; cell: number; at: number; life: number; decoy: boolean }

export type Round = { seed: number; spawns: Spawn[] }

// Targets come faster and live shorter as the round goes on.
export function createRound(seed: number): Round {
  const random = rng(seed)
  const spawns: Spawn[] = []
  let at = 700
  let id = 0
  let lastCell = -1
  while (at < ROUND_MS - 600) {
    const progress = at / ROUND_MS
    const life = Math.round(1100 - 500 * progress) // 1100 ms down to 600 ms
    let cell = Math.floor(random() * GRID * GRID)
    if (cell === lastCell) cell = (cell + 1) % (GRID * GRID)
    lastCell = cell
    spawns.push({ id: id++, cell, at, life, decoy: random() < 0.18 })
    at += Math.round(life * (0.85 + random() * 0.3)) // the next one often appears before this one expires
  }
  return { seed, spawns }
}

export type Stats = {
  score: number
  hits: number
  misses: number // targets that expired, and clicks on an empty cell
  decoyHits: number
  combo: number
  bestCombo: number
  reactionTotal: number
}

export const emptyStats = (): Stats => ({ score: 0, hits: 0, misses: 0, decoyHits: 0, combo: 0, bestCombo: 0, reactionTotal: 0 })

export const HIT_POINTS = 50
export const SPEED_BONUS = 50 // up to this much, for a hit in the first instant
export const DECOY_PENALTY = 100
export const MISS_PENALTY = 20
export const COMBO_STEP = 0.05 // +5% per combo step
export const COMBO_CAP = 2

export const multiplier = (combo: number) => Math.min(COMBO_CAP, 1 + COMBO_STEP * combo)

export type Game = {
  round: Round
  stats: Stats
  resolved: Set<number> // spawn ids that were hit, expired or are decoys that went by
}

// A booster pack gives a starting combo.
export const BOOSTER_COMBO = 5

export function startGame(round: Round, startCombo = 0): Game {
  const stats = emptyStats()
  stats.combo = startCombo
  return { round, stats, resolved: new Set() }
}

const live = (game: Game, cell: number, t: number): Spawn | undefined =>
  game.round.spawns.find((s) => s.cell === cell && !game.resolved.has(s.id) && t >= s.at && t < s.at + s.life)

// Expires targets whose time ran out before t. Real targets cost a miss; decoys going by are fine.
export function advance(game: Game, t: number): void {
  for (const s of game.round.spawns) {
    if (game.resolved.has(s.id) || t < s.at + s.life) continue
    game.resolved.add(s.id)
    if (!s.decoy) miss(game.stats)
  }
}

function miss(stats: Stats): void {
  stats.misses += 1
  stats.combo = 0
  stats.score = Math.max(0, stats.score - MISS_PENALTY)
}

export type ClickResult = 'hit' | 'decoy' | 'empty'

// A click on a cell at time t (ms since the round started).
export function click(game: Game, cell: number, t: number): ClickResult {
  if (t < 0 || t >= ROUND_MS) return 'empty'
  advance(game, t)
  const stats = game.stats
  const target = live(game, cell, t)
  if (!target) {
    miss(stats)
    return 'empty'
  }
  game.resolved.add(target.id)
  if (target.decoy) {
    stats.decoyHits += 1
    stats.combo = 0
    stats.score = Math.max(0, stats.score - DECOY_PENALTY)
    return 'decoy'
  }
  const reaction = t - target.at
  const speed = Math.round(SPEED_BONUS * (1 - reaction / target.life))
  stats.hits += 1
  stats.reactionTotal += reaction
  stats.combo += 1
  stats.bestCombo = Math.max(stats.bestCombo, stats.combo)
  stats.score += Math.round((HIT_POINTS + speed) * multiplier(stats.combo - 1))
  return 'hit'
}

// Call when the round is over, so targets still on screen count as misses.
export function finish(game: Game): Stats {
  advance(game, ROUND_MS + 10_000)
  return game.stats
}

export const targetsInRound = (round: Round) => round.spawns.filter((s) => !s.decoy).length

export function accuracy(stats: Stats): number {
  const attempts = stats.hits + stats.misses + stats.decoyHits
  return attempts === 0 ? 0 : stats.hits / attempts
}

export const averageReaction = (stats: Stats): number => (stats.hits === 0 ? 0 : Math.round(stats.reactionTotal / stats.hits))

// ---- opponent ----

// RivalBot plays the same round. Its skill sets its reaction time and how often it misses or taps a decoy.
export function playBot(round: Round, skill: number, seed: number): Stats {
  const random = rng(seed)
  const game = startGame(round)
  for (const s of round.spawns) {
    const reaction = (260 + (1 - skill) * 520) * (0.8 + random() * 0.5)
    if (s.decoy) {
      if (random() < 0.12 * (1 - skill) + 0.02) click(game, s.cell, s.at + reaction)
      continue
    }
    if (reaction < s.life * (0.5 + 0.5 * skill) && random() > 0.04 * (1 - skill) + 0.01) click(game, s.cell, s.at + reaction)
  }
  return finish(game)
}

// ---- achievements the game awards ----

export type Earned = { achievementId: string; reason: string }

export function earnedAchievements(stats: Stats, won: boolean): Earned[] {
  const out: Earned[] = []
  if (won) out.push({ achievementId: 'ach_first_win', reason: 'Won a ranked match' })
  if (stats.score >= 2000) out.push({ achievementId: 'ach_sharpshooter', reason: `Scored ${stats.score}` })
  if (stats.hits > 0 && stats.misses === 0 && stats.decoyHits === 0) out.push({ achievementId: 'ach_flawless', reason: 'No misses or decoys' })
  return out
}
