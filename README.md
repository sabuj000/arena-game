# Arena game

A demo for the fictional **Arena** gaming API ([docs](https://github.com/sabuj000/arena-docs)). It has three parts:

| Part | What it is |
| --- | --- |
| `sdk/` | A zero-dependency TypeScript SDK generated from `openapi/arena.json` (28 operations, 6 resources). Retries on network errors, 429 and 500, and reuses one idempotency key across retries. |
| `sandbox/` | A working implementation of the whole API that runs in the browser (or Node) over JSON state. Real games call Arena from a server; this exists so the demo needs no backend. |
| `game/` and `components/` | A game hub. One player, inventory, shop and profile are shared by every game, and each game has its own leaderboards. The games are *Arena Reflex* (reaction) and *Memory sequence* (repeat a growing pattern) and *Word scramble* (unscramble words against the clock). |

## How the game uses the API

| Action in the game | API calls |
| --- | --- |
| Pick a name | `POST /players` (errors: `invalid_display_name`, `display_name_taken`) |
| Start a ranked match | `GET /players` (find RivalBot), `POST /matches`, `POST /matches/{id}/start` |
| Use a booster pack | `POST /players/{id}/inventory/consume` |
| Finish a round | `POST /matches/{id}/end`, `POST /leaderboards/{id}/scores` (weekly and lifetime), `POST .../achievements/{id}/unlock`, `POST .../inventory/grants` (coins) |
| Leaderboard | `GET /leaderboards/{id}/entries`, `GET /leaderboards/{id}/players/{player_id}` |
| Shop | `POST /purchases` (test tokens), `GET /purchases`, `POST /purchases/{id}/refund`, `GET /players/{id}/entitlements` |

## Add a game

1. Write a pure, seeded engine in `game/<id>/` with tests.
2. Add the game to `game/registry.ts` with two leaderboards: `best` keeps the highest score, `total` adds scores up. Add both to `sandbox/catalog.ts`.
3. Write a component that takes `GameProps` and register it in `components/games/index.ts`. It calls `closeMatch` with a `Report` to submit the result.

`tests/registry.test.ts` checks that every game has its leaderboards and a component.

The Arena Reflex engine (`game/reflex/engine.ts`) is pure and seeded, so a round is reproducible and tested without a browser.

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
npm run dev         # play at http://localhost:3000
npm run gen:sdk     # regenerate the SDK after the spec changes
npm test            # sandbox, SDK and spec contract tests
npm run typecheck
```

The contract test checks that the sandbox implements every operation in the spec, returns the documented success status and response fields, and can produce every documented error code with its status.

Sandbox test credentials: keys `sk_test_*` (all operations) and `pk_test_*` (list leaderboards, entries, list achievements); payment tokens `tok_test_success` and `tok_test_declined`.
