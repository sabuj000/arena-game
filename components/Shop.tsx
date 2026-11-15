'use client'
import { useCallback, useEffect, useState } from 'react'
import { ArenaError } from '../sdk/index.ts'
import type { Player, Purchase } from '../sdk/index.ts'
import type { GameClient } from '../game/client.ts'
import { PRICES, buy } from '../game/flow.ts'
import type { Profile } from '../game/flow.ts'

const ITEMS = [
  { id: 'itm_gold_pack', name: 'Booster pack', blurb: 'Start a round with a 5x combo. Used up when you play.' },
  { id: 'itm_arena_skin', name: 'Neon skin', blurb: 'A neon look for the board. One per player.' },
]

export default function Shop({ client, player, profile, onChange }: { client: GameClient; player: Player; profile: Profile | null; onChange: () => void }) {
  const [declined, setDeclined] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [purchases, setPurchases] = useState<Purchase[]>([])

  const reload = useCallback(async () => {
    setPurchases((await client.arena.purchases.list({ player_id: player.id, limit: 5 })).data)
  }, [client, player.id])

  useEffect(() => {
    reload().catch(() => setPurchases([]))
  }, [reload])

  async function purchase(itemId: string) {
    setBusy(itemId)
    setMessage(null)
    try {
      const p = await buy(client.arena, player, itemId, declined ? 'tok_test_declined' : 'tok_test_success')
      setMessage({ kind: 'ok', text: `Purchase ${p.id} ${p.status}.` })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.' })
    } finally {
      setBusy(null)
      onChange()
      reload().catch(() => undefined)
    }
  }

  async function refund(id: string) {
    setBusy(id)
    setMessage(null)
    try {
      const p = await client.arena.purchases.refund(id, { reason: 'customer_request' })
      setMessage({ kind: 'ok', text: `Refunded ${p.id}. Items taken back: ${p.refund?.revoked_quantity ?? 0}.` })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.' })
    } finally {
      setBusy(null)
      onChange()
      reload().catch(() => undefined)
    }
  }

  return (
    <section className="card">
      <h2>Shop</h2>
      <p className="muted">Payments are fake. The sandbox accepts the test token <code>tok_test_success</code>, or <code>tok_test_declined</code> to simulate a decline.</p>
      <label className="check">
        <input type="checkbox" checked={declined} onChange={(e) => setDeclined(e.target.checked)} /> Use the declined test card
      </label>
      <ul className="shop">
        {ITEMS.map((item) => {
          const owned = item.id === 'itm_arena_skin' && profile?.skins.includes(item.id)
          return (
            <li key={item.id}>
              <div>
                <strong>{item.name}</strong> <span className="muted">{PRICES[item.id]}</span>
                <p className="muted">{item.blurb}</p>
              </div>
              <button disabled={busy !== null || owned} onClick={() => purchase(item.id)}>{owned ? 'Owned' : busy === item.id ? 'Paying…' : 'Buy'}</button>
            </li>
          )
        })}
      </ul>
      {message ? <p className={message.kind === 'ok' ? 'notice' : 'error'} role="status">{message.text}</p> : null}
      <h3>Recent purchases</h3>
      {purchases.length === 0 ? <p className="muted">None yet.</p> : null}
      <ul className="plain">
        {purchases.map((p) => (
          <li key={p.id} className="purchase">
            <span>{p.id} · {p.item_id.replace('itm_', '').replace(/_/g, ' ')} · {p.status}</span>
            {p.status === 'succeeded' ? <button className="secondary" disabled={busy !== null} onClick={() => refund(p.id)}>Refund</button> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
