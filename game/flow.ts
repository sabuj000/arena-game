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

export type Finished = {
  match: Match
  won: boolean
  draw: boolean
  bestRank: number
  totalRank: number
  newAchievements: string[]
  coins: number
}

export type Report = {
  game: GameInfo
  match: Match
  player: Player
  rival: Player
  /** The player's score and the rival's score. A higher score wins. */
  mine: number
  theirs: number
  /** Achievement ids this round earned. Ones the player already has are skipped. */
  earn: (won: boolean) => string[]
  coins: (won: boolean) => number
}

// Reports the result: ends the match, submits the score to the game's two leaderboards, unlocks achievements, grants coins.
export async function closeMatch(arena: Arena, report: Report): Promise<Finished> {
  const { game, match, player, rival } = report
  const outcome = decide(report.mine, report.theirs)
  const ended = await arena.matches.end(match.id, {
    results: [
      { player_id: player.id, placement: outcome.playerPlacement, score: report.mine },
      { player_id: rival.id, placement: outcome.rivalPlacement, score: report.theirs },
    ],
  })
  const won = outcome.winner === 'player'
  const best = await arena.leaderboards.submitScore(game.boards.best, { player_id: player.id, score: report.mine, match_id: match.id })
  const total = await arena.leaderboards.submitScore(game.boards.total, { player_id: player.id, score: report.mine, match_id: match.id })

  const already = new Set((await arena.achievements.listForPlayer(player.id)).data.map((a) => a.achievement_id))
  const newAchievements: string[] = []
  for (const id of report.earn(won)) {
    if (already.has(id) || newAchievements.includes(id)) continue
    await arena.achievements.unlock(player.id, id)
    newAchievements.push(id)
  }

  const coins = report.coins(won)
  if (coins > 0) await arena.inventory.grant(player.id, { item_id: 'itm_coin', quantity: coins, reason: `match ${match.id}` })

  return { match: ended, won, draw: outcome.winner === 'draw', bestRank: best.rank, totalRank: total.rank, newAchievements, coins }
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
