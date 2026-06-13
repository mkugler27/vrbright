import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Photo, SyncQueueItem, PendingChatFile } from '../types';
import type { WorkOrderRow } from './workingOrdersApi';
import type { Conversation, Message } from './chatApi';
import type { User } from './supabase';

interface VRBrightDB extends DBSchema {
  chatConversations: {
    key: string;
    value: Conversation;
  };
  chatMessages: {
    key: string;
    value: Message;
    indexes: { 'by-conversation': string };
  };
  chatUsers: {
    key: string;
    value: User;
  };
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
    key: string; // user id (bubble id) — full list cache per user
    value: {
      key: string;
      data: WorkOrderRow[];
      cached_at: string;
    };
  };
  woDetail: {
    key: string; // wo _id
    value: {
      _id: string;
      data: WorkOrderRow;
      cached_at: string;
    };
  };
  pendingChatFiles: {
    key: string;
    value: PendingChatFile;
    indexes: { 'by-created': string };
  };
}

let dbInstance: IDBPDatabase<VRBrightDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<VRBrightDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<VRBrightDB>('vrbright-db', 7, {
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
      if (oldVersion < 4) {
        db.createObjectStore('woDetail', { keyPath: '_id' });
      }
      if (oldVersion < 5) {
        const store = db.createObjectStore('pendingChatFiles', { keyPath: 'id' });
        store.createIndex('by-created', 'created_at');
      }
      if (oldVersion < 6) {
        db.createObjectStore('chatConversations', { keyPath: 'id' });
        const store = db.createObjectStore('chatMessages', { keyPath: 'id' });
        store.createIndex('by-conversation', 'conversation_id');
      }
      if (oldVersion < 7) {
        db.createObjectStore('chatUsers', { keyPath: 'id' });
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

// Working orders list cache (keyed by an arbitrary string — e.g. user id,
// date, or "open_<userId>" used by WOPage). Returns the array directly.
export async function saveWOCache(key: string, wos: WorkOrderRow[]): Promise<void> {
  const db = await getDB();
  await db.put('woCache', { key, data: wos, cached_at: new Date().toISOString() });
}

export async function getWOCache(key: string): Promise<WorkOrderRow[]> {
  const db = await getDB();
  const entry = await db.get('woCache', key);
  return (entry?.data as WorkOrderRow[]) ?? [];
}

// Working order detail cache (keyed by wo _id)
export async function saveWODetail(wo: WorkOrderRow): Promise<void> {
  const db = await getDB();
  await db.put('woDetail', { _id: wo._id, data: wo, cached_at: new Date().toISOString() });
}

export async function getWODetail(woId: string): Promise<{ data: WorkOrderRow; cached_at: string } | null> {
  const db = await getDB();
  const entry = await db.get('woDetail', woId);
  if (!entry) return null;
  return { data: entry.data as WorkOrderRow, cached_at: entry.cached_at };
}

// Chat conversations cache
export async function saveCachedConversations(convs: Conversation[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chatConversations', 'readwrite');
  for (const c of convs) {
    await tx.store.put(c);
  }
  await tx.done;
}

export async function getCachedConversations(): Promise<Conversation[]> {
  const db = await getDB();
  return db.getAll('chatConversations');
}

// Chat messages cache (stores last 100 messages per conversation)
export async function saveCachedMessages(convId: string, msgs: Message[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chatMessages', 'readwrite');
  for (const m of msgs) {
    await tx.store.put(m);
  }
  await tx.done;

  // Trim to 100 messages for this conversation to prevent storage bloat
  const allMsgs = await getCachedMessages(convId);
  if (allMsgs.length > 100) {
    const sorted = allMsgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const toDelete = sorted.slice(0, sorted.length - 100);
    const deleteTx = db.transaction('chatMessages', 'readwrite');
    for (const m of toDelete) {
      await deleteTx.store.delete(m.id);
    }
    await deleteTx.done;
  }
}

export async function getCachedMessages(convId: string): Promise<Message[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('chatMessages', 'by-conversation', convId);
  return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function clearChatCache(): Promise<void> {
  const db = await getDB();
  await db.clear('chatConversations');
  await db.clear('chatMessages');
  await db.clear('chatUsers');
}

export async function saveCachedUsers(users: User[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chatUsers', 'readwrite');
  for (const u of users) {
    await tx.store.put(u);
  }
  await tx.done;
}

export async function getCachedUsers(): Promise<User[]> {
  const db = await getDB();
  return db.getAll('chatUsers');
}