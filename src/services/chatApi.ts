import { supabase } from './supabase'
import type { User } from './supabase'
import type { ChatFile } from '../types'
import {
  saveCachedConversations,
  getCachedConversations,
  saveCachedMessages,
  getCachedMessages,
  saveCachedUsers,
  getCachedUsers
} from './db'
import { enqueueCreateConversation } from './syncQueue'

export type Conversation = {
  id: string
  tipo: 'individual' | 'group' | 'wo'
  nome: string | null
  bubble_group_id: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
  participants?: User[]
  member_count?: number
  wo_id?: string
  work_orders?: any
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  tipo: 'text' | 'audio'
  audio_url: string | null
  transcription: string | null
  bubble_id: string | null
  created_at: string
  sender?: User
  chat_file?: ChatFile | null
}

// ──────────────────────────────────────────────
// USERS
// ──────────────────────────────────────────────

export async function upsertUser(
  supabaseId: string,
  profile: { nome: string; email: string; avatar_url?: string; bubble_id?: string; tipo_user_bubble?: string }
): Promise<void> {
  await supabase.from('users').upsert(
    { id: supabaseId, ...profile },
    { onConflict: 'id' }
  )
}

export async function getSupabaseUserById(supabaseId: string): Promise<User | null> {
  if (!navigator.onLine) return null
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', supabaseId)
      .single()
    if (error) return null
    return data ?? null
  } catch {
    return null
  }
}

export async function getSupabaseUserByEmail(email: string): Promise<User | null> {
  if (!navigator.onLine) return null
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()
    if (error) return null
    return data ?? null
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────
// CONVERSATIONS
// ──────────────────────────────────────────────

export async function getConversationsForUser(userId: string): Promise<Conversation[]> {
  try {
    if (!navigator.onLine) throw new Error('Offline')
    const { data, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id,last_read_at,conversations(id,tipo,nome,bubble_group_id,last_message,last_message_at,created_at,users:conversation_participants!inner(user_id,users(id,bubble_id,nome,email,avatar_url,tipo_user_bubble)))')
      .eq('user_id', userId)

    if (error) throw new Error(error.message)
    if (!data) return []

    const convs = data
      .map((row: any) => {
        const conv: any = row.conversations
        const participants = conv.users?.map((p: any) => p.users).filter(Boolean) ?? []
        const distinctUserIds = new Set(participants.map((p: any) => p.id))
        if (distinctUserIds.size < 2) return null
        let unread = 0
        if (conv?.last_message_at) {
          const lastRead = row.last_read_at ?? '1970-01-01'
          unread = conv.last_message_at > lastRead ? 1 : 0
        }
        return {
          ...conv,
          unread_count: unread,
          participants,
          member_count: participants.length,
        }
      })
      .filter(Boolean) as Conversation[]

    saveCachedConversations(convs).catch(e => console.warn('Failed to cache conversations:', e))

    // Pre-cache all conversation participants in chatUsers store
    const participants = convs
      .flatMap(c => c.participants ?? [])
      .filter((p, index, self) => self.findIndex(u => u.id === p.id) === index)
    if (participants.length > 0) {
      saveCachedUsers(participants).catch(e => console.warn('Failed to cache conversation users:', e))
    }

    return convs
  } catch (err) {
    console.warn('[chatApi] getConversationsForUser failed, falling back to cache:', err)
    try {
      const cached = await getCachedConversations()
      return cached.filter(c => c.participants?.some(p => p.id === userId))
    } catch (cacheErr) {
      console.error('Failed to load cached conversations:', cacheErr)
      return []
    }
  }
}

export async function getGroupsForUser(userId: string): Promise<Conversation[]> {
  const all = await getConversationsForUser(userId)
  return all
    .filter(c => c.tipo === 'group')
    .sort((a, b) => {
      const at = a.last_message_at ?? a.created_at
      const bt = b.last_message_at ?? b.created_at
      return bt.localeCompare(at)
    })
}

export async function getDMsForUser(userId: string): Promise<Conversation[]> {
  const all = await getConversationsForUser(userId)
  return all
    .filter(c => c.tipo === 'individual')
    .sort((a, b) => {
      const at = a.last_message_at ?? a.created_at
      const bt = b.last_message_at ?? b.created_at
      return bt.localeCompare(at)
    })
}

async function handleOfflineCreateConv(convId: string, userA_id: string, userB_id: string): Promise<string | null> {
  try {
    const userA = await getSupabaseUserById(userA_id)
    const userB = await getSupabaseUserById(userB_id)
    
    const newConv: Conversation = {
      id: convId,
      tipo: 'individual',
      nome: null,
      bubble_group_id: null,
      last_message: null,
      last_message_at: null,
      unread_count: 0,
      created_at: new Date().toISOString(),
      participants: [userA!, userB!].filter(Boolean) as User[],
      member_count: 2
    }

    const cachedConvs = await getCachedConversations()
    await saveCachedConversations([...cachedConvs, newConv])
    await enqueueCreateConversation(convId, userA_id, userB_id)
    return convId
  } catch (err) {
    console.error('Failed to create conversation offline:', err)
    return null
  }
}

export async function createIndividualConversation(
  userA_id: string,
  userB_id: string
): Promise<string | null> {
  if (userA_id === userB_id) return null

  if (navigator.onLine) {
    const { data: existing } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userA_id)

    if (existing && existing.length > 0) {
      const convIds = existing.map((p: any) => p.conversation_id)
      const { data } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .in('conversation_id', convIds)
        .eq('user_id', userB_id)
        .eq('conversation_id', convIds[0])

      if (data && data.length > 0) return data[0].conversation_id
    }
  }

  const convId = generateUUID()

  if (navigator.onLine) {
    try {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ id: convId, tipo: 'individual' })
        .select('id')
        .single()

      if (convErr || !conv) throw new Error(convErr?.message || 'Failed to create conv')

      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: userA_id },
        { conversation_id: conv.id, user_id: userB_id },
      ])

      return conv.id
    } catch (err) {
      console.warn('Online createConversation failed, falling back to offline enqueue:', err)
      return await handleOfflineCreateConv(convId, userA_id, userB_id)
    }
  } else {
    return await handleOfflineCreateConv(convId, userA_id, userB_id)
  }
}

export async function createGroupConversation(
  name: string,
  memberIds: string[]
): Promise<string | null> {
  if (!name.trim() || memberIds.length < 2) return null

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ tipo: 'group', nome: name.trim() })
    .select('id')
    .single()

  if (convErr || !conv) return null

  const rows = Array.from(new Set(memberIds)).map(uid => ({
    conversation_id: conv.id,
    user_id: uid,
  }))

  const { error: partErr } = await supabase
    .from('conversation_participants')
    .insert(rows)

  if (partErr) {
    await supabase.from('conversations').delete().eq('id', conv.id)
    return null
  }

  return conv.id
}

export async function updateGroupConversation(
  convId: string,
  nome: string
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ nome: nome.trim() })
    .eq('id', convId)
  if (error) throw new Error(error.message)
}


export async function getGroupMembers(convId: string): Promise<User[]> {
  try {
    if (!navigator.onLine) throw new Error('Offline')
    const { data, error } = await supabase
      .from('conversation_participants')
      .select('user_id,users(id,bubble_id,nome,email,avatar_url,tipo_user_bubble)')
      .eq('conversation_id', convId)

    if (error) throw new Error(error.message)
    const list = (data ?? []).map((row: any) => row.users).filter(Boolean) as User[]
    return list
  } catch (err) {
    console.warn('[chatApi] getGroupMembers failed, falling back to cache:', err)
    try {
      const cachedConvs = await getCachedConversations()
      const found = cachedConvs.find(c => c.id === convId)
      return found?.participants ?? []
    } catch {
      return []
    }
  }
}

export async function addGroupMembers(convId: string, userIds: string[]): Promise<void> {
  const rows = userIds.map(uid => ({ conversation_id: convId, user_id: uid }))
  await supabase.from('conversation_participants').insert(rows)
}

export async function removeGroupMember(convId: string, userId: string): Promise<void> {
  await supabase
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', convId)
    .eq('user_id', userId)
}

export async function searchUsersForGroup(
  query: string,
  excludeUserId: string
): Promise<User[]> {
  try {
    if (!navigator.onLine) throw new Error('Offline')
    const q = query.trim()
    let req = supabase
      .from('users')
      .select('*')
      .neq('id', excludeUserId)
      .order('nome', { ascending: true })
      .limit(20)

    if (q) {
      req = req.or(`nome.ilike.%${q}%,email.ilike.%${q}%`)
    }

    const { data, error } = await req
    if (error) throw new Error(error.message)
    const list = (data ?? []) as User[]

    saveCachedUsers(list).catch(e => console.warn(e))
    return list
  } catch (err) {
    console.warn('[chatApi] searchUsersForGroup failed, falling back to cache:', err)
    try {
      const cached = await getCachedUsers()
      const filtered = cached.filter(u => u.id !== excludeUserId)
      if (query.trim()) {
        const lowerQ = query.toLowerCase()
        return filtered.filter(u => 
          u.nome.toLowerCase().includes(lowerQ) || 
          (u.email ?? '').toLowerCase().includes(lowerQ)
        ).slice(0, 20)
      }
      return filtered.slice(0, 20)
    } catch (cacheErr) {
      console.error(cacheErr)
      return []
    }
  }
}

export async function getChatContacts(excludeUserId: string): Promise<User[]> {
  try {
    if (!navigator.onLine) throw new Error('Offline')
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .neq('id', excludeUserId)
      .order('nome', { ascending: true })

    if (error) throw new Error(error.message)
    const list = (data ?? []) as User[]

    saveCachedUsers(list).catch(e => console.warn(e))
    return list
  } catch (err) {
    console.warn('[chatApi] getChatContacts failed, falling back to cache:', err)
    try {
      const cached = await getCachedUsers()
      return cached
        .filter(u => u.id !== excludeUserId)
        .sort((a, b) => a.nome.localeCompare(b.nome))
    } catch (cacheErr) {
      console.error(cacheErr)
      return []
    }
  }
}

// ──────────────────────────────────────────────
// MESSAGES
// ──────────────────────────────────────────────

export async function getMessages(conversationId: string, limit = 100): Promise<Message[]> {
  try {
    if (!navigator.onLine) throw new Error('Offline')
    const { data, error } = await supabase
      .from('messages')
      .select('*,sender:users(id,nome,email,avatar_url,tipo_user_bubble),chat_file:chat_files(*)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw new Error(error.message)

    const msgs = ((data ?? []) as any[]).map(m => {
      const cf = m.chat_file
      if (Array.isArray(cf)) m.chat_file = cf[0] ?? null
      else if (cf && Object.keys(cf).length === 0) m.chat_file = null
      return m
    }) as Message[]

    saveCachedMessages(conversationId, msgs).catch(e => console.warn('Failed to cache messages:', e))
    return msgs
  } catch (err) {
    console.warn('[chatApi] getMessages failed, falling back to cache:', err)
    try {
      return await getCachedMessages(conversationId)
    } catch (cacheErr) {
      console.error('Failed to load cached messages:', cacheErr)
      return []
    }
  }
}

export async function getChatFile(messageId: string): Promise<ChatFile | null> {
  const { data, error } = await supabase
    .from('chat_files')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle()

  if (error) {
    console.warn('[chatApi] getChatFile error:', error.message)
    return null
  }
  return (data as ChatFile) ?? null
}

export async function getChatFileById(id: string): Promise<ChatFile | null> {
  const { data, error } = await supabase
    .from('chat_files')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.warn('[chatApi] getChatFileById error:', error.message)
    return null
  }
  return (data as ChatFile) ?? null
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  tipo: 'text' | 'audio' = 'text',
  audioUrl?: string,
  transcription?: string,
  bubbleId?: string,
  id?: string
): Promise<Message | null> {
  const payload: any = {
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    tipo,
    audio_url: audioUrl ?? null,
    transcription: transcription ?? null,
    bubble_id: bubbleId ?? null,
  }
  if (id) payload.id = id;

  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('*,sender:users(id,nome,email,avatar_url,tipo_user_bubble),chat_file:chat_files(*)')
    .single()

  if (error) {
    console.error('sendMessage error:', error.message)
    return null
  }

  await supabase
    .from('conversations')
    .update({
      last_message: tipo === 'audio' ? 'Audio' : content,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  // Auto-mark as read for the sender
  await markConversationRead(conversationId, senderId)

  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', senderId)

  return data as Message
}

export async function markConversationRead(conversationId: string, userId?: string): Promise<void> {
  if (userId) {
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
  }
}

// ──────────────────────────────────────────────
// REALTIME
// ──────────────────────────────────────────────

export type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'JOINING'

export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (msg: Message) => void,
  onDeleted: (id: string) => void,
  onStatus?: (status: ChannelStatus, err?: any) => void
) {
  supabase.auth.getSession().then(({ data }) => {
    console.log('[chatApi] subscribeToMessages auth session check:', data.session ? `Authenticated as ${data.session.user.email}` : 'No active session (anonymous)')
  })

  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        console.log('[chatApi] postgres_changes messages INSERT payload:', payload)
        const msg = payload.new as Message
        if (msg.conversation_id === conversationId) {
          console.log('[chatApi] message INSERT (client-side matched)', msg)
          onNewMessage(msg)
        } else {
          console.warn('[chatApi] message INSERT conversationId mismatch:', msg.conversation_id, 'expected:', conversationId)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_files',
      },
      async (payload) => {
        console.log('[chatApi] postgres_changes chat_files INSERT payload:', payload)
        const newFile = payload.new as { id?: string; message_id?: string }
        if (!newFile?.id) return
        const cf = await getChatFileById(newFile.id)
        if (cf) {
          console.log('[chatApi] chat_file resolved and matched:', cf)
          onNewMessage({ id: cf.message_id, chat_file: cf } as unknown as Message)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        console.log('[chatApi] postgres_changes messages DELETE payload:', payload)
        onDeleted((payload.old as any).id)
      }
    )

  if (onStatus) {
    channel.subscribe((status, err) => {
      console.log('[chatApi] channel status', status, err?.message ?? '')
      onStatus(status as ChannelStatus, err)
    })
  } else {
    channel.subscribe((status, err) => console.log('[chatApi] channel status', status, err?.message ?? ''))
  }

  return channel;
}

export function subscribeToConversations(
  userId: string,
  onUpdate: () => void
) {
  return supabase
    .channel(`conversations:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_participants',
        filter: `user_id=eq.${userId}`,
      },
      () => onUpdate()
    )
    .subscribe()
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
