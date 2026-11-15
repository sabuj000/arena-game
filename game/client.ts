// Builds the SDK client for the browser. It talks to the in-browser sandbox instead of the network.
import { Arena } from '../sdk/index.ts'
import type { RequestEvent } from '../sdk/index.ts'
import { createSandbox } from '../sandbox/sandbox.ts'
import type { Sandbox } from '../sandbox/sandbox.ts'
import { localStorageStorage } from '../sandbox/store.ts'
import type { State, Storage } from '../sandbox/store.ts'

export const STORAGE_KEY = 'arena-reflex-sandbox'
export const PLAYER_KEY = 'arena-reflex-player'

// Keeps one copy in memory, so the sandbox works even when localStorage is blocked.
function cached(inner: Storage): Storage {
  let cache: State | null | undefined
  return {
    load: () => {
      if (cache === undefined) cache = inner.load()
      return cache
    },
    save: (state) => {
      cache = state
      inner.save(state)
    },
    clear: () => {
      cache = null
      inner.clear()
    },
  }
}

export type GameClient = { arena: Arena; sandbox: Sandbox }

export function createGameClient(onRequest: (event: RequestEvent) => void): GameClient {
  const sandbox = createSandbox({ storage: cached(localStorageStorage(STORAGE_KEY)), latency: [40, 140] })
  const arena = new Arena({ apiKey: 'sk_test_arena_reflex', fetch: sandbox.fetch, onRequest })
  return { arena, sandbox }
}
