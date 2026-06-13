import { supabase } from './supabase'
import { fetchBubbleUserByEmail } from './teamApi'

/**
 * Sync this single user's Bubble `tipo_user` (and avatar) into Supabase.
 * Idempotent and safe to call on every login. Failures are non-fatal.
 *
 * Note: we don't sync the full team list from the client — RLS on the
 * `users` table only allows users to update their own row. So each
 * user fetches their own profile from Bubble.
 */
export async function syncMyBubbleRole(
  userId: string,
  email: string
): Promise<void> {
  try {
    const bubble = await fetchBubbleUserByEmail(email)
    if (!bubble) return
    const updates: Record<string, string> = {}
    if (bubble.tipo_user) updates.tipo_user_bubble = bubble.tipo_user
    if (bubble.profile_picture) updates.avatar_url = bubble.profile_picture
    if (Object.keys(updates).length === 0) return
    await supabase.from('users').update(updates).eq('id', userId)
  } catch (e) {
    console.warn('teamSync: my-role sync failed:', e)
  }
}

export function canCreateGroups(tipoUserBubble: string | undefined | null): boolean {
  if (!tipoUserBubble) return false
  const t = tipoUserBubble.toLowerCase()
  return t === 'owner' || t === 'director'
}
