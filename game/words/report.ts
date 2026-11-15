import type { Match, Player } from '../../sdk/index.ts'
import { coinsFor } from '../common.ts'
import type { Report } from '../flow.ts'
import { gameById } from '../registry.ts'
import { earnedAchievements } from './engine.ts'
import type { Stats } from './engine.ts'

// What Word scramble tells the API when a game ends. Coins follow the points.
export function wordsReport(match: Match, player: Player, rival: Player, mine: Stats, theirs: Stats): Report {
  return {
    game: gameById('words'),
    match,
    player,
    rival,
    mine: mine.score,
    theirs: theirs.score,
    earn: (won) => earnedAchievements(mine, won),
    coins: (won) => coinsFor(mine.score, won),
  }
}
