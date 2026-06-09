import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabase'
import {
  getConversationsForUser,
  getMessages,
  sendMessage,
  subscribeToMessages,
  subscribeToConversations,
  markConversationRead,
  syncUserFromBubble,
  getSupabaseUserByBubbleId,
  type Conversation,
  type Message,
} from '../services/chatApi'
import { useAuth } from '../context/AuthContext'
import { fetchTodayWO } from '../services/workingOrdersApi'
import { getWOCache, saveWOCache } from '../services/db'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { isSupabaseConfigured } from '../services/supabase'
import type { WorkOrderRow } from '../services/workingOrdersApi'

type Tab = 'chats' | 'wo'
type WoTab = 'today' | 'other'

export default function ChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>('chats')
  const [woTab, setWoTab] = useState<WoTab>('today')

  // ── Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)

  // ── Active conversation
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Sync user on mount
  useEffect(() => {
    if (!user) return
    syncUserFromBubble(user.id_bubble, user.nome, user.email, 'worker')
  }, [user])

  // ── Load conversations
  useEffect(() => {
    if (!user) return
    const userBubbleId = user.id_bubble
    let cancelled = false

    async function load() {
      setLoadingConversations(true)
      const sbUser = await getSupabaseUserByBubbleId(userBubbleId)
      if (!sbUser || cancelled) { setLoadingConversations(false); return }

      const convs = await getConversationsForUser(sbUser.id)
      if (!cancelled) {
        // Sort by last_message_at desc (WhatsApp style)
        const sorted = [...convs].sort((a, b) => {
          const at = a.last_message_at ?? a.created_at
          const bt = b.last_message_at ?? b.created_at
          return bt.localeCompare(at)
        })
        setConversations(sorted)
        setLoadingConversations(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user])

  // ── Open conversation ref (defined below, use ref to avoid TDZ)
  const openConversationRef = useRef<(conv: Conversation) => void>(() => {})

  // ── Open conversation from ?c= param
  useEffect(() => {
    const targetId = searchParams.get('c')
    if (!targetId || !user) return
    if (loadingConversations) return
    const target = conversations.find(c => c.id === targetId)
    if (target && activeConversation?.id !== targetId) {
      openConversationRef.current(target)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, loadingConversations, conversations, user, activeConversation?.id])

  // ── Subscribe to conversation updates
  useEffect(() => {
    if (!user) return

    getSupabaseUserByBubbleId(user.id_bubble).then(sbUser => {
      if (!sbUser) return
      const sub = subscribeToConversations(sbUser.id, () => {
        getConversationsForUser(sbUser.id).then(setConversations)
      })
      return () => supabase.removeChannel(sub)
    })
  }, [user])

  // ── Open conversation
  async function openConversation(conv: Conversation) {
    setActiveConversation(conv)
    setLoadingMessages(true)

    if (!user) return
    const sbUser = await getSupabaseUserByBubbleId(user.id_bubble)
    if (!sbUser) return

    const msgs = await getMessages(conv.id)
    setMessages(msgs)
    setLoadingMessages(false)

    await markConversationRead(conv.id)
    setConversations(prev =>
      prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
    )

    const channel = subscribeToMessages(conv.id, (msg: Message) => {
      setMessages(prev => [...prev, msg])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })

    return () => supabase.removeChannel(channel)
  }

  // Keep ref pointing to the latest openConversation
  openConversationRef.current = openConversation

  // ── Send message
  async function handleSend() {
    if (!newMessage.trim() || !user || !activeConversation) return
    const sbUser = await getSupabaseUserByBubbleId(user.id_bubble)
    if (!sbUser) return

    const text = newMessage.trim()
    setNewMessage('')

    const msg = await sendMessage(activeConversation.id, sbUser.id, text, 'text')
    if (msg) setMessages(prev => [...prev, msg])

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function getParticipantNames(conv: Conversation, myId: string): string {
    const others = conv.participants?.filter(p => p.id !== myId) ?? []
    if (conv.tipo === 'group') return conv.nome ?? 'Group'
    return others[0]?.nome ?? 'Chat'
  }

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function formatLastSync(iso: string | null): string {
    if (!iso) return ''
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // ── WO tab data (offline-first: cache → fetch)
  const [woList, setWoList] = useState<WorkOrderRow[]>([])
  const [loadingWo, setLoadingWo] = useState(false)
  const [woCachedAt, setWoCachedAt] = useState<string>('')
  const isOnline = useOnlineStatus()

  // Get today's date string in local time (YYYY-MM-DD) to avoid timezone issues
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    if (activeTab !== 'wo') return
    if (!user?.id_bubble) return
    const userId = user.id_bubble
    const token = user.token
    let cancelled = false

    async function load() {
      // 1. Show cache instantly
      const cached = await getWOCache(userId)
      if (cancelled) return
      if (cached.length > 0) {
        setWoList(cached)
        setWoCachedAt(new Date().toISOString()) // approximate — we don't have cache timestamp
        setLoadingWo(false)
      } else {
        setLoadingWo(true)
      }

      // 2. Try to fetch fresh data in background (only if online)
      if (!navigator.onLine) return

      try {
        const wos = await fetchTodayWO({ userBubbleId: userId, token })
        if (cancelled) return
        setWoList(wos)
        setWoCachedAt(new Date().toISOString())
        await saveWOCache(userId, wos)
      } catch (err) {
        console.warn('WO fetch failed (offline?):', err)
      } finally {
        if (!cancelled) setLoadingWo(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeTab, user, isOnline])

  const woToday = woList.filter((wo) => {
    if (!wo.data) return false
    const d = new Date(wo.data)
    const woDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return woDateStr === todayStr
  })
  const woOther = woList.filter((wo) => {
    if (!wo.data) return false
    const d = new Date(wo.data)
    const woDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return woDateStr !== todayStr
  })

  const displayedWo = woTab === 'today' ? woToday : woOther

  // ── Message view
  if (activeConversation) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
          <button
            onClick={() => setActiveConversation(null)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="font-semibold text-gray-800 text-sm">
              {activeConversation.tipo === 'group'
                ? activeConversation.nome
                : getParticipantNames(activeConversation, '')}
            </p>
            <p className="text-xs text-gray-500 capitalize">{activeConversation.tipo}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingMessages && (
            <div className="text-center text-gray-400 text-sm py-8">Loading messages...</div>
          )}
          {!loadingMessages && messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">
              No messages yet. Start the conversation!
            </div>
          )}
          {messages.map(msg => {
            const isMine = msg.sender?.id === user?.id_bubble || msg.sender_id === user?.id_bubble
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${
                  isMine
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md shadow-sm'
                }`}>
                  {msg.tipo === 'audio' ? (
                    <div className="flex items-center gap-2">
                      <MicIcon />
                      <span className="text-xs opacity-80">Audio</span>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                  {msg.transcription && (
                    <p className="text-xs mt-1 opacity-70 italic">{msg.transcription}</p>
                  )}
                  <p className={`text-xs mt-1 ${isMine ? 'text-blue-200' : 'text-gray-400'} text-right`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 bg-white border-t border-gray-200">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSend}
              className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main list view
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Supabase not configured banner */}
      {!isSupabaseConfigured && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Chat requires Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Add them in Vercel.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Chat</h1>
        </div>
        <button
          onClick={() => navigate('/chat/new')}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
          title="New chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>

      {/* Tabs - Pill switcher */}
      <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-200">
        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-full p-1 relative">
          <span
            className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
            style={{ transform: activeTab === 'chats' ? 'translateX(0%)' : 'translateX(100%)' }}
          />
          <button
            onClick={() => setActiveTab('chats')}
            className={`relative z-10 py-2 text-sm font-semibold text-center transition-colors duration-300 ${
              activeTab === 'chats' ? 'text-gray-800' : 'text-gray-500'
            }`}
          >
            Chats
          </button>
          <button
            onClick={() => setActiveTab('wo')}
            className={`relative z-10 py-2 text-sm font-semibold text-center transition-colors duration-300 ${
              activeTab === 'wo' ? 'text-gray-800' : 'text-gray-500'
            }`}
          >
            My Work Orders
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'chats' && (
          <div>
            {loadingConversations && (
              <div className="space-y-4 p-4">
                {[1, 2, 3].map(i => (
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

            {!loadingConversations && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="font-medium text-gray-500">No chats yet</p>
                <p className="text-sm mt-1">Start a conversation with admin or a colleague</p>
              </div>
            )}

            {!loadingConversations && conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100"
              >
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  conv.tipo === 'group' ? 'bg-purple-500' : 'bg-blue-600'
                }`}>
                  {conv.tipo === 'group' ? (
                    <GroupIcon />
                  ) : (
                    <span className="text-sm font-semibold text-white">
                      {getParticipantNames(conv, '').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800 text-sm truncate">
                      {conv.tipo === 'group'
                        ? conv.nome
                        : getParticipantNames(conv, '')}
                    </p>
                    <span className="text-xs text-gray-400 ml-2 shrink-0">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {conv.last_message || 'No messages'}
                  </p>
                </div>

                {/* Unread badge */}
                {conv.unread_count > 0 && (
                  <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center shrink-0">
                    {conv.unread_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'wo' && (
          <div>
            {/* WO sub-tabs - Pill switcher */}
            <div className="px-4 pt-3 pb-3">
              <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-full p-1 relative">
                <span
                  className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
                  style={{ transform: woTab === 'today' ? 'translateX(0%)' : 'translateX(100%)' }}
                />
                <button
                  onClick={() => setWoTab('today')}
                  className={`relative z-10 py-1.5 text-sm font-semibold text-center transition-colors duration-300 ${
                    woTab === 'today' ? 'text-gray-800' : 'text-gray-500'
                  }`}
                >
                  Today ({woToday.length})
                </button>
                <button
                  onClick={() => setWoTab('other')}
                  className={`relative z-10 py-1.5 text-sm font-semibold text-center transition-colors duration-300 ${
                    woTab === 'other' ? 'text-gray-800' : 'text-gray-500'
                  }`}
                >
                  Other days ({woOther.length})
                </button>
              </div>
            </div>

            {/* Offline indicator + last sync */}
            {woCachedAt && (
              <div className="px-4 pb-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                {isOnline ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Synced {formatLastSync(woCachedAt)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-700">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M12 9v4m0 4h.01" />
                    </svg>
                    Offline — last synced {formatLastSync(woCachedAt)}
                  </span>
                )}
              </div>
            )}

            {loadingWo && (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {!loadingWo && displayedWo.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="font-medium text-gray-500">
                  No work orders {woTab === 'today' ? 'for today' : 'for other days'}
                </p>
              </div>
            )}

            {!loadingWo && displayedWo.map((wo) => {
              const isPriority = wo.prioridade === true || wo.prioridade === 'yes' || wo.prioridade === 'Yes'
              return (
                <button
                  key={wo._id}
                  onClick={() => navigate('/wo')}
                  className="w-full mx-3 my-1.5 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all overflow-hidden text-left"
                  style={{ width: 'calc(100% - 1.5rem)' }}
                >
                  <div className="flex items-stretch">
                    {/* Left accent bar with WO number */}
                    <div className="bg-gradient-to-b from-primary to-primary-dark px-2 py-4 flex flex-col items-center justify-center w-20 shrink-0">
                      <span className="text-[9px] text-white/70 font-semibold uppercase tracking-wider">WO</span>
                      <span className="text-white font-bold text-base leading-none mt-0.5">#{wo.codigo_id}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 px-3 py-3 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-gray-800 text-sm truncate">
                          {wo.qual_condo_txt || 'Property'}
                        </p>
                        {isPriority && (
                          <span className="shrink-0 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-0.5">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            Priority
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {wo.tipo_JOB && (
                          <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                            {wo.tipo_JOB}
                          </span>
                        )}
                        {wo.apt && (
                          <span className="text-[11px] text-gray-500">Apt {wo.apt}</span>
                        )}
                      </div>
                      {wo.status && (
                        <div className="mt-2">
                          <StatusBadge status={wo.status} />
                        </div>
                      )}
                    </div>

                    {/* Chevron */}
                    <div className="flex items-center pr-3">
                      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Icons ────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; ring: string; dot: string }> = {
  'NOT STARTED': { label: 'Not Started', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200', dot: 'bg-red-500' },
  'IN PROGRESS': { label: 'In Progress', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const cfg = STATUS_CONFIG[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-700', ring: 'ring-gray-200', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text} ring-1 ${cfg.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function MicIcon() {
  return (
    <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}