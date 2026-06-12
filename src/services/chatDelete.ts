import { supabase } from './supabase'
import { getDB } from './db'

export interface DeleteMessageParams {
  messageId: string
  currentUserId: string
  currentUserEmail: string
}

export async function deleteMessage({
  messageId,
  currentUserId,
  currentUserEmail,
}: DeleteMessageParams): Promise<void> {
  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .single()

  if (msgErr || !msg) {
    throw new Error('Message not found')
  }

  if (msg.sender_id !== currentUserId) {
    throw new Error('You can only delete your own messages')
  }

  const { data: cf } = await supabase
    .from('chat_files')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle()

  if (cf?.public_url) {
    const db = await getDB()
    await db.put('syncQueue', {
      id: `cfq_del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action: 'send_chat_file_delete',
      chat_file_id: cf.id,
      payload: {
        email_worker: currentUserEmail,
        file_url: cf.public_url,
        del: true,
      },
      attempts: 0,
      max_attempts: 5,
      created_at: new Date().toISOString(),
    })
  }

  if (cf?.storage_path) {
    supabase.storage.from('chat-media').remove([cf.storage_path]).catch(() => {})
  }

  const { error: delErr } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)

  if (delErr) {
    throw new Error('Delete failed: ' + delErr.message)
  }
}
