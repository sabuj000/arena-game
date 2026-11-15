'use client'
import type { RequestEvent } from '../sdk/index.ts'

export type LogEntry = RequestEvent & { id: number }

export default function ApiLog({ events }: { events: LogEntry[] }) {
  return (
    <aside className="log" aria-label="API calls">
      <h2>API calls</h2>
      <p className="muted">Every action in the game is a call to the Arena API through the SDK.</p>
      {events.length === 0 ? <p className="muted">No calls yet.</p> : null}
      <ol>
        {events.map((e) => (
          <li key={e.id} className={e.status >= 400 ? 'bad' : 'ok'}>
            <span className="method">{e.method}</span> <span className="path">{e.path}</span>
            <span className="meta">
              {e.status} · {Math.round(e.durationMs)} ms{e.attempt > 1 ? ` · attempt ${e.attempt}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
