import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { getSupabaseUserByBubbleId } from '../services/chatApi'
import { useAuth } from '../context/AuthContext'
import { useActiveConversation } from '../context/ActiveConversationContext'

// Returns the number of conversations with unread messages.
// - Excludes the currently active conversation (no badge when user is
//   already viewing that chat).
// - Sender updates their own last_read_at when sending, so they never
//   see their own messages as unread.
export function useUnreadCount(): { count: number; refresh: () => void } {
  const { user } = useAuth()
  const { activeConversationId } = useActiveConversation()
  const [count, setCount] = useState(0)
  const refreshKeyRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!user) return
    if (!isSupabaseConfigured) return

    try {
      const me = await getSupabaseUserByBubbleId(user.id_bubble)
      if (!me) return

      const { data: myConvs } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          last_read_at,
          conversations (id, last_message_at)
        `)
        .eq('user_id', me.id)

      if (!myConvs) { setCount(0); return }

      let unread = 0
      for (const row of myConvs as any[]) {
        const conv = row.conversations
        if (!conv?.last_message_at) continue
        // Skip the conversation the user is currently viewing
        if (conv.id === activeConversationId) continue
        const lastRead = row.last_read_at ?? '1970-01-01'
        if (conv.last_message_at > lastRead) unread++
      }
      setCount(unread)
      refreshKeyRef.current += 1
    } catch (err) {
      console.warn('unread count error:', err)
    }
  }, [user, activeConversationId])

  useEffect(() => {
    refresh()
    if (!user || !isSupabaseConfigured) return

    let channel: ReturnType<typeof supabase.channel> | undefined
    let pollInterval: ReturnType<typeof setInterval> | undefined

    try {
      channel = supabase
        .channel(`unread-count-${user.id_bubble}`)
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
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversation_participants' },
          () => refresh()
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('realtime unavailable, falling back to polling')
            if (!pollInterval) {
              pollInterval = setInterval(() => refresh(), 5000)
            }
          }
        })
    } catch (err) {
      console.warn('unread subscription error:', err)
      pollInterval = setInterval(() => refresh(), 5000)
    }

    return () => {
      if (channel) supabase.removeChannel(channel)
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [user, refresh])

  return { count, refresh }
}