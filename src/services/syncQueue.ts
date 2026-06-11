import { getDB, getMeta, setMeta } from './db'
import type { SyncQueueItem } from '../types'
import type { WorkOrderRow } from './workingOrdersApi'
import { BUBBLE_TOKEN } from '../config/api'

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

let processing = false

export async function processQueue(): Promise<{ ok: number; fail: number }> {
  if (processing) return { ok: 0, fail: 0 }
  if (!navigator.onLine) return { ok: 0, fail: 0 }

  processing = true
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
    processing = false
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
