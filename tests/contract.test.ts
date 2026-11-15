// Checks that the sandbox behaves as openapi/arena.json says: the same operations, success statuses,
// response shapes, and every documented error code with its status.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ApiResponse } from '../sandbox/server.ts'
import { OPERATIONS } from '../sandbox/server.ts'
import { world } from './helpers.ts'

const spec = JSON.parse(readFileSync(new URL('../openapi/arena.json', import.meta.url), 'utf8'))
const specOps: Array<{ key: string; method: string; path: string; op: any }> = Object.entries(spec.paths).flatMap(([path, methods]: [string, any]) =>
  Object.entries(methods).map(([method, op]) => ({ key: `${method.toUpperCase()} ${path}`, method: method.toUpperCase(), path, op })),
)

// A throwaway world with helpers to build the situations each scenario needs.
function scene() {
  const w = world()
  const call = (method: string, path: string, body?: unknown, query: Record<string, string> = {}): ApiResponse =>
    w.sandbox.call({ method, path, query, headers: { authorization: 'Bearer sk_test_contract' }, body })
  const b = (r: ApiResponse) => r.body as any
  let n = 0
  const player = () => b(call('POST', '/players', { display_name: `Player${++n}` })).id as string
  const match = (players = 2) => {
    const ids = Array.from({ length: players }, player)
    return { id: b(call('POST', '/matches', { mode: 'ranked', max_players: 2, player_ids: ids })).id as string, ids }
  }
  const active = () => {
    const m = match()
    call('POST', `/matches/${m.id}/start`)
    return m
  }
  const purchase = (token = 'tok_test_success', item = 'itm_gold_pack') => {
    const p = player()
    const r = call('POST', '/purchases', { player_id: p, item_id: item, quantity: 1, payment_token: token })
    return { p, r }
  }
  return { w, call, b, player, match, active, purchase }
}

const resolve = (ref: string): any => spec.components.schemas[ref.split('/').pop() as string]

// Every field in the body is in the schema, and every required field is in the body with the right value.
function checkObject(label: string, body: Record<string, any>, schema: any) {
  for (const name of Object.keys(body)) assert.ok(schema.properties[name], `${label}: response has "${name}", which the schema does not define`)
  const required = new Set<string>(schema.required ?? Object.keys(schema.properties))
  for (const [name, def] of Object.entries<any>(schema.properties)) {
    if (name === 'deleted') continue
    if (!required.has(name)) continue
    assert.ok(name in body, `${label}: response is missing "${name}"`)
    if (def.const) assert.equal(body[name], def.const)
    if (def.enum) assert.ok(def.enum.includes(body[name]), `${label}: ${name}=${body[name]} is not one of ${def.enum}`)
    // Known spec gap: the spec types started_at, ended_at, match_id, grant_id, reason and refund as plain values, but they can be null.
    if (body[name] === null) continue
    if (def.type === 'integer') assert.ok(Number.isInteger(body[name]), `${label}: ${name} is not an integer`)
    if (def.type === 'string') assert.equal(typeof body[name], 'string', `${label}: ${name} is not a string`)
  }
}

type Scenario = (s: ReturnType<typeof scene>) => ApiResponse

// One success scenario per operation.
const success: Record<string, Scenario> = {
  'POST /players': (s) => s.call('POST', '/players', { display_name: 'Alpha', metadata: { region: 'ap-south' } }),
  'GET /players': (s) => (s.player(), s.call('GET', '/players', undefined, { limit: '10' })),
  'GET /players/{player_id}': (s) => s.call('GET', `/players/${s.player()}`),
  'PATCH /players/{player_id}': (s) => s.call('PATCH', `/players/${s.player()}`, { status: 'suspended' }),
  'DELETE /players/{player_id}': (s) => s.call('DELETE', `/players/${s.player()}`),
  'POST /matches': (s) => s.call('POST', '/matches', { mode: 'ranked', max_players: 2 }),
  'GET /matches': (s) => (s.match(), s.call('GET', '/matches')),
  'GET /matches/{match_id}': (s) => s.call('GET', `/matches/${s.match().id}`),
  'POST /matches/{match_id}/join': (s) => {
    const m = s.b(s.call('POST', '/matches', { mode: 'casual', max_players: 2 }))
    return s.call('POST', `/matches/${m.id}/join`, { player_id: s.player() })
  },
  'POST /matches/{match_id}/start': (s) => s.call('POST', `/matches/${s.match().id}/start`),
  'POST /matches/{match_id}/end': (s) => {
    const m = s.active()
    return s.call('POST', `/matches/${m.id}/end`, { results: [{ player_id: m.ids[0], placement: 1, score: 10 }, { player_id: m.ids[1], placement: 2, score: 5 }] })
  },
  'POST /matches/{match_id}/cancel': (s) => s.call('POST', `/matches/${s.match().id}/cancel`),
  'GET /leaderboards': (s) => s.call('GET', '/leaderboards'),
  'GET /leaderboards/{leaderboard_id}': (s) => s.call('GET', '/leaderboards/weekly'),
  'POST /leaderboards/{leaderboard_id}/scores': (s) => s.call('POST', '/leaderboards/weekly/scores', { player_id: s.player(), score: 100 }),
  'GET /leaderboards/{leaderboard_id}/entries': (s) => s.call('GET', '/leaderboards/weekly/entries', undefined, { limit: '3' }),
  'GET /leaderboards/{leaderboard_id}/players/{player_id}': (s) => {
    const p = s.player()
    s.call('POST', '/leaderboards/weekly/scores', { player_id: p, score: 5 })
    return s.call('GET', `/leaderboards/weekly/players/${p}`)
  },
  'GET /players/{player_id}/inventory': (s) => s.call('GET', `/players/${s.player()}/inventory`),
  'POST /players/{player_id}/inventory/grants': (s) => s.call('POST', `/players/${s.player()}/inventory/grants`, { item_id: 'itm_coin', quantity: 10, reason: 'test' }),
  'POST /players/{player_id}/inventory/consume': (s) => {
    const p = s.player()
    s.call('POST', `/players/${p}/inventory/grants`, { item_id: 'itm_coin', quantity: 10 })
    return s.call('POST', `/players/${p}/inventory/consume`, { item_id: 'itm_coin', quantity: 3 })
  },
  'GET /achievements': (s) => s.call('GET', '/achievements'),
  'GET /players/{player_id}/achievements': (s) => s.call('GET', `/players/${s.player()}/achievements`),
  'POST /players/{player_id}/achievements/{achievement_id}/unlock': (s) => s.call('POST', `/players/${s.player()}/achievements/ach_first_win/unlock`),
  'POST /purchases': (s) => s.purchase().r,
  'GET /purchases': (s) => (s.purchase(), s.call('GET', '/purchases')),
  'GET /purchases/{purchase_id}': (s) => s.call('GET', `/purchases/${s.b(s.purchase().r).id}`),
  'POST /purchases/{purchase_id}/refund': (s) => s.call('POST', `/purchases/${s.b(s.purchase().r).id}/refund`, { reason: 'customer_request' }),
  'GET /players/{player_id}/entitlements': (s) => s.call('GET', `/players/${s.player()}/entitlements`),
}

// One scenario per documented error code. The key is "METHOD /path code".
const errors: Record<string, Scenario> = {
  'POST /players display_name_taken': (s) => (s.call('POST', '/players', { display_name: 'Alpha' }), s.call('POST', '/players', { display_name: 'alpha' })),
  'POST /players invalid_display_name': (s) => s.call('POST', '/players', { display_name: 'ab' }),
  'GET /players/{player_id} player_not_found': (s) => s.call('GET', '/players/plr_missing'),
  'GET /matches/{match_id} match_not_found': (s) => s.call('GET', '/matches/mch_missing'),
  'POST /matches/{match_id}/join match_full': (s) => s.call('POST', `/matches/${s.match().id}/join`, { player_id: s.player() }),
  'POST /matches/{match_id}/join match_not_joinable': (s) => s.call('POST', `/matches/${s.active().id}/join`, { player_id: s.player() }),
  'POST /matches/{match_id}/join player_suspended': (s) => {
    const m = s.b(s.call('POST', '/matches', { mode: 'casual', max_players: 2 }))
    const p = s.player()
    s.call('PATCH', `/players/${p}`, { status: 'suspended' })
    return s.call('POST', `/matches/${m.id}/join`, { player_id: p })
  },
  'POST /matches/{match_id}/start match_not_startable': (s) => {
    const m = s.b(s.call('POST', '/matches', { mode: 'casual', max_players: 2, player_ids: [s.player()] }))
    return s.call('POST', `/matches/${m.id}/start`)
  },
  'POST /matches/{match_id}/end match_not_active': (s) => {
    const m = s.match()
    return s.call('POST', `/matches/${m.id}/end`, { results: [{ player_id: m.ids[0], placement: 1 }] })
  },
  'POST /matches/{match_id}/end player_not_in_match': (s) => {
    const m = s.active()
    return s.call('POST', `/matches/${m.id}/end`, { results: [{ player_id: s.player(), placement: 1 }] })
  },
  'POST /matches/{match_id}/cancel match_not_cancellable': (s) => {
    const m = s.active()
    s.call('POST', `/matches/${m.id}/end`, { results: [{ player_id: m.ids[0], placement: 1 }] })
    return s.call('POST', `/matches/${m.id}/cancel`)
  },
  'GET /leaderboards/{leaderboard_id} leaderboard_not_found': (s) => s.call('GET', '/leaderboards/nope'),
  'POST /leaderboards/{leaderboard_id}/scores player_not_found': (s) => s.call('POST', '/leaderboards/weekly/scores', { player_id: 'plr_missing', score: 1 }),
  'POST /leaderboards/{leaderboard_id}/scores player_suspended': (s) => {
    const p = s.player()
    s.call('PATCH', `/players/${p}`, { status: 'suspended' })
    return s.call('POST', '/leaderboards/weekly/scores', { player_id: p, score: 1 })
  },
  'POST /leaderboards/{leaderboard_id}/scores invalid_score': (s) => s.call('POST', '/leaderboards/weekly/scores', { player_id: s.player(), score: -1 }),
  'GET /leaderboards/{leaderboard_id}/players/{player_id} entry_not_found': (s) => s.call('GET', `/leaderboards/weekly/players/${s.player()}`),
  'POST /players/{player_id}/inventory/grants item_not_found': (s) => s.call('POST', `/players/${s.player()}/inventory/grants`, { item_id: 'itm_nope', quantity: 1 }),
  'POST /players/{player_id}/inventory/grants item_limit_reached': (s) => s.call('POST', `/players/${s.player()}/inventory/grants`, { item_id: 'itm_arena_skin', quantity: 2 }),
  'POST /players/{player_id}/inventory/consume insufficient_quantity': (s) => s.call('POST', `/players/${s.player()}/inventory/consume`, { item_id: 'itm_coin', quantity: 1 }),
  'POST /players/{player_id}/achievements/{achievement_id}/unlock achievement_not_found': (s) => s.call('POST', `/players/${s.player()}/achievements/ach_nope/unlock`),
  'POST /players/{player_id}/achievements/{achievement_id}/unlock player_not_found': (s) => s.call('POST', '/players/plr_missing/achievements/ach_first_win/unlock'),
  'POST /purchases payment_declined': (s) => s.purchase('tok_test_declined').r,
  'POST /purchases item_not_found': (s) => s.call('POST', '/purchases', { player_id: s.player(), item_id: 'itm_nope', quantity: 1, payment_token: 'tok_test_success' }),
  'POST /purchases item_not_for_sale': (s) => s.call('POST', '/purchases', { player_id: s.player(), item_id: 'itm_coin', quantity: 1, payment_token: 'tok_test_success' }),
  'GET /purchases/{purchase_id} purchase_not_found': (s) => s.call('GET', '/purchases/pur_missing'),
  'POST /purchases/{purchase_id}/refund purchase_already_refunded': (s) => {
    const id = s.b(s.purchase().r).id
    s.call('POST', `/purchases/${id}/refund`, { reason: 'other' })
    return s.call('POST', `/purchases/${id}/refund`, { reason: 'other' })
  },
  'POST /purchases/{purchase_id}/refund purchase_not_refundable': (s) => {
    const id = s.b(s.purchase().r).id
    s.w.advanceDays(15)
    return s.call('POST', `/purchases/${id}/refund`, { reason: 'other' })
  },
  'PATCH /players/{player_id} display_name_taken': (s) => {
    s.call('POST', '/players', { display_name: 'Alpha' })
    return s.call('PATCH', `/players/${s.player()}`, { display_name: 'alpha' })
  },
  'PATCH /players/{player_id} invalid_display_name': (s) => s.call('PATCH', `/players/${s.player()}`, { display_name: 'ab' }),
  'PATCH /players/{player_id} player_not_found': (s) => s.call('PATCH', '/players/plr_missing', { status: 'active' }),
  'DELETE /players/{player_id} player_not_found': (s) => s.call('DELETE', '/players/plr_missing'),
  'POST /matches match_full': (s) => s.call('POST', '/matches', { mode: 'casual', max_players: 2, player_ids: [s.player(), s.player(), s.player()] }),
  'POST /matches player_not_found': (s) => s.call('POST', '/matches', { mode: 'casual', max_players: 2, player_ids: ['plr_missing'] }),
  'POST /matches player_suspended': (s) => {
    const p = s.player()
    s.call('PATCH', `/players/${p}`, { status: 'suspended' })
    return s.call('POST', '/matches', { mode: 'casual', max_players: 2, player_ids: [p] })
  },
  'POST /matches/{match_id}/join match_not_found': (s) => s.call('POST', '/matches/mch_missing/join', { player_id: s.player() }),
  'POST /matches/{match_id}/join player_not_found': (s) => {
    const m = s.b(s.call('POST', '/matches', { mode: 'casual', max_players: 2 }))
    return s.call('POST', `/matches/${m.id}/join`, { player_id: 'plr_missing' })
  },
  'POST /matches/{match_id}/start match_not_found': (s) => s.call('POST', '/matches/mch_missing/start'),
  'POST /matches/{match_id}/end match_not_found': (s) => s.call('POST', '/matches/mch_missing/end', { results: [{ player_id: s.player(), placement: 1 }] }),
  'POST /matches/{match_id}/cancel match_not_found': (s) => s.call('POST', '/matches/mch_missing/cancel'),
  'POST /leaderboards/{leaderboard_id}/scores leaderboard_not_found': (s) => s.call('POST', '/leaderboards/nope/scores', { player_id: s.player(), score: 1 }),
  'GET /leaderboards/{leaderboard_id}/entries leaderboard_not_found': (s) => s.call('GET', '/leaderboards/nope/entries'),
  'GET /leaderboards/{leaderboard_id}/players/{player_id} leaderboard_not_found': (s) => s.call('GET', `/leaderboards/nope/players/${s.player()}`),
  'GET /players/{player_id}/inventory player_not_found': (s) => s.call('GET', '/players/plr_missing/inventory'),
  'POST /players/{player_id}/inventory/grants player_not_found': (s) => s.call('POST', '/players/plr_missing/inventory/grants', { item_id: 'itm_coin', quantity: 1 }),
  'POST /players/{player_id}/inventory/consume player_not_found': (s) => s.call('POST', '/players/plr_missing/inventory/consume', { item_id: 'itm_coin', quantity: 1 }),
  'GET /players/{player_id}/achievements player_not_found': (s) => s.call('GET', '/players/plr_missing/achievements'),
  'POST /purchases player_not_found': (s) => s.call('POST', '/purchases', { player_id: 'plr_missing', item_id: 'itm_gold_pack', quantity: 1, payment_token: 'tok_test_success' }),
  'POST /purchases/{purchase_id}/refund purchase_not_found': (s) => s.call('POST', '/purchases/pur_missing/refund', { reason: 'other' }),
  'GET /players/{player_id}/entitlements player_not_found': (s) => s.call('GET', '/players/plr_missing/entitlements'),
}

test('the sandbox implements exactly the operations in the spec', () => {
  assert.deepEqual([...OPERATIONS].sort(), specOps.map((o) => o.key).sort())
})

for (const { key, op } of specOps) {
  test(`${key}: success status and response shape match the spec`, () => {
    const run = success[key]
    assert.ok(run, `no success scenario for ${key}`)
    const response = run(scene())
    const expected = Number(Object.keys(op.responses)[0])
    assert.equal(response.status, expected, JSON.stringify(response.body))
    const schema = op.responses[expected].content?.['application/json']?.schema
    assert.ok(schema, `${key}: the spec has no response schema`)
    const body = response.body as Record<string, any>
    if (schema.$ref) checkObject(key, body, resolve(schema.$ref))
    else {
      // A list: the envelope, and every item against its schema.
      assert.equal(schema.properties.object.const, 'list')
      assert.deepEqual(Object.keys(body).sort(), Object.keys(schema.properties).sort(), `${key}: list envelope`)
      assert.ok(Array.isArray(body.data))
      assert.equal(typeof body.has_more, 'boolean')
      assert.ok(body.next_cursor === null || typeof body.next_cursor === 'string')
      for (const item of body.data) checkObject(`${key} item`, item, resolve(schema.properties.data.items.$ref))
    }
  })

  for (const { code, status } of op['x-error-codes'] as Array<{ code: string; status: number }>) {
    test(`${key}: ${code} returns ${status}`, () => {
      const run = errors[`${key} ${code}`]
      assert.ok(run, `no error scenario for ${key} ${code}`)
      const response = run(scene())
      assert.equal(response.status, status, JSON.stringify(response.body))
      assert.equal((response.body as any).error.code, code)
    })
  }
}

test('POST /matches/{match_id}/end: players can share a placement, and results come back in placement order', () => {
  const s = scene()
  const m = s.active()
  const draw = s.call('POST', `/matches/${m.id}/end`, { results: [{ player_id: m.ids[0], placement: 1 }, { player_id: m.ids[1], placement: 1 }] })
  assert.equal(draw.status, 200, JSON.stringify(draw.body))
  assert.deepEqual((s.b(draw).results as Array<{ placement: number }>).map((r) => r.placement), [1, 1])
  const other = s.active()
  const gap = s.call('POST', `/matches/${other.id}/end`, { results: [{ player_id: other.ids[0], placement: 5 }, { player_id: other.ids[1], placement: 2 }] })
  assert.equal(gap.status, 200, JSON.stringify(gap.body))
  assert.deepEqual((s.b(gap).results as Array<{ placement: number }>).map((r) => r.placement), [2, 5])
})
