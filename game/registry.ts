// The games in the hub. Pure data, so tests and the UI can both use it.
// Each game has two leaderboards: its best score, and the total of all its scores.

export type GameInfo = {
  id: string
  name: string
  blurb: string
  /** Leaderboard ids. `best` keeps the highest score and `total` adds scores up. */
  boards: { best: string; total: string }
  /** Short instructions, shown on the game's start screen. */
  howTo: HowTo
}

export type HowTo = {
  goal: string
  /** Controls on a phone or tablet. */
  touch: string
  /** Controls with a keyboard and mouse. */
  keyboard: string
  scoring: string
  booster: string
}

export const GAMES: GameInfo[] = [
  {
    id: 'reflex',
    name: 'Arena Reflex',
    blurb: 'A 20-second reaction round. Click the targets fast and avoid the decoys.',
    // These two ids come from the first version of the demo and are kept as they are.
    boards: { best: 'weekly', total: 'lifetime' },
    howTo: {
      goal: 'Tap the green targets as they light up. Do not tap the red decoys. The round lasts 20 seconds.',
      touch: 'Tap the cells.',
      keyboard: 'Click the cells.',
      scoring: 'A hit scores 50 plus a speed bonus. A decoy costs 100 and an empty cell costs 20. Hits in a row build a combo.',
      booster: 'A booster pack starts the round with a combo of 5.',
    },
  },
  {
    id: 'memory',
    name: 'Memory sequence',
    blurb: 'Watch the pattern, then repeat it. It grows by one pad every level.',
    boards: { best: 'memory_weekly', total: 'memory_lifetime' },
    howTo: {
      goal: 'Watch the pads light up, then tap them in the same order. Each level adds one pad, up to level 30.',
      touch: 'Tap the pads.',
      keyboard: 'Click the pads.',
      scoring: 'Each level you finish scores 10 times the level. One wrong pad ends the game.',
      booster: 'A booster pack gives you one second chance.',
    },
  },
  {
    id: 'words',
    name: 'Word scramble',
    blurb: 'Unscramble as many words as you can in 60 seconds. Streaks multiply your points.',
    boards: { best: 'words_weekly', total: 'words_lifetime' },
    howTo: {
      goal: 'Unscramble the letters into a word before the 60 seconds run out.',
      touch: 'Tap the letters in order, then Check. Back removes a letter and Skip moves on.',
      keyboard: 'Type the word and press Enter. Skip moves on.',
      scoring: 'A word scores 10 for each letter plus a speed bonus. Each correct word in a row adds 10% to the next one, up to 50%. A wrong guess or a skip resets the streak.',
      booster: 'A booster pack adds 10 seconds.',
    },
  },
  {
    id: 'tiles',
    name: 'Tile merge',
    blurb: 'Slide the board and merge equal tiles. No timer: end the game when you like.',
    boards: { best: 'tiles_weekly', total: 'tiles_lifetime' },
    howTo: {
      goal: 'Slide the board to merge equal tiles. Make a 256 tile for an achievement. There is no timer.',
      touch: 'Swipe on the board, or use the arrow buttons.',
      keyboard: 'Arrow keys or WASD.',
      scoring: 'Each merge scores the value of the new tile. The game ends when no move is left, or when you end it.',
      booster: 'A booster pack gives you one undo.',
    },
  },
  {
    id: 'connect4',
    name: 'Connect Four',
    blurb: 'Take turns dropping discs and get four in a row. Play alone against the system, or with a second player on the same device.',
    boards: { best: 'connect4_weekly', total: 'connect4_lifetime' },
    howTo: {
      goal: 'Take turns dropping discs into the columns. Get four in a row, across, down or diagonally, before your opponent does.',
      touch: 'Tap a column to drop your disc. With two players, take turns on the same screen.',
      keyboard: 'Click a column, or press 1 to 7. Playing alone, you are red and move first.',
      scoring: 'A win scores 100 plus 5 for each disc you did not need to use. A draw scores 50. A loss scores 2 for each disc you played.',
      booster: 'A booster pack lets player 1 take back their last move and the reply to it, once.',
    },
  },
]

export const gameById = (id: string): GameInfo => GAMES.find((g) => g.id === id) ?? GAMES[0]
