'use client'
import { useEffect, useRef, useState } from 'react'
import { ArenaError } from '../../sdk/index.ts'
import type { Match, Player } from '../../sdk/index.ts'
import { ACHIEVEMENTS } from '../../sandbox/catalog.ts'
import type { GameProps } from './types.ts'
import { EARLY, NONE, REACT_WINDOW_MS, WIN_ROUNDS, isOver, nextWait, react, record, startGame, systemPress, winnerOf } from '../../game/duel/engine.ts'
import type { Game, Mode, Press } from '../../game/duel/engine.ts'
import { closeMatch, findRival } from '../../game/flow.ts'
import type { Finished } from '../../game/flow.ts'
import { openMatch } from '../../game/flow.ts'
import { duelReport } from '../../game/duel/report.ts'

const SYSTEM_SKILL = 0.6
type Phase = 'setup' | 'opening' | 'wait' | 'draw' | 'between' | 'closing' | 'done'
type Result = { finished: Finished; game: Game; versus: boolean; names: [string, string] }
type Side = 'a' | 'b'

const errorText = (err: unknown) => (err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.')
const describe = (p: Press) => (p.kind === 'react' ? `${p.ms} ms` : p.kind === 'early' ? 'false start' : 'no press')

export default function Duel({ client, player, profile, onChange }: GameProps) {
  const [mode, setMode] = useState<Mode>('solo')
  const [secondName, setSecondName] = useState('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [wins, setWins] = useState<[number, number]>([0, 0])
  const [points, setPoints] = useState<[number, number]>([0, 0])
  const [message, setMessage] = useState('')
  const [names, setNames] = useState<[string, string]>([player.display_name, 'System'])
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useBooster, setUseBooster] = useState(false)

  const gameRef = useRef<Game | null>(null)
  const phaseRef = useRef<Phase>('setup')
  const matchRef = useRef<Match | null>(null)
  const rivalRef = useRef<Player | null>(null)
  const versusRef = useRef(false)
  const namesRef = useRef<[string, string]>([player.display_name, 'System'])
  const pressesRef = useRef<{ a: Press | null; b: Press | null }>({ a: null, b: null })
  const drawAtRef = useRef(0)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const resolvedRef = useRef(true)
  const runRef = useRef(0)
  const pressRef = useRef<(side: Side) => void>(() => undefined)

  function go(next: Phase) {
    phaseRef.current = next
    setPhase(next)
  }
  function later(fn: () => void, ms: number) {
    timersRef.current.push(setTimeout(fn, ms))
  }
  function clearTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.repeat) return
      const key = e.key.toLowerCase()
      const playing = phaseRef.current === 'wait' || phaseRef.current === 'draw'
      if (key === 'a' || (key === ' ' && !versusRef.current)) {
        if (playing) e.preventDefault()
        pressRef.current('a')
      } else if (key === 'l' && versusRef.current) {
        pressRef.current('b')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      runRef.current += 1
      clearTimers()
    }
  }, [])

  const boosters = profile?.inventory.find((i) => i.item_id === 'itm_gold_pack')?.quantity ?? 0

  async function start() {
    setError(null)
    setResult(null)
    go('opening')
    const run = ++runRef.current
    try {
      const versus = mode === 'versus'
      let rival: Player
      if (versus) {
        const wanted = secondName.trim()
        const found = await client.arena.players.list({ display_name: wanted })
        rival = found.data[0] ?? (await client.arena.players.create({ display_name: wanted }))
        if (rival.id === player.id) throw new Error('Player 2 must be a different player.')
      } else {
        rival = await findRival(client.arena)
      }
      const boosted = useBooster && boosters > 0
      if (boosted) await client.arena.inventory.consume(player.id, { item_id: 'itm_gold_pack', quantity: 1 })
      const match = await openMatch(client.arena, player, rival)
      if (run !== runRef.current) return
      const seed = Math.floor(Math.random() * 2 ** 31)
      gameRef.current = startGame(seed, mode, boosted ? 1 : 0)
      matchRef.current = match
      rivalRef.current = rival
      versusRef.current = versus
      namesRef.current = [player.display_name, versus ? rival.display_name : 'System']
      setNames(namesRef.current)
      setWins([0, 0])
      setPoints([0, 0])
      if (boosted) onChange()
      beginRound()
    } catch (err) {
      if (run !== runRef.current) return
      setError(err instanceof Error && !(err instanceof ArenaError) ? err.message : errorText(err))
      go('setup')
    }
  }

  function beginRound() {
    const game = gameRef.current
    if (!game) return
    pressesRef.current = { a: null, b: null }
    resolvedRef.current = false
    setMessage('Wait for the signal. Pressing early loses the round.')
    go('wait')
    const wait = nextWait(game)
    const plan = versusRef.current ? null : systemPress(game.seed, game.attempt, SYSTEM_SKILL)
    if (plan && plan.kind === 'early') later(() => press('b', EARLY), wait * 0.6)
    later(() => {
      drawAtRef.current = performance.now()
      go('draw')
      setMessage('DRAW!')
      if (plan && plan.kind === 'react') later(() => press('b', react(plan.ms)), plan.ms)
      later(() => resolve(), REACT_WINDOW_MS)
    }, wait)
  }

  // A side pressed. `forced` is set when the system presses.
  function press(side: Side, forced?: Press) {
    if (resolvedRef.current) return
    const current = phaseRef.current
    if (current !== 'wait' && current !== 'draw') return
    if (pressesRef.current[side] !== null) return
    const value = forced ?? (current === 'wait' ? EARLY : react(Math.max(0, Math.round(performance.now() - drawAtRef.current))))
    pressesRef.current[side] = value
    const { a, b } = pressesRef.current
    const bothIn = a !== null && b !== null
    // With two people, the first valid press wins at once: the other can only be slower.
    if (value.kind === 'early' || bothIn || (versusRef.current && value.kind === 'react')) resolve()
  }
  pressRef.current = (side) => press(side)

  function resolve() {
    const game = gameRef.current
    if (!game || resolvedRef.current) return
    resolvedRef.current = true
    clearTimers()
    const a = pressesRef.current.a ?? NONE
    const b = pressesRef.current.b ?? NONE
    const recorded = record(game, a, b)
    go('between')
    if (recorded.replay) {
      setMessage('False start forgiven by your booster. The round is replayed.')
      later(beginRound, 1800)
      return
    }
    setWins([...game.wins])
    setPoints([...game.score])
    const [n1, n2] = namesRef.current
    const w = recorded.outcome?.winner ?? 0
    setMessage(`${w === 0 ? 'No winner this round' : `${w === 1 ? n1 : n2} wins the round`}. ${n1}: ${describe(a)} · ${n2}: ${describe(b)}`)
    if (isOver(game)) later(() => void end(), 1800)
    else later(beginRound, 2000)
  }

  async function end() {
    const game = gameRef.current
    const match = matchRef.current
    const rival = rivalRef.current
    if (!game || !match || !rival) return
    const run = runRef.current
    go('closing')
    try {
      const finished = await closeMatch(client.arena, duelReport(game, match, player, rival, versusRef.current))
      if (run !== runRef.current) return
      setResult({ finished, game, versus: versusRef.current, names: namesRef.current })
      go('done')
      onChange()
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      go('setup')
    }
  }

  const live = phase === 'wait' || phase === 'draw' || phase === 'between'
  const achievementNames = new Map(ACHIEVEMENTS.map((a) => [a.id, a.name]))
  const winnerName = result ? ([null, result.names[0], result.names[1]] as const)[winnerOf(result.game)] : null

  return (
    <section className="card">
      {live || phase === 'closing' || phase === 'opening' ? (
        <>
          <div className="hud">
            <span>{names[0]} <strong>{wins[0]}</strong> <span className="muted">({points[0]})</span></span>
            <span className="muted">First to {WIN_ROUNDS}</span>
            <span>{names[1]} <strong>{wins[1]}</strong> <span className="muted">({points[1]})</span></span>
          </div>
          <div className={`signal ${phase === 'draw' ? 'go' : phase === 'wait' ? 'stop' : ''}`} role="status" aria-live="assertive">
            {phase === 'opening' ? 'Opening match…' : phase === 'closing' ? 'Sending results…' : phase === 'draw' ? 'DRAW!' : phase === 'wait' ? 'Wait…' : 'Round over'}
          </div>
          <p className="muted hint" aria-live="polite">{message}</p>
          <div className={`duelpads${versusRef.current ? '' : ' solo'}`}>
            <button type="button" className="duelpad" disabled={!live} onPointerDown={() => press('a')}>
              {names[0]}
              <small>{versusRef.current ? 'Tap or key A' : 'Tap here, or press A or Space'}</small>
            </button>
            {versusRef.current ? (
              <button type="button" className="duelpad" disabled={!live} onPointerDown={() => press('b')}>
                {names[1]}
                <small>Tap or key L</small>
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {phase === 'setup' || phase === 'done' ? (
        <div>
          <fieldset className="modes">
            <legend>Players</legend>
            <label className="check"><input type="radio" name="mode" checked={mode === 'solo'} onChange={() => setMode('solo')} /> 1 player, against the system</label>
            <label className="check"><input type="radio" name="mode" checked={mode === 'versus'} onChange={() => setMode('versus')} /> 2 players on this device</label>
          </fieldset>
          {mode === 'versus' ? (
            <div>
              <label htmlFor="p2">Player 2 name</label>
              <input id="p2" value={secondName} onChange={(e) => setSecondName(e.target.value)} autoComplete="off" />
              <p className="muted">If this name already exists in the sandbox, that player joins. Otherwise a new player is created. Player 1 presses A and player 2 presses L, or tap your own button.</p>
            </div>
          ) : (
            <p className="muted">Press A, Space or your button when the signal says DRAW. The system presses by itself.</p>
          )}
          <div className="controls">
            <button onClick={start} disabled={mode === 'versus' && secondName.trim().length < 3}>{phase === 'done' ? 'Play again' : 'Start ranked match'}</button>
            {boosters > 0 ? (
              <label className="check">
                <input type="checkbox" checked={useBooster} onChange={(e) => setUseBooster(e.target.checked)} /> Player 1 uses a booster pack: one false start is forgiven ({boosters} left)
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <div className="result">
          <h2>{winnerName ? `${winnerName} wins` : 'Draw'}</h2>
          <p>
            {result.names[0]} {result.game.wins[0]} ({result.game.score[0]}) · {result.names[1]} {result.game.wins[1]} ({result.game.score[1]})
          </p>
          <ul className="plain">
            <li>{result.names[0]}: weekly rank {result.finished.bestRank} · total rank {result.finished.totalRank} · +{result.finished.coins} coins</li>
            {result.finished.newAchievements.map((id) => (
              <li key={id} className="notice">{result.names[0]} unlocked: {achievementNames.get(id) ?? id}</li>
            ))}
            {result.finished.rival ? (
              <li>{result.names[1]}: weekly rank {result.finished.rival.bestRank} · total rank {result.finished.rival.totalRank} · +{result.finished.rival.coins} coins</li>
            ) : null}
            {result.finished.rival?.newAchievements.map((id) => (
              <li key={`p2-${id}`} className="notice">{result.names[1]} unlocked: {achievementNames.get(id) ?? id}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
