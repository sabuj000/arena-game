export type ErrorBody = {
  error: { type: string; code: string; message: string; param?: string; request_id?: string }
}

// Thrown when the API returns an error response.
export class ArenaError extends Error {
  readonly status: number
  readonly type: string
  readonly code: string
  readonly param: string | undefined
  readonly requestId: string | undefined

  constructor(status: number, body: ErrorBody['error']) {
    super(body.message)
    this.name = 'ArenaError'
    this.status = status
    this.type = body.type
    this.code = body.code
    this.param = body.param
    this.requestId = body.request_id
  }
}

// Thrown when no response arrived, even after retries.
export class ArenaConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArenaConnectionError'
  }
}
