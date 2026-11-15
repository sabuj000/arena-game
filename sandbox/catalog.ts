// What the dashboard would configure for a real game: items, leaderboards and achievements.

export type ItemDef = { name: string; consumable: boolean; forSale: boolean; max: number }

export const ITEMS: Record<string, ItemDef> = {
  itm_gold_pack: { name: 'Booster pack', consumable: true, forSale: true, max: 99 },
  itm_arena_skin: { name: 'Neon skin', consumable: false, forSale: true, max: 1 },
  itm_season_pass: { name: 'Season pass', consumable: false, forSale: true, max: 1 },
  itm_coin: { name: 'Coins', consumable: true, forSale: false, max: 10000 },
}

export type LeaderboardDef = {
  name: string
  sort: 'desc' | 'asc'
  update_mode: 'best' | 'latest' | 'sum'
  reset: 'never' | 'daily' | 'weekly' | 'monthly'
}

export const LEADERBOARDS: Record<string, LeaderboardDef> = {
  weekly: { name: 'Weekly best', sort: 'desc', update_mode: 'best', reset: 'weekly' },
  lifetime: { name: 'Lifetime total', sort: 'desc', update_mode: 'sum', reset: 'never' },
}

export type AchievementDef = { id: string; key: string; name: string; description: string; hidden: boolean }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ach_first_win', key: 'first_win', name: 'First win', description: 'Win your first ranked match.', hidden: false },
  { id: 'ach_sharpshooter', key: 'sharpshooter', name: 'Sharpshooter', description: 'Score 2,000 or more in one round.', hidden: false },
  { id: 'ach_flawless', key: 'flawless', name: 'Flawless', description: 'Finish a round without a miss.', hidden: true },
]

// Used by tests and by the game to create a believable board.
export const SEED_PLAYERS: Array<{ name: string; best: number; total: number }> = [
  { name: 'NovaKnight', best: 3400, total: 18200 },
  { name: 'IronVale', best: 3100, total: 15800 },
  { name: 'RivalBot', best: 2600, total: 9400 },
  { name: 'PixelFox', best: 2200, total: 7300 },
  { name: 'Quasar', best: 1700, total: 4100 },
]
