import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { WorkOrder, Photo, SyncQueueItem } from '../types';

interface VRBrightDB extends DBSchema {
  workOrders: {
    key: string;
    value: WorkOrder;
    indexes: { 'by-status': WorkOrderStatus; 'by-date': string };
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
}

type WorkOrderStatus = WorkOrder['status'];

let dbInstance: IDBPDatabase<VRBrightDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<VRBrightDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<VRBrightDB>('vrbright-db', 1, {
    upgrade(db) {
      const woStore = db.createObjectStore('workOrders', { keyPath: 'id' });
      woStore.createIndex('by-status', 'status');
      woStore.createIndex('by-date', 'scheduled_date');

      const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
      photoStore.createIndex('by-work-order', 'work_order_id');

      const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
      syncStore.createIndex('by-created', 'created_at');
    },
  });

  return dbInstance;
}

export async function getAllWorkOrders(): Promise<WorkOrder[]> {
  const db = await getDB();
  return db.getAll('workOrders');
}

export async function getWorkOrder(id: string): Promise<WorkOrder | undefined> {
  const db = await getDB();
  return db.get('workOrders', id);
}

export async function saveWorkOrder(wo: WorkOrder): Promise<void> {
  const db = await getDB();
  await db.put('workOrders', wo);
}

export async function saveWorkOrders(orders: WorkOrder[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('workOrders', 'readwrite');
  await Promise.all([
    ...orders.map((wo) => tx.store.put(wo)),
    tx.done,
  ]);
}

export async function getPhotosByWorkOrder(workOrderId: string): Promise<Photo[]> {
  const db = await getDB();
  return db.getAllFromIndex('photos', 'by-work-order', workOrderId);
}

export async function savePhoto(photo: Photo): Promise<void> {
  const db = await getDB();
  await db.put('photos', photo);
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('photos', id);
}

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put('syncQueue', item);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncQueue', 'by-created');
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

export async function updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put('syncQueue', item);
}
