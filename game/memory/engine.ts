// Memory sequence engine. The game shows a growing pattern of pads. The player repeats it.
// Pure and seeded: the same seed gives the same pattern. No DOM, no clock.
import { rng } from '../common.ts'

export const PADS = 9 // a 3 x 3 grid
export const MAX_LEVEL = 30

export function createSequence(seed: number): number[] {
  const random = rng(seed)
  return Array.from({ length: MAX_LEVEL }, () => Math.floor(random() * PADS))
}

export type Game = {
  seq: number[]
  /** The level being played. Level n shows the first n pads. */
  level: number
  /** How many pads of this level the player has entered. */
  entered: number
  completed: number
  score: number
  /** Mistakes left. A booster pack gives one. */
  spare: number
  mistakes: number
  over: boolean
  won: boolean
}

export const startGame = (seed: number, spare = 0): Game => ({ seq: createSequence(seed), level: 1, entered: 0, completed: 0, score: 0, spare, mistakes: 0, over: false, won: false })

export const levelScore = (level: number) => 10 * level
// How long each pad is shown, in ms. It gets faster with the level.
export const stepMs = (level: number) => Math.max(280, 650 - level * 25)

export const shown = (game: Game): number[] => game.seq.slice(0, game.level)

export type PressResult = 'correct' | 'level' | 'win' | 'retry' | 'over' | 'ignored'

export function press(game: Game, pad: number): PressResult {
  if (game.over) return 'ignored'
  if (pad === game.seq[game.entered]) {
    game.entered += 1
    if (game.entered < game.level) return 'correct'
    game.score += levelScore(game.level)
    game.completed = game.level
    if (game.level >= MAX_LEVEL) {
      game.over = true
      game.won = true
      return 'win'
    }
    game.level += 1
    game.entered = 0
    return 'level'
  }
  game.mistakes += 1
  if (game.spare > 0) {
    game.spare -= 1
    game.entered = 0 // the same level is shown again
    return 'retry'
  }
  game.over = true
  return 'over'
}

export type Stats = { score: number; completed: number; mistakes: number }
export const statsOf = (game: Game): Stats => ({ score: game.score, completed: game.completed, mistakes: game.mistakes })

// RivalBot plays the same pattern. Its skill (0 to 1) sets how long it lasts.
export function playBot(seed: number, skill: number, botSeed: number): Stats {
  const random = rng(botSeed)
  const game = startGame(seed)
  while (!game.over) {
    const chance = Math.max(0.15, 0.99 - (game.level - 1) * 0.035 * (1.7 - skill))
    for (let i = 0; i < game.level && !game.over; i++) {
      if (random() < Math.pow(chance, 1 / game.level)) press(game, game.seq[game.entered])
      else press(game, (game.seq[game.entered] + 1) % PADS)
    }
  }
  return statsOf(game)
}

export const ELEPHANT_LEVEL = 10

export function earnedAchievements(stats: Stats, won: boolean): string[] {
  const out: string[] = []
  if (won) out.push('ach_first_win')
  if (stats.completed >= ELEPHANT_LEVEL) out.push('ach_elephant')
  return out
}
