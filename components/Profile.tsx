'use client'
import type { Player } from '../sdk/index.ts'
import type { Profile as ProfileData } from '../game/flow.ts'

export default function Profile({ player, profile, onReset }: { player: Player; profile: ProfileData | null; onReset: () => void }) {
  const qty = (id: string) => profile?.inventory.find((i) => i.item_id === id)?.quantity ?? 0
  return (
    <section className="card">
      <h2>{player.display_name}</h2>
      <p className="muted">{player.id} · created {new Date(player.created_at).toLocaleDateString()}</p>
      <h3>Inventory</h3>
      <ul className="plain">
        <li>Coins: <strong>{qty('itm_coin')}</strong></li>
        <li>Booster packs: <strong>{qty('itm_gold_pack')}</strong></li>
        <li>Neon skin: <strong>{profile?.skins.includes('itm_arena_skin') ? 'owned' : 'not owned'}</strong></li>
      </ul>
      <h3>Achievements</h3>
      <ul className="badges">
        {profile?.achievements.map(({ achievement, unlockedAt }) => (
          <li key={achievement.id} className={unlockedAt ? 'got' : ''}>
            <strong>{achievement.name}</strong>
            <span>{achievement.description}</span>
            <em>{unlockedAt ? `Unlocked ${new Date(unlockedAt).toLocaleDateString()}` : 'Locked'}</em>
          </li>
        ))}
      </ul>
      <h3>Sandbox</h3>
      <p className="muted">Erase all sandbox data and start again with the seed players.</p>
      <button className="secondary" onClick={onReset}>Reset sandbox</button>
    </section>
  )
}
