import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabase'
import {
  getDMsForUser,
  getGroupsForUser,
  getMessages,
  getChatFile,
  getSupabaseUserById,
  sendMessage,
  subscribeToMessages,
  subscribeToConversations,
  markConversationRead,
  upsertUser,
  generateUUID,
  getChatContacts,
  type Conversation,
  type Message,
} from '../services/chatApi'
import { useAuth } from '../context/AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useUnreadCount } from '../context/UnreadContext'
import { useActiveConversation } from '../context/ActiveConversationContext'
import { canCreateGroups } from '../services/teamSync'
import { deleteMessage } from '../services/chatDelete'
import {
  sendMediaMessage,
  queueMediaOffline,
  compressImage,
} from '../services/chatMedia'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { AudioPlayer } from '../components/chat/AudioPlayer'
import { AttachmentMenu } from '../components/chat/AttachmentMenu'
import { MediaPreview, type MediaPreviewItem } from '../components/chat/MediaPreview'
import { GroupSettingsModal } from '../components/chat/GroupSettingsModal'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { saveCachedMessages, getDB } from '../services/db'
import { enqueueChatMessage } from '../services/syncQueue'
import { syncWorkingOrders, patchWOInBubble } from '../services/woSync'
import { WOListView } from '../components/chat/WOListView'
import { WOWizard } from '../components/chat/WOWizard'
import type { ChatFileType } from '../types'

type Tab = 'chats' | 'groups' | 'works'
type WoTab = 'today' | 'other'

const QUICK_EMOJIS = [
  '👍','👎','👏','🙌','🙏','💪','✌️','🤝',
  '😂','🤣','😊','😎','🤔','😢','😡','😍',
  '🔥','⭐','✅','❌','⚠️','🚧','🛠️','🔧',
  '☀️','🌧️','❄️','🌙','🏠','🚗','📞','💬',
]

function isMediaMessage(msg: Message): boolean {
  const content = msg.content ?? ''
  return /^(Image|Audio|Document|File)/.test(content.trim())
}

function MicIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.5a4 4 0 004-4V8a4 4 0 10-8 0v6.5a4 4 0 004 4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 11-14 0M12 18.5V22" />
    </svg>
  )
}

function ImageIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2z M8 11a2 2 0 11.001-4.001A2 2 0 018 11zm9 7l-5-5-4 4" />
    </svg>
  )
}

function FileIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

export default function ChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refresh: refreshUnread } = useUnreadCount()
  const { setActiveConversationId } = useActiveConversation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOnline = useOnlineStatus()

  const [activeTab, setActiveTab] = useState<Tab>('chats')
  const [woTab] = useState<WoTab>('today')
  const [, setWoList] = useState<unknown[]>([])

  const [dms, setDms] = useState<Conversation[]>([])
  const [groups, setGroups] = useState<Conversation[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [mySupabaseId, setMySupabaseId] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'ok' | 'reconnecting' | 'error'>('ok')
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const [pendingMessageIds, setPendingMessageIds] = useState<Set<string>>(new Set())
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<string>>(new Set())
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmLabel?: string
    isDestructive?: boolean
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })

  const [newMessage, setNewMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<MediaPreviewItem | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorder = useAudioRecorder()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const msgChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const convChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Sync current user
  useEffect(() => {
    if (!user) return
    upsertUser(user.id, {
      nome: user.nome,
      email: user.email,
      avatar_url: user.profile_picture,
      bubble_id: user.bubble_id,
      tipo_user_bubble: user.tipo_user_bubble,
    })
  }, [user])

  // ── Load conversations + subscribe to list changes
  useEffect(() => {
    if (!user) return
    const userId = user.id
    let cancelled = false
    let convChannel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      setLoadingConvs(true)
      setError(null)
      try {
        // Dispara a sincronização de WOs em background
        if (navigator.onLine && user && user.email) {
          syncWorkingOrders({ workerEmail: user.email }).catch(console.error)
        }
        let sbUser = await getSupabaseUserById(userId)
        if (!sbUser) {
          if (user && user.id === userId) {
            sbUser = {
              id: user!.id,
              nome: user!.nome,
              email: user!.email,
              tipo_user_bubble: user!.tipo_user_bubble,
              avatar_url: user!.profile_picture,
              bubble_id: user!.bubble_id
            }
          } else {
            throw new Error('User profile not found. Please sign out and sign in again.')
          }
        }
        if (cancelled) return
        setMySupabaseId(sbUser.id)

        const [dmList, groupList] = await Promise.all([
          getDMsForUser(sbUser.id),
          getGroupsForUser(sbUser.id),
        ])
        if (cancelled) return
        setDms(dmList)
        setGroups(groupList)

        // Pre-cache all chat contacts in the background if online
        if (navigator.onLine) {
          getChatContacts(sbUser.id).catch(e => console.warn('[ChatPage] Failed to pre-cache contacts:', e))
        }

        convChannel = subscribeToConversations(sbUser.id, async () => {
          if (cancelled) return
          const [dmList2, groupList2] = await Promise.all([
            getDMsForUser(sbUser.id),
            getGroupsForUser(sbUser.id),
          ])
          if (cancelled) return
          setDms(dmList2)
          setGroups(groupList2)
        })
        convChannelRef.current = convChannel
      } catch (err: any) {
        console.error('Error loading conversations:', err)
        setError(err.message || String(err))
      } finally {
        if (!cancelled) setLoadingConvs(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (convChannel) {
        supabase.removeChannel(convChannel)
        convChannelRef.current = null
      }
    }
  }, [user])

  // ── Open conversation ref
  const openConversationRef = useRef<(conv: Conversation) => void>(() => {})

  // ── Open from ?c= param
  useEffect(() => {
    const targetId = searchParams.get('c')
    if (!targetId || !user) return
    if (loadingConvs) return
    const all = [...dms, ...groups]
    const target = all.find(c => c.id === targetId)
    if (target && activeConversation?.id !== targetId) {
      openConversationRef.current(target)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, loadingConvs, dms, groups, user, activeConversation?.id])

  // ── Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return
    const handle = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showEmojiPicker])

  function insertEmoji(emoji: string) {
    setNewMessage(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // ── Open conversation
  async function openConversation(conv: Conversation) {
    if (msgChannelRef.current) {
      supabase.removeChannel(msgChannelRef.current)
      msgChannelRef.current = null
    }

    setActiveConversation(conv)
    setActiveConversationId(conv.id)
    setMessages([])
    setLoadingMessages(true)
    if (!user) return
    let sbUser = await getSupabaseUserById(user.id)
    if (!sbUser) {
      sbUser = {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo_user_bubble: user.tipo_user_bubble,
        avatar_url: user.profile_picture,
        bubble_id: user.bubble_id
      }
    }

    const msgs = await getMessages(conv.id, 100)
    setMessages(msgs)
    setLoadingMessages(false)

    try {
      const db = await getDB()
      const queueItems = await db.getAll('syncQueue')
      const pendingIds = new Set(
        queueItems
          .filter(item => item.action === 'send_chat_message' && item.payload.conversation_id === conv.id)
          .map(item => item.payload.id as string)
      )
      setPendingMessageIds(pendingIds)
    } catch (e) {
      console.warn('Failed to load pending message IDs:', e)
    }

    await markConversationRead(conv.id, sbUser.id)
    setDms(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    setGroups(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    refreshUnread()

    const channel = subscribeToMessages(
      conv.id,
      async (msg: Message) => {
        console.log('[chatPage] Realtime message event received:', msg)
        // chat_file insert path: msg has only { id, chat_file } from the chat_files subscribe
        if (msg.chat_file && !msg.content) {
          setMessages(prev =>
            prev.map(m => m.id === msg.id ? { ...m, chat_file: msg.chat_file } : m)
          )
          return
        }
        let enriched = { ...msg }
        if (!enriched.sender) {
          const senderProfile = conv.participants?.find(p => p.id === enriched.sender_id)
          if (senderProfile) {
            enriched.sender = senderProfile
          }
        }
        if (isMediaMessage(enriched) && !enriched.chat_file) {
          for (let i = 0; i < 2; i++) {
            await new Promise(r => setTimeout(r, 600))
            const cf = await getChatFile(msg.id)
            if (cf) { enriched = { ...enriched, chat_file: cf }; break }
          }
        }
        setMessages(prev => {
          if (prev.some(m => m.id === enriched.id)) {
            return prev.map(m => m.id === enriched.id ? enriched : m)
          }
          return [...prev, enriched]
        })
        setPendingMessageIds(prev => {
          if (prev.has(enriched.id)) {
            const next = new Set(prev)
            next.delete(enriched.id)
            return next
          }
          return prev
        })
        if (enriched.sender_id !== sbUser.id) {
          await markConversationRead(conv.id, sbUser.id)
          refreshUnread()
        }
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      },
      (deletedId: string) => {
        console.log('[chatPage] Realtime message delete event received:', deletedId)
        setDeletingMessageIds(prev => new Set(prev).add(deletedId))
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== deletedId))
          setDeletingMessageIds(prev => {
            const next = new Set(prev)
            next.delete(deletedId)
            return next
          })
        }, 300)
      },
      (status) => {
        console.log('[chatPage] Realtime status change:', status)
        if (status === 'SUBSCRIBED') setConnectionStatus('ok')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('reconnecting')
        }
      }
    )
    msgChannelRef.current = channel
  }
  openConversationRef.current = openConversation

  // ── Close conversation
  function closeConversation() {
    if (msgChannelRef.current) {
      supabase.removeChannel(msgChannelRef.current)
      msgChannelRef.current = null
    }
    setActiveConversation(null)
    setActiveConversationId(null)
    setMessages([])
    setConnectionStatus('ok')
    setShowGroupSettings(false)
  }

  // ── Cleanup on unmount
  useEffect(() => {
    return () => {
      if (msgChannelRef.current) {
        supabase.removeChannel(msgChannelRef.current)
        msgChannelRef.current = null
      }
      setActiveConversationId(null)
    }
  }, [setActiveConversationId])

  async function handleOfflineSend(sbUser: any, textContent: string, dateIso: string) {
    const msgId = generateUUID()
    const optimisticMsg: Message = {
      id: msgId,
      conversation_id: activeConversation!.id,
      sender_id: sbUser.id,
      content: textContent,
      tipo: 'text',
      audio_url: null,
      transcription: null,
      bubble_id: null,
      created_at: dateIso,
      sender: {
        id: sbUser.id,
        nome: user!.nome,
        email: user!.email,
        avatar_url: user!.profile_picture,
        tipo_user_bubble: user!.tipo_user_bubble
      }
    }

    setMessages(prev => [...prev, optimisticMsg])
    setPendingMessageIds(prev => new Set(prev).add(msgId))
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    const updatedConv = {
      ...activeConversation!,
      last_message: textContent,
      last_message_at: dateIso
    }
    setActiveConversation(updatedConv)
    setDms(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c))
    setGroups(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c))

    try {
      await saveCachedMessages(activeConversation!.id, [...messages, optimisticMsg])
      await enqueueChatMessage(msgId, activeConversation!.id, sbUser.id, textContent, dateIso)
    } catch (e) {
      console.error('Failed to save/queue offline message:', e)
    }
  }

  // ── Send message
  async function handleSend() {
    if (!user || !activeConversation || sending) return
    let sbUser = await getSupabaseUserById(user.id)
    if (!sbUser) {
      sbUser = {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo_user_bubble: user.tipo_user_bubble,
        avatar_url: user.profile_picture,
        bubble_id: user.bubble_id
      }
    }

    if (pendingMedia) {
      const media = pendingMedia
      setPendingMedia(null)
      setSending(true)
      
      // Salva o texto e limpa a caixa
      const currentText = newMessage.trim()
      setNewMessage('')
      setShowAttachMenu(false)
      
      try {
        if (isOnline) {
          const res = await sendMediaMessage({
            conversationId: activeConversation.id,
            senderId: sbUser.id,
            senderEmail: user.email,
            fileType: media.type,
            mimeType: media.mimeType,
            originalName: media.name,
            blob: media.blob,
            content: currentText,
          })
          if (res?.message) {
            setMessages(prev => prev.some(m => m.id === res.message.id) ? prev : [...prev, res.message])
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          }
        } else {
          const msgId = generateUUID()
          const createdIso = new Date().toISOString()
          const optimisticContent = currentText !== '' ? currentText : (media.type === 'audio' ? 'Audio' : (media.name || 'File'))
          const optimisticMsg: Message = {
            id: msgId,
            conversation_id: activeConversation.id,
            sender_id: sbUser.id,
            sender: sbUser as any,
            content: optimisticContent,
            tipo: media.type === 'audio' ? 'audio' : 'text',
            audio_url: null,
            transcription: null,
            bubble_id: null,
            created_at: createdIso,
            chat_file: {
              id: 'temp_cf_' + msgId,
              message_id: msgId,
              sender_id: sbUser.id,
              bucket: 'chat-media',
              storage_path: 'pending',
              public_url: URL.createObjectURL(media.blob),
              file_type: media.type,
              mime_type: media.mimeType,
              original_name: media.name,
              file_size: media.blob.size,
              synced: false,
              created_at: createdIso,
            } as any
          }

          setMessages(prev => [...prev, optimisticMsg])
          setPendingMessageIds(prev => new Set(prev).add(msgId))
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

          const updatedConv = {
            ...activeConversation,
            last_message: optimisticMsg.content,
            last_message_at: createdIso
          }
          setActiveConversation(updatedConv)
          setDms(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c))
          setGroups(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c))

          try {
            await saveCachedMessages(activeConversation.id, [...messages, optimisticMsg])
            await queueMediaOffline({
              messageId: msgId,
              conversationId: activeConversation.id,
              senderId: sbUser.id,
              senderEmail: user.email,
              fileType: media.type,
              mimeType: media.mimeType,
              originalName: media.name,
              blob: media.blob,
              content: optimisticContent,
            })
          } catch (e) {
            console.error('Failed to queue offline media:', e)
          }
        }
      } catch (e) {
        console.error('media send failed:', e)
        alert('Failed to send media. Please try again.')
      } finally {
        setSending(false)
      }
      return
    }

    const text = newMessage.trim()
    if (!text) return
    setNewMessage('')
    
    const createdIso = new Date().toISOString()
    if (isOnline) {
      setSending(true)
      try {
        const sentMsg = await sendMessage(activeConversation.id, sbUser.id, text, 'text')
        if (sentMsg) {
          setMessages(prev => prev.some(m => m.id === sentMsg.id) ? prev : [...prev, sentMsg])
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
      } catch (e) {
        console.warn('Online sendMessage failed, falling back to offline enqueue:', e)
        await handleOfflineSend(sbUser, text, createdIso)
      } finally {
        setSending(false)
      }
    } else {
      await handleOfflineSend(sbUser, text, createdIso)
    }
  }

  // ── File/image selection
  async function handleFileSelected(file: File) {
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

  // ── Audio record
  async function handleMicPress() { await recorder.start() }
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

  // ── Delete message
  async function handleDelete(msg: Message) {
    if (!user || !activeConversation) return
    if (msg.sender_id !== mySupabaseId) return
    
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message? This action cannot be undone.',
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }))
        setDeletingMessageIds(prev => new Set(prev).add(msg.id))
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== msg.id))
          setDeletingMessageIds(prev => {
            const next = new Set(prev)
            next.delete(msg.id)
            return next
          })
        }, 300)
        try {
          await deleteMessage({
            messageId: msg.id,
            currentUserId: mySupabaseId,
            currentUserEmail: user.email,
          })
        } catch (e: any) {
          console.error('delete failed:', e)
          alert(e?.message ?? 'Delete failed')
        }
      }
    })
  }

  // ── Helpers
  function getParticipantNames(conv: Conversation): string {
    if (conv.tipo === 'group') return conv.nome ?? 'Group'
    const others = conv.participants?.filter(p => p.id !== mySupabaseId) ?? []
    return others[0]?.nome ?? 'Chat'
  }
  function getParticipantAvatar(conv: Conversation): string | undefined {
    const others = conv.participants?.filter(p => p.id !== mySupabaseId) ?? []
    return others[0]?.avatar_url
  }
  function getParticipantInitials(conv: Conversation): string {
    const name = getParticipantNames(conv)
    return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
  }
  function formatTime(dateStr: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  function formatLastListTime(dateStr: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    if (diffMs < 86400000 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
    if (diffMs < 7 * 86400000) {
      return d.toLocaleDateString('en-US', { weekday: 'short' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // ── Conversation list views
  const dmView = useMemo(() => {
    if (loadingConvs) return <ListSkeleton />
    if (dms.length === 0) {
      return (
        <EmptyState
          icon={<ChatBubbleIcon />}
          title="No chats yet"
          subtitle="Tap + to start a new conversation"
        />
      )
    }
    return dms.map(conv => (
      <ConversationRow
        key={conv.id}
        conv={conv}
        onClick={() => openConversation(conv)}
        title={getParticipantNames(conv)}
        avatar={getParticipantAvatar(conv)}
        initials={getParticipantInitials(conv)}
        subtitle={conv.last_message ?? 'Tap to start chatting'}
        time={formatLastListTime(conv.last_message_at)}
      />
    ))
  }, [dms, loadingConvs, mySupabaseId])

  const groupView = useMemo(() => {
    if (loadingConvs) return <ListSkeleton />
    if (groups.length === 0) {
      return (
        <EmptyState
          icon={<GroupIcon />}
          title="No groups yet"
          subtitle={
            canCreateGroups(user?.tipo_user_bubble)
              ? 'Tap + to create a new group'
              : 'Only Owners and Directors can create groups'
          }
        />
      )
    }
    return groups.map(conv => (
      <ConversationRow
        key={conv.id}
        conv={conv}
        onClick={() => openConversation(conv)}
        title={conv.nome ?? 'Group'}
        avatar={undefined}
        initials={(conv.nome ?? 'G').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || 'G'}
        subtitle={`${conv.member_count ?? conv.participants?.length ?? 0} members · ${conv.last_message ?? 'No messages yet'}`}
        time={formatLastListTime(conv.last_message_at)}
        isGroup
      />
    ))
  }, [groups, loadingConvs, mySupabaseId, user?.tipo_user_bubble])

  // ── RENDER (SPLIT PANE RESPONSIVE)
  return (
    <div className="flex h-full w-full bg-gray-50 overflow-hidden">
      
      {/* LEFT PANE (LIST VIEW) */}
      <div className={`flex-col h-full bg-gray-50 border-r border-gray-200 w-full md:w-80 lg:w-96 shrink-0 ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-800">Chat</h1>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}
                title={isOnline ? 'Online' : 'Offline'}
              />
              {!isOnline && (
                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                  Offline
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(activeTab === 'chats' || (activeTab === 'groups' && canCreateGroups(user?.tipo_user_bubble))) && (
              <button
                onClick={() => navigate(activeTab === 'groups' ? '/chat/groups/new' : '/chat/new')}
                className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center"
                aria-label="New"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-2.5 text-sm font-semibold ${activeTab === 'chats' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
          >
            Chats
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 py-2.5 text-sm font-semibold ${activeTab === 'groups' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
          >
            Groups
          </button>
          <button
            onClick={() => setActiveTab('works')}
            className={`flex-1 py-2.5 text-sm font-semibold ${activeTab === 'works' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
          >
            Works
          </button>
        </div>

        {/* WO tab content (left here to satisfy the import chain — unused) */}
        {woTab === 'today' && <div style={{ display: 'none' }} onLoad={() => setWoList([])} />}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 mx-4 my-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
              Error: {error}
            </div>
          )}
          {activeTab === 'chats' && dmView}
          {activeTab === 'groups' && groupView}
          {activeTab === 'works' && <WOListView onSelect={openConversation} />}
        </div>
      </div>

      {/* RIGHT PANE (CONVERSATION VIEW) */}
      <div className={`flex-col flex-1 h-full bg-gray-50 relative ${!activeConversation ? 'hidden md:flex' : 'flex'}`}>
        {activeConversation ? (
          <div className="flex flex-col h-full overflow-hidden w-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm shrink-0">
              <button onClick={closeConversation} className="md:hidden p-2 rounded-full hover:bg-gray-100 shrink-0">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">
              {getParticipantNames(activeConversation)}
            </p>
            <p className="text-xs text-gray-500 capitalize flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
              <span>{activeConversation.tipo === 'group' ? 'Group' : 'Direct message'}</span>
              {!isOnline && (
                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider scale-90 origin-left">
                  Offline
                </span>
              )}
            </p>
          </div>
          {connectionStatus === 'reconnecting' && (
            <span className="text-xs text-orange-500 font-medium">Reconnecting…</span>
          )}
          {activeConversation.tipo === 'group' && (
            <button
              onClick={() => setShowGroupSettings(true)}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
              aria-label="Group Settings"
            >
              <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingMessages && <div className="text-center text-gray-400 text-sm py-8">Loading messages...</div>}
          {!loadingMessages && messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">No messages yet. Start the conversation!</div>
          )}
          {messages.map(msg => {
            const isMine = msg.sender_id === mySupabaseId
            const senderAvatar = msg.sender?.avatar_url
            const senderName = msg.sender?.nome ?? ''
            const senderInitials = senderName
              ? senderName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
              : (msg.sender_id?.charAt(0)?.toUpperCase() ?? '?')
            const cf = msg.chat_file && (msg.chat_file as any).id ? msg.chat_file : null
            const isMediaLabel = isMediaMessage(msg)
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end origin-right' : 'justify-start origin-left'} ${!isMine && senderAvatar ? 'items-end' : ''} transition-all duration-300 ease-out ${deletingMessageIds.has(msg.id) ? 'opacity-0 scale-90 translate-y-2' : 'opacity-100 scale-100 translate-y-0'}`}
                onContextMenu={(e) => {
                  if (isMine) {
                    e.preventDefault()
                    handleDelete(msg)
                  }
                }}
              >
                {!isMine && senderAvatar && (
                  <img src={senderAvatar} alt={msg.sender?.nome ?? 'User'} className="w-7 h-7 rounded-full object-cover mr-2 mb-0.5 shrink-0" />
                )}
                {!isMine && !senderAvatar && (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 mr-2 mb-0.5 shrink-0">
                    {senderInitials}
                  </div>
                )}
                <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm shadow-sm ${isMine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'}`}>
                  {!isMine && activeConversation.tipo === 'group' && (
                    <p className="text-[10px] font-semibold text-gray-500 mb-0.5">{senderName}</p>
                  )}
                  {cf?.file_type === 'image' ? (
                    <div className="relative flex flex-col gap-1.5">
                      <div className="relative inline-block">
                        <a href={cf.public_url} target="_blank" rel="noopener noreferrer">
                          <img src={cf.public_url} alt={cf.original_name ?? 'Image'} className="max-w-full max-h-64 rounded-lg cursor-pointer" />
                        </a>
                        {/* Tag Overlay */}
                        {msg.content?.match(/^\[(.*?)\]/)?.[1] && (
                          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm border border-white/10 pointer-events-none">
                            {msg.content.match(/^\[(.*?)\]/)?.[1]}
                          </div>
                        )}
                      </div>
                      {/* Extra Text Below Image */}
                      {msg.content?.replace(/^\[.*?\]\s*/, '').trim() && (
                        <p className="text-sm break-words whitespace-pre-wrap px-1">
                          {msg.content.replace(/^\[.*?\]\s*/, '').trim()}
                        </p>
                      )}
                    </div>
                  ) : cf?.file_type === 'audio' ? (
                    <AudioPlayer url={cf.public_url} transcription={msg.transcription} inverted={isMine} />
                  ) : cf?.file_type === 'file' ? (
                    <a href={cf.public_url} target="_blank" rel="noopener noreferrer" download={cf.original_name} className={`flex items-center gap-3 min-w-[200px] max-w-[260px] ${isMine ? 'text-white' : 'text-gray-800'}`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isMine ? 'bg-white/20' : 'bg-orange-100'}`}>
                        <FileIcon className={`w-5 h-5 ${isMine ? 'text-white' : 'text-orange-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isMine ? 'text-white' : 'text-gray-800'}`}>{cf.original_name ?? 'File'}</p>
                        <p className={`text-xs ${isMine ? 'text-blue-100' : 'text-gray-500'}`}>{cf.file_size ? formatFileSize(cf.file_size) : 'Document'}</p>
                      </div>
                    </a>
                  ) : isMediaLabel ? (
                    <div className="flex items-center gap-2 opacity-80">
                      {msg.content?.trim().startsWith('Image') ? <ImageIcon /> :
                       msg.content?.trim().startsWith('Audio') ? <MicIcon /> :
                       <FileIcon />}
                      <span className="text-xs">{msg.content?.trim() || 'File'}</span>
                    </div>
                  ) : (
                    <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.transcription && !cf && (
                    <p className="text-xs mt-1 opacity-70 italic break-words">{msg.transcription}</p>
                  )}
                  <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
                    <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                    {isMine && (
                      pendingMessageIds.has(msg.id) ? (
                        <svg className="w-3 h-3 opacity-70 ml-0.5 animate-pulse" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-label="Pending sync to Supabase">
                          <title>Pending sync to Supabase</title>
                          <circle cx="12" cy="12" r="9" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
                        </svg>
                      ) : (
                        <div className="flex items-center gap-1.5 ml-1">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                            <path d="M1 8l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(msg); }}
                            className="hover:text-red-300 opacity-70 hover:opacity-100 transition-colors"
                            aria-label="Delete message"
                            title="Delete message"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )
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

        {/* WOWizard for Work Orders */}
        {activeConversation.tipo === 'wo' && (
          <WOWizard 
            conversation={activeConversation}
            isLastWO={
              groups.filter(g => 
                g.tipo === 'wo' && 
                g.id !== activeConversation.id &&
                (g.work_orders?.status === 'NOT STARTED' || g.work_orders?.status === 'IN PROGRESS')
              ).length === 0
            }
            onAttachPhoto={(tag) => {
               setNewMessage(tag + ' ');
               setShowAttachMenu(true);
            }}
            onSendSystemMessage={async (text) => {
              if (!user) return;
              let sbUser = await getSupabaseUserById(user.id);
              if (!sbUser) {
                sbUser = { id: user.id, nome: user.nome, email: user.email, tipo_user_bubble: user.tipo_user_bubble, avatar_url: user.profile_picture, bubble_id: user.bubble_id };
              }
              handleOfflineSend(sbUser as any, text, new Date().toISOString());
            }}
            onWOStarted={async () => {
              if (!user) return;
              const myWoConvs = groups.filter(g => 
                g.tipo === 'wo' && 
                g.work_orders?.status === 'IN PROGRESS' && 
                g.work_orders.id !== activeConversation.wo_id
              );
              for (const old of myWoConvs) {
                if (!old.work_orders) continue;
                
                await supabase.from('work_orders').update({ status: 'COMPLETED' }).eq('id', old.work_orders.id);
                if (old.work_orders.bubble_id) {
                  patchWOInBubble(old.work_orders.bubble_id, { status: 'COMPLETED' }).catch(console.error);
                }
                
                setGroups(prev => prev.map(g => {
                  if (g.id === old.id && g.work_orders) {
                    return { ...g, work_orders: { ...g.work_orders, status: 'COMPLETED' } };
                  }
                  return g;
                }));
              }
            }}
            onClose={() => {
              // Optionally close conversation when done
              closeConversation();
            }}
          />
        )}

        {/* Pending media preview */}
        {pendingMedia && (
          <MediaPreview
            media={pendingMedia}
            onRemove={() => {
              if (pendingMedia.url) URL.revokeObjectURL(pendingMedia.url)
              setPendingMedia(null)
            }}
          />
        )}

        {/* Bottom bar */}
        <div className="border-t border-gray-200 bg-white px-3 py-2 shrink-0">
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="mb-2 bg-gray-50 rounded-xl p-2 grid grid-cols-8 gap-1">
              {QUICK_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => insertEmoji(e)}
                  className="w-9 h-9 text-xl hover:bg-white rounded-lg"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {showAttachMenu && (
            <div className="relative mb-2">
              <AttachmentMenu
                open
                onSelect={file => handleFileSelected(file)}
                onClose={() => setShowAttachMenu(false)}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEmojiPicker(s => !s)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
              aria-label="Emoji"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowAttachMenu(s => !s)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
              aria-label="Attach"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Type a message..."
              className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(newMessage.trim() || pendingMedia) ? (
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-50"
                aria-label="Send"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </button>
            ) : (
              <button
                onPointerDown={handleMicPress}
                onPointerUp={handleMicRelease}
                onPointerLeave={() => recorder.cancel()}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors ${recorder.isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-600'}`}
                aria-label="Hold to record"
              >
                <MicIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <GroupSettingsModal
          isOpen={showGroupSettings}
          onClose={() => setShowGroupSettings(false)}
          conversation={activeConversation}
          currentUserId={mySupabaseId}
          currentUserRole={user?.tipo_user_bubble}
          onUpdate={(updatedConv) => {
            setActiveConversation(updatedConv)
            setGroups(prev => prev.map(g => g.id === updatedConv.id ? updatedConv : g))
          }}
          onLeave={(convId) => {
            closeConversation()
            setGroups(prev => prev.filter(g => g.id !== convId))
          }}
        />
        <ConfirmationModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          isDestructive={confirmConfig.isDestructive}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
          </div>
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50">
            <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
              <ChatBubbleIcon />
            </div>
            <h2 className="text-xl font-semibold text-gray-600">VR Bright Chat</h2>
            <p className="text-sm mt-2 text-center max-w-xs">Select a conversation from the sidebar to start messaging</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components

function ListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="w-12 h-12 bg-gray-200 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-32" />
            <div className="h-2 bg-gray-100 rounded w-48" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">{icon}</div>
      <p className="font-medium text-gray-500">{title}</p>
      <p className="text-sm mt-1 text-center">{subtitle}</p>
    </div>
  )
}

function ConversationRow({
  conv,
  onClick,
  title,
  avatar,
  initials,
  subtitle,
  time,
  isGroup,
}: {
  conv: Conversation
  onClick: () => void
  title: string
  avatar?: string
  initials: string
  subtitle: string
  time: string
  isGroup?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
    >
      {avatar ? (
        <img src={avatar} alt={title} className="w-12 h-12 rounded-full object-cover shrink-0" />
      ) : (
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${isGroup ? 'bg-gradient-to-br from-purple-500 to-purple-700' : 'bg-gradient-to-br from-primary to-primary-dark'}`}>
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-gray-800 text-sm truncate">{title}</p>
          {time && <span className="text-[10px] text-gray-400 shrink-0">{time}</span>}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
      </div>
      {conv.unread_count > 0 && (
        <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">
          {conv.unread_count > 99 ? '99+' : conv.unread_count}
        </span>
      )}
    </button>
  )
}

function ChatBubbleIcon() {
  return (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}
