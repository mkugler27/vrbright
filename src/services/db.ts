import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Photo, SyncQueueItem } from '../types';
import type { WorkOrderRow } from './workingOrdersApi';

interface VRBrightDB extends DBSchema {
  workOrders: {
    key: string;
    value: unknown;
    indexes: { 'by-status': string; 'by-date': string };
  };
  photos: {
    key: string;
    value: Photo;
    indexes: { 'by-work-order': string };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { 'by-created': string };
  };
  team: {
    key: string; // member _id
    value: {
      _id: string;
      data: unknown;
      cached_at: string; // ISO timestamp
    };
    indexes: { 'by-cached': string };
  };
  meta: {
    key: string; // arbitrary key like 'team_last_sync'
    value: { key: string; value: unknown; updated_at: string };
  };
  woCache: {
    key: string; // YYYY-MM-DD (today's date)
    value: {
      key: string;
      data: WorkOrderRow[];
      cached_at: string;
    };
  };
}

let dbInstance: IDBPDatabase<VRBrightDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<VRBrightDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<VRBrightDB>('vrbright-db', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
        photoStore.createIndex('by-work-order', 'work_order_id');
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncStore.createIndex('by-created', 'created_at');
      }
      if (oldVersion < 2) {
        const teamStore = db.createObjectStore('team', { keyPath: '_id' });
        teamStore.createIndex('by-cached', 'cached_at');
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 3) {
        db.createObjectStore('woCache', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

// Generic meta helpers (for "last sync" timestamps etc)
export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('meta', { key, value, updated_at: new Date().toISOString() });
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const entry = await db.get('meta', key);
  return entry?.value as T | undefined;
}

// Team cache helpers
export async function saveTeamCache(members: unknown[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('team', 'readwrite');
  const now = new Date().toISOString();
  for (const m of members) {
    const member = m as { _id: string };
    await tx.store.put({ _id: member._id, data: m, cached_at: now });
  }
  await tx.done;
  await setMeta('team_last_sync', now);
}

export async function getTeamCache(): Promise<unknown[]> {
  const db = await getDB();
  const all = await db.getAll('team');
  return all
    .sort((a, b) => a._id.localeCompare(b._id))
    .map((entry) => entry.data);
}

export async function getTeamLastSync(): Promise<string | undefined> {
  return getMeta<string>('team_last_sync');
}

export async function clearTeamCache(): Promise<void> {
  const db = await getDB();
  await db.clear('team');
  await setMeta('team_last_sync', null);
}

// Working orders cache (keyed by YYYY-MM-DD)
export async function saveWOCache(dateKey: string, wos: WorkOrderRow[]): Promise<void> {
  const db = await getDB();
  await db.put('woCache', { key: dateKey, data: wos, cached_at: new Date().toISOString() });
}

export async function getWOCache(dateKey: string): Promise<WorkOrderRow[]> {
  const db = await getDB();
  const entry = await db.get('woCache', dateKey);
  return (entry?.data as WorkOrderRow[]) ?? [];
}