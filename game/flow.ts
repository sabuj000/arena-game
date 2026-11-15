// How Arena Reflex uses the Arena API. Every step here is one SDK call, so the UI can show the API log.
import { Arena } from '../sdk/index.ts'
import type { Achievement, InventoryItem, LeaderboardEntry, Match, Player, Purchase } from '../sdk/index.ts'
import { decide } from './common.ts'
import type { GameInfo } from './registry.ts'

export const RIVAL_NAME = 'RivalBot'

export async function findRival(arena: Arena): Promise<Player> {
  const found = await arena.players.list({ display_name: RIVAL_NAME })
  const rival = found.data[0]
  if (rival) return rival
  return arena.players.create({ display_name: RIVAL_NAME })
}

// Creates a ranked match against the rival and starts it.
export async function openMatch(arena: Arena, player: Player, rival: Player): Promise<Match> {
  const match = await arena.matches.create({ mode: 'ranked', max_players: 2, player_ids: [player.id, rival.id] })
  return arena.matches.start(match.id)
}

/** What one player got from a finished match. */
export type Side = {
  won: boolean
  bestRank: number
  totalRank: number
  newAchievements: string[]
  coins: number
}

export type Finished = Side & {
  match: Match
  draw: boolean
  /** Present when the rival is a second player who also gets a result. */
  rival?: Side
}

export type Rewards = {
  /** Achievement ids this result earned. Ones the player already has are skipped. */
  earn: (won: boolean) => string[]
  coins: (won: boolean) => number
}

export type Report = Rewards & {
  game: GameInfo
  match: Match
  player: Player
  rival: Player
  /** The player's score and the rival's score. A higher score wins. */
  mine: number
  theirs: number
  /** Set this when the rival is a person. They then get their score, achievements and coins too. The system opponent gets none. */
  rivalRewards?: Rewards
}

// Gives one player the results of a match: the score on both of the game's leaderboards, achievements and coins.
async function settle(arena: Arena, game: GameInfo, matchId: string, playerId: string, score: number, won: boolean, rewards: Rewards): Promise<Side> {
  const best = await arena.leaderboards.submitScore(game.boards.best, { player_id: playerId, score, match_id: matchId })
  const total = await arena.leaderboards.submitScore(game.boards.total, { player_id: playerId, score, match_id: matchId })

  const already = new Set((await arena.achievements.listForPlayer(playerId)).data.map((a) => a.achievement_id))
  const newAchievements: string[] = []
  for (const id of rewards.earn(won)) {
    if (already.has(id) || newAchievements.includes(id)) continue
    await arena.achievements.unlock(playerId, id)
    newAchievements.push(id)
  }

  const coins = rewards.coins(won)
  if (coins > 0) await arena.inventory.grant(playerId, { item_id: 'itm_coin', quantity: coins, reason: `match ${matchId}` })
  return { won, bestRank: best.rank, totalRank: total.rank, newAchievements, coins }
}

// Reports the result: ends the match, then gives the player (and a second player, if there is one) their results.
export async function closeMatch(arena: Arena, report: Report): Promise<Finished> {
  const { game, match, player, rival } = report
  const outcome = decide(report.mine, report.theirs)
  const ended = await arena.matches.end(match.id, {
    results: [
      { player_id: player.id, placement: outcome.playerPlacement, score: report.mine },
      { player_id: rival.id, placement: outcome.rivalPlacement, score: report.theirs },
    ],
  })
  const mine = await settle(arena, game, match.id, player.id, report.mine, outcome.winner === 'player', report)
  const rivalSide = report.rivalRewards
    ? await settle(arena, game, match.id, rival.id, report.theirs, outcome.winner === 'rival', report.rivalRewards)
    : undefined
  return { ...mine, match: ended, draw: outcome.winner === 'draw', rival: rivalSide }
}

export type Profile = {
  player: Player
  inventory: InventoryItem[]
  achievements: Array<{ achievement: Achievement | { id: string; name: string; description: string; hidden: true }; unlockedAt: string | null }>
  skins: string[]
}

export async function loadBoard(arena: Arena, id: string): Promise<LeaderboardEntry[]> {
  return (await arena.leaderboards.entries(id, { limit: 10 })).data
}

export async function loadProfile(arena: Arena, player: Player): Promise<Profile> {
  const [inventory, catalog, mine, entitlements] = await Promise.all([
    arena.inventory.list(player.id),
    arena.achievements.list(),
    arena.achievements.listForPlayer(player.id),
    arena.purchases.listEntitlements(player.id),
  ])
  const unlocked = new Map(mine.data.map((a) => [a.achievement_id, a.unlocked_at]))
  const achievements: Profile['achievements'] = catalog.data.map((a) => ({ achievement: a, unlockedAt: unlocked.get(a.id) ?? null }))
  // Hidden achievements are not in the catalog. Show them only once the player has earned one.
  for (const [id, at] of unlocked) {
    if (!catalog.data.some((a) => a.id === id)) achievements.push({ achievement: { id, name: id.replace(/^ach_/, '').replace(/_/g, ' '), description: 'A hidden achievement.', hidden: true }, unlockedAt: at })
  }
  return { player, inventory: inventory.data, achievements, skins: entitlements.data.map((e) => e.item_id) }
}

export const PRICES: Record<string, string> = { itm_gold_pack: '$1.99', itm_arena_skin: '$4.99', itm_season_pass: '$9.99' }

export async function buy(arena: Arena, player: Player, itemId: string, token: 'tok_test_success' | 'tok_test_declined'): Promise<Purchase> {
  return arena.purchases.create({ player_id: player.id, item_id: itemId, quantity: 1, payment_token: token })
}
