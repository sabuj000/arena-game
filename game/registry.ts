// The games in the hub. Pure data, so tests and the UI can both use it.
// Each game has two leaderboards: its best score, and the total of all its scores.

export type GameInfo = {
  id: string
  name: string
  blurb: string
  /** Leaderboard ids. `best` keeps the highest score and `total` adds scores up. */
  boards: { best: string; total: string }
}

export const GAMES: GameInfo[] = [
  {
    id: 'reflex',
    name: 'Arena Reflex',
    blurb: 'A 20-second reaction round. Click the targets fast and avoid the decoys.',
    // These two ids come from the first version of the demo and are kept as they are.
    boards: { best: 'weekly', total: 'lifetime' },
  },
  {
    id: 'memory',
    name: 'Memory sequence',
    blurb: 'Watch the pattern, then repeat it. It grows by one pad every level.',
    boards: { best: 'memory_weekly', total: 'memory_lifetime' },
  },
  {
    id: 'words',
    name: 'Word scramble',
    blurb: 'Unscramble as many words as you can in 60 seconds. Streaks multiply your points.',
    boards: { best: 'words_weekly', total: 'words_lifetime' },
  },
]

export const gameById = (id: string): GameInfo => GAMES.find((g) => g.id === id) ?? GAMES[0]
