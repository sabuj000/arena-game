import type { Match, Player } from '../../sdk/index.ts'
import { coinsFor } from '../common.ts'
import type { Report } from '../flow.ts'
import { gameById } from '../registry.ts'
import { earnedAchievements } from './engine.ts'
import type { Stats } from './engine.ts'

// What Memory sequence tells the API when a game ends. Points are small, so coins are scaled up.
export function memoryReport(match: Match, player: Player, rival: Player, mine: Stats, theirs: Stats): Report {
  return {
    game: gameById('memory'),
    match,
    player,
    rival,
    mine: mine.score,
    theirs: theirs.score,
    earn: (won) => earnedAchievements(mine, won),
    coins: (won) => coinsFor(mine.score * 3, won),
  }
}
