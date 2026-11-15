'use client'
import { useEffect, useRef, useState } from 'react'
import { ArenaError } from '../../sdk/index.ts'
import type { Match, Player } from '../../sdk/index.ts'
import { ACHIEVEMENTS } from '../../sandbox/catalog.ts'
import type { GameProps } from './types.ts'
import { BOOSTER_MS, ROUND_MS, WORDSMITH_WORDS, current, playBot, skip, startGame, statsOf, submit } from '../../game/words/engine.ts'
import type { Game, Stats } from '../../game/words/engine.ts'
import { closeMatch, findRival, openMatch } from '../../game/flow.ts'
import type { Finished } from '../../game/flow.ts'
import { wordsReport } from '../../game/words/report.ts'

const RIVAL_SKILL = 0.6
type Phase = 'idle' | 'opening' | 'playing' | 'closing' | 'done'
type Result = { mine: Stats; theirs: Stats; finished: Finished }

const errorText = (err: unknown) => (err instanceof ArenaError ? `${err.message} (${err.code})` : 'Something went wrong.')

export default function Words({ client, player, profile, onChange }: GameProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [t, setT] = useState(0)
  const [limit, setLimit] = useState(ROUND_MS)
  const [letters, setLetters] = useState('')
  const [guess, setGuess] = useState('')
  const [score, setScore] = useState(0)
  const [solved, setSolved] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useBooster, setUseBooster] = useState(false)

  const gameRef = useRef<Game | null>(null)
  const seedRef = useRef(0)
  const matchRef = useRef<Match | null>(null)
  const rivalRef = useRef<Player | null>(null)
  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runRef = useRef(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [touch, setTouch] = useState(false) // phones and tablets: tap the letters, no on-screen keyboard
  const endingRef = useRef(false) // stops the round being reported twice

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches)
    return () => {
      runRef.current += 1
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const boosters = profile?.inventory.find((i) => i.item_id === 'itm_gold_pack')?.quantity ?? 0

  function sync(game: Game) {
    setScore(game.score)
    setSolved(game.solved)
    setStreak(game.streak)
    setLetters(current(game)?.letters ?? '')
  }

  async function start() {
    setError(null)
    setResult(null)
    setFeedback(null)
    setGuess('')
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
      const game = startGame(seedRef.current, boosted ? BOOSTER_MS : 0)
      gameRef.current = game
      matchRef.current = match
      rivalRef.current = rival
      if (boosted) onChange()
      setLimit(game.limit)
      setT(0)
      sync(game)
      startRef.current = performance.now()
      setPhase('playing')
      timerRef.current = setInterval(() => {
        const now = performance.now() - startRef.current
        if (now >= game.limit) void end()
        else setT(now)
      }, 100)
      if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => inputRef.current?.focus(), 0)
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  function send() {
    const game = gameRef.current
    if (phase !== 'playing' || !game || guess.trim() === '') return
    const now = performance.now() - startRef.current
    const before = game.score
    const outcome = submit(game, guess, now)
    if (outcome === 'over') {
      void end()
      return
    }
    if (outcome === 'correct') {
      setFeedback({ kind: 'ok', text: `+${game.score - before}` })
      setGuess('')
    } else {
      setFeedback({ kind: 'bad', text: 'Not a match. Try again or skip.' })
    }
    sync(game)
    if (game.index >= game.puzzles.length) void end()
  }

  function pass() {
    const game = gameRef.current
    if (phase !== 'playing' || !game) return
    skip(game, performance.now() - startRef.current)
    setGuess('')
    setFeedback({ kind: 'bad', text: 'Skipped. Your streak starts again.' })
    sync(game)
  }

  async function end() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
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
      const finished = await closeMatch(client.arena, wordsReport(match, player, rival, mine, theirs))
      if (run !== runRef.current) return
      setResult({ mine, theirs, finished })
      setPhase('done')
      onChange()
    } catch (err) {
      if (run !== runRef.current) return
      setError(errorText(err))
      setPhase('idle')
    }
  }

  const playing = phase === 'playing'
  const left = Math.max(0, Math.ceil((limit - t) / 1000))
  const names = new Map(ACHIEVEMENTS.map((a) => [a.id, a.name]))

  // Which scrambled letters the current guess already uses, so tapped tiles can be greyed out.
  const usedTiles = new Set<number>()
  if (letters) {
    for (const ch of guess.toLowerCase()) {
      const at = letters.split('').findIndex((l, i) => l.toLowerCase() === ch && !usedTiles.has(i))
      if (at >= 0) usedTiles.add(at)
    }
  }

  return (
    <section className="card">
      <div className="hud">
        <span>Score <strong>{score}</strong></span>
        <span>Solved <strong>{solved}</strong></span>
        <span>Streak <strong>{streak}</strong></span>
        <span>Time <strong>{playing ? left : limit / 1000}s</strong></span>
      </div>

      <div className="letters" aria-label="Scrambled letters">
        {playing && letters
          ? letters.split('').map((ch, i) => (
              <button key={`${i}-${ch}`} type="button" className={`tile${usedTiles.has(i) ? ' used' : ''}`} disabled={usedTiles.has(i)} onClick={() => setGuess((g) => g + ch)} aria-label={`Add ${ch}`}>
                {ch.toUpperCase()}
              </button>
            ))
          : <span className="muted">{phase === 'opening' ? 'Opening match…' : phase === 'closing' ? 'Sending results…' : 'Press start to see the letters.'}</span>}
      </div>

      <form
        className="guessbar"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <label htmlFor="guess" className="sr-only">Your word</label>
        <input id="guess" ref={inputRef} value={guess} onChange={(e) => setGuess(e.target.value.replace(/[^a-zA-Z]/g, ''))} disabled={!playing} autoComplete="off" autoCapitalize="none" spellCheck={false} readOnly={touch} inputMode={touch ? 'none' : 'text'} placeholder={touch ? 'Tap the letters' : 'Type or tap letters'} />
        <button type="submit" disabled={!playing || guess === ''}>Check</button>
        <button type="button" className="secondary" disabled={!playing || guess === ''} onClick={() => setGuess((g) => g.slice(0, -1))}>Back</button>
        <button type="button" className="secondary" disabled={!playing} onClick={pass}>Skip</button>
      </form>
      <p className={feedback?.kind === 'ok' ? 'notice' : 'muted'} aria-live="polite">{feedback?.text ?? `Solve ${WORDSMITH_WORDS} words in one round for an achievement.`}</p>

      {phase === 'idle' || phase === 'done' ? (
        <div className="controls">
          <button onClick={start}>{phase === 'done' ? 'Play again' : 'Start ranked match'}</button>
          {boosters > 0 ? (
            <label className="check">
              <input type="checkbox" checked={useBooster} onChange={(e) => setUseBooster(e.target.checked)} /> Use a booster pack for +10 seconds ({boosters} left)
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
            <li>{result.mine.solved} solved · {result.mine.skipped} skipped · {result.mine.wrong} wrong · best streak {result.mine.bestStreak}</li>
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
