import { Arena } from '../sdk/index.ts'
import type { ArenaOptions } from '../sdk/index.ts'
import { createSandbox } from '../sandbox/sandbox.ts'
import type { SandboxOptions } from '../sandbox/sandbox.ts'
import { memoryStorage } from '../sandbox/store.ts'

// A sandbox with a clock the test controls.
export function world(options: Partial<SandboxOptions> & { arena?: Partial<ArenaOptions> } = {}) {
  let now = new Date('2026-11-15T10:00:00Z')
  const sandbox = createSandbox({ storage: memoryStorage(), env: { now: () => now }, ...options })
  const arena = new Arena({
    apiKey: 'sk_test_unit',
    fetch: sandbox.fetch,
    sleep: async () => {},
    ...options.arena,
  })
  return {
    sandbox,
    arena,
    advanceDays(days: number) {
      now = new Date(now.getTime() + days * 86_400_000)
    },
  }
}
