import { useEffect } from 'react'
import { useOnlineStatus } from './useOnlineStatus'
import { processQueue, getQueueLength, getLastSyncTime } from '../services/syncQueue'
import { processPendingChatFiles } from '../services/chatMedia'

// Auto-processes the sync queue whenever the user comes back online.
// Returns the queue length and last sync time so the UI can show a badge.
export function useSyncQueue(onQueueChange?: (n: number) => void) {
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!isOnline) return

    let cancelled = false
    async function run() {
      // 1) Upload any blobs that were queued offline, then they create
      //    a message + chat_files row + a syncQueue 'send_chat_file' item.
      const media = await processPendingChatFiles()
      if (cancelled) return
      if (media.ok || media.fail) {
        console.log('Pending chat files processed:', media)
      }

      // 2) Drain the queue — this handles Bubble sync for chat files + WO actions.
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