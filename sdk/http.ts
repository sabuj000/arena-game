import { ArenaConnectionError, ArenaError } from './errors.ts'
import type { ErrorBody } from './errors.ts'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type RequestEvent = {
  method: string
  path: string
  status: number
  durationMs: number
  attempt: number
  idempotencyKey?: string
}

export type ArenaOptions = {
  /** A secret key (sk_) for servers, or a publishable key (pk_) for clients. */
  apiKey: string
  baseUrl?: string
  /** Send a specific API version, for example 2026-10-01. */
  version?: string
  /** Retries after a network error, a 429 or a 500. The default is 2. */
  maxRetries?: number
  fetch?: FetchLike
  sleep?: (ms: number) => Promise<void>
  /** Called once per attempt. Useful for logging. */
  onRequest?: (event: RequestEvent) => void
}

export type RequestOptions = {
  /** Reuse a key to make a retry safe. POST requests get a random key if you do not set one. */
  idempotencyKey?: string
  signal?: AbortSignal
}

type Query = Record<string, string | number | boolean | undefined>

const DEFAULT_BASE_URL = 'https://api.arena.example/v1'

function newKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID ? c.randomUUID() : `key-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export class Http {
  private readonly options: ArenaOptions
  private readonly baseUrl: string
  private readonly doFetch: FetchLike
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: ArenaOptions) {
    this.options = options
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init))
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  async request<T>(
    method: string,
    path: string,
    input: { query?: Query; body?: unknown } = {},
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) search.set(name, String(value))
    }
    const url = `${this.baseUrl}${path}${search.size > 0 ? `?${search}` : ''}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      Accept: 'application/json',
    }
    if (this.options.version) headers['Arena-Version'] = this.options.version
    if (input.body !== undefined) headers['Content-Type'] = 'application/json'
    // A POST gets one key for every attempt, so a retry can never repeat the action.
    const key = method === 'POST' ? (requestOptions.idempotencyKey ?? newKey()) : undefined
    if (key) headers['Idempotency-Key'] = key

    const maxRetries = this.options.maxRetries ?? 2
    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const started = Date.now()
      let response: Response
      try {
        response = await this.doFetch(url, {
          method,
          headers,
          body: input.body === undefined ? undefined : JSON.stringify(input.body),
          signal: requestOptions.signal,
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        lastError = error
        this.options.onRequest?.({ method, path, status: 0, durationMs: Date.now() - started, attempt, idempotencyKey: key })
        if (attempt < maxRetries) await this.sleep(backoff(attempt))
        continue
      }

      this.options.onRequest?.({
        method,
        path,
        status: response.status,
        durationMs: Date.now() - started,
        attempt,
        idempotencyKey: key,
      })

      if (response.status === 429 && attempt < maxRetries) {
        const seconds = Number(response.headers.get('Retry-After') ?? '1')
        await this.sleep((Number.isFinite(seconds) ? seconds : 1) * 1000 + Math.random() * 250)
        continue
      }
      if (response.status === 500 && attempt < maxRetries) {
        await this.sleep(backoff(attempt))
        continue
      }

      const text = await response.text()
      let parsed: unknown
      try {
        parsed = text ? JSON.parse(text) : undefined
      } catch {
        parsed = undefined
      }
      if (response.ok) return parsed as T
      const body = parsed as Partial<ErrorBody> | undefined
      throw new ArenaError(
        response.status,
        body?.error ?? { type: 'api_error', code: 'invalid_response', message: `Unexpected response (${response.status}).` },
      )
    }
    throw new ArenaConnectionError(
      `No response after ${maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
    )
  }
}

function backoff(attempt: number): number {
  return 500 * 2 ** attempt + Math.random() * 250
}

export type List<T> = { object: 'list'; data: T[]; has_more: boolean; next_cursor: string | null }

// Walks every page of a list call. Use it as: for await (const player of paginate((cursor) => arena.players.list({ cursor }))).
export async function* paginate<T>(page: (cursor: string | undefined) => Promise<List<T>>): AsyncGenerator<T> {
  let cursor: string | undefined
  for (;;) {
    const result = await page(cursor)
    yield* result.data
    if (!result.has_more || !result.next_cursor) return
    cursor = result.next_cursor
  }
}
