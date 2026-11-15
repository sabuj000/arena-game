'use client'
import { useState } from 'react'
import type { Player } from '../sdk/index.ts'
import { createPracticeClient } from '../game/client.ts'
import type { GameClient } from '../game/client.ts'
import { GAMES } from '../game/registry.ts'
import HowToPlay from './HowToPlay.tsx'
import { GAME_COMPONENTS } from './games/index.ts'
import type { GameProps } from './games/types.ts'

type Practice = { client: GameClient; player: Player }

export default function Hub(props: GameProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [practice, setPractice] = useState<Practice | null>(null)
  const [starting, setStarting] = useState(false)
  const [practiceError, setPracticeError] = useState<string | null>(null)
  const game = GAMES.find((g) => g.id === selected)
  const Component = game ? GAME_COMPONENTS[game.id] : undefined

  async function startPractice() {
    setStarting(true)
    setPracticeError(null)
    try {
      const client = createPracticeClient()
      const player = await client.arena.players.create({ display_name: 'Practice' })
      setPractice({ client, player })
    } catch {
      setPracticeError('Could not start a practice round. Try again.')
    } finally {
      setStarting(false)
    }
  }

  if (game && Component) {
    return (
      <div>
        <button className="secondary back" onClick={() => (setPractice(null), setSelected(null))}>← All games</button>
        <h2 className="game-title">{game.name}</h2>
        <HowToPlay key={game.id} game={game} practicing={practice !== null} busy={starting} onPractice={() => void startPractice()} onExitPractice={() => setPractice(null)} />
        {practiceError ? <p className="error">{practiceError}</p> : null}
        {practice ? (
          <>
            <p className="practice-banner" role="status">
              <strong>Practice mode.</strong> This round runs in a throwaway sandbox. Your score, coins, shop items and leaderboard rank do not change, and the API log does not show these calls.
            </p>
            <Component key="practice" client={practice.client} player={practice.player} profile={null} skin={false} onChange={() => undefined} />
          </>
        ) : (
          <Component key="real" {...props} />
        )}
      </div>
    )
  }

  return (
    <section>
      <h2>Games</h2>
      <p className="muted">One player, one inventory and one profile across every game. Each game has its own leaderboards.</p>
      <ul className="games">
        {GAMES.map((g) => (
          <li key={g.id} className="card">
            <h3>{g.name}</h3>
            <p className="muted">{g.blurb}</p>
            <button onClick={() => setSelected(g.id)}>Play</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
