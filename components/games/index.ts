import type { ReactNode } from 'react'
import Reflex from './Reflex.tsx'
import type { GameProps } from './types.ts'

// Add a game here, and in game/registry.ts, to put it in the hub.
export const GAME_COMPONENTS: Record<string, (props: GameProps) => ReactNode> = {
  reflex: Reflex,
}
