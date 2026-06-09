import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { getSupabaseUserByBubbleId } from '../services/chatApi'
import { useAuth } from '../context/AuthContext'

// Returns the number of conversations that have new messages
// (i.e. last_message_at > my last read timestamp)
export function useUnreadCount(): { count: number; refresh: () => void } {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) return
    if (!isSupabaseConfigured) return

    try {
      const me = await getSupabaseUserByBubbleId(user.id_bubble)
      if (!me) return

      // Get all conversations I'm in
      const { data: myConvs } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          last_read_at,
          conversations (id, last_message_at, last_message)
        `)
        .eq('user_id', me.id)

      if (!myConvs) { setCount(0); return }

      let unread = 0
      for (const row of myConvs as any[]) {
        const conv = row.conversations
        if (!conv?.last_message_at) continue
        const lastRead = row.last_read_at ?? '1970-01-01'
        if (conv.last_message_at > lastRead) unread++
      }
      setCount(unread)
    } catch (err) {
      // Silently ignore — unread count is non-critical
      console.warn('unread count error:', err)
    }
  }, [user])

  useEffect(() => {
    refresh()
    if (!user || !isSupabaseConfigured) return

    let channel: ReturnType<typeof supabase.channel> | undefined
    try {
      channel = supabase
        .channel('unread-count')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversation_participants' },
          () => refresh()
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversations' },
          () => refresh()
        )
        .subscribe()
    } catch (err) {
      console.warn('unread subscription error:', err)
    }

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [user, refresh])

  return { count, refresh }
}