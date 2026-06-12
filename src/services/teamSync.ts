import { supabase } from './supabase'
import { fetchActiveTeam } from './teamApi'

/**
 * Sync Bubble `tipo_user` (Owner, Director, Manager, …) into the
 * Supabase `users.tipo_user_bubble` column. Idempotent — safe to call
 * on every login. Failures are non-fatal; the user is still logged in
 * even if the sync throws.
 */
export async function syncBubbleRolesToUsers(): Promise<{ synced: number }> {
  const team = await fetchActiveTeam()

  const rows = team
    .filter(m => m.email && m.tipo_user)
    .map(m => ({
      email: m.email!.toLowerCase(),
      tipo_user_bubble: m.tipo_user!,
    }))

  if (rows.length === 0) return { synced: 0 }

  const { error } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'email', count: 'exact' })

  if (error) {
    console.warn('teamSync: upsert failed:', error.message)
    return { synced: 0 }
  }

  return { synced: rows.length }
}

export function canCreateGroups(tipoUserBubble: string | undefined | null): boolean {
  if (!tipoUserBubble) return false
  const t = tipoUserBubble.toLowerCase()
  return t === 'owner' || t === 'director'
}
