'use client'
import { useEffect, useRef, useState } from 'react'
import { ArenaError } from '../../sdk/index.ts'
import type { Match, Player } from '../../sdk/index.ts'
import { ACHIEVEMENTS } from '../../sandbox/catalog.ts'
import type { GameProps } from './types.ts'
import { MAX_LEVEL, PADS, playBot, press, shown, startGame, statsOf, stepMs } from '../../game/memory/engine.ts'
import type { Game, PressResult, Stats } from '../../game/memory/engine.ts'
import { closeMatch, findRival, openMatch } from '../../game/flow.ts'
import type { Finished } from '../../game/flow.ts'
import { memoryReport } from '../../game/memory/report.ts'

const RIVAL_SKILL = 0.6
type Phase = 'idle' | 'opening' | 'showing' | 'input' | 'closing' | 'done'
type Result = { mine: Stats; theirs: Stats; finished: Finished; won: boolean }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const errorText = (err: unknown) => (err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.')

export default function Memory({ client, player, profile, skin, onChange }: GameProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(1)
  const [score, setScore] = useState(0)
  const [spare, setSpare] = useState(0)
  const [lit, setLit] = useState<number | null>(null)
  const [flash, setFlash] = useState<{ pad: number; kind: 'hit' | 'decoy'; n: number } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useBooster, setUseBooster] = useState(false)

  const gameRef = useRef<Game | null>(null)
  const seedRef = useRef(0)
  const matchRef = useRef<Match | null>(null)
  const rivalRef = useRef<Player | null>(null)
  const runRef = useRef(0) // changes when a new game starts or the component unmounts, which stops old timers
  const flashCount = useRef(0)

  useEffect(() => {
    return () => {
      runRef.current += 1
    }
  }, [])

  const boosters = profile?.inventory.find((i) => i.item_id === 'itm_gold_pack')?.quantity ?? 0

  async function start() {
    setError(null)
    setResult(null)
    setNote(null)
    setPhase('opening')
    const run = ++runRef.current
    try {
      const rival = await findRival(client.arena)
      const boosted = useBooster && boosters > 0
      if (boosted) await client.arena.inventory.consume(player.id, { item_id: 'itm_gold_pack', quantity: 1 })
      const match = await openMatch(client.arena, player, rival)
      if (run !== runRef.current) return
      seedRef.current = Math.floor(Math.random() * 2 ** 31)
      gameRef.current = startGame(seedRef.current, boosted ? 1 : 0)
      matchRef.current = match
      rivalRef.current = rival
      setLevel(1)
      setScore(0)
      setSpare(boosted ? 1 : 0)
      if (boosted) onChange()
      await showLevel(run)
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  async function showLevel(run: number) {
    const game = gameRef.current
    if (!game) return
    setPhase('showing')
    await sleep(600)
    const step = stepMs(game.level)
    for (const pad of shown(game)) {
      if (run !== runRef.current) return
      setLit(pad)
      await sleep(step * 0.7)
      setLit(null)
      await sleep(step * 0.3)
    }
    if (run !== runRef.current) return
    setPhase('input')
  }

  function tap(pad: number) {
    const game = gameRef.current
    if (phase !== 'input' || !game) return
    const result: PressResult = press(game, pad)
    flashCount.current += 1
    setFlash({ pad, kind: result === 'retry' || result === 'over' ? 'decoy' : 'hit', n: flashCount.current })
    setScore(game.score)
    setSpare(game.spare)
    if (result === 'level') {
      setLevel(game.level)
      setNote(null)
      void showLevel(runRef.current)
    } else if (result === 'retry') {
      setNote('Wrong pad. Your booster gave you a second chance: watch again.')
      void showLevel(runRef.current)
    } else if (result === 'win' || result === 'over') {
      void end()
    }
  }

  async function end() {
    const game = gameRef.current
    const match = matchRef.current
    const rival = rivalRef.current
    if (!game || !match || !rival) return
    const run = runRef.current
    setPhase('closing')
    const mine = statsOf(game)
    const theirs = playBot(seedRef.current, RIVAL_SKILL, seedRef.current + 1)
    try {
      const finished = await closeMatch(client.arena, memoryReport(match, player, rival, mine, theirs))
      if (run !== runRef.current) return
      setResult({ mine, theirs, finished, won: game.won })
      setPhase('done')
      onChange()
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  const input = phase === 'input'
  const names = new Map(ACHIEVEMENTS.map((a) => [a.id, a.name]))
  const status = phase === 'showing' ? 'Watch the pattern' : phase === 'input' ? 'Your turn' : phase === 'opening' ? 'Opening match…' : phase === 'closing' ? 'Sending results…' : ''

  return (
    <section className="card">
      <div className="hud">
        <span>Score <strong>{score}</strong></span>
        <span>Level <strong>{level}</strong> / {MAX_LEVEL}</span>
        <span>Second chances <strong>{spare}</strong></span>
      </div>
      <p className="status" aria-live="polite">{status}</p>
      <div className={`board${skin ? ' skin' : ''}`} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {Array.from({ length: PADS }, (_, pad) => (
          <button
            key={pad}
            type="button"
            className={`cell${lit === pad ? ' target' : ''}`}
            onPointerDown={() => tap(pad)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                tap(pad)
              }
            }}
            aria-label={`Pad ${pad + 1}${lit === pad ? ', lit' : ''}`}
            tabIndex={input ? 0 : -1}
          >
            {flash && flash.pad === pad ? <span key={flash.n} className={`flash ${flash.kind}`} /> : null}
          </button>
        ))}
      </div>
      <p className="muted hint">{note ?? 'Repeat the pattern in the same order. It gets one pad longer each level.'}</p>

      {phase === 'idle' || phase === 'done' ? (
        <div className="controls">
          <button onClick={start}>{phase === 'done' ? 'Play again' : 'Start ranked match'}</button>
          {boosters > 0 ? (
            <label className="check">
              <input type="checkbox" checked={useBooster} onChange={(e) => setUseBooster(e.target.checked)} /> Use a booster pack for a second chance ({boosters} left)
            </label>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <div className="result">
          <h2>{result.finished.draw ? 'Draw' : result.finished.won ? 'You won' : 'RivalBot won'}</h2>
          <p>You {result.mine.score} · RivalBot {result.theirs.score}</p>
          <ul className="plain">
            <li>{result.won ? 'You finished every level.' : `You completed ${result.mine.completed} level${result.mine.completed === 1 ? '' : 's'}.`}</li>
            <li>Weekly rank {result.finished.bestRank} · total rank {result.finished.totalRank}</li>
            <li>+{result.finished.coins} coins</li>
            {result.finished.newAchievements.map((id) => (
              <li key={id} className="notice">Achievement unlocked: {names.get(id) ?? id}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
