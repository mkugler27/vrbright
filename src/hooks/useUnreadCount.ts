import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { getSupabaseUserById } from '../services/chatApi'
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
      const me = await getSupabaseUserById(user.id)
      if (!me) return

      // Step 1: get my conversation participants
      const { data: myConvs, error: cpError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', me.id)

      if (cpError) {
        console.warn('[unread] conversation_participants fetch failed:', cpError.message)
        return
      }
      if (!myConvs || myConvs.length === 0) { setCount(0); return }

      // Step 2: get last_message_at for each conversation (separate query
      // to avoid the JOIN RLS issue we saw in getMessages)
      const convIds = myConvs.map(c => c.conversation_id)
      const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('id, last_message_at')
        .in('id', convIds)

      if (convError) {
        console.warn('[unread] conversations fetch failed:', convError.message)
        return
      }

      const lastMessageById = new Map<string, string | null>()
      for (const c of (convs ?? []) as any[]) {
        lastMessageById.set(c.id, c.last_message_at)
      }

      let unread = 0
      for (const row of myConvs) {
        const lastMessageAt = lastMessageById.get(row.conversation_id)
        if (!lastMessageAt) continue
        if (row.conversation_id === activeConversationId) continue
        const lastRead = row.last_read_at ?? '1970-01-01'
        if (lastMessageAt > lastRead) unread++
      }
      setCount(unread)
      refreshKeyRef.current += 1
    } catch (err) {
      console.warn('unread count error:', err)
    }
  }, [user, activeConversationId])

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return

    refresh()

    // Always poll — realtime is best-effort but unreliable for badge updates.
    // 5s interval is light and keeps the badge fresh.
    const pollInterval = setInterval(() => refresh(), 5000)

    return () => {
      clearInterval(pollInterval)
    }
  }, [user, refresh])

  return { count, refresh }
}