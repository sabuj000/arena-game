'use client'
import { useEffect, useRef, useState } from 'react'
import { ArenaError } from '../../sdk/index.ts'
import type { Match, Player } from '../../sdk/index.ts'
import { ACHIEVEMENTS } from '../../sandbox/catalog.ts'
import type { GameProps } from './types.ts'
import { BIG_TILE, SIZE, finish, maxTile, move, playBot, startGame, statsOf, undo } from '../../game/tiles/engine.ts'
import type { Dir, Game, Stats } from '../../game/tiles/engine.ts'
import { closeMatch, findRival, openMatch } from '../../game/flow.ts'
import type { Finished } from '../../game/flow.ts'
import { tilesReport } from '../../game/tiles/report.ts'

const RIVAL_SKILL = 0.5
type Phase = 'idle' | 'opening' | 'playing' | 'closing' | 'done'
type Result = { mine: Stats; theirs: Stats; finished: Finished; stuck: boolean }

const errorText = (err: unknown) => (err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.')
const KEYS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }
const ARROWS: Array<[Dir, string]> = [['up', '↑'], ['left', '←'], ['down', '↓'], ['right', '→']]

export default function Tiles({ client, player, profile, onChange }: GameProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [board, setBoard] = useState<number[]>(Array(SIZE * SIZE).fill(0))
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [spare, setSpare] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useBooster, setUseBooster] = useState(false)

  const gameRef = useRef<Game | null>(null)
  const seedRef = useRef(0)
  const matchRef = useRef<Match | null>(null)
  const rivalRef = useRef<Player | null>(null)
  const runRef = useRef(0)
  const endingRef = useRef(false)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const slideRef = useRef<(dir: Dir) => boolean>(() => false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key]
      if (!dir) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (slideRef.current(dir)) e.preventDefault() // only block page scrolling while a game is on
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      runRef.current += 1
    }
  }, [])

  const boosters = profile?.inventory.find((i) => i.item_id === 'itm_gold_pack')?.quantity ?? 0

  function sync(game: Game) {
    setBoard([...game.board])
    setScore(game.score)
    setMoves(game.moves)
    setSpare(game.spare)
    setCanUndo(game.spare > 0 && game.previous !== null)
  }

  async function start() {
    setError(null)
    setResult(null)
    setPhase('opening')
    endingRef.current = false
    const run = ++runRef.current
    try {
      const rival = await findRival(client.arena)
      const boosted = useBooster && boosters > 0
      if (boosted) await client.arena.inventory.consume(player.id, { item_id: 'itm_gold_pack', quantity: 1 })
      const match = await openMatch(client.arena, player, rival)
      if (run !== runRef.current) return
      seedRef.current = Math.floor(Math.random() * 2 ** 31)
      const game = startGame(seedRef.current, boosted ? 1 : 0)
      gameRef.current = game
      matchRef.current = match
      rivalRef.current = rival
      if (boosted) onChange()
      sync(game)
      setPhase('playing')
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  function slide(dir: Dir): boolean {
    const game = gameRef.current
    if (phase !== 'playing' || !game || endingRef.current) return false
    move(game, dir)
    sync(game)
    if (game.over) void end(true)
    return true
  }
  slideRef.current = slide

  function takeBack() {
    const game = gameRef.current
    if (phase !== 'playing' || !game) return
    if (undo(game)) sync(game)
  }

  function endNow() {
    const game = gameRef.current
    if (phase !== 'playing' || !game) return
    finish(game)
    void end(false)
  }

  async function end(stuck: boolean) {
    const game = gameRef.current
    const match = matchRef.current
    const rival = rivalRef.current
    if (!game || !match || !rival || endingRef.current) return
    endingRef.current = true
    const run = runRef.current
    setPhase('closing')
    const mine = statsOf(game)
    const theirs = playBot(seedRef.current, RIVAL_SKILL, seedRef.current + 1)
    try {
      const finished = await closeMatch(client.arena, tilesReport(match, player, rival, mine, theirs))
      if (run !== runRef.current) return
      setResult({ mine, theirs, finished, stuck })
      setPhase('done')
      onChange()
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  const playing = phase === 'playing'
  const names = new Map(ACHIEVEMENTS.map((a) => [a.id, a.name]))

  return (
    <section className="card">
      <div className="hud">
        <span>Score <strong>{score}</strong></span>
        <span>Moves <strong>{moves}</strong></span>
        <span>Best tile <strong>{maxTile(board)}</strong></span>
        <span>Undos <strong>{spare}</strong></span>
      </div>
      <div
        className="tiles"
        role="group"
        aria-label="Tile board. Use the arrow keys, swipe, or the buttons below."
        onPointerDown={(e) => {
          swipeRef.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const start = swipeRef.current
          swipeRef.current = null
          if (!start) return
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return
          slide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
        }}
      >
        {board.map((v, i) => (
          <div key={i} className={`tilecell${v ? ` v${Math.min(v, 2048)}` : ''}`} aria-label={v ? `Tile ${v}` : 'Empty'}>
            {v || ''}
          </div>
        ))}
      </div>
      <div className="dpad" aria-label="Move buttons">
        {ARROWS.map(([dir, label]) => (
          <button key={dir} type="button" className={`secondary d-${dir}`} disabled={!playing} onClick={() => slide(dir)} aria-label={`Slide ${dir}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted hint">Arrow keys, WASD, swipe or the buttons. Make a {BIG_TILE} tile for an achievement.</p>

      {playing ? (
        <div className="controls">
          <button className="secondary" disabled={!canUndo} onClick={takeBack}>Undo last move</button>
          <button onClick={endNow}>End game and submit score</button>
        </div>
      ) : null}
      {phase === 'opening' ? <p className="muted center-text">Opening match…</p> : null}
      {phase === 'closing' ? <p className="muted center-text">Sending results…</p> : null}
      {phase === 'idle' || phase === 'done' ? (
        <div className="controls">
          <button onClick={start}>{phase === 'done' ? 'Play again' : 'Start ranked match'}</button>
          {boosters > 0 ? (
            <label className="check">
              <input type="checkbox" checked={useBooster} onChange={(e) => setUseBooster(e.target.checked)} /> Use a booster pack for one undo ({boosters} left)
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
            <li>{result.stuck ? 'No moves left.' : 'You ended the game.'} {result.mine.moves} moves · best tile {result.mine.maxTile}</li>
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
