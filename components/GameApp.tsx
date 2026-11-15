'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Player } from '../sdk/index.ts'
import { PLAYER_KEY, createGameClient } from '../game/client.ts'
import type { GameClient } from '../game/client.ts'
import { loadProfile } from '../game/flow.ts'
import type { Profile as ProfileData } from '../game/flow.ts'
import ApiLog from './ApiLog.tsx'
import type { LogEntry } from './ApiLog.tsx'
import Join from './Join.tsx'
import Leaderboard from './Leaderboard.tsx'
import Play from './Play.tsx'
import Profile from './Profile.tsx'
import Shop from './Shop.tsx'

type Tab = 'play' | 'shop' | 'board' | 'profile'
const TABS: Array<[Tab, string]> = [['play', 'Play'], ['shop', 'Shop'], ['board', 'Leaderboard'], ['profile', 'Profile']]

function remember(id: string | null) {
  try {
    if (id) window.localStorage.setItem(PLAYER_KEY, id)
    else window.localStorage.removeItem(PLAYER_KEY)
  } catch {
    // Storage is blocked. The player is kept for this page view only.
  }
}

export default function GameApp() {
  const [client, setClient] = useState<GameClient | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [events, setEvents] = useState<LogEntry[]>([])
  const [tab, setTab] = useState<Tab>('play')
  const [version, setVersion] = useState(0)
  const nextId = useRef(0)

  useEffect(() => {
    const created = createGameClient((event) => {
      nextId.current += 1
      const entry = { ...event, id: nextId.current }
      setEvents((prev) => [entry, ...prev].slice(0, 40))
    })
    let saved: string | null = null
    try {
      saved = window.localStorage.getItem(PLAYER_KEY)
    } catch {
      saved = null
    }
    ;(async () => {
      if (saved) {
        try {
          setPlayer(await created.arena.players.retrieve(saved))
        } catch {
          remember(null)
        }
      }
      setClient(created)
    })()
  }, [])

  const refresh = useCallback(async () => {
    if (!client || !player) return
    try {
      setProfile(await loadProfile(client.arena, player))
    } catch {
      // The profile is only a display. Leave the last one in place.
    }
    setVersion((v) => v + 1)
  }, [client, player])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function reset() {
    client?.sandbox.reset()
    remember(null)
    setPlayer(null)
    setProfile(null)
    setEvents([])
    setTab('play')
  }

  if (!client) return <p className="muted center">Starting the sandbox…</p>

  const coins = profile?.inventory.find((i) => i.item_id === 'itm_coin')?.quantity ?? 0

  return (
    <div className="layout">
      <main>
        {player ? (
          <>
            <div className="bar">
              <strong>{player.display_name}</strong>
              <span className="muted">{coins} coins</span>
            </div>
            <div className="tabs" role="tablist">
              {TABS.map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'play' ? <Play client={client} player={player} profile={profile} skin={Boolean(profile?.skins.includes('itm_arena_skin'))} onChange={refresh} /> : null}
            {tab === 'shop' ? <Shop client={client} player={player} profile={profile} onChange={refresh} /> : null}
            {tab === 'board' ? <Leaderboard client={client} player={player} version={version} /> : null}
            {tab === 'profile' ? <Profile player={player} profile={profile} onReset={reset} /> : null}
          </>
        ) : (
          <Join
            client={client}
            onJoined={(p) => {
              remember(p.id)
              setPlayer(p)
            }}
          />
        )}
      </main>
      <ApiLog events={events} />
    </div>
  )
}
