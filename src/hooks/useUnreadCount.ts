import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { getSupabaseUserByBubbleId } from '../services/chatApi'
import { useAuth } from '../context/AuthContext'

// Returns the number of conversations that have unread messages.
// Strategy: sums unread_count on conversations the user participates in.
// This works without last_read_at column — the count is updated when
// messages arrive and when markConversationRead resets it.
export function useUnreadCount(): { count: number; refresh: () => void } {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) return
    if (!isSupabaseConfigured) return

    try {
      const me = await getSupabaseUserByBubbleId(user.id_bubble)
      if (!me) return

      // Get all conversations I'm in and sum their unread_count
      const { data: myConvs } = await supabase
        .from('conversation_participants')
        .select('conversation_id, conversations (unread_count)')
        .eq('user_id', me.id)

      if (!myConvs) { setCount(0); return }

      const total = (myConvs as any[]).reduce((sum, row) => {
        return sum + ((row.conversations as any)?.unread_count ?? 0)
      }, 0)
      setCount(total)
    } catch (err) {
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
          { event: 'INSERT', schema: 'public', table: 'messages' },
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