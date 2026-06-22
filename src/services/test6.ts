import { getCachedConversations, getDB } from './db'

export async function test() {
  const db = await getDB()
  const syncQueue = await db.getAll('syncQueue')
  console.log('SyncQueue size:', syncQueue.length)
  console.log('SyncQueue actions:', syncQueue.map(i => i.action))
}
