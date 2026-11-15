'use client'
import { useState } from 'react'
import { ArenaError } from '../sdk/index.ts'
import type { Player } from '../sdk/index.ts'
import type { GameClient } from '../game/client.ts'

export default function Join({ client, onJoined }: { client: GameClient; onJoined: (player: Player) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onJoined(await client.arena.players.create({ display_name: name.trim() }))
    } catch (err) {
      setError(err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card join" onSubmit={submit}>
      <h2>Pick a player name</h2>
      <p className="muted">This calls <code>POST /v1/players</code>. Try a name that is too short, or NovaKnight, to see the API errors.</p>
      <label htmlFor="name">Display name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create player'}</button>
    </form>
  )
}
