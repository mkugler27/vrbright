import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { getSupabaseUserById } from '../services/chatApi'
import { useAuth } from './AuthContext'
import { useActiveConversation } from './ActiveConversationContext'

interface UnreadContextValue {
  count: number
  refresh: () => Promise<void>
}

const UnreadContext = createContext<UnreadContextValue | null>(null)

// Single source of truth for unread conversations. Mounted once at the
// top of the app so every consumer (AppShell badge, DashboardHome card)
// sees the same number without duplicating polling.
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { activeConversationId } = useActiveConversation()
  const [count, setCount] = useState(0)

  const activeRef = useRef(activeConversationId)
  useEffect(() => {
    activeRef.current = activeConversationId
  }, [activeConversationId])

  const refresh = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return

    try {
      const me = await getSupabaseUserById(user.id)
      if (!me) return

      const { data: myConvs, error: cpError } = await supabase
        .from('conversation_participants')
        .select('conversation_id,last_read_at')
        .eq('user_id', me.id)

      if (cpError || !myConvs || myConvs.length === 0) {
        if (!cpError) setCount(0)
        return
      }

      const convIds = myConvs.map(c => c.conversation_id)
      const { data: convs } = await supabase
        .from('conversations')
        .select('id,last_message_at')
        .in('id', convIds)

      const isAdmin = ['Admin', 'Owner', 'Director'].includes(me.tipo_user_bubble || '');
      let woQuery = supabase.from('conversations').select('id, last_message_at, work_orders!inner(worker_email)').eq('tipo', 'wo');
      if (!isAdmin) {
        woQuery = woQuery.eq('work_orders.worker_email', me.email);
      }
      const { data: woData } = await woQuery;

      const lastMessageById = new Map<string, string | null>()
      for (const c of (convs ?? []) as any[]) {
        lastMessageById.set(c.id, c.last_message_at)
      }
      for (const w of (woData ?? []) as any[]) {
        lastMessageById.set(w.id, w.last_message_at)
      }

      let unread = 0
      const debug: any[] = []
      
      const allConversationIdsToCheck = new Set([
        ...convIds,
        ...((woData ?? []).map(w => w.id))
      ])

      for (const cid of allConversationIdsToCheck) {
        const lastMessageAt = lastMessageById.get(cid)
        if (!lastMessageAt) continue
        
        const myPart = myConvs.find(p => p.conversation_id === cid)
        const lastRead = myPart?.last_read_at ?? '1970-01-01'

        if (cid === activeRef.current) {
          debug.push({ conv: cid.slice(0, 8), skip: 'active', lastMessageAt, lastRead })
          continue
        }
        
        const isUnread = lastMessageAt > lastRead
        debug.push({ conv: cid.slice(0, 8), lastMessageAt, lastRead, isUnread })
        if (isUnread) unread++
      }
      console.log('[unread] refresh:', { count: unread, active: activeConversationId?.slice(0, 8), debug })
      setCount(unread)
    } catch (err) {
      console.warn('[unread] refresh error:', err)
    }
  }, [user, activeConversationId])

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return
    refresh()
    
    // Fallback polling just in case
    const pollInterval = setInterval(() => refresh(), 10000)
    
    // Realtime subscription for global unread badge
    const channel = supabase.channel('global_unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants' }, () => {
        refresh()
      })
      .subscribe()

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [user, refresh])

  return (
    <UnreadContext.Provider value={{ count, refresh }}>
      {children}
    </UnreadContext.Provider>
  )
}

export function useUnreadCount(): UnreadContextValue {
  const ctx = useContext(UnreadContext)
  if (!ctx) throw new Error('useUnreadCount must be used within UnreadProvider')
  return ctx
}
