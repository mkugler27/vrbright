import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { getSupabaseUserByBubbleId } from '../services/chatApi'
import { useAuth } from '../context/AuthContext'

// Returns the number of conversations with unread messages.
// Sums unread_count from conversations the user participates in.
// Subscribes to realtime INSERT on messages so the badge updates live.
export function useUnreadCount(): { count: number; refresh: () => void } {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const refreshKeyRef = useRef(0) // bump to force re-render

  const refresh = useCallback(async () => {
    if (!user) return
    if (!isSupabaseConfigured) return

    try {
      const me = await getSupabaseUserByBubbleId(user.id_bubble)
      if (!me) return

      const { data: myConvs } = await supabase
        .from('conversation_participants')
        .select('conversation_id, conversations (unread_count)')
        .eq('user_id', me.id)

      if (!myConvs) { setCount(0); return }

      const total = (myConvs as any[]).reduce((sum, row) => {
        return sum + ((row.conversations as any)?.unread_count ?? 0)
      }, 0)
      setCount(total)
      refreshKeyRef.current += 1
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
        .channel('unread-count-global')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
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