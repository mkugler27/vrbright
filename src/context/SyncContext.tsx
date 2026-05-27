import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { SyncQueueItem } from '../types';
import { getSyncQueue } from '../services/db';
import { processSyncQueue, setSyncListener } from '../services/sync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface SyncContextType {
  queue: SyncQueueItem[];
  isSyncing: boolean;
  pendingCount: number;
  triggerSync: () => Promise<void>;
  refreshQueue: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isOnline = useOnlineStatus();

  const refreshQueue = useCallback(async () => {
    const items = await getSyncQueue();
    setQueue(items);
  }, []);

  useEffect(() => {
    refreshQueue();
    setSyncListener(() => {
      refreshQueue();
      setIsSyncing((prev) => !prev);
    });
  }, [refreshQueue]);

  useEffect(() => {
    if (isOnline) {
      triggerSync();
    }
  }, [isOnline]);

  const triggerSync = async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      await processSyncQueue();
    } finally {
      setIsSyncing(false);
      await refreshQueue();
    }
  };

  return (
    <SyncContext.Provider
      value={{
        queue,
        isSyncing,
        pendingCount: queue.length,
        triggerSync,
        refreshQueue,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextType {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
