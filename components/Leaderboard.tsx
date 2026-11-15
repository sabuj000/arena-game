'use client'
import { useEffect, useState } from 'react'
import { ArenaError } from '../sdk/index.ts'
import type { LeaderboardEntry, Player } from '../sdk/index.ts'
import type { GameClient } from '../game/client.ts'
import { loadBoard } from '../game/flow.ts'
import { GAMES } from '../game/registry.ts'

type Kind = 'best' | 'total'
const TITLES: Record<Kind, string> = { best: 'Best score', total: 'Total score' }

export default function Leaderboard({ client, player, version }: { client: GameClient; player: Player; version: number }) {
  const [gameId, setGameId] = useState(GAMES[0].id)
  const [kind, setKind] = useState<Kind>('best')
  const board = (GAMES.find((g) => g.id === gameId) ?? GAMES[0]).boards[kind]
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null)
  const [mine, setMine] = useState<LeaderboardEntry | null>(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    ;(async () => {
      const top = await loadBoard(client.arena, board)
      let own: LeaderboardEntry | null = null
      try {
        own = await client.arena.leaderboards.playerEntry(board, player.id)
      } catch (err) {
        if (!(err instanceof ArenaError && err.code === 'entry_not_found')) throw err
      }
      if (!cancelled) {
        setRows(top)
        setMine(own)
      }
    })().catch(() => {
      if (!cancelled) setRows([])
    })
    return () => {
      cancelled = true
    }
  }, [client, player.id, board, version])

  return (
    <section className="card">
      {GAMES.length > 1 ? (
        <div className="tabs small" role="tablist" aria-label="Game">
          {GAMES.map((g) => (
            <button key={g.id} role="tab" aria-selected={gameId === g.id} className={gameId === g.id ? 'on' : ''} onClick={() => setGameId(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="tabs small" role="tablist" aria-label="Board">
        {(['best', 'total'] as const).map((id) => (
          <button key={id} role="tab" aria-selected={kind === id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)}>
            {TITLES[id]}
          </button>
        ))}
      </div>
      {rows === null ? <p className="muted">Loading…</p> : null}
      {rows ? (
        <ol className="rows">
          {rows.map((r) => (
            <li key={r.player_id} className={r.player_id === player.id ? 'me' : ''}>
              <span className="rank">{r.rank}</span>
              <span className="who">{r.display_name ?? r.player_id}</span>
              <span className="score">{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {rows && mine && !rows.some((r) => r.player_id === player.id) ? (
        <p className="muted">You are rank {mine.rank} with {mine.score.toLocaleString()}.</p>
      ) : null}
      {rows && !mine ? <p className="muted">Play a round to get on this board.</p> : null}
    </section>
  )
}
