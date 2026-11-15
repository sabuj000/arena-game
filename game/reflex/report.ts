import type { Match, Player } from '../../sdk/index.ts'
import { coinsFor } from '../common.ts'
import type { Report } from '../flow.ts'
import { gameById } from '../registry.ts'
import { earnedAchievements } from './engine.ts'
import type { Stats } from './engine.ts'

// What Arena Reflex tells the API when a round ends.
export function reflexReport(match: Match, player: Player, rival: Player, mine: Stats, theirs: Stats): Report {
  return {
    game: gameById('reflex'),
    match,
    player,
    rival,
    mine: mine.score,
    theirs: theirs.score,
    earn: (won) => earnedAchievements(mine, won).map((a) => a.achievementId),
    coins: (won) => coinsFor(mine.score, won),
  }
}
