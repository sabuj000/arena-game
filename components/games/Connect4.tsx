'use client'
import { useEffect, useRef, useState } from 'react'
import { ArenaError } from '../../sdk/index.ts'
import type { Match, Player } from '../../sdk/index.ts'
import { ACHIEVEMENTS } from '../../sandbox/catalog.ts'
import { rng } from '../../game/common.ts'
import type { GameProps } from './types.ts'
import { COLS, ROWS, drop, legalColumns, newGame, scoreOf, systemMove, undoRound, winnerOf } from '../../game/connect4/engine.ts'
import type { Game, Mode } from '../../game/connect4/engine.ts'
import { closeMatch, findRival, openMatch } from '../../game/flow.ts'
import type { Finished } from '../../game/flow.ts'
import { connect4Report } from '../../game/connect4/report.ts'

type Phase = 'setup' | 'opening' | 'playing' | 'closing' | 'done'
type Result = { finished: Finished; game: Game; names: [string, string] }
// A copy of what the screen needs, so React redraws when the engine's game changes.
type View = { board: number[]; turn: 0 | 1; status: Game['status']; line: number[]; spare: number; canUndo: boolean }

const errorText = (err: unknown) => (err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.')
const viewOf = (g: Game): View => ({ board: g.board.slice(), turn: g.turn, status: g.status, line: g.line.slice(), spare: g.spare, canUndo: g.spare > 0 && g.turn === 0 && g.history.length >= 2 && g.status === 'playing' })
const COLOURS = ['red', 'yellow'] as const

export default function Connect4({ client, player, profile, onChange }: GameProps) {
  const [mode, setMode] = useState<Mode>('solo')
  const [secondName, setSecondName] = useState('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [view, setView] = useState<View | null>(null)
  const [names, setNames] = useState<[string, string]>([player.display_name, 'System'])
  const [message, setMessage] = useState('')
  const [thinking, setThinking] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useBooster, setUseBooster] = useState(false)

  const gameRef = useRef<Game | null>(null)
  const phaseRef = useRef<Phase>('setup')
  const matchRef = useRef<Match | null>(null)
  const rivalRef = useRef<Player | null>(null)
  const versusRef = useRef(false)
  const namesRef = useRef<[string, string]>([player.display_name, 'System'])
  const thinkingRef = useRef(false)
  const randRef = useRef<() => number>(() => Math.random())
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const runRef = useRef(0)
  const playRef = useRef<(col: number) => void>(() => undefined)

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
      if (e.repeat || e.key < '1' || e.key > String(COLS)) return
      playRef.current(Number(e.key) - 1)
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
      const game = newGame(boosted ? 1 : 0)
      gameRef.current = game
      matchRef.current = match
      rivalRef.current = rival
      versusRef.current = versus
      randRef.current = rng(Math.floor(Math.random() * 2 ** 31))
      namesRef.current = [player.display_name, versus ? rival.display_name : 'System']
      setNames(namesRef.current)
      setView(viewOf(game))
      setThinking(false)
      thinkingRef.current = false
      setMessage(versus ? `${namesRef.current[0]}'s turn (red). Tap a column.` : 'Your turn (red). Tap a column.')
      if (boosted) onChange()
      go('playing')
    } catch (err) {
      if (run !== runRef.current) return
      setError(err instanceof Error && !(err instanceof ArenaError) ? err.message : errorText(err))
      go('setup')
    }
  }

  function turnMessage(game: Game): string {
    const [a, b] = namesRef.current
    if (versusRef.current) return `${game.turn === 0 ? a : b}'s turn (${COLOURS[game.turn]}). Tap a column.`
    return game.turn === 0 ? 'Your turn (red). Tap a column.' : 'The system is thinking…'
  }

  // After any move: show it, then finish the game, let the system reply, or wait for the next player.
  function afterMove(game: Game) {
    setView(viewOf(game))
    if (game.status !== 'playing') {
      const w = winnerOf(game)
      const how = game.direction === 'diagonal' ? 'on the diagonal' : game.direction === 'vertical' ? 'going down' : 'across'
      setMessage(w === 0 ? 'The board is full. It is a draw.' : `${namesRef.current[w - 1]} wins with four in a row, ${how}.`)
      later(() => void end(), 1600)
      return
    }
    setMessage(turnMessage(game))
    if (!versusRef.current && game.turn === 1) {
      thinkingRef.current = true
      setThinking(true)
      later(() => {
        const g = gameRef.current
        if (!g || g.status !== 'playing') return
        drop(g, systemMove(g, randRef.current))
        thinkingRef.current = false
        setThinking(false)
        afterMove(g)
      }, 500 + Math.floor(randRef.current() * 500))
    }
  }

  function play(col: number) {
    const game = gameRef.current
    if (phaseRef.current !== 'playing' || !game || thinkingRef.current || game.status !== 'playing') return
    if (!versusRef.current && game.turn !== 0) return
    if (!drop(game, col)) {
      setMessage('That column is full. Pick another one.')
      return
    }
    afterMove(game)
  }
  playRef.current = play

  function undo() {
    const game = gameRef.current
    if (!game || thinkingRef.current || !undoRound(game)) return
    setView(viewOf(game))
    setMessage(`Took back your last move. ${turnMessage(game)}`)
  }

  async function end() {
    const game = gameRef.current
    const match = matchRef.current
    const rival = rivalRef.current
    if (!game || !match || !rival) return
    const run = runRef.current
    go('closing')
    try {
      const finished = await closeMatch(client.arena, connect4Report(game, match, player, rival, versusRef.current))
      if (run !== runRef.current) return
      setResult({ finished, game, names: namesRef.current })
      go('done')
      onChange()
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      go('setup')
    }
  }

  const showBoard = view !== null && (phase === 'playing' || phase === 'closing' || phase === 'opening' || phase === 'done')
  const canPlay = phase === 'playing' && !thinking && view?.status === 'playing'
  const full = (col: number) => view !== null && view.board[col] !== 0
  const achievementNames = new Map(ACHIEVEMENTS.map((a) => [a.id, a.name]))
  const winnerName = result ? ([null, result.names[0], result.names[1]] as const)[winnerOf(result.game)] : null

  return (
    <section className="card">
      {showBoard && view ? (
        <>
          <div className="hud">
            <span><i className="dot red" /> {names[0]}</span>
            <span className="muted">Get four in a row</span>
            <span><i className="dot yellow" /> {names[1]}</span>
          </div>
          <p className={`c4status${view.status === 'playing' ? '' : ' over'}`} role="status" aria-live="polite">{phase === 'opening' ? 'Opening match…' : phase === 'closing' ? 'Sending results…' : message}</p>
          <div className="c4board" role="group" aria-label="Connect Four board">
            {Array.from({ length: COLS }, (_, col) => (
              <button key={col} type="button" className="c4col" disabled={!canPlay || full(col)} onClick={() => play(col)} aria-label={`Drop a disc in column ${col + 1}`}>
                {Array.from({ length: ROWS }, (_, row) => {
                  const index = row * COLS + col
                  const value = view.board[index]
                  return <span key={row} className={`c4cell${value ? ` ${COLOURS[value - 1]}` : ''}${view.line.includes(index) ? ' win' : ''}`} />
                })}
              </button>
            ))}
          </div>
          {view.canUndo && phase === 'playing' ? (
            <button type="button" className="secondary" onClick={undo} disabled={thinking}>Take back my last move (booster)</button>
          ) : null}
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
              <p className="muted">If this name already exists in the sandbox, that player joins. Otherwise a new player is created. Player 1 is red and moves first. Player 2 is yellow. Take turns on this screen.</p>
            </div>
          ) : (
            <p className="muted">You are red and move first. The system is yellow. Tap a column to drop a disc, and get four in a row before it does.</p>
          )}
          <div className="controls">
            <button onClick={start} disabled={mode === 'versus' && secondName.trim().length < 3}>{phase === 'done' ? 'Play again' : 'Start ranked match'}</button>
            {boosters > 0 ? (
              <label className="check">
                <input type="checkbox" checked={useBooster} onChange={(e) => setUseBooster(e.target.checked)} /> Player 1 uses a booster pack: one move can be taken back ({boosters} left)
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
            {result.names[0]} {scoreOf(result.game, 0)} · {result.names[1]} {scoreOf(result.game, 1)}
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
