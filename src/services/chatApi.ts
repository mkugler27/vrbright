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
  const { error } = await supabase.from('users').upsert(
    { bubble_id: bubbleId, nome, email, role },
    { onConflict: 'bubble_id' }
  )
  if (error) console.error('syncUser error:', error.message)
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
  // Pega conversas onde o usuário é participante
  const { data } = await supabase
    .from('conversation_participants')
    .select(`
      conversation_id,
      conversations (
        id, tipo, nome, bubble_group_id, last_message, last_message_at, unread_count, created_at,
        users:conversation_participants!inner(user_id, users(id, bubble_id, nome, email, role, avatar_url))
      )
    `)
    .eq('user_id', userId)

  if (!data) return []

  // Flatten nested structure
  return data.map((row: any) => {
    const conv: any = row.conversations
    return {
      ...conv,
      participants: conv.users?.map((p: any) => p.users).filter(Boolean) ?? [],
    }
  })
}

export async function createIndividualConversation(
  userA_id: string,
  userB_id: string
): Promise<string | null> {
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

  // Update last_message and unread_count on the conversation
  // First, get current unread_count to increment it (don't reset to 1)
  const { data: currentConv } = await supabase
    .from('conversations')
    .select('unread_count')
    .eq('id', conversationId)
    .single()

  const newUnread = ((currentConv as any)?.unread_count ?? 0) + 1
  await supabase
    .from('conversations')
    .update({
      last_message: tipo === 'audio' ? 'Audio' : content,
      last_message_at: new Date().toISOString(),
      unread_count: newUnread,
    })
    .eq('id', conversationId)

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
  // Reset unread_count so the badge disappears
  await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId)
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