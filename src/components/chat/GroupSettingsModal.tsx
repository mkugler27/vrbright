import { useState, useEffect, useMemo } from 'react'
import {
  getGroupMembers,
  updateGroupConversation,
  addGroupMembers,
  removeGroupMember,
  searchUsersForGroup,
  type Conversation
} from '../../services/chatApi'
import type { User } from '../../services/supabase'
import { canCreateGroups } from '../../services/teamSync'

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

export interface GroupSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  conversation: Conversation
  currentUserId: string | null
  currentUserRole: string | undefined | null
  onUpdate: (updatedConv: Conversation) => void
  onLeave: (convId: string) => void
}

export function GroupSettingsModal({
  isOpen,
  onClose,
  conversation,
  currentUserId,
  currentUserRole,
  onUpdate,
  onLeave,
}: GroupSettingsModalProps) {
  const [members, setMembers] = useState<User[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  
  const [groupName, setGroupName] = useState(conversation.nome || '')
  const [updatingName, setUpdatingName] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameSuccess, setNameSuccess] = useState(false)

  // Search & add new users
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const [addingUserIds, setAddingUserIds] = useState<Set<string>>(new Set())

  const [leaving, setLeaving] = useState(false)
  const [removingUserIds, setRemovingUserIds] = useState<Set<string>>(new Set())

  const isManager = useMemo(() => canCreateGroups(currentUserRole), [currentUserRole])

  // Load members on open
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    
    async function load() {
      setLoadingMembers(true)
      try {
        const list = await getGroupMembers(conversation.id)
        if (!cancelled) {
          setMembers(list)
        }
      } catch (err) {
        console.error('Failed to load group members:', err)
      } finally {
        if (!cancelled) setLoadingMembers(false)
      }
    }

    load()
    setGroupName(conversation.nome || '')
    setSearchQuery('')
    setSearchResults([])
    setNameError('')
    setNameSuccess(false)
    
    return () => {
      cancelled = true
    }
  }, [isOpen, conversation])

  // Search users (debounced)
  useEffect(() => {
    if (!isOpen || !searchQuery.trim() || !currentUserId) {
      setSearchResults([])
      return
    }
    
    let cancelled = false
    setSearching(true)
    
    const delayDebounceFn = setTimeout(async () => {
      try {
        const list = await searchUsersForGroup(searchQuery, currentUserId)
        if (!cancelled) {
          // Filter out users who are already members
          const currentMemberIds = new Set(members.map(m => m.id))
          const filtered = list.filter(u => !currentMemberIds.has(u.id))
          setSearchResults(filtered)
        }
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(delayDebounceFn)
    }
  }, [searchQuery, members, currentUserId, isOpen])

  if (!isOpen) return null

  async function handleSaveName() {
    if (!groupName.trim() || groupName.trim() === conversation.nome) return
    setUpdatingName(true)
    setNameError('')
    setNameSuccess(false)
    try {
      await updateGroupConversation(conversation.id, groupName.trim())
      setNameSuccess(true)
      onUpdate({
        ...conversation,
        nome: groupName.trim(),
        participants: members, // keep current members
      })
    } catch (err: any) {
      setNameError(err?.message || 'Failed to update name')
    } finally {
      setUpdatingName(false)
    }
  }

  async function handleAddMember(user: User) {
    if (addingUserIds.has(user.id)) return
    setAddingUserIds(prev => new Set(prev).add(user.id))
    try {
      await addGroupMembers(conversation.id, [user.id])
      const updatedMembers = [...members, user]
      setMembers(updatedMembers)
      // Remove from search results
      setSearchResults(prev => prev.filter(u => u.id !== user.id))
      onUpdate({
        ...conversation,
        participants: updatedMembers,
        member_count: updatedMembers.length
      })
    } catch (err) {
      console.error('Failed to add member:', err)
      alert('Could not add member. Please try again.')
    } finally {
      setAddingUserIds(prev => {
        const next = new Set(prev)
        next.delete(user.id)
        return next
      })
    }
  }

  async function handleRemoveMember(user: User) {
    if (removingUserIds.has(user.id)) return
    if (!confirm(`Are you sure you want to remove ${user.nome} from the group?`)) return
    
    setRemovingUserIds(prev => new Set(prev).add(user.id))
    try {
      await removeGroupMember(conversation.id, user.id)
      const updatedMembers = members.filter(m => m.id !== user.id)
      setMembers(updatedMembers)
      onUpdate({
        ...conversation,
        participants: updatedMembers,
        member_count: updatedMembers.length
      })
    } catch (err) {
      console.error('Failed to remove member:', err)
      alert('Could not remove member. Please try again.')
    } finally {
      setRemovingUserIds(prev => {
        const next = new Set(prev)
        next.delete(user.id)
        return next
      })
    }
  }

  async function handleLeaveGroup() {
    if (!currentUserId) return
    if (!confirm('Are you sure you want to leave this group? You will no longer receive or view messages here.')) return
    
    setLeaving(true)
    try {
      await removeGroupMember(conversation.id, currentUserId)
      onLeave(conversation.id)
      onClose()
    } catch (err) {
      console.error('Failed to leave group:', err)
      alert('Could not leave group. Please try again.')
      setLeaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Group Info</h2>
            <p className="text-xs text-gray-500">{members.length} participants</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Edit Group Name */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Group Name</h3>
            {isManager ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={groupName}
                  onChange={e => {
                    setGroupName(e.target.value.slice(0, 50))
                    setNameSuccess(false)
                  }}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Group name"
                />
                <button
                  onClick={handleSaveName}
                  disabled={updatingName || !groupName.trim() || groupName.trim() === conversation.nome}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
                >
                  {updatingName ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-800 bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-100">
                {conversation.nome}
              </p>
            )}
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
            {nameSuccess && <p className="text-xs text-emerald-600 mt-1">Name updated successfully!</p>}
          </div>

          {/* Add Members Section (Managers only) */}
          {isManager && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Add Participant</h3>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              
              {/* Search Results */}
              {searchQuery.trim() && (
                <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-48 overflow-y-auto mt-2 bg-white shadow-inner">
                  {searching && <p className="text-xs text-gray-400 p-3 text-center">Searching…</p>}
                  {!searching && searchResults.length === 0 && (
                    <p className="text-xs text-gray-400 p-3 text-center">No contacts found to add.</p>
                  )}
                  {!searching && searchResults.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-2.5">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-semibold text-gray-800 truncate">{u.nome}</p>
                        <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                      </div>
                      <button
                        onClick={() => handleAddMember(u)}
                        disabled={addingUserIds.has(u.id)}
                        className="p-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {addingUserIds.has(u.id) ? (
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Participants ({members.length})
            </h3>
            {loadingMembers ? (
              <div className="space-y-2 py-2">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-gray-200 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-gray-200 rounded w-24" />
                      <div className="h-2 bg-gray-100 rounded w-36" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1 divide-y divide-gray-50">
                {members.map(m => {
                  const isMe = m.id === currentUserId
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-2">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.nome} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                          {getInitials(m.nome)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-gray-800 truncate">{m.nome}</p>
                          {isMe && (
                            <span className="bg-gray-100 text-gray-600 text-[9px] px-1.5 py-0.5 rounded-sm font-medium">
                              You
                            </span>
                          )}
                          {m.tipo_user_bubble && (
                            <span className="bg-blue-50 text-blue-600 text-[8px] uppercase tracking-wider px-1 py-0.2 rounded font-bold">
                              {m.tipo_user_bubble}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                      </div>
                      
                      {/* Delete button (Manager only, and can't delete self) */}
                      {isManager && !isMe && (
                        <button
                          onClick={() => handleRemoveMember(m)}
                          disabled={removingUserIds.has(m.id)}
                          className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors shrink-0"
                          aria-label="Remove member"
                        >
                          {removingUserIds.has(m.id) ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={handleLeaveGroup}
            disabled={leaving}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
          >
            {leaving ? (
              <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
            Leave Group
          </button>
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
