// Word scramble engine. The game shows scrambled letters and the player unscrambles the word.
// Pure and seeded: the same seed gives the same words and the same scrambles. No DOM, no clock.
import { rng } from '../common.ts'

export const ROUND_MS = 60_000
export const BOOSTER_MS = 10_000 // a booster pack adds time

export const WORDS: string[] = (
  'planet garden bridge castle dragon forest island jungle knight legend marble nature orange pencil rocket silver ' +
  'tunnel valley window wizard yellow zipper anchor basket candle desert engine falcon guitar hammer jacket ladder ' +
  'magnet needle oyster parrot quartz ribbon saddle ticket umpire velvet wagon yogurt zebra apple bread cloud dream ' +
  'earth flame glass heart ivory jewel kite lemon mango night ocean piano queen river stone tiger uncle vivid water ' +
  'young pilot trace crate stare tears rates stale least tales steal slate heart earth hater share shear hares ' +
  'brave claim drift eagle frost grape honey input joker karma light moon noble olive pride quest ranch solar tower ' +
  'unity vapor whale xenon yield zesty amber blaze coral dusty ember fable gleam haste inbox jolly kneel lunar moody ' +
  'nutty opera plume quiet realm swift track unfit viola wheat yacht zonal adapt bloom crisp dwell elbow flock grain ' +
  'hinge ideal juicy knock lodge mound nerve outer plain quilt reign shelf thumb urban vault wrist'
)
  .split(' ')
  .filter((w, i, all) => all.indexOf(w) === i)

const DICT = new Set(WORDS)
const sortLetters = (w: string) => w.split('').sort().join('')

export type Puzzle = { word: string; letters: string }

function scramble(word: string, random: () => number): string {
  const letters = word.split('')
  for (let attempt = 0; attempt < 20; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[letters[i], letters[j]] = [letters[j], letters[i]]
    }
    if (letters.join('') !== word) return letters.join('')
  }
  return letters.slice(1).concat(letters[0]).join('') // a rotation, for words with repeated letters
}

// A list of puzzles with no word twice.
export function createPuzzles(seed: number, count = 40): Puzzle[] {
  const random = rng(seed)
  const pool = [...WORDS]
  const out: Puzzle[] = []
  while (out.length < count && pool.length > 0) {
    const word = pool.splice(Math.floor(random() * pool.length), 1)[0]
    out.push({ word, letters: scramble(word, random) })
  }
  return out
}

// A guess is right if it is the word, or another word in the list made from the same letters.
export function accepts(puzzle: Puzzle, guess: string): boolean {
  const g = guess.trim().toLowerCase()
  return g === puzzle.word || (DICT.has(g) && sortLetters(g) === sortLetters(puzzle.word))
}

export type Game = {
  puzzles: Puzzle[]
  index: number
  /** When the current puzzle appeared, in ms since the round started. */
  shownAt: number
  limit: number
  score: number
  solved: number
  skipped: number
  wrong: number
  streak: number
  bestStreak: number
}

export const startGame = (seed: number, extraMs = 0): Game => ({ puzzles: createPuzzles(seed), index: 0, shownAt: 0, limit: ROUND_MS + extraMs, score: 0, solved: 0, skipped: 0, wrong: 0, streak: 0, bestStreak: 0 })

export const current = (game: Game): Puzzle | undefined => game.puzzles[game.index]
export const isOver = (game: Game, t: number) => t >= game.limit || game.index >= game.puzzles.length

// Up to 10 extra points for a fast answer: 10 within the first second, one less each second after.
export const speedBonus = (ms: number) => Math.max(0, 10 - Math.floor(ms / 1000))
// +10% for each word solved in a row, up to +50%.
export const multiplier = (streak: number) => 1 + 0.1 * Math.min(streak, 5)

export type SubmitResult = 'correct' | 'wrong' | 'over'

export function submit(game: Game, guess: string, t: number): SubmitResult {
  const puzzle = current(game)
  if (!puzzle || isOver(game, t)) return 'over'
  if (!accepts(puzzle, guess)) {
    game.wrong += 1
    game.streak = 0
    return 'wrong'
  }
  game.score += Math.round((10 * puzzle.word.length + speedBonus(t - game.shownAt)) * multiplier(game.streak))
  game.solved += 1
  game.streak += 1
  game.bestStreak = Math.max(game.bestStreak, game.streak)
  next(game, t)
  return 'correct'
}

export function skip(game: Game, t: number): void {
  if (!current(game) || isOver(game, t)) return
  game.skipped += 1
  game.streak = 0
  next(game, t)
}

function next(game: Game, t: number) {
  game.index += 1
  game.shownAt = t
}

export type Stats = { score: number; solved: number; skipped: number; wrong: number; bestStreak: number }
export const statsOf = (g: Game): Stats => ({ score: g.score, solved: g.solved, skipped: g.skipped, wrong: g.wrong, bestStreak: g.bestStreak })

// RivalBot plays the same words. Its skill (0 to 1) sets how fast it solves.
export function playBot(seed: number, skill: number, botSeed: number): Stats {
  const random = rng(botSeed)
  const game = startGame(seed)
  let t = 0
  while (!isOver(game, t)) {
    const slow = (3500 + (1 - skill) * 9000) * (0.6 + random() * 0.8)
    if (random() < 0.04 + 0.12 * (1 - skill)) {
      t += 2000
      skip(game, t)
    } else {
      t += slow
      submit(game, current(game)?.word ?? '', t)
    }
  }
  return statsOf(game)
}

export const WORDSMITH_WORDS = 12

export function earnedAchievements(stats: Stats, won: boolean): string[] {
  const out: string[] = []
  if (won) out.push('ach_first_win')
  if (stats.solved >= WORDSMITH_WORDS) out.push('ach_wordsmith')
  return out
}
