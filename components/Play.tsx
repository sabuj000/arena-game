'use client'
import { useEffect, useRef, useState } from 'react'
import { ArenaError } from '../sdk/index.ts'
import type { Player } from '../sdk/index.ts'
import { ACHIEVEMENTS } from '../sandbox/catalog.ts'
import type { GameClient } from '../game/client.ts'
import { BOOSTER_COMBO, GRID, ROUND_MS, accuracy, advance, averageReaction, click, createRound, finish, playBot, startGame } from '../game/engine.ts'
import type { ClickResult, Game, Round, Spawn, Stats } from '../game/engine.ts'
import { closeMatch, findRival, openMatch } from '../game/flow.ts'
import type { Finished, Profile } from '../game/flow.ts'
import type { Match } from '../sdk/index.ts'

const RIVAL_SKILL = 0.5
type Phase = 'idle' | 'opening' | 'countdown' | 'playing' | 'closing' | 'done'
type Result = { mine: Stats; theirs: Stats; finished: Finished }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const visibleAt = (game: Game, t: number): Spawn[] => game.round.spawns.filter((s) => !game.resolved.has(s.id) && t >= s.at && t < s.at + s.life)
const errorText = (err: unknown) => (err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.')

export default function Play({ client, player, profile, skin, onChange }: { client: GameClient; player: Player; profile: Profile | null; skin: boolean; onChange: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(3)
  const [t, setT] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [visible, setVisible] = useState<Spawn[]>([])
  const [flash, setFlash] = useState<{ cell: number; kind: ClickResult; n: number } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useBooster, setUseBooster] = useState(false)

  const gameRef = useRef<Game | null>(null)
  const roundRef = useRef<Round | null>(null)
  const matchRef = useRef<Match | null>(null)
  const rivalRef = useRef<Player | null>(null)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const flashCount = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const boosters = profile?.inventory.find((i) => i.item_id === 'itm_gold_pack')?.quantity ?? 0

  async function start() {
    setError(null)
    setResult(null)
    setStats(null)
    setVisible([])
    setPhase('opening')
    try {
      const rival = await findRival(client.arena)
      const boosted = useBooster && boosters > 0
      if (boosted) await client.arena.inventory.consume(player.id, { item_id: 'itm_gold_pack', quantity: 1 })
      const match = await openMatch(client.arena, player, rival)
      const seed = Math.floor(Math.random() * 2 ** 31)
      const round = createRound(seed)
      roundRef.current = round
      matchRef.current = match
      rivalRef.current = rival
      gameRef.current = startGame(round, boosted ? BOOSTER_COMBO : 0)
      if (boosted) onChange()
      for (let n = 3; n > 0; n--) {
        if (!mounted.current) return
        setCount(n)
        setPhase('countdown')
        await sleep(700)
      }
      if (!mounted.current) return
      begin()
    } catch (err) {
      if (!mounted.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  function begin() {
    startRef.current = performance.now()
    setPhase('playing')
    const tick = () => {
      const game = gameRef.current
      if (!game) return
      const now = performance.now() - startRef.current
      if (now >= ROUND_MS) {
        void end()
        return
      }
      advance(game, now)
      setT(now)
      setStats({ ...game.stats })
      setVisible(visibleAt(game, now))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  async function end() {
    cancelAnimationFrame(rafRef.current)
    const game = gameRef.current
    const round = roundRef.current
    const match = matchRef.current
    const rival = rivalRef.current
    if (!game || !round || !match || !rival) return
    setPhase('closing')
    setVisible([])
    const mine = finish(game)
    const theirs = playBot(round, RIVAL_SKILL, round.seed + 1)
    try {
      const finished = await closeMatch(client.arena, match, player, rival, mine, theirs)
      if (!mounted.current) return
      setResult({ mine, theirs, finished })
      setPhase('done')
      onChange()
    } catch (err) {
      if (!mounted.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  function press(cell: number) {
    const game = gameRef.current
    if (phase !== 'playing' || !game) return
    const now = performance.now() - startRef.current
    const kind = click(game, cell, now)
    flashCount.current += 1
    setFlash({ cell, kind, n: flashCount.current })
    setStats({ ...game.stats })
    setVisible(visibleAt(game, now))
  }

  const playing = phase === 'playing'
  const targets = new Map(visible.map((s) => [s.cell, s]))
  const timeLeft = Math.max(0, Math.ceil((ROUND_MS - t) / 1000))
  const names = new Map(ACHIEVEMENTS.map((a) => [a.id, a.name]))

  return (
    <section className="card">
      <div className="hud" aria-live="off">
        <span>Score <strong>{(stats?.score ?? 0).toLocaleString()}</strong></span>
        <span>Combo <strong>{stats?.combo ?? 0}</strong></span>
        <span>Time <strong>{playing ? timeLeft : ROUND_MS / 1000}s</strong></span>
      </div>
      <div className={`board${skin ? ' skin' : ''}`} style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}>
        {Array.from({ length: GRID * GRID }, (_, cell) => {
          const target = targets.get(cell)
          return (
            <button
              key={cell}
              type="button"
              className={`cell${target ? (target.decoy ? ' decoy' : ' target') : ''}`}
              onPointerDown={() => press(cell)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  press(cell)
                }
              }}
              aria-label={target ? (target.decoy ? 'Decoy, do not click' : 'Target, click now') : 'Empty cell'}
              tabIndex={playing ? 0 : -1}
            >
              {flash && flash.cell === cell ? <span key={flash.n} className={`flash ${flash.kind}`} /> : null}
            </button>
          )
        })}
        {phase === 'countdown' ? <div className="overlay">{count}</div> : null}
        {phase === 'opening' ? <div className="overlay small">Opening match…</div> : null}
        {phase === 'closing' ? <div className="overlay small">Sending results…</div> : null}
      </div>
      <p className="muted hint">Click the glowing squares fast. Red squares are decoys: do not click them.</p>

      {phase === 'idle' || phase === 'done' ? (
        <div className="controls">
          <button onClick={start}>{phase === 'done' ? 'Play again' : 'Start ranked match'}</button>
          {boosters > 0 ? (
            <label className="check">
              <input type="checkbox" checked={useBooster} onChange={(e) => setUseBooster(e.target.checked)} /> Use a booster pack ({boosters} left)
            </label>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <div className="result">
          <h2>{result.finished.draw ? 'Draw' : result.finished.won ? 'You won' : 'RivalBot won'}</h2>
          <p>
            You {result.mine.score.toLocaleString()} · RivalBot {result.theirs.score.toLocaleString()}
          </p>
          <ul className="plain">
            <li>Accuracy {Math.round(accuracy(result.mine) * 100)}% · average reaction {averageReaction(result.mine)} ms · best combo {result.mine.bestCombo}</li>
            <li>Weekly rank {result.finished.weeklyRank} · lifetime rank {result.finished.lifetimeRank}</li>
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
