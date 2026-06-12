import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabase'

// Curated set of frequently used emojis. Covers reactions, work-site
// vocabulary and general chat use. Loaded on demand from a button row.
const QUICK_EMOJIS = [
  '👍','👎','👏','🙌','🙏','💪','✌️','🤝',
  '😂','🤣','😊','😎','🤔','😢','😡','😍',
  '🔥','⭐','✅','❌','⚠️','🚧','🛠️','🔧',
  '☀️','🌧️','❄️','🌙','🏠','🚗','📞','💬',
]
import {
  getConversationsForUser,
  getMessages,
  sendMessage,
  subscribeToMessages,
  subscribeToConversations,
  markConversationRead,
  upsertUser,
  getSupabaseUserById,
  type Conversation,
  type Message,
} from '../services/chatApi'
import { useAuth } from '../context/AuthContext'
import { fetchTodayWO } from '../services/workingOrdersApi'
import { getWOCache, saveWOCache } from '../services/db'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { isSupabaseConfigured } from '../services/supabase'
import { useUnreadCount } from '../hooks/useUnreadCount'
import { useActiveConversation } from '../context/ActiveConversationContext'
import type { WorkOrderRow } from '../services/workingOrdersApi'
import type { ChatFileType } from '../types'
import {
  compressImage,
  sendMediaMessage,
  queueMediaOffline,
} from '../services/chatMedia'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { AudioPlayer } from '../components/chat/AudioPlayer'
import { AttachmentMenu } from '../components/chat/AttachmentMenu'
import { MediaPreview, type MediaPreviewItem } from '../components/chat/MediaPreview'

type Tab = 'chats' | 'wo'
type WoTab = 'today' | 'other'

export default function ChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refresh: refreshUnread } = useUnreadCount()
  const { setActiveConversationId } = useActiveConversation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>('chats')
  const [woTab, setWoTab] = useState<WoTab>('today')

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [mySupabaseId, setMySupabaseId] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<MediaPreviewItem | null>(null)
  const [sendingMedia, setSendingMedia] = useState(false)
  const recorder = useAudioRecorder()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  // ── Realtime channel refs — cleaned up on unmount / conversation close
  const convChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const msgChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const diagChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const msgPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevSizeRef = useRef<number>(0)

  // ── Sync user on mount
  useEffect(() => {
    if (!user) return
    upsertUser(user.id, { nome: user.nome, email: user.email, role: user.role })
  }, [user])

  // ── Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return
    const handleClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showEmojiPicker])

  function insertEmoji(emoji: string) {
    setNewMessage(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // ── Load conversations + subscribe to updates
  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoadingConversations(true)
      if (!user) return
      const sbUser = await getSupabaseUserById(user.id)
      if (!sbUser || cancelled) { setLoadingConversations(false); return }
      if (!cancelled) setMySupabaseId(sbUser.id)

      const convs = await getConversationsForUser(sbUser.id)
      if (cancelled) return

      const sorted = [...convs].sort((a, b) => {
        const at = a.last_message_at ?? a.created_at
        const bt = b.last_message_at ?? b.created_at
        return bt.localeCompare(at)
      })
      setConversations(sorted)
      setLoadingConversations(false)

      // Subscribe to conversation changes — re-fetch when anything changes
      convChannelRef.current = subscribeToConversations(sbUser.id, () => {
        getConversationsForUser(sbUser.id).then(updated => {
          if (!cancelled) setConversations(updated)
        })
      })
    }

    load()
    return () => {
      cancelled = true
      if (convChannelRef.current) {
        supabase.removeChannel(convChannelRef.current)
        convChannelRef.current = null
      }
    }
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

  // ── Open conversation
  async function openConversation(conv: Conversation) {
    // Remove previous message channel if any
    if (msgChannelRef.current) {
      supabase.removeChannel(msgChannelRef.current)
      msgChannelRef.current = null
    }

    setActiveConversation(conv)
    setActiveConversationId(conv.id) // sync to global context for badge
    setLoadingMessages(true)

    if (!user) return
    const sbUser = await getSupabaseUserById(user.id)
    if (!sbUser) return

    const msgs = await getMessages(conv.id)
    const unique = Array.from(new Map(msgs.map(m => [m.id, m])).values())
    setMessages(unique)
    setLoadingMessages(false)

    await markConversationRead(conv.id, sbUser.id)
    setConversations(prev =>
      prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
    )
    refreshUnread() // re-fetch unread count after marking as read

    let lastMessageCount = unique.length

    const fetchAndMerge = async (source: string) => {
      const latest = await getMessages(conv.id)
      console.log(`[ChatPage] ${source}: fetched ${latest.length} msgs (lastCount=${lastMessageCount})`)
      if (latest.length > lastMessageCount) {
        setMessages(prev => {
          const known = new Set(prev.map(m => m.id))
          const next = [...prev, ...latest.filter(m => !known.has(m.id))]
          prevSizeRef.current = next.length
          return next
        })
        lastMessageCount = latest.length
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        console.log(`[ChatPage] ${source}: merged, now ${lastMessageCount} msgs`)
      }
    }

    const startPolling = () => {
      if (msgPollTimerRef.current) return
      console.log('[ChatPage] starting 3s background polling (realtime is best-effort)')
      msgPollTimerRef.current = setInterval(() => fetchAndMerge('polling'), 3000)
    }

    // Always run a 3s polling in the background. Realtime is best-effort.
    // This guarantees messages arrive even when the realtime channel
    // silently fails (e.g. RLS blocks the join, channel status is
    // CHANNEL_ERROR, etc.).
    startPolling()

    msgChannelRef.current = subscribeToMessages(conv.id, async (msg: Message) => {
      console.log('[ChatPage] realtime message received:', msg.id)
      // If message is from someone else, mark as read immediately
      // (user is viewing this conversation)
      if (msg.sender_id !== sbUser.id) {
        await markConversationRead(conv.id, sbUser.id)
        refreshUnread()
      }
      // Realtime payload doesn't include the joined sender — fetch it
      let enriched = msg
      if (!msg.sender) {
        const { data: senderData } = await supabase
          .from('users')
          .select('id, bubble_id, nome, email, role, avatar_url')
          .eq('id', msg.sender_id)
          .single()
        enriched = { ...msg, sender: (senderData as any) ?? undefined }
      }
      // Realtime also doesn't include the joined chat_file. Fetch it if the
      // message content suggests it has media (we use the content label).
      if (enriched.content && /^(Image|Audio|Document|File)/.test(enriched.content.trim())) {
        if (!(enriched.chat_file && (enriched.chat_file as any).id)) {
          const { data: cfRow } = await supabase
            .from('chat_files')
            .select('*')
            .eq('message_id', enriched.id)
            .maybeSingle()
          if (cfRow) {
            enriched = { ...enriched, chat_file: cfRow as any }
          }
        }
      }
      setMessages(prev => {
        prevSizeRef.current = prev.length
        if (prev.some(m => m.id === enriched.id)) return prev
        return [...prev, enriched]
      })
      lastMessageCount = Math.max(lastMessageCount, prevSizeRef.current)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })
  }

  openConversationRef.current = openConversation

  // Cleanup message channel and clear active conversation when leaving ChatPage
  useEffect(() => {
    return () => {
      if (msgChannelRef.current) {
        supabase.removeChannel(msgChannelRef.current)
        msgChannelRef.current = null
      }
      if (diagChannelRef.current) {
        supabase.removeChannel(diagChannelRef.current)
        diagChannelRef.current = null
      }
      if (msgPollTimerRef.current) {
        clearInterval(msgPollTimerRef.current)
        msgPollTimerRef.current = null
      }
      setActiveConversationId(null)
    }
  }, [setActiveConversationId])

  // ── Send message (text or media)
  async function handleSend() {
    if (!user || !activeConversation) return
    if (sendingMedia) return
    const sbUser = await getSupabaseUserById(user.id)
    if (!sbUser) return

    // 1) Media path
    if (pendingMedia) {
      const media = pendingMedia
      setPendingMedia(null)
      setSendingMedia(true)

      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const placeholderContent =
        media.type === 'image' ? 'Image' :
        media.type === 'audio' ? 'Audio' :
        (media.name ?? 'File')

      const optimistic: Message = {
        id: tempId,
        conversation_id: activeConversation.id,
        sender_id: sbUser.id,
        content: placeholderContent,
        tipo: 'text',
        audio_url: null,
        transcription: null,
        bubble_id: null,
        created_at: new Date().toISOString(),
        sender: {
          id: sbUser.id,
          nome: user.nome,
          email: user.email,
          role: user.role,
          avatar_url: undefined,
        },
        chat_file: {
          id: tempId,
          message_id: tempId,
          sender_id: sbUser.id,
          bucket: 'chat-media',
          storage_path: '',
          public_url: media.url,
          file_type: media.type,
          mime_type: media.mimeType,
          original_name: media.name,
          file_size: media.blob.size,
          synced: false,
          created_at: new Date().toISOString(),
        },
      }
      setMessages(prev => [...prev, optimistic])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

      try {
        if (isOnline) {
          const { message, chatFile } = await sendMediaMessage({
            conversationId: activeConversation.id,
            senderId: sbUser.id,
            senderEmail: user.email,
            fileType: media.type,
            mimeType: media.mimeType,
            originalName: media.name,
            blob: media.blob,
          })
          // Replace optimistic message with the real one
          setMessages(prev =>
            prev.map(m => (m.id === tempId ? { ...message, chat_file: chatFile } : m))
          )
          // Now safe to revoke the blob URL — the message is using the
          // Supabase public URL from the real chat_file record.
          URL.revokeObjectURL(media.url)
        } else {
          // Offline: keep the blob URL alive so the optimistic message
          // keeps showing the media. It will be replaced when sync runs
          // (processPendingChatFiles) and the real chat_file arrives.
          await queueMediaOffline({
            conversationId: activeConversation.id,
            senderId: sbUser.id,
            senderEmail: user.email,
            fileType: media.type,
            mimeType: media.mimeType,
            originalName: media.name,
            blob: media.blob,
          })
        }
      } catch (e) {
        console.error('media send failed:', e)
        // On failure, also keep the blob URL alive (don't revoke) so the
        // user still sees the media in the optimistic message.
      } finally {
        setSendingMedia(false)
      }
      return
    }

    // 2) Plain text path
    if (!newMessage.trim()) return
    const text = newMessage.trim()
    setNewMessage('')

    const msg = await sendMessage(activeConversation.id, sbUser.id, text, 'text')
    if (msg) {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // ── Handle file/image selection from AttachmentMenu
  async function handleFileSelected(file: File, _source: 'camera' | 'gallery' | 'file') {
    setShowAttachMenu(false)
    try {
      let blob: Blob = file
      let mimeType = file.type
      let type: ChatFileType

      if (file.type.startsWith('image/')) {
        blob = await compressImage(file)
        mimeType = blob.type || file.type
        type = 'image'
      } else {
        type = 'file'
      }

      setPendingMedia({
        blob,
        type,
        mimeType,
        url: URL.createObjectURL(blob),
        name: file.name,
      })
    } catch (e) {
      console.error('Failed to process file:', e)
      alert('Could not process this file. Please try another.')
    }
  }

  // ── Hold-to-record mic handlers
  async function handleMicPress() {
    await recorder.start()
  }
  async function handleMicRelease() {
    const recorded = await recorder.stop()
    if (recorded) {
      setPendingMedia({
        blob: recorded.blob,
        type: 'audio',
        mimeType: recorded.mimeType,
        url: recorded.url,
        durationMs: recorded.durationMs,
      })
    }
  }

  function getParticipantNames(conv: Conversation, myId: string): string {
    const others = conv.participants?.filter(p => p.id !== myId) ?? []
    if (conv.tipo === 'group') return conv.nome ?? 'Group'
    return others[0]?.nome ?? 'Chat'
  }

  function getParticipantAvatar(conv: Conversation, myId: string): string | undefined {
    const others = conv.participants?.filter(p => p.id !== myId) ?? []
    return others[0]?.avatar_url
  }

  function getParticipantInitials(conv: Conversation, myId: string): string {
    const name = getParticipantNames(conv, myId)
    return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
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

  function formatRecordingTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
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

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── WO tab data (offline-first: cache → fetch)
  const [woList, setWoList] = useState<WorkOrderRow[]>([])
  const [loadingWo, setLoadingWo] = useState(false)
  const [woCachedAt, setWoCachedAt] = useState<string>('')
  const isOnline = useOnlineStatus()

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    if (activeTab !== 'wo') return
    if (!user?.email) return
    const workerEmail = user.email
    let cancelled = false

    async function load() {
      const cached = await getWOCache(workerEmail)
      if (cancelled) return
      if (cached.length > 0) {
        setWoList(cached)
        setWoCachedAt(new Date().toISOString())
        setLoadingWo(false)
      } else {
        setLoadingWo(true)
      }

      if (!navigator.onLine) return

      try {
        const wos = await fetchTodayWO({ workerEmail })
        if (cancelled) return
        setWoList(wos)
        setWoCachedAt(new Date().toISOString())
        await saveWOCache(workerEmail, wos)
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
      <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm shrink-0">
          <button onClick={() => {
            setActiveConversation(null);
            setActiveConversationId(null);
            if (msgChannelRef.current) { supabase.removeChannel(msgChannelRef.current); msgChannelRef.current = null }
            if (msgPollTimerRef.current) { clearInterval(msgPollTimerRef.current); msgPollTimerRef.current = null }
          }}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="font-semibold text-gray-800 text-sm">
              {activeConversation.tipo === 'group' ? activeConversation.nome : getParticipantNames(activeConversation, mySupabaseId ?? '')}
            </p>
            <p className="text-xs text-gray-500 capitalize">{activeConversation.tipo}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingMessages && <div className="text-center text-gray-400 text-sm py-8">Loading messages...</div>}
          {!loadingMessages && messages.length === 0 && <div className="text-center text-gray-400 text-sm py-8">No messages yet. Start the conversation!</div>}
          {messages.map(msg => {
            const isMine = msg.sender_id === mySupabaseId
            const senderAvatar = msg.sender?.avatar_url
            // Fallback chain: nome initials → user_id first char → "?"
            const senderName = msg.sender?.nome ?? ''
            const senderInitials = senderName
              ? senderName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
              : (msg.sender_id?.charAt(0)?.toUpperCase() ?? '?')
            const cf = msg.chat_file && (msg.chat_file as any).id ? msg.chat_file : null
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${!isMine && senderAvatar ? 'items-end' : ''}`}>
                {!isMine && senderAvatar && (
                  <img src={senderAvatar} alt={msg.sender?.nome ?? 'User'} className="w-7 h-7 rounded-full object-cover mr-2 mb-0.5 shrink-0" />
                )}
                {!isMine && !senderAvatar && (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 mr-2 mb-0.5 shrink-0">
                    {senderInitials}
                  </div>
                )}
                <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm shadow-sm ${isMine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'}`}>
                  {cf?.file_type === 'image' ? (
                    <a href={cf.public_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={cf.public_url}
                        alt={cf.original_name ?? 'Image'}
                        className="max-w-full max-h-64 rounded-lg cursor-pointer"
                      />
                    </a>
                  ) : cf?.file_type === 'audio' ? (
                    <AudioPlayer url={cf.public_url} transcription={msg.transcription} inverted={isMine} />
                  ) : cf?.file_type === 'file' ? (
                    <a
                      href={cf.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={cf.original_name}
                      className={`flex items-center gap-3 min-w-[200px] max-w-[260px] ${isMine ? 'text-white' : 'text-gray-800'}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isMine ? 'bg-white/20' : 'bg-orange-100'}`}>
                        <svg className={`w-5 h-5 ${isMine ? 'text-white' : 'text-orange-600'}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isMine ? 'text-white' : 'text-gray-800'}`}>
                          {cf.original_name ?? 'File'}
                        </p>
                        <p className={`text-xs ${isMine ? 'text-blue-100' : 'text-gray-500'}`}>
                          {cf.file_size ? formatFileSize(cf.file_size) : 'Document'}
                        </p>
                      </div>
                      <svg className={`w-5 h-5 shrink-0 ${isMine ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>
                  ) : msg.tipo === 'audio' ? (
                    // Legacy audio message (no chat_file) — kept as-is
                    <div className="flex items-center gap-2"><MicIcon /><span className="text-xs opacity-80">Audio</span></div>
                  ) : (
                    <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.transcription && !cf && (
                    <p className="text-xs mt-1 opacity-70 italic break-words">{msg.transcription}</p>
                  )}
                  <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
                    <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                    {isMine && (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                        <path d="M1 8l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {isMine && cf && !cf.synced && (
                      <svg className="w-3 h-3 opacity-70 ml-1" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-label="Pending sync to Bubble">
                        <title>Pending sync to Bubble</title>
                        <circle cx="12" cy="12" r="9" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="bg-white border-t border-gray-200 shrink-0 relative">
          {pendingMedia && (
            <MediaPreview
              media={pendingMedia}
              onRemove={() => {
                URL.revokeObjectURL(pendingMedia.url)
                setPendingMedia(null)
              }}
            />
          )}

          {recorder.isRecording && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-red-700">
                Recording {formatRecordingTime(recorder.durationMs)}
              </span>
              <span className="ml-auto text-xs text-red-600">Release to send</span>
            </div>
          )}

          <div className="px-4 py-3 relative">
            <AttachmentMenu
              open={showAttachMenu}
              onSelect={handleFileSelected}
              onClose={() => setShowAttachMenu(false)}
            />
            {showEmojiPicker && (
              <div ref={emojiPickerRef}
                className="absolute bottom-full mb-2 left-4 right-4 bg-white border border-gray-200 rounded-2xl shadow-lg p-3 z-10">
                <div className="grid grid-cols-8 gap-1">
                  {QUICK_EMOJIS.map(emoji => (
                    <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}
                      className="text-2xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowEmojiPicker(v => !v)}
                className="p-2.5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors shrink-0"
                aria-label="Open emoji picker">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setShowAttachMenu(v => !v)}
                className={`p-2.5 rounded-full transition-colors shrink-0 ${
                  showAttachMenu ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                aria-label="Attach file"
                aria-expanded={showAttachMenu}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <input ref={inputRef} type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Type a message..."
                className="flex-1 min-w-0 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {newMessage.trim() || pendingMedia ? (
                <button
                  onClick={handleSend}
                  disabled={sendingMedia}
                  className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:hover:bg-blue-600 shrink-0"
                  aria-label="Send"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onPointerDown={handleMicPress}
                  onPointerUp={handleMicRelease}
                  onPointerLeave={() => recorder.isRecording && recorder.cancel()}
                  onPointerCancel={() => recorder.isRecording && recorder.cancel()}
                  className={`p-2.5 rounded-full transition-colors shrink-0 select-none touch-none ${
                    recorder.isRecording
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  aria-label="Hold to record"
                >
                  <MicIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main list view
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {!isSupabaseConfigured && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Chat requires Supabase env vars. Add them in Vercel.</span>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Chat</h1>
        </div>
        <button onClick={() => navigate('/chat/new')} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" title="New chat">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>

      <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-200">
        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-full p-1 relative">
          <span className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
            style={{ transform: activeTab === 'chats' ? 'translateX(0%)' : 'translateX(100%)' }} />
          <button onClick={() => setActiveTab('chats')}
            className={`relative z-10 py-2 text-sm font-semibold text-center transition-colors duration-300 ${activeTab === 'chats' ? 'text-gray-800' : 'text-gray-500'}`}>
            Chats
          </button>
          <button onClick={() => setActiveTab('wo')}
            className={`relative z-10 py-2 text-sm font-semibold text-center transition-colors duration-300 ${activeTab === 'wo' ? 'text-gray-800' : 'text-gray-500'}`}>
            My Work Orders
          </button>
        </div>
      </div>

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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="font-medium text-gray-500">No chats yet</p>
                <p className="text-sm mt-1">Start a conversation with admin or a colleague</p>
              </div>
            )}

            {!loadingConversations && conversations.map(conv => (
              <button key={conv.id} onClick={() => openConversation(conv)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100">
                {conv.tipo === 'group' ? (
                  <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center shrink-0"><GroupIcon /></div>
                ) : (() => {
                  const avatarUrl = getParticipantAvatar(conv, mySupabaseId ?? '')
                  const initials = getParticipantInitials(conv, mySupabaseId ?? '')
                  return avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-white">{initials}</span>
                    </div>
                  )
                })()}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800 text-sm truncate">
                      {conv.tipo === 'group' ? conv.nome : getParticipantNames(conv, mySupabaseId ?? '')}
                    </p>
                    <span className="text-xs text-gray-400 ml-2 shrink-0">{formatTime(conv.last_message_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{conv.last_message || 'No messages'}</p>
                </div>
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
            <div className="px-4 pt-3 pb-3">
              <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-full p-1 relative">
                <span className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
                  style={{ transform: woTab === 'today' ? 'translateX(0%)' : 'translateX(100%)' }} />
                <button onClick={() => setWoTab('today')}
                  className={`relative z-10 py-1.5 text-sm font-semibold text-center transition-colors duration-300 ${woTab === 'today' ? 'text-gray-800' : 'text-gray-500'}`}>
                  Today ({woToday.length})
                </button>
                <button onClick={() => setWoTab('other')}
                  className={`relative z-10 py-1.5 text-sm font-semibold text-center transition-colors duration-300 ${woTab === 'other' ? 'text-gray-800' : 'text-gray-500'}`}>
                  Other days ({woOther.length})
                </button>
              </div>
            </div>

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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M12 9v4m0 4h.01" />
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="font-medium text-gray-500">No work orders {woTab === 'today' ? 'for today' : 'for other days'}</p>
              </div>
            )}

            {!loadingWo && displayedWo.map((wo) => {
              const isPriority = wo.prioridade === true || wo.prioridade === 'yes' || wo.prioridade === 'Yes'
              return (
                <button key={wo._id} onClick={() => navigate('/wo')}
                  className="w-full mx-3 my-1.5 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all overflow-hidden text-left"
                  style={{ width: 'calc(100% - 1.5rem)' }}>
                  <div className="flex items-stretch">
                    <div className="bg-gradient-to-b from-primary to-primary-dark px-2 py-4 flex flex-col items-center justify-center w-20 shrink-0">
                      <span className="text-[9px] text-white/70 font-semibold uppercase tracking-wider">WO</span>
                      <span className="text-white font-bold text-base leading-none mt-0.5">#{wo.codigo_id}</span>
                    </div>
                    <div className="flex-1 px-3 py-3 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-gray-800 text-sm truncate">{wo.qual_condo_txt || 'Property'}</p>
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
                        {wo.tipo_JOB && <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{wo.tipo_JOB}</span>}
                        {wo.apt && <span className="text-[11px] text-gray-500">Apt {wo.apt}</span>}
                      </div>
                      {wo.status && <div className="mt-2"><StatusBadge status={wo.status} /></div>}
                    </div>
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

// ── Icons & helpers ───────────────────────────

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
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}