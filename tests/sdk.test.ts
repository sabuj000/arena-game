import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Arena, ArenaError, paginate } from '../sdk/index.ts'
import { world } from './helpers.ts'

test('errors become ArenaError with status, code and request id', async () => {
  const { arena } = world()
  await assert.rejects(arena.players.retrieve('plr_missing'), (e: unknown) => {
    assert.ok(e instanceof ArenaError)
    assert.equal(e.status, 404)
    assert.equal(e.code, 'player_not_found')
    assert.match(e.requestId ?? '', /^req_/)
    return true
  })
})

test('a bad API key is rejected with invalid_api_key', async () => {
  const w = world({ arena: { apiKey: 'nope' } })
  await assert.rejects(w.arena.players.list(), (e: unknown) => e instanceof ArenaError && e.status === 401 && e.code === 'invalid_api_key')
})

test('a publishable key cannot create players', async () => {
  const w = world({ arena: { apiKey: 'pk_test_x' } })
  await assert.rejects(w.arena.players.create({ display_name: 'Nope' }), (e: unknown) => e instanceof ArenaError && e.code === 'secret_key_required')
  assert.ok((await w.arena.leaderboards.list()).data.length > 0)
})

test('a 500 is retried and the retry reuses the idempotency key, so one player is created', async () => {
  let failures = 1
  const seen: string[] = []
  const w = world({
    fault: (req) => {
      if (req.method === 'POST' && req.path === '/players') {
        seen.push(req.headers['idempotency-key'])
        if (failures-- > 0) return { status: 500 }
      }
      return null
    },
  })
  const player = await w.arena.players.create({ display_name: 'RetryMe' })
  assert.equal(player.display_name, 'RetryMe')
  assert.equal(seen.length, 2)
  assert.equal(seen[0], seen[1])
  assert.equal((await w.arena.players.list({ display_name: 'RetryMe' })).data.length, 1)
})

test('a 429 is retried', async () => {
  let limited = 2
  const w = world({ fault: (req) => (req.method === 'GET' && limited-- > 0 ? { status: 429, headers: { 'Retry-After': '1' } } : null) })
  assert.ok(await w.arena.leaderboards.list())
})

test('the same idempotency key with different parameters is rejected', async () => {
  const { arena } = world()
  await arena.players.create({ display_name: 'KeyOne' }, { idempotencyKey: 'k1' })
  await assert.rejects(arena.players.create({ display_name: 'KeyTwo' }, { idempotencyKey: 'k1' }), (e: unknown) => e instanceof ArenaError && e.code === 'idempotency_key_reuse')
})

test('the same idempotency key and parameters replays the first response', async () => {
  const { arena } = world()
  const first = await arena.players.create({ display_name: 'Replay' }, { idempotencyKey: 'k2' })
  const second = await arena.players.create({ display_name: 'Replay' }, { idempotencyKey: 'k2' })
  assert.equal(first.id, second.id)
})

test('paginate walks every page', async () => {
  const { arena } = world()
  for (let i = 0; i < 7; i++) await arena.players.create({ display_name: `Pager${i}` })
  const ids: string[] = []
  for await (const p of paginate((cursor) => arena.players.list({ limit: 3, cursor }))) ids.push(p.id)
  assert.equal(ids.length, 12) // 5 seed players + 7
  assert.equal(new Set(ids).size, 12)
})

test('purchase, consume, refund and entitlements behave', async () => {
  const w = world()
  const p = await w.arena.players.create({ display_name: 'Shopper' })
  const pack = await w.arena.purchases.create({ player_id: p.id, item_id: 'itm_gold_pack', quantity: 2, payment_token: 'tok_test_success' })
  assert.equal(pack.status, 'succeeded')
  await w.arena.inventory.consume(p.id, { item_id: 'itm_gold_pack', quantity: 1 })
  const refunded = await w.arena.purchases.refund(pack.id, { reason: 'customer_request' })
  assert.equal(refunded.status, 'refunded')
  assert.equal(refunded.refund?.revoked_quantity, 1) // one was already used
  const skin = await w.arena.purchases.create({ player_id: p.id, item_id: 'itm_arena_skin', quantity: 1, payment_token: 'tok_test_success' })
  const ents = await w.arena.purchases.listEntitlements(p.id)
  assert.deepEqual(ents.data.map((e: any) => e.purchase_id), [skin.id])
})

test('leaderboards: best keeps the highest, sum adds, ties share a rank', async () => {
  const { arena } = world()
  const a = await arena.players.create({ display_name: 'TieA' })
  const b = await arena.players.create({ display_name: 'TieB' })
  await arena.leaderboards.submitScore('weekly', { player_id: a.id, score: 500 })
  await arena.leaderboards.submitScore('weekly', { player_id: a.id, score: 100 })
  const bScore = await arena.leaderboards.submitScore('weekly', { player_id: b.id, score: 500 })
  const entryA: any = await arena.leaderboards.playerEntry('weekly', a.id)
  assert.equal(entryA.score, 500)
  assert.equal(entryA.rank, bScore.rank)
  await arena.leaderboards.submitScore('lifetime', { player_id: a.id, score: 100 })
  await arena.leaderboards.submitScore('lifetime', { player_id: a.id, score: 50 })
  assert.equal(((await arena.leaderboards.playerEntry('lifetime', a.id)) as any).score, 150)
})

test('Arena is exported as a class', () => {
  assert.equal(typeof Arena, 'function')
})
