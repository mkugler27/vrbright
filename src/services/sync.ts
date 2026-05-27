import type { SyncQueueItem, Photo } from '../types';
import {
  getSyncQueue,
  removeSyncQueueItem,
  updateSyncQueueItem,
  getPhotosByWorkOrder,
} from './db';
import * as api from './api';

const BASE_DELAY = 1000;

let isSyncing = false;
let onSyncChange: (() => void) | null = null;

export function setSyncListener(listener: () => void) {
  onSyncChange = listener;
}

export async function processSyncQueue(): Promise<void> {
  if (isSyncing || !navigator.onLine) return;

  isSyncing = true;
  onSyncChange?.();

  try {
    const queue = await getSyncQueue();

    for (const item of queue) {
      if (item.attempts >= item.max_attempts) continue;

      try {
        await processItem(item);
        await removeSyncQueueItem(item.id);
      } catch (error) {
        const updated: SyncQueueItem = {
          ...item,
          attempts: item.attempts + 1,
          last_attempt_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        await updateSyncQueueItem(updated);

        const delay = BASE_DELAY * Math.pow(2, updated.attempts);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  } finally {
    isSyncing = false;
    onSyncChange?.();
  }
}

async function processItem(item: SyncQueueItem): Promise<void> {
  switch (item.action) {
    case 'update_status':
      await api.updateWorkOrderStatus(
        item.work_order_id,
        item.payload.status as string,
        item.payload.notes as string | undefined
      );
      break;

    case 'update_notes':
      await api.updateWorkOrderStatus(
        item.work_order_id,
        item.payload.status as string,
        item.payload.notes as string
      );
      break;

    case 'upload_photo': {
      const photos = await getPhotosByWorkOrder(item.work_order_id);
      const photo = photos.find((p: Photo) => p.id === item.payload.photo_id);
      if (photo) {
        await api.uploadPhoto(item.work_order_id, photo.blob, photo.caption);
      }
      break;
    }

    case 'complete_wo':
      await api.completeWorkOrder(
        item.work_order_id,
        item.payload.notes as string
      );
      break;
  }
}

export function getIsSyncing(): boolean {
  return isSyncing;
}
