import { supabase } from './supabase'
import type { User } from './supabase'
import type { ChatFile } from '../types'

export type Conversation = {
  id: string
  tipo: 'individual' | 'group'
  nome: string | null
  bubble_group_id: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
  participants?: User[]
  member_count?: number
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
  profile: { nome: string; email: string; role: string; avatar_url?: string; bubble_id?: string; tipo_user_bubble?: string }
): Promise<void> {
  await supabase.from('users').upsert(
    { id: supabaseId, ...profile },
    { onConflict: 'id' }
  )
}

export async function getSupabaseUserById(supabaseId: string): Promise<User | null> {
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
  const { data } = await supabase
    .from('conversation_participants')
    .select(`
      conversation_id,
      last_read_at,
      conversations (
        id, tipo, nome, bubble_group_id, last_message, last_message_at, created_at,
        users:conversation_participants!inner(user_id, users(id, bubble_id, nome, email, role, avatar_url, tipo_user_bubble))
      )
    `)
    .eq('user_id', userId)

  if (!data) return []

  return data
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

export async function createIndividualConversation(
  userA_id: string,
  userB_id: string
): Promise<string | null> {
  if (userA_id === userB_id) return null

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

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ tipo: 'individual' })
    .select('id')
    .single()

  if (convErr || !conv) return null

  await supabase.from('conversation_participants').insert([
    { conversation_id: conv.id, user_id: userA_id },
    { conversation_id: conv.id, user_id: userB_id },
  ])

  return conv.id
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

export async function getGroupMembers(convId: string): Promise<User[]> {
  const { data } = await supabase
    .from('conversation_participants')
    .select('user_id, users(id, bubble_id, nome, email, role, avatar_url, tipo_user_bubble)')
    .eq('conversation_id', convId)

  if (!data) return []
  return data.map((row: any) => row.users).filter(Boolean) as User[]
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

  const { data } = await req
  return (data ?? []) as User[]
}

// ──────────────────────────────────────────────
// MESSAGES
// ──────────────────────────────────────────────

export async function getMessages(conversationId: string, limit = 100): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      sender:users(id, nome, email, role, avatar_url, tipo_user_bubble),
      chat_file:chat_files(*)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[chatApi] getMessages error:', error.message)
    return []
  }

  return (data ?? []) as Message[]
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

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  tipo: 'text' | 'audio' = 'text',
  audioUrl?: string,
  transcription?: string,
  bubbleId?: string
): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      tipo,
      audio_url: audioUrl ?? null,
      transcription: transcription ?? null,
      bubble_id: bubbleId ?? null,
    })
    .select(`
      *,
      sender:users(id, nome, email, role, avatar_url, tipo_user_bubble),
      chat_file:chat_files(*)
    `)
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
  const channel = supabase
    .channel(`messages:${conversationId}`, {
      config: { broadcast: { self: false }, presence: { key: '' } },
    })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onNewMessage(payload.new as Message)
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onDeleted((payload.old as any).id)
    )

  if (onStatus) {
    channel.subscribe((status, err) => onStatus(status as ChannelStatus, err))
  } else {
    channel.subscribe()
  }

  return channel
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
