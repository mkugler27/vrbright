import { supabase } from './supabase'
import type { User } from './supabase'

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
}

// ──────────────────────────────────────────────
// USERS
// ──────────────────────────────────────────────

export async function syncUserFromBubble(
  bubbleId: string,
  nome: string,
  email: string,
  role: string
): Promise<void> {
  // Try to update first by bubble_id; insert if not found
  // This avoids the duplicate-row problem that upsert can cause
  // when bubble_id has no UNIQUE constraint
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('bubble_id', bubbleId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('users')
      .update({ nome, email, role })
      .eq('id', existing.id)
  } else {
    await supabase.from('users').insert({ bubble_id: bubbleId, nome, email, role })
  }
}

export async function getSupabaseUserByBubbleId(bubbleId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('bubble_id', bubbleId)
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
  // Pega conversas onde o usuário é participante, incluindo o last_read_at
  // deste participante específico (para calcular unread por conversa)
  const { data } = await supabase
    .from('conversation_participants')
    .select(`
      conversation_id,
      last_read_at,
      conversations (
        id, tipo, nome, bubble_group_id, last_message, last_message_at, created_at,
        users:conversation_participants!inner(user_id, users(id, bubble_id, nome, email, role, avatar_url))
      )
    `)
    .eq('user_id', userId)

  if (!data) return []

  // Flatten nested structure and compute per-conversation unread,
  // and filter out self-conversations (orphan conversations where the
  // current user is the only distinct participant).
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
      }
    })
    .filter(Boolean) as Conversation[]
}

export async function createIndividualConversation(
  userA_id: string,
  userB_id: string
): Promise<string | null> {
  // Don't allow self-conversations
  if (userA_id === userB_id) return null

  // Verifica se já existe conversa individual entre os dois
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

  // Cria nova conversa
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

// ──────────────────────────────────────────────
// MESSAGES
// ──────────────────────────────────────────────

export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select(`*, sender:users(id, nome, email, role, avatar_url)`)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).reverse() as Message[]
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
    .select(`*, sender:users(id, nome, email, role, avatar_url)`)
    .single()

  if (error) {
    console.error('sendMessage error:', error.message)
    return null
  }

  // Unread is derived from `last_message_at > last_read_at`, so we only need
  // to bump `last_message` and `last_message_at` on the conversation.
  await supabase
    .from('conversations')
    .update({
      last_message: tipo === 'audio' ? 'Audio' : content,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  // Mark the sender as read up to this message so their own message
  // doesn't count as unread on this conversation.
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', senderId)

  return data as Message
}

export async function markConversationRead(conversationId: string, userId?: string): Promise<void> {
  // Update last_read_at on my participant row (drives unread count)
  if (userId) {
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
  }
}

// ──────────────────────────────────────────────
// REALTIME SUBSCRIPTION
// ──────────────────────────────────────────────

export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (msg: Message) => void
) {
  return supabase
    .channel(`messages:${conversationId}`)
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
    .subscribe()
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