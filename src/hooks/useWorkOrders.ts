import { useState, useEffect, useCallback } from 'react';
import type { WorkOrder, WorkOrderStatus, SyncQueueItem } from '../types';
import {
  getAllWorkOrders,
  saveWorkOrder,
  saveWorkOrders,
  getWorkOrder,
  addToSyncQueue,
} from '../services/db';
import { fetchWorkOrders } from '../services/api';
import { useOnlineStatus } from './useOnlineStatus';

export function useWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline) {
        try {
          const remote = await fetchWorkOrders();
          console.log('API response:', remote);
          const mapped = remote.map((wo) => ({ ...wo, synced: true }));
          await saveWorkOrders(mapped);
          setWorkOrders(mapped);
        } catch (err) {
          console.error('Fetch WO error:', err);
          const local = await getAllWorkOrders();
          setWorkOrders(local);
        }
      } else {
        const local = await getAllWorkOrders();
        setWorkOrders(local);
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  const updateStatus = useCallback(
    async (id: string, status: WorkOrderStatus, notes?: string) => {
      const wo = await getWorkOrder(id);
      if (!wo) return;

      const updated: WorkOrder = {
        ...wo,
        status,
        notes: notes || wo.notes,
        updated_at: new Date().toISOString(),
        synced: false,
      };
      await saveWorkOrder(updated);

      const syncItem: SyncQueueItem = {
        id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        action: status === 'completed' ? 'complete_wo' : 'update_status',
        work_order_id: id,
        payload: { status, notes },
        attempts: 0,
        max_attempts: 5,
        created_at: new Date().toISOString(),
      };
      await addToSyncQueue(syncItem);

      setWorkOrders((prev) =>
        prev.map((w) => (w.id === id ? updated : w))
      );
    },
    []
  );

  return { workOrders, loading, refresh: loadWorkOrders, updateStatus };
}
