import { useEffect } from 'react'
import { useOnlineStatus } from './useOnlineStatus'
import { processQueue, getQueueLength, getLastSyncTime } from '../services/syncQueue'
import { processPendingChatFiles } from '../services/chatMedia'

// Auto-processes the sync queue whenever the user comes back online
// AND every 10 seconds while online (to catch items added while the
// user is browsing). Returns the queue length for the UI badge.
export function useSyncQueue(onQueueChange?: (n: number) => void) {
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!isOnline) return

    let cancelled = false
    async function runOnce(reason: string) {
      const media = await processPendingChatFiles()
      if (cancelled) return
      if (media.ok || media.fail) {
        console.log(`[useSyncQueue:${reason}] pending chat files:`, media)
      }
      const result = await processQueue()
      if (cancelled) return
      if (result.ok || result.fail) {
        console.log(`[useSyncQueue:${reason}] sync queue:`, result)
      }
      const n = await getQueueLength()
      onQueueChange?.(n)
    }

    // 1) Fire once on mount/online
    const initial = setTimeout(() => runOnce('initial'), 500)
    // 2) Then poll every 10s while online — catches items added while
    //    the user is already online
    const recurring = setInterval(() => runOnce('recurring'), 10000)

    return () => {
      cancelled = true
      clearTimeout(initial)
      clearInterval(recurring)
    }
  }, [isOnline, onQueueChange])

  return { isOnline }
}

export { getQueueLength, getLastSyncTime }