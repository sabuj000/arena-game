# Arena game

A demo for the fictional **Arena** gaming API ([docs](https://github.com/sabuj000/arena-docs)). It has three parts:

| Part | What it is |
| --- | --- |
| `sdk/` | A zero-dependency TypeScript SDK generated from `openapi/arena.json` (28 operations, 6 resources). Retries on network errors, 429 and 500, and reuses one idempotency key across retries. |
| `sandbox/` | A working implementation of the whole API that runs in the browser (or Node) over JSON state. Real games call Arena from a server; this exists so the demo needs no backend. |
| `game/` | *Arena Reflex*, a quick reaction game that uses the SDK for players, matches, leaderboards, inventory, achievements and purchases. (Coming in the next PR.) |

## Use the SDK

```ts
import { Arena } from './sdk/index.ts'
import { createSandbox } from './sandbox/sandbox.ts'
import { memoryStorage } from './sandbox/store.ts'

const sandbox = createSandbox({ storage: memoryStorage() })
const arena = new Arena({ apiKey: 'sk_test_demo', fetch: sandbox.fetch })

const player = await arena.players.create({ display_name: 'Nova' })
await arena.leaderboards.submitScore('weekly', { player_id: player.id, score: 2400 })
```

Against a real server, omit `fetch` and set `baseUrl`.

## Develop

```
npm install
npm run gen:sdk     # regenerate the SDK after the spec changes
npm test            # sandbox, SDK and spec contract tests
npm run typecheck
```

The contract test checks that the sandbox implements every operation in the spec, returns the documented success status and response fields, and can produce every documented error code with its status.

Sandbox test credentials: keys `sk_test_*` (all operations) and `pk_test_*` (list leaderboards, entries, list achievements); payment tokens `tok_test_success` and `tok_test_declined`.
