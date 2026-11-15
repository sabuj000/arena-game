import type { Match, Player } from '../../sdk/index.ts'
import { coinsFor } from '../common.ts'
import type { Report } from '../flow.ts'
import { gameById } from '../registry.ts'
import { earnedAchievements, scoreOf } from './engine.ts'
import type { Game } from './engine.ts'

// What Connect Four tells the API when a game ends.
// `rivalIsPerson` is true in two-player mode, where the second player also gets their score, achievements and coins.
export function connect4Report(game: Game, match: Match, player: Player, rival: Player, rivalIsPerson: boolean): Report {
  return {
    game: gameById('connect4'),
    match,
    player,
    rival,
    mine: scoreOf(game, 0),
    theirs: scoreOf(game, 1),
    earn: () => earnedAchievements(game, 0),
    coins: (won) => coinsFor(scoreOf(game, 0), won),
    rivalRewards: rivalIsPerson
      ? {
          earn: () => earnedAchievements(game, 1),
          coins: (won) => coinsFor(scoreOf(game, 1), won),
        }
      : undefined,
  }
}
