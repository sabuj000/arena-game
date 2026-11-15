import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as e from '../game/reflex/engine.ts'
import { reflexReport } from '../game/reflex/report.ts'
import { buy, closeMatch, findRival, loadBoard, loadProfile, openMatch } from '../game/flow.ts'
import { world } from './helpers.ts'

function perfect(seed: number) {
  const round = e.createRound(seed)
  const game = e.startGame(round)
  for (const s of round.spawns) if (!s.decoy) e.click(game, s.cell, s.at + 150)
  return { round, mine: e.finish(game) }
}

test('a won ranked round runs the whole API flow', async () => {
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Tester' })
  const rival = await findRival(arena)
  assert.equal(rival.display_name, 'RivalBot')
  const match = await openMatch(arena, player, rival)
  assert.equal(match.status, 'active')
  const { round, mine } = perfect(21)
  const theirs = e.playBot(round, 0.3, 1)
  const done = await closeMatch(arena, reflexReport(match, player, rival, mine, theirs))
  assert.equal(done.won, true)
  assert.equal(done.match.status, 'completed')
  assert.deepEqual(done.newAchievements.sort(), ['ach_first_win', 'ach_flawless', 'ach_sharpshooter'])
  const profile = await loadProfile(arena, player)
  assert.equal(profile.inventory.find((i) => i.item_id === 'itm_coin')?.quantity, done.coins)
  assert.equal(profile.achievements.filter((a) => a.unlockedAt).length, 3)
  assert.ok((await loadBoard(arena, 'weekly')).some((r) => r.player_id === player.id))
})

test('achievements are awarded once, and a lost round still counts for the leaderboard', async () => {
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Tester' })
  const rival = await findRival(arena)
  const { round, mine } = perfect(21)
  const strong = e.playBot(round, 0.95, 1)
  const first = await closeMatch(arena, reflexReport(await openMatch(arena, player, rival), player, rival, mine, e.playBot(round, 0.3, 1)))
  assert.equal(first.newAchievements.length, 3)
  const second = await closeMatch(arena, reflexReport(await openMatch(arena, player, rival), player, rival, mine, { ...strong, score: mine.score + 1 }))
  assert.equal(second.won, false)
  assert.deepEqual(second.newAchievements, [])
  const lifetime = await arena.leaderboards.playerEntry('lifetime', player.id)
  assert.equal(lifetime.score, mine.score * 2)
})

test('shop: a declined card is an error and grants nothing; a good card grants the item', async () => {
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Shopper' })
  await assert.rejects(buy(arena, player, 'itm_arena_skin', 'tok_test_declined'), (err: any) => err.code === 'payment_declined')
  assert.deepEqual((await loadProfile(arena, player)).skins, [])
  await buy(arena, player, 'itm_arena_skin', 'tok_test_success')
  assert.deepEqual((await loadProfile(arena, player)).skins, ['itm_arena_skin'])
})

test('a Memory sequence round goes through the same flow with its own leaderboards', async () => {
  const { memoryReport } = await import('../game/memory/report.ts')
  const m = await import('../game/memory/engine.ts')
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Rememberer' })
  const rival = await findRival(arena)
  const game = m.startGame(5)
  for (let l = 0; l < 10; l++) {
    const n = game.level
    for (let i = 0; i < n; i++) m.press(game, game.seq[i])
  }
  m.press(game, (game.seq[0] + 1) % m.PADS) // then a mistake ends the game
  const mine = m.statsOf(game)
  assert.equal(mine.completed, 10)
  const done = await closeMatch(arena, memoryReport(await openMatch(arena, player, rival), player, rival, mine, { score: 100, completed: 4, mistakes: 1 }))
  assert.equal(done.won, true)
  assert.deepEqual(done.newAchievements.sort(), ['ach_elephant', 'ach_first_win'])
  assert.equal(((await arena.leaderboards.playerEntry('memory_weekly', player.id)) as any).score, 550)
  assert.equal(((await arena.leaderboards.playerEntry('memory_lifetime', player.id)) as any).score, 550)
  // The Reflex boards are untouched.
  await assert.rejects(arena.leaderboards.playerEntry('weekly', player.id), (e: any) => e.code === 'entry_not_found')
})

test('a Word scramble round goes through the same flow with its own leaderboards', async () => {
  const { wordsReport } = await import('../game/words/report.ts')
  const w = await import('../game/words/engine.ts')
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Wordy' })
  const rival = await findRival(arena)
  const game = w.startGame(8)
  for (let i = 0; i < 12; i++) w.submit(game, w.current(game)!.word, 2000 * (i + 1))
  const mine = w.statsOf(game)
  assert.equal(mine.solved, 12)
  const done = await closeMatch(arena, wordsReport(await openMatch(arena, player, rival), player, rival, mine, { score: 10, solved: 1, skipped: 0, wrong: 0, bestStreak: 1 }))
  assert.deepEqual(done.newAchievements.sort(), ['ach_first_win', 'ach_wordsmith'])
  assert.equal(((await arena.leaderboards.playerEntry('words_weekly', player.id)) as any).score, mine.score)
})

test('a Tile merge game goes through the same flow with its own leaderboards', async () => {
  const { tilesReport } = await import('../game/tiles/report.ts')
  const t = await import('../game/tiles/engine.ts')
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Slider' })
  const rival = await findRival(arena)
  const mine = { score: 3200, maxTile: 256, moves: 180 }
  const done = await closeMatch(arena, tilesReport(await openMatch(arena, player, rival), player, rival, mine, t.playBot(4, 0.5, 1)))
  assert.ok(done.newAchievements.includes('ach_big_tile'))
  assert.equal(((await arena.leaderboards.playerEntry('tiles_weekly', player.id)) as any).score, 3200)
  const profile = await loadProfile(arena, player)
  assert.ok(profile.achievements.some((a) => a.achievement.id === 'ach_big_tile' && a.unlockedAt))
})

// Scripted Connect Four games. Side 0 is the player.
const DIAGONAL_WIN = [0, 1, 1, 2, 2, 3, 3, 6, 2, 3, 3] // side 0 wins with 6 discs on a diagonal

test('Connect Four against the system: only the player gets a result', async () => {
  const { connect4Report } = await import('../game/connect4/report.ts')
  const c = await import('../game/connect4/engine.ts')
  const { arena } = world()
  const player = await arena.players.create({ display_name: 'Stacker' })
  const rival = await findRival(arena)
  const game = c.newGame()
  for (const col of DIAGONAL_WIN) c.drop(game, col)
  assert.equal(game.status, 'won')
  const done = await closeMatch(arena, connect4Report(game, await openMatch(arena, player, rival), player, rival, false))
  assert.equal(done.won, true)
  assert.equal(done.rival, undefined)
  assert.deepEqual(done.newAchievements.sort(), ['ach_diagonal', 'ach_first_win'])
  assert.equal(((await arena.leaderboards.playerEntry('connect4_weekly', player.id)) as any).score, 175)
  // The system opponent's score is not put on the leaderboard: RivalBot keeps its seeded score.
  const botScore = (await arena.leaderboards.entries('connect4_weekly', { limit: 20 })).data.find((e) => e.player_id === rival.id)?.score
  assert.equal(botScore, 135)
})

test('Connect Four with two players: both get their score, coins and achievements', async () => {
  const { connect4Report } = await import('../game/connect4/report.ts')
  const c = await import('../game/connect4/engine.ts')
  const { arena } = world()
  const one = await arena.players.create({ display_name: 'PlayerOne' })
  const two = await arena.players.create({ display_name: 'PlayerTwo' })
  const game = c.newGame()
  // Player two stacks four across the bottom while player one plays above them.
  for (const col of [0, 6, 0, 5, 1, 4, 1, 3]) c.drop(game, col)
  assert.equal(game.status, 'won')
  assert.equal(game.winner, 1)
  const match = await openMatch(arena, one, two)
  const done = await closeMatch(arena, connect4Report(game, match, one, two, true))
  assert.equal(done.won, false)
  assert.equal(done.draw, false)
  assert.ok(done.rival)
  assert.equal(done.rival!.won, true)
  assert.deepEqual(done.rival!.newAchievements, ['ach_first_win'])
  assert.deepEqual(done.newAchievements, [])
  assert.equal(((await arena.leaderboards.playerEntry('connect4_weekly', two.id)) as any).score, c.scoreOf(game, 1))
  assert.equal(((await arena.leaderboards.playerEntry('connect4_weekly', one.id)) as any).score, c.scoreOf(game, 0))
  const stored = await arena.matches.retrieve(match.id)
  assert.deepEqual(stored.results.map((r: any) => [r.player_id, r.placement]), [[two.id, 1], [one.id, 2]])
  assert.ok((await arena.inventory.list(two.id)).data.some((i) => i.item_id === 'itm_coin'))
})

test('a drawn Connect Four game puts both players at placement 1', async () => {
  const { connect4Report } = await import('../game/connect4/report.ts')
  const c = await import('../game/connect4/engine.ts')
  const { arena } = world()
  const one = await arena.players.create({ display_name: 'DrawOne' })
  const two = await arena.players.create({ display_name: 'DrawTwo' })
  // A full board with no four in a row, with the last disc still to play.
  const game = c.newGame()
  const odd = [1, 1, 2, 2, 1, 1, 2]
  for (let row = 0; row < c.ROWS; row++) for (let col = 0; col < c.COLS; col++) game.board[row * c.COLS + col] = (row % 2 === 1 ? odd : odd.map((v) => 3 - v))[col]
  game.board[0] = 0
  game.discs = [21, 20]
  game.turn = 1
  c.drop(game, 0)
  assert.equal(game.status, 'draw')
  const match = await openMatch(arena, one, two)
  const done = await closeMatch(arena, connect4Report(game, match, one, two, true))
  assert.equal(done.draw, true)
  assert.deepEqual((await arena.matches.retrieve(match.id)).results.map((r: any) => r.placement), [1, 1])
})
