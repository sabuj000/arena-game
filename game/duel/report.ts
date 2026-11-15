import type { Match, Player } from '../../sdk/index.ts'
import { coinsFor } from '../common.ts'
import type { Report } from '../flow.ts'
import { gameById } from '../registry.ts'
import { earnedAchievements } from './engine.ts'
import type { Game } from './engine.ts'

// What Quick Draw tells the API when a duel ends.
// `rivalIsPerson` is true in two-player mode, where the second player also gets their score, achievements and coins.
export function duelReport(game: Game, match: Match, player: Player, rival: Player, rivalIsPerson: boolean): Report {
  return {
    game: gameById('duel'),
    match,
    player,
    rival,
    mine: game.score[0],
    theirs: game.score[1],
    earn: () => earnedAchievements(game, 0),
    coins: (won) => coinsFor(game.score[0], won),
    rivalRewards: rivalIsPerson
      ? {
          earn: () => earnedAchievements(game, 1),
          coins: (won) => coinsFor(game.score[1], won),
        }
      : undefined,
  }
}
