import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSupabaseUserById, searchUsersForGroup, createGroupConversation } from '../services/chatApi'
import { canCreateGroups } from '../services/teamSync'
import type { User } from '../services/supabase'

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('')
}

export default function NewGroupPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [myId, setMyId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Auth gate
  useEffect(() => {
    if (!user) return
    if (!canCreateGroups(user.tipo_user_bubble)) {
      navigate('/chat', { replace: true })
    }
  }, [user, navigate])

  // Load my id
  useEffect(() => {
    if (!user) return
    getSupabaseUserById(user.id).then(u => {
      if (u) setMyId(u.id)
    })
  }, [user])

  // Search users (debounced via input)
  useEffect(() => {
    if (!myId) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      const list = await searchUsersForGroup(search, myId)
      if (!cancelled) {
        setUsers(list)
        setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [search, myId])

  const memberIds = useMemo(() => Array.from(selected), [selected])

  const canCreate =
    !creating &&
    name.trim().length > 0 &&
    name.trim().length <= 50 &&
    memberIds.length >= 2

  function toggle(uid: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  async function handleCreate() {
    if (!canCreate || !myId) return
    setCreating(true)
    setError('')
    try {
      const ids = Array.from(new Set([...memberIds, myId]))
      const convId = await createGroupConversation(name.trim(), ids)
      if (!convId) {
        setError('Could not create group. Please try again.')
        setCreating(false)
        return
      }
      navigate(`/chat?c=${convId}`)
    } catch (e) {
      console.error(e)
      setError('Unexpected error. Please try again.')
      setCreating(false)
    }
  }

  const selectedUsers = useMemo(
    () => users.filter(u => selected.has(u.id)),
    [users, selected]
  )

  if (!user) return null
  if (!canCreateGroups(user.tipo_user_bubble)) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-500 text-sm">Only Owners and Directors can create groups.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <button onClick={() => navigate('/chat')} className="p-2 rounded-full hover:bg-gray-100">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-800">New group</h1>
          <p className="text-xs text-gray-500">{memberIds.length} selected</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </div>

      {/* Group name */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <label className="block text-xs font-semibold text-gray-600 mb-1">Group name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value.slice(0, 50))}
          placeholder="e.g. Painting Crew A"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[10px] text-gray-400 mt-1">{name.length}/50</p>
      </div>

      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <div className="px-4 py-2 bg-white border-b border-gray-100 flex flex-wrap gap-2">
          {selectedUsers.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {u.nome}
              <button onClick={() => toggle(u.id)} className="hover:text-blue-900">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>
      )}

      {/* Search */}
      <div className="px-4 py-2 bg-white border-b border-gray-100">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="w-full bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-32" />
                  <div className="h-2 bg-gray-100 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && users.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-12">No contacts found.</div>
        )}
        {!loading && users.map(u => {
          const isSelected = selected.has(u.id)
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100"
            >
              {u.avatar_url ? (
                <img src={u.avatar_url} alt={u.nome} className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white font-semibold text-sm flex items-center justify-center shrink-0">
                  {getInitials(u.nome)}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-gray-800 text-sm truncate">{u.nome}</p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
