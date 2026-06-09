import { useEffect } from 'react'
import { useOnlineStatus } from './useOnlineStatus'
import { processQueue, getQueueLength, getLastSyncTime } from '../services/syncQueue'
import { useAuth } from '../context/AuthContext'

// Auto-processes the sync queue whenever the user comes back online.
// Returns the queue length and last sync time so the UI can show a badge.
export function useSyncQueue(onQueueChange?: (n: number) => void) {
  const isOnline = useOnlineStatus()
  const { user } = useAuth()

  useEffect(() => {
    if (!isOnline || !user?.token) return
    const token = user.token

    let cancelled = false
    async function run() {
      const result = await processQueue(token)
      if (cancelled) return
      console.log('Sync queue processed:', result)
      const n = await getQueueLength()
      onQueueChange?.(n)
    }

    // Process after a small delay to let any UI update settle
    const t = setTimeout(run, 500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isOnline, user?.token, onQueueChange])

  return { isOnline }
}

export { getQueueLength, getLastSyncTime }