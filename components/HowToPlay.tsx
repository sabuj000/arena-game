'use client'
import { useEffect, useState } from 'react'
import type { GameInfo } from '../game/registry.ts'

const SEEN_PREFIX = 'arena-howto-seen-'

function wasSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + id) === '1'
  } catch {
    return false
  }
}
function markSeen(id: string) {
  try {
    window.localStorage.setItem(SEEN_PREFIX + id, '1')
  } catch {
    // Storage is blocked. The panel opens each time, which is harmless.
  }
}

type Props = {
  game: GameInfo
  practicing: boolean
  busy: boolean
  onPractice: () => void
  onExitPractice: () => void
}

// Short instructions for a game, and the practice round. Open the first time a player sees the game.
export default function HowToPlay({ game, practicing, busy, onPractice, onExitPractice }: Props) {
  const [open, setOpen] = useState(true)
  const [first, setFirst] = useState(false)

  useEffect(() => {
    const seen = wasSeen(game.id)
    setFirst(!seen)
    setOpen(!seen)
    markSeen(game.id)
  }, [game.id])

  const how = game.howTo
  return (
    <details className="howto" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>How to play</summary>
      <dl>
        <dt>Goal</dt>
        <dd>{how.goal}</dd>
        <dt>On a phone</dt>
        <dd>{how.touch}</dd>
        <dt>With a keyboard</dt>
        <dd>{how.keyboard}</dd>
        <dt>Scoring</dt>
        <dd>{how.scoring}</dd>
        <dt>Booster pack</dt>
        <dd>{how.booster}</dd>
      </dl>
      {practicing ? (
        <button type="button" className="secondary" onClick={onExitPractice}>Back to the real game</button>
      ) : (
        <>
          {first ? (
            <p className="muted">First time here? Try a practice round. It uses a throwaway sandbox, so your score, coins and shop items do not change.</p>
          ) : null}
          <button type="button" className={first ? '' : 'secondary'} disabled={busy} onClick={onPractice}>
            {busy ? 'Starting…' : 'Practice round'}
          </button>
        </>
      )}
    </details>
  )
}
