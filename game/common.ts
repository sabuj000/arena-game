// Helpers shared by every game.

// mulberry32: a small seeded random number generator.
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Outcome = { winner: 'player' | 'rival' | 'draw'; playerPlacement: 1 | 2; rivalPlacement: 1 | 2 }

export function decide(player: number, rival: number): Outcome {
  if (player > rival) return { winner: 'player', playerPlacement: 1, rivalPlacement: 2 }
  if (rival > player) return { winner: 'rival', playerPlacement: 2, rivalPlacement: 1 }
  return { winner: 'draw', playerPlacement: 1, rivalPlacement: 1 }
}

// Coins for a round: 1 per 100 points, 10 extra for a win. Games can scale the points first.
export const coinsFor = (points: number, won: boolean) => Math.floor(points / 100) + (won ? 10 : 0)
