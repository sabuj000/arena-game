import { SEED_PLAYERS } from './catalog.ts'
import { handle } from './server.ts'
import type { ApiRequest, ApiResponse, Env } from './server.ts'
import { emptyState } from './store.ts'
import type { State, Storage } from './store.ts'

export type Sandbox = {
  /** Handles one API request and saves the result. */
  call: (request: ApiRequest) => ApiResponse
  /** A fetch function for the SDK. It answers from the sandbox instead of the network. */
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  /** Erases all data and seeds the starting players. */
  reset: () => void
  /** Reads the current state, for tests. */
  peek: () => State
}

export type SandboxOptions = {
  storage: Storage
  env?: Env
  /** Fake network delay in milliseconds, as [min, max]. */
  latency?: [number, number]
  /** Called with each response status. Return a status to make the next request fail, for tests. */
  fault?: (request: ApiRequest) => { status: number; headers?: Record<string, string> } | null
}

const BASE_PATH = '/v1'
const SEED_KEY = 'sk_test_sandbox_seed'

// Fills an empty sandbox with a few players and scores, using the same API calls a game would make.
function seed(state: State, env: Env): void {
  const call = (method: string, path: string, body?: unknown) =>
    handle(state, { method, path, query: {}, headers: { authorization: `Bearer ${SEED_KEY}` }, body }, env).body as Record<string, unknown>
  for (const seeded of SEED_PLAYERS) {
    const player = call('POST', '/players', { display_name: seeded.name })
    const id = String(player.id)
    // Two submissions: the best score first, then the rest of the lifetime total.
    call('POST', '/leaderboards/weekly/scores', { player_id: id, score: seeded.best })
    call('POST', '/leaderboards/lifetime/scores', { player_id: id, score: seeded.total })
  }
}

export function createSandbox(options: SandboxOptions): Sandbox {
  const env: Env = options.env ?? { now: () => new Date() }

  const load = (): State => {
    const saved = options.storage.load()
    if (saved) return saved
    const fresh = emptyState()
    seed(fresh, env)
    options.storage.save(fresh)
    return fresh
  }

  const call = (request: ApiRequest): ApiResponse => {
    const state = load()
    const response = handle(state, request, env)
    options.storage.save(state)
    return response
  }

  const sandboxFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input, 'https://api.arena.example')
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, name) => {
      headers[name.toLowerCase()] = value
    })
    let body: unknown
    if (typeof init.body === 'string' && init.body !== '') {
      try {
        body = JSON.parse(init.body)
      } catch {
        return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'invalid_json', message: 'The request body is not valid JSON.' } }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
    }
    const request: ApiRequest = {
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname.startsWith(BASE_PATH) ? url.pathname.slice(BASE_PATH.length) || '/' : url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      body,
    }
    if (options.latency) {
      const [min, max] = options.latency
      await new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)))
    }
    const fault = options.fault?.(request)
    if (fault) {
      return new Response(JSON.stringify({ error: { type: 'api_error', code: 'injected_fault', message: 'A test fault.' } }), {
        status: fault.status,
        headers: { 'Content-Type': 'application/json', ...fault.headers },
      })
    }
    const response = call(request)
    return new Response(JSON.stringify(response.body), { status: response.status, headers: response.headers })
  }

  return {
    call,
    fetch: sandboxFetch,
    reset: () => {
      options.storage.clear()
      load()
    },
    peek: load,
  }
}
