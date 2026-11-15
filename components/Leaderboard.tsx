'use client'
import { useEffect, useState } from 'react'
import { ArenaError } from '../sdk/index.ts'
import type { LeaderboardEntry, Player } from '../sdk/index.ts'
import type { GameClient } from '../game/client.ts'
import { loadBoard } from '../game/flow.ts'

type BoardId = 'weekly' | 'lifetime'
const TITLES: Record<BoardId, string> = { weekly: 'Weekly best', lifetime: 'Lifetime total' }

export default function Leaderboard({ client, player, version }: { client: GameClient; player: Player; version: number }) {
  const [board, setBoard] = useState<BoardId>('weekly')
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
      <div className="tabs small" role="tablist">
        {(['weekly', 'lifetime'] as const).map((id) => (
          <button key={id} role="tab" aria-selected={board === id} className={board === id ? 'on' : ''} onClick={() => setBoard(id)}>
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
