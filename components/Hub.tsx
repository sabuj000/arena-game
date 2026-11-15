'use client'
import { useState } from 'react'
import { GAMES } from '../game/registry.ts'
import { GAME_COMPONENTS } from './games/index.ts'
import type { GameProps } from './games/types.ts'

export default function Hub(props: GameProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const game = GAMES.find((g) => g.id === selected)
  const Component = game ? GAME_COMPONENTS[game.id] : undefined

  if (game && Component) {
    return (
      <div>
        <button className="secondary back" onClick={() => setSelected(null)}>← All games</button>
        <h2 className="game-title">{game.name}</h2>
        <Component {...props} />
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
