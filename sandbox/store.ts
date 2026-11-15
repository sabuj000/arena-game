import type { Grant, Match, Player, Purchase } from '../sdk/types.ts'

// All sandbox data. It is plain JSON, so any storage can hold it.
export type State = {
  seq: number
  players: Record<string, Player>
  matches: Record<string, Match>
  purchases: Record<string, Purchase>
  grants: Record<string, Grant>
  order: { players: string[]; matches: string[]; purchases: string[] }
  scores: Record<string, Record<string, { id: string; score: number; submitted_at: string }>>
  inventory: Record<string, Record<string, { quantity: number; updated_at: string }>>
  unlocked: Record<string, Record<string, string>>
  idempotency: Record<string, { fingerprint: string; status: number; body: unknown }>
}

export function emptyState(): State {
  return {
    seq: 0,
    players: {},
    matches: {},
    purchases: {},
    grants: {},
    order: { players: [], matches: [], purchases: [] },
    scores: {},
    inventory: {},
    unlocked: {},
    idempotency: {},
  }
}

export type Storage = {
  load: () => State | null
  save: (state: State) => void
  clear: () => void
}

export function memoryStorage(): Storage {
  let saved: string | null = null
  return {
    load: () => (saved ? (JSON.parse(saved) as State) : null),
    save: (state) => {
      saved = JSON.stringify(state)
    },
    clear: () => {
      saved = null
    },
  }
}

// Keeps the sandbox in the browser, so it survives a reload.
export function localStorageStorage(key: string): Storage {
  return {
    load: () => {
      try {
        const text = window.localStorage.getItem(key)
        return text ? (JSON.parse(text) as State) : null
      } catch {
        return null
      }
    },
    save: (state) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(state))
      } catch {
        // Storage can be full or blocked. The sandbox keeps working for this page view.
      }
    },
    clear: () => {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // Nothing to clear.
      }
    },
  }
}
