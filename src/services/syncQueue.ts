import { getDB, getMeta, setMeta } from './db'
import type { SyncQueueItem } from '../types'
import type { WorkOrderRow } from './workingOrdersApi'
import { BUBBLE_TOKEN, CHAT_FILE_RECEIVE_URL } from '../config/api'
import { supabase } from './supabase'

const PATCH_URL = 'https://system.vrbrightpainting.com/version-test/api/1.1/obj/workingorders'

// ──────────────────────────────────────────────
// ENQUEUE
// ──────────────────────────────────────────────

export async function enqueueUpdate(
  workOrderId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDB()
  const id = `wo_${workOrderId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const item: SyncQueueItem = {
    id,
    action: 'update_status',
    work_order_id: workOrderId,
    payload,
    attempts: 0,
    max_attempts: 5,
    created_at: new Date().toISOString(),
  }
  await db.put('syncQueue', item)
}

export async function enqueueChatMessage(
  messageId: string,
  conversationId: string,
  senderId: string,
  content: string,
  createdIso: string
): Promise<void> {
  const db = await getDB()
  const id = `msg_${messageId}`
  const item: SyncQueueItem = {
    id,
    action: 'send_chat_message',
    payload: {
      id: messageId,
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      tipo: 'text',
      created_at: createdIso,
    },
    attempts: 0,
    max_attempts: 5,
    created_at: new Date().toISOString(),
  }
  await db.put('syncQueue', item)
}

export async function enqueueCreateConversation(
  conversationId: string,
  userA_id: string,
  userB_id: string
): Promise<void> {
  const db = await getDB()
  const id = `conv_${conversationId}`
  const item: SyncQueueItem = {
    id,
    action: 'create_conversation',
    payload: {
      id: conversationId,
      userA_id,
      userB_id,
    },
    attempts: 0,
    max_attempts: 5,
    created_at: new Date().toISOString(),
  }
  await db.put('syncQueue', item)
}

// ──────────────────────────────────────────────
// QUEUE LENGTH / STATUS
// ──────────────────────────────────────────────

export async function getQueueLength(): Promise<number> {
  const db = await getDB()
  return db.count('syncQueue')
}

export async function getPendingForWO(workOrderId: string): Promise<SyncQueueItem[]> {
  const db = await getDB()
  const all = await db.getAll('syncQueue')
  return all.filter(i => i.work_order_id === workOrderId)
}

// ──────────────────────────────────────────────
// PROCESS QUEUE (when online)
// ──────────────────────────────────────────────

// Vite HMR can re-import this module, losing the module-level `processing`
// flag. Stash it on globalThis so concurrent processors across HMR
// re-imports still see each other.
const GLOBAL_KEY = '__vrbright_syncProcessing'
if (typeof globalThis !== 'undefined' && !(GLOBAL_KEY in (globalThis as any))) {
  ;(globalThis as any)[GLOBAL_KEY] = false
}

export async function processQueue(): Promise<{ ok: number; fail: number }> {
  if ((globalThis as any)[GLOBAL_KEY]) return { ok: 0, fail: 0 }
  if (!navigator.onLine) return { ok: 0, fail: 0 }
  ;(globalThis as any)[GLOBAL_KEY] = true

  let ok = 0
  let fail = 0

  try {
    const db = await getDB()
    const items = await db.getAllFromIndex('syncQueue', 'by-created')

    for (const item of items) {
      if (item.attempts >= item.max_attempts) {
        console.warn('SyncQueue: max attempts reached, skipping', item.id)
        fail++
        continue
      }

      try {
        if (item.action === 'create_conversation') {
          const current = await db.get('syncQueue', item.id)
          if (!current) continue

          const convId = item.payload.id as string
          const userA = item.payload.userA_id as string
          const userB = item.payload.userB_id as string

          const { error: convErr } = await supabase
            .from('conversations')
            .insert({ id: convId, tipo: 'individual' })

          if (convErr) {
            const isDuplicate = convErr.code === '23505' || convErr.message?.includes('duplicate key')
            if (!isDuplicate) {
              throw new Error(`Create conversation offline failed: ${convErr.message}`)
            }
          }

          const { error: partErr } = await supabase
            .from('conversation_participants')
            .insert([
              { conversation_id: convId, user_id: userA },
              { conversation_id: convId, user_id: userB }
            ])

          if (partErr) {
            const isDuplicate = partErr.code === '23505' || partErr.message?.includes('duplicate key')
            if (!isDuplicate) {
              throw new Error(`Create participants offline failed: ${partErr.message}`)
            }
          }

          await db.delete('syncQueue', item.id)
          ok++
          continue
        }

        if (item.action === 'send_chat_message') {
          const current = await db.get('syncQueue', item.id)
          if (!current) continue

          const { error: msgErr } = await supabase
            .from('messages')
            .insert({
              id: item.payload.id,
              conversation_id: item.payload.conversation_id,
              sender_id: item.payload.sender_id,
              content: item.payload.content,
              tipo: item.payload.tipo,
              created_at: item.payload.created_at,
            })

          if (msgErr) {
            const isDuplicate = msgErr.code === '23505' || msgErr.message?.includes('duplicate key')
            if (!isDuplicate) {
              throw new Error(`Supabase offline message insert failed: ${msgErr.message}`)
            }
          }

          // Update conversations last_message
          await supabase
            .from('conversations')
            .update({
              last_message: item.payload.content,
              last_message_at: item.payload.created_at,
            })
            .eq('id', item.payload.conversation_id)

          await db.delete('syncQueue', item.id)
          ok++
          continue
        }

        if (item.action === 'send_chat_file_delete') {
          const current = await db.get('syncQueue', item.id)
          if (!current) continue

          const res = await fetch(CHAT_FILE_RECEIVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          })

          if (!res.ok) {
            throw new Error(`Bubble chat file delete sync failed: ${res.status}`)
          }

          await db.delete('syncQueue', item.id)
          ok++
          continue
        }

        if (item.action === 'send_chat_file') {
          // Idempotency check: re-read the item from IDB. If it was
          // already deleted (by a concurrent processor), skip.
          const current = await db.get('syncQueue', item.id)
          if (!current) {
            console.log(`[syncQueue] item ${item.id} already processed, skipping`)
            continue
          }

          // POST to Bubble workflow (wf/receive_file) with the public URL
          // + worker email. The workflow stores the reference in Bubble.
          // Workflow is public — no Authorization header.
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          const res = await fetch(CHAT_FILE_RECEIVE_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload),
          })

          if (!res.ok) {
            throw new Error(`Bubble chat file sync failed: ${res.status}`)
          }

          // Mark the chat_files row as synced in Supabase
          if (item.chat_file_id) {
            await supabase
              .from('chat_files')
              .update({ synced: true })
              .eq('id', item.chat_file_id)
          }

          // Delete from queue only after a successful POST. The check
          // at the top of the loop on the next processor run will skip
          // already-processed items.
          await db.delete('syncQueue', item.id)
          ok++
          continue
        }

        // Default: PATCH the working order
        if (!item.work_order_id) {
          throw new Error('SyncQueue item missing work_order_id')
        }
        const res = await fetch(`${PATCH_URL}/${item.work_order_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${BUBBLE_TOKEN}`,
          },
          body: JSON.stringify(item.payload),
        })

        if (!res.ok) {
          throw new Error(`Bubble PATCH failed: ${res.status}`)
        }

        // Success — remove from queue
        await db.delete('syncQueue', item.id)
        ok++
      } catch (err: any) {
        // Failure — increment attempts
        const updated: SyncQueueItem = {
          ...item,
          attempts: item.attempts + 1,
          last_attempt_at: new Date().toISOString(),
          error: err?.message ?? String(err),
        }
        await db.put('syncQueue', updated)
        fail++
      }
    }

    await setMeta('syncQueue_last_run', new Date().toISOString())
  } finally {
    ;(globalThis as any)[GLOBAL_KEY] = false
  }

  return { ok, fail }
}

export async function getLastSyncTime(): Promise<string | undefined> {
  return getMeta<string>('syncQueue_last_run')
}

// ──────────────────────────────────────────────
// OPTIMISTIC UPDATE — mutates local cache while
// enqueuing the change for later sync.
// ──────────────────────────────────────────────

export async function applyLocalWOUpdate(
  woList: WorkOrderRow[],
  woId: string,
  patch: Partial<WorkOrderRow>
): Promise<WorkOrderRow[]> {
  return woList.map(wo => (wo._id === woId ? { ...wo, ...patch } : wo))
}
