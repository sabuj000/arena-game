import type { Player } from '../../sdk/index.ts'
import type { GameClient } from '../../game/client.ts'
import type { Profile } from '../../game/flow.ts'

// What every game component receives from the hub.
export type GameProps = {
  client: GameClient
  player: Player
  profile: Profile | null
  /** True when the player owns the Neon skin. */
  skin: boolean
  /** Call after the game changed the player's data, so the hub reloads the profile. */
  onChange: () => void
}
