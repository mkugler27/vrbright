import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import {
  createIndividualConversation,
  getSupabaseUserById,
  getChatContacts,
  getDMsForUser,
} from '../services/chatApi'
import { useAuth } from '../context/AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import type { User } from '../services/supabase'

type UserWithStatus = User & {
  last_message_at: string | null
  conversation_id: string | null
}

export default function NewChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const [users, setUsers] = useState<UserWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Sync current user and load contacts
  useEffect(() => {
    if (!user) return
    const myId = user.id
    const myNome = user.nome
    const myEmail = user.email
    const myTipo = user.tipo_user_bubble
    const myAvatar = user.profile_picture
    const myBubbleId = user.bubble_id
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // --- 1) LOAD CACHE FIRST ---
        try {
          const dbModule = await import('../services/db')
          const cachedUsers = await dbModule.getCachedUsers()
          const cachedConvs = await dbModule.getCachedConversations()
          
          if (cachedUsers.length > 0) {
            const allUsers = cachedUsers.filter(u => u.id !== myId)
            const dms = cachedConvs.filter(c => c.tipo === 'individual' && c.participants?.some(p => p.id === myId))
            const dmMap = new Map<string, any>()
            for (const dm of dms) {
              const otherParticipant = dm.participants?.find(p => p.id !== myId)
              if (otherParticipant) {
                dmMap.set(otherParticipant.id, dm)
              }
            }
            const enriched: UserWithStatus[] = allUsers.map(u => {
              const dm = dmMap.get(u.id)
              return {
                ...u,
                conversation_id: dm?.id ?? null,
                last_message_at: dm?.last_message_at ?? null,
              }
            })
            enriched.sort((a, b) => {
              if (a.last_message_at && b.last_message_at) return b.last_message_at.localeCompare(a.last_message_at)
              if (a.last_message_at) return -1
              if (b.last_message_at) return 1
              return a.nome.localeCompare(b.nome)
            })
            setUsers(enriched)
            setLoading(false)
          }
        } catch (cacheErr) {
          console.warn('Cache load failed:', cacheErr)
        }

        // --- 2) BACKGROUND NETWORK LOAD ---
        // Ensure current user exists in Supabase
        if (navigator.onLine) {
          const { error: upsertErr } = await supabase.from('users').upsert(
            { id: myId, nome: myNome, email: myEmail },
            { onConflict: 'id' }
          )
          if (upsertErr) console.warn('upsertUser failed:', upsertErr)
        }

        // Get my Supabase user details
        let me = await getSupabaseUserById(myId)
        if (!me) {
          // Offline fallback
          me = {
            id: myId,
            nome: myNome,
            email: myEmail,
            tipo_user_bubble: myTipo,
            avatar_url: myAvatar,
            bubble_id: myBubbleId
          }
        }

        // Load all users except me (offline-safe)
        const allUsers = await getChatContacts(me.id)

        // Load DMs in one optimized query/cache fetch
        const dms = await getDMsForUser(me.id)
        const dmMap = new Map<string, any>()
        for (const dm of dms) {
          const otherParticipant = dm.participants?.find(p => p.id !== me!.id)
          if (otherParticipant) {
            dmMap.set(otherParticipant.id, dm)
          }
        }

        if (cancelled) return

        // Enrich contacts list with existing conversations
        const enriched: UserWithStatus[] = allUsers.map(u => {
          const dm = dmMap.get(u.id)
          return {
            ...u,
            conversation_id: dm?.id ?? null,
            last_message_at: dm?.last_message_at ?? null,
          }
        })

        if (!cancelled) {
          // Sort: users with recent interactions first, then by name
          enriched.sort((a, b) => {
            if (a.last_message_at && b.last_message_at) {
              return b.last_message_at.localeCompare(a.last_message_at)
            }
            if (a.last_message_at) return -1
            if (b.last_message_at) return 1
            return a.nome.localeCompare(b.nome)
          })
          setUsers(enriched)
        }
      } catch (err: any) {
        console.error('Error loading contacts:', err)
        setError(err?.message || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.id])

  async function startChat(targetUser: UserWithStatus) {
    if (!user || creating) return
    setCreating(targetUser.id)

    let me = await getSupabaseUserById(user.id)
    if (!me) {
      me = {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo_user_bubble: user.tipo_user_bubble,
        avatar_url: user.profile_picture,
        bubble_id: user.bubble_id
      }
    }

    // Reuse existing conversation if present
    if (targetUser.conversation_id) {
      navigate(`/chat?c=${targetUser.conversation_id}`)
      return
    }

    const convId = await createIndividualConversation(me.id, targetUser.id)
    setCreating(null)
    if (convId) navigate(`/chat?c=${convId}`)
  }

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
    if (diff < 7 * 86400000) {
      return d.toLocaleDateString('en-US', { weekday: 'short' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function getInitials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('')
  }

  const filtered = users.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200 shadow-sm">
        <button
          onClick={() => navigate('/chat')}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-800">New chat</h1>
          <p className="text-xs text-gray-500">
            {isOnline ? `${users.length} contacts` : 'Offline — showing cached contacts'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 mx-4 my-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
            Error: {error}
          </div>
        )}
        {loading && (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-32" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="font-medium text-gray-500">{search ? 'No matches' : 'No contacts yet'}</p>
            <p className="text-sm mt-1">Other workers will appear here when they sign up</p>
          </div>
        )}

        {!loading && filtered.map(u => {
          const isCreating = creating === u.id
          return (
            <button
              key={u.id}
              onClick={() => startChat(u)}
              disabled={!!creating}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 disabled:opacity-50"
            >
              {/* Avatar */}
              {u.avatar_url ? (
                <img
                  src={u.avatar_url}
                  alt={u.nome}
                  className="w-12 h-12 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-semibold text-sm shrink-0">
                  {getInitials(u.nome)}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-gray-800 text-sm truncate">{u.nome}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {u.last_message_at
                    ? `Last chat ${formatTime(u.last_message_at)}`
                    : u.tipo_user_bubble === 'Owner' || u.tipo_user_bubble === 'Director' ? u.tipo_user_bubble : 'Tap to start chatting'}
                </p>
              </div>

              {/* Right */}
              {isCreating ? (
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              ) : u.last_message_at ? (
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <span className="text-xs text-blue-600 font-medium">Start</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}