import { useEffect } from 'react'
import { useOnlineStatus } from './useOnlineStatus'
import { processQueue, getQueueLength, getLastSyncTime } from '../services/syncQueue'

// Auto-processes the sync queue whenever the user comes back online.
// Returns the queue length and last sync time so the UI can show a badge.
export function useSyncQueue(onQueueChange?: (n: number) => void) {
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!isOnline) return

    let cancelled = false
    async function run() {
      const result = await processQueue()
      if (cancelled) return
      console.log('Sync queue processed:', result)
      const n = await getQueueLength()
      onQueueChange?.(n)
    }

    // Process after a small delay to let any UI update settle
    const t = setTimeout(run, 500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isOnline, onQueueChange])

  return { isOnline }
}

export { getQueueLength, getLastSyncTime }