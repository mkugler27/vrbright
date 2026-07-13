import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { fetchTodayWO, type WorkOrderRow } from '../services/workingOrdersApi';
import { getWOCache, saveWOCache, getDB, getCachedUsers, getCachedMessages } from '../services/db';
import { supabase } from '../services/supabase';
import { compressImage, sendMediaMessage, queueMediaOffline } from '../services/chatMedia';
import { deleteMessage } from '../services/chatDelete';
import { createIndividualConversation, sendMessage, subscribeToMessages, type Message } from '../services/chatApi';
import { enqueueChatMessage } from '../services/syncQueue';
import { patchWOInBubble } from '../services/woSync';

function cacheKey(email: string): string {
  return `open_${email || 'anon'}`;
}

function formatSectionDate(iso: string | undefined, today: Date = new Date()): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'No date';

  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dd.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 1) return 'Tomorrow';

  return dd.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function isoDayKey(iso: string | undefined): string {
  if (!iso) return 'no-date';
  return iso.slice(0, 10);
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never synced';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TYPE_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  Painting: { bg: 'bg-primary/10', text: 'text-primary-dark', ring: 'ring-primary/20' },
  Cleaning: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
  Repair: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  Complaint: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200' },
};

function TypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  const cfg = TYPE_COLORS[type] || { bg: 'bg-gray-100', text: 'text-gray-700', ring: 'ring-gray-200' };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text} ring-1 ${cfg.ring}`}
    >
      {type}
    </span>
  );
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; ring: string; dot: string }> = {
  'NOT STARTED': { label: 'Not Started', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200', dot: 'bg-red-500' },
  'IN PROGRESS': { label: 'In Progress', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
  'COMPLETED': { label: 'Completed', bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-500' },
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = STATUS_CONFIG[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-700', ring: 'ring-gray-200', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text} ring-1 ${cfg.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function PriorityTag() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 ring-1 ring-blue-200">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 2.9 1.2-6L1.3 7.8l6.1-.7L10 1.5z" />
      </svg>
      Priority
    </span>
  );
}

export function WOPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const dayKey = useMemo(() => cacheKey(user?.email ?? ''), [user?.email]);

  const [wos, setWOs] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Detail View State
  const [selectedWO, setSelectedWO] = useState<WorkOrderRow | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'chat'>('info');

  // Photo Wizard & Notes
  const [notes, setNotes] = useState('');
  const [savingWO, setSavingWO] = useState(false);
  const [uploadingGroup, setUploadingGroup] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // Chat integration inside WO
  const [adminConvId, setAdminConvId] = useState<string | null>(null);
  const [woMessages, setWOMessages] = useState<Message[]>([]);
  const [loadingWOMessages, setLoadingWOMessages] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<any[]>([]);

  // Step Completion Validation & Memos
  const [noPhotosSteps, setNoPhotosSteps] = useState<{
    repair: boolean;
    damage: boolean;
    splinkers: boolean;
  }>({
    repair: false,
    damage: false,
    splinkers: false,
  });

  useEffect(() => {
    if (selectedWO) {
      const stored = localStorage.getItem(`wo_no_photos_${selectedWO._id}`);
      if (stored) {
        try {
          setNoPhotosSteps(JSON.parse(stored));
        } catch (e) {
          console.error(e);
        }
      } else {
        setNoPhotosSteps({ repair: false, damage: false, splinkers: false });
      }
    }
  }, [selectedWO?._id]);

  const updateNoPhotosStep = (stepKey: 'repair' | 'damage' | 'splinkers', val: boolean) => {
    if (!selectedWO) return;
    const next = { ...noPhotosSteps, [stepKey]: val };
    setNoPhotosSteps(next);
    localStorage.setItem(`wo_no_photos_${selectedWO._id}`, JSON.stringify(next));
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch admin DM conversation (create if missing)
  const getOrCreateAdminConversation = async (myId: string): Promise<string | null> => {
    try {
      let admins: any[] = [];
      if (navigator.onLine) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .in('tipo_user_bubble', ['Owner', 'Director', 'Manager', 'Supervisor']);
        admins = data || [];
      }
      if (admins.length === 0) {
        const cached = await getCachedUsers();
        admins = cached.filter(u => 
          ['Owner', 'Director', 'Manager', 'Supervisor'].includes(u.tipo_user_bubble || '')
        );
      }
      if (admins.length === 0) {
        console.warn('No administrative users found to start WO chat');
        return null;
      }
      // Choose first admin
      const admin = admins.find(a => a.tipo_user_bubble === 'Owner') || 
                    admins.find(a => a.tipo_user_bubble === 'Director') || 
                    admins[0];
      
      const convId = await createIndividualConversation(myId, admin.id);
      return convId;
    } catch (err) {
      console.error('Failed to get admin conversation:', err);
      return null;
    }
  };

  // Load Open Work Orders
  const loadOpenWOs = async () => {
    const cachedWO = await getWOCache(dayKey);
    if (cachedWO.length > 0) {
      setWOs(cachedWO);
      setLoading(false);
    }

    if (!user?.email) {
      if (cachedWO.length === 0) {
        setError('Not authenticated');
        setLoading(false);
      }
      return;
    }

    if (cachedWO.length > 0) setRefreshing(true);

    try {
      const data = await fetchTodayWO({ workerEmail: user.email });
      setWOs(data);
      await saveWOCache(dayKey, data);
      setLastSync(new Date().toISOString());
      setError('');
    } catch (err) {
      console.warn('WO refresh failed:', err);
      if (cachedWO.length === 0) {
        setError(isOnline ? 'Failed to load work orders' : 'Offline — no cached data');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOpenWOs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, isOnline, dayKey]);

  // Load Admin Conversation for chat
  useEffect(() => {
    if (!selectedWO || !user) return;
    const userId = user.id;
    let active = true;
    async function resolveChat() {
      const convId = await getOrCreateAdminConversation(userId);
      if (active) {
        setAdminConvId(convId);
      }
    }
    resolveChat();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWO?._id, user?.id]);

  // Load Pending Offline Photos
  const loadPendingPhotos = async () => {
    if (!selectedWO) return;
    try {
      const db = await getDB();
      const allPending = await db.getAllFromIndex('pendingChatFiles', 'by-created');
      const filtered = allPending.filter(item => item.work_order_id === selectedWO._id);
      setPendingPhotos(filtered);
    } catch (err) {
      console.warn('Failed to load pending photos:', err);
    }
  };

  useEffect(() => {
    loadPendingPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWO?._id]);

  // Load WO Messages and subscribe to updates
  useEffect(() => {
    if (!selectedWO || !adminConvId) return;
    const selectedWOId = selectedWO._id;
    const convId = adminConvId;

    let active = true;
    async function loadWOMessages() {
      setLoadingWOMessages(true);
      try {
        let msgs: Message[] = [];
        if (navigator.onLine) {
          const { data, error } = await supabase
            .from('messages')
            .select('*,sender:users(*),chat_file:chat_files(*)')
            .eq('conversation_id', convId)
            .eq('work_order_id', selectedWOId)
            .order('created_at', { ascending: true });
          
          if (!error && data) {
            msgs = (data as any[]).map(m => {
              const cf = m.chat_file;
              if (Array.isArray(cf)) m.chat_file = cf[0] ?? null;
              else if (cf && Object.keys(cf).length === 0) m.chat_file = null;
              return m;
            }) as Message[];
          }
        } else {
          const cached = await getCachedMessages(convId);
          msgs = cached.filter(m => m.work_order_id === selectedWOId);
        }

        if (active) {
          setWOMessages(msgs);
        }
      } catch (err) {
        console.warn('Failed to load WO messages:', err);
      } finally {
        if (active) {
          setLoadingWOMessages(false);
        }
      }
    }

    loadWOMessages();

    let channel: any = null;
    if (navigator.onLine) {
      channel = subscribeToMessages(
        convId,
        (newMsg) => {
          if (newMsg.work_order_id === selectedWOId) {
            setWOMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        },
        (deletedId) => {
          setWOMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      );
    }

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [selectedWO?._id, adminConvId]);

  // Scroll Chat to Bottom
  useEffect(() => {
    if (activeSubTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [woMessages, activeSubTab]);

  // Group Photos into Galleries (Repair, Damage, Sprinkler, Extra)
  const photosByGroup = useMemo(() => {
    const groups = {
      repair: [] as { id: string; url: string; isPending: boolean; messageId?: string }[],
      damage: [] as { id: string; url: string; isPending: boolean; messageId?: string }[],
      splinkers: [] as { id: string; url: string; isPending: boolean; messageId?: string }[],
      extra: [] as { id: string; url: string; isPending: boolean; messageId?: string }[],
    };

    // Synced photos
    for (const msg of woMessages) {
      const cf = msg.chat_file;
      if (!cf || cf.file_type !== 'image') continue;

      const contentUpper = (msg.content || '').toUpperCase();
      if (contentUpper.includes('[REPAIR]')) {
        groups.repair.push({ id: cf.id, url: cf.public_url, isPending: false, messageId: msg.id });
      } else if (contentUpper.includes('[DAMAGE]') || contentUpper.includes('[DAMAGED]')) {
        groups.damage.push({ id: cf.id, url: cf.public_url, isPending: false, messageId: msg.id });
      } else if (contentUpper.includes('[SPRINKLER]')) {
        groups.splinkers.push({ id: cf.id, url: cf.public_url, isPending: false, messageId: msg.id });
      } else if (contentUpper.includes('[EXTRA]')) {
        groups.extra.push({ id: cf.id, url: cf.public_url, isPending: false, messageId: msg.id });
      }
    }

    // Pending offline photos
    for (const item of pendingPhotos) {
      if (item.file_type !== 'image') continue;
      const objectUrl = URL.createObjectURL(item.blob);
      const groupKey = item.tipo_foto as 'repair' | 'damage' | 'splinkers' | 'extra';
      if (groups[groupKey]) {
        groups[groupKey].push({ id: item.id, url: objectUrl, isPending: true });
      }
    }

    return groups;
  }, [woMessages, pendingPhotos]);

  // Handle Photo Upload
  const handleUploadPhoto = async (group: 'repair' | 'damage' | 'splinkers' | 'extra', file: File) => {
    if (!selectedWO || !adminConvId || !user) return;
    setUploadingGroup(group);
    try {
      const compressedBlob = await compressImage(file);

      let tag = '[REPAIR]';
      if (group === 'damage') tag = '[DAMAGED]';
      else if (group === 'splinkers') tag = '[SPRINKLER]';
      else if (group === 'extra') tag = '[EXTRA]';

      const content = `${tag} Photo uploaded for WO #${selectedWO.codigo_id}`;
      const messageId = crypto.randomUUID();

      const opts = {
        messageId,
        conversationId: adminConvId,
        senderId: user.id,
        senderEmail: user.email,
        fileType: 'image' as const,
        mimeType: 'image/jpeg',
        originalName: `${group}_${Date.now()}.jpg`,
        blob: compressedBlob,
        content,
        codigo_WO: String(selectedWO.codigo_id),
        tipo_foto: group,
        workOrderId: selectedWO._id
      };

      if (navigator.onLine) {
        const result = await sendMediaMessage(opts);
        if (result) {
          const newMsg: Message = {
            ...result.message,
            sender: { id: user.id, nome: user.nome, email: user.email } as any
          };
          setWOMessages(prev => [...prev, newMsg]);
        }
      } else {
        await queueMediaOffline(opts);
        await loadPendingPhotos();
      }

      // Reset 'No Photos' toggle for this step
      if (group !== 'extra') {
        updateNoPhotosStep(group, false);
      }
    } catch (err) {
      console.error('Failed to upload photo:', err);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploadingGroup(null);
    }
  };

  // Handle Photo Delete
  const handleDeletePhoto = async (photo: { id: string; isPending: boolean; messageId?: string }) => {
    if (!user || !selectedWO) return;
    if (!confirm('Are you sure you want to delete this photo?')) return;

    setDeletingPhotoId(photo.id);
    try {
      if (photo.isPending) {
        const db = await getDB();
        await db.delete('pendingChatFiles', photo.id);
        await loadPendingPhotos();
      } else if (photo.messageId) {
        await deleteMessage({
          messageId: photo.messageId,
          currentUserId: user.id,
          currentUserEmail: user.email,
          codigo_WO: String(selectedWO.codigo_id)
        });
        setWOMessages(prev => prev.filter(m => m.id !== photo.messageId));
      }
    } catch (err) {
      console.error('Failed to delete photo:', err);
      alert('Failed to delete photo. Please try again.');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  // Update Status & Finalize WO
  const handleUpdateStatus = async (newStatus: 'NOT STARTED' | 'IN PROGRESS' | 'COMPLETED') => {
    if (!selectedWO) return;
    setSavingWO(true);
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'COMPLETED') {
        updates.notes_extra = notes;
      }
      
      const { error } = await supabase
        .from('work_orders')
        .update(updates)
        .eq('id', selectedWO._id);

      if (error) throw error;

      const updatedWO = { ...selectedWO, ...updates };
      setWOs(prev => prev.map(w => w._id === selectedWO._id ? updatedWO : w));
      setSelectedWO(updatedWO);

      // Bubble integration webhook (status/notes updates only)
      patchWOInBubble(String(selectedWO.codigo_id || ''), updates).catch(console.error);

      if (newStatus === 'COMPLETED') {
        setSelectedWO(null);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update status. Please try again.');
    } finally {
      setSavingWO(false);
    }
  };

  // Send Text Chat Message
  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !adminConvId || !user || !selectedWO) return;
    const text = chatInput.trim();
    setChatInput('');

    try {
      if (navigator.onLine) {
        const msg = await sendMessage(
          adminConvId,
          user.id,
          text,
          'text',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          selectedWO._id
        );
        if (msg) {
          setWOMessages(prev => [...prev, msg]);
        }
      } else {
        const messageId = crypto.randomUUID();
        await enqueueChatMessage(
          messageId,
          adminConvId,
          user.id,
          text,
          new Date().toISOString(),
          selectedWO._id
        );

        const optimisticMsg: Message = {
          id: messageId,
          conversation_id: adminConvId,
          sender_id: user.id,
          content: text,
          tipo: 'text',
          audio_url: null,
          transcription: null,
          bubble_id: null,
          created_at: new Date().toISOString(),
          sender: { id: user.id, nome: user.nome, email: user.email } as any,
          work_order_id: selectedWO._id
        };
        setWOMessages(prev => [...prev, optimisticMsg]);
      }
    } catch (err) {
      console.error('Failed to send WO message:', err);
    }
  };

  const handleManualRefresh = () => {
    if (refreshing) return;
    loadOpenWOs();
  };

  // ── RENDER WORK ORDER LISTS (default view)
  if (!selectedWO) {
    return (
      <div className="min-h-full bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-white px-5 pt-6 pb-4 sticky top-0 z-10 border-b border-gray-100/80 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Open Work</h1>
            <button
              onClick={handleManualRefresh}
              disabled={refreshing || !isOnline}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 active:scale-90 transition-transform disabled:opacity-50"
              aria-label="Refresh work orders"
              title={isOnline ? 'Refresh' : 'Offline'}
            >
              <svg
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-500 font-medium">
              {wos.length} open {wos.length === 1 ? 'job' : 'jobs'}
            </p>
            <span className="text-gray-300">·</span>
            <p className="text-xs text-gray-400">
              {isOnline ? (
                <>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />
                  {formatLastSync(lastSync)}
                </>
              ) : (
                <>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-1" />
                  Offline · {formatLastSync(lastSync)}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow px-4 py-4 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {!loading && !error && wos.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">No open jobs</p>
            </div>
          )}

          {!loading && !error && wos.length > 0 && (
            <div className="space-y-4">
              {(() => {
                const groups: { key: string; label: string; items: typeof wos }[] = [];
                for (const wo of wos) {
                  const key = isoDayKey(wo.data);
                  const last = groups[groups.length - 1];
                  if (last && last.key === key) {
                    last.items.push(wo);
                  } else {
                    groups.push({ key, label: formatSectionDate(wo.data), items: [wo] });
                  }
                }
                return groups.map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        {group.label}
                      </h2>
                      <span className="text-xs text-gray-400 font-medium">
                        · {group.items.length} {group.items.length === 1 ? 'job' : 'jobs'}
                      </span>
                      <div className="flex-1 h-px bg-gray-200/70 ml-1" />
                    </div>
                    <div className="space-y-2.5">
                      {group.items.map((wo) => {
                        const propertyName = (wo.qual_condo_txt || wo.qual_condo_txt_nick || '—').trim();
                        const isPriority = wo.prioridade === true || (typeof wo.prioridade === 'string' && wo.prioridade.toLowerCase() === 'yes');

                        return (
                          <div
                            key={wo._id}
                            className="bg-white rounded-[24px] p-4 shadow-sm border border-gray-100/60 active:scale-[0.99] transition-transform"
                          >
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">WO</span>
                                <span className="text-2xl font-bold text-gray-900 leading-none tracking-tight">
                                  #{wo.codigo_id ?? '—'}
                                </span>
                              </div>
                              <StatusBadge status={wo.status} />
                            </div>

                            <h3 className="font-semibold text-gray-900 text-[15px] truncate">
                              {propertyName}
                            </h3>

                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {wo.tipo_JOB && <TypeBadge type={wo.tipo_JOB} />}
                              {isPriority && <PriorityTag />}
                              {wo.apt && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                  </svg>
                                  Apt {wo.apt}
                                </span>
                              )}
                              <div className="ml-auto flex-shrink-0">
                                <button
                                  onClick={() => setSelectedWO(wo)}
                                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-wider shadow-sm shadow-primary/30 active:scale-95 active:shadow-none transition-all"
                                  aria-label="Open job"
                                >
                                  <span>Open</span>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RENDER HIGH-FIDELITY DETAILS PANEL
  const condoName = (selectedWO.qual_condo_txt || selectedWO.qual_condo_txt_nick || '—').trim();
  const isPriority = selectedWO.prioridade === true || (typeof selectedWO.prioridade === 'string' && selectedWO.prioridade.toLowerCase() === 'yes');

  return (
    <div className="min-h-full bg-gray-50 flex flex-col h-full overflow-hidden">
      {/* Detail Top Header */}
      <div className="bg-white px-5 pt-6 pb-4 border-b border-gray-100 flex flex-col shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => setSelectedWO(null)}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 active:scale-90 transition-transform shrink-0"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-grow min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">WO</span>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">#{selectedWO.codigo_id ?? '—'}</h2>
            </div>
            <h1 className="text-sm font-semibold text-gray-700 truncate">{condoName}</h1>
          </div>
          <StatusBadge status={selectedWO.status} />
        </div>

        <div className="flex items-center gap-2 mt-1">
          {selectedWO.tipo_JOB && <TypeBadge type={selectedWO.tipo_JOB} />}
          {isPriority && <PriorityTag />}
          {selectedWO.apt && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-semibold bg-gray-100 px-2 py-0.5 rounded-md">
              Apt {selectedWO.apt}
            </span>
          )}
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex p-2 gap-2 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => setActiveSubTab('info')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-extrabold uppercase tracking-wider transition-all ${
            activeSubTab === 'info'
              ? 'bg-primary text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          Info & Photos
        </button>
        <button
          onClick={() => setActiveSubTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-extrabold uppercase tracking-wider transition-all ${
            activeSubTab === 'chat'
              ? 'bg-primary text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          Job Chat
        </button>
      </div>

      {/* Panel Views Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        
        {/* SUB TAB: INFO & PHOTOS */}
        {activeSubTab === 'info' && (
          <div className="space-y-6">
            
            {/* General Info Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2 text-sm text-gray-600">
              {selectedWO.data && (
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-400">Scheduled:</span>
                  <span className="text-gray-800 font-medium">
                    {new Date(selectedWO.data + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
              {selectedWO.data_inicio && (
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-400">Started:</span>
                  <span className="text-gray-800 font-medium">
                    {new Date(selectedWO.data_inicio).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            {/* Start Job Button Trigger */}
            {selectedWO.status === 'NOT STARTED' && (
              <button
                onClick={() => handleUpdateStatus('IN PROGRESS')}
                disabled={savingWO}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-md shadow-emerald-600/20 active:scale-98 transition-transform disabled:opacity-50"
              >
                {savingWO ? 'STARTING...' : 'START JOB'}
              </button>
            )}

            {/* PHOTO WIZARD STEP SECTIONS */}
            {(() => {
              const isStep1Satisfied = photosByGroup.repair.length > 0 || noPhotosSteps.repair;
              const isStep2Satisfied = photosByGroup.damage.length > 0 || noPhotosSteps.damage;
              const isStep3Satisfied = photosByGroup.splinkers.length > 0 || noPhotosSteps.splinkers;

              const isStep2Locked = !isStep1Satisfied;
              const isStep3Locked = !isStep1Satisfied || !isStep2Satisfied;
              const isStep4Locked = !isStep1Satisfied || !isStep2Satisfied || !isStep3Satisfied;

              return (
                <div className="space-y-4">
                  
                  {/* Step 1: Repair Photos */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">1. Repair Photos</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Upload photos of the completed repairs</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {uploadingGroup === 'repair' && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
                        <button
                          onClick={() => {
                            if (selectedWO.status === 'NOT STARTED') {
                              handleUpdateStatus('IN PROGRESS');
                            }
                            updateNoPhotosStep('repair', !noPhotosSteps.repair);
                          }}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                            noPhotosSteps.repair
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {noPhotosSteps.repair ? 'No Photos Checked' : 'No Photos'}
                        </button>
                      </div>
                    </div>

                    {/* Gallery */}
                    <div className="grid grid-cols-4 gap-2">
                      {photosByGroup.repair.map(p => (
                        <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group bg-gray-50">
                          <img src={p.url} alt="Repair" className="w-full h-full object-cover" />
                          {p.isPending && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                              </svg>
                            </div>
                          )}
                          <button
                            onClick={() => handleDeletePhoto(p)}
                            disabled={deletingPhotoId === p.id}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-sm opacity-90 hover:opacity-100 active:scale-90 transition-transform"
                            aria-label="Delete"
                          >
                            {deletingPhotoId === p.id ? (
                              <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                      <label className="relative aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-primary flex flex-col items-center justify-center gap-1 cursor-pointer active:bg-gray-50 transition-colors">
                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadPhoto('repair', file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Step 2: Damage Photos */}
                  <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 relative transition-all duration-300 ${isStep2Locked ? 'opacity-40 select-none pointer-events-none' : ''}`}>
                    {isStep2Locked && (
                      <div className="absolute top-3 right-3 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-amber-100 flex items-center gap-1 z-10">
                        🔒 Complete Step 1
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">2. Damage Photos</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Upload photos of pre-existing damages</p>
                      </div>
                      {!isStep2Locked && (
                        <div className="flex items-center gap-2">
                          {uploadingGroup === 'damage' && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
                          <button
                            onClick={() => updateNoPhotosStep('damage', !noPhotosSteps.damage)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                              noPhotosSteps.damage
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {noPhotosSteps.damage ? 'No Photos Checked' : 'No Photos'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Gallery */}
                    <div className="grid grid-cols-4 gap-2">
                      {photosByGroup.damage.map(p => (
                        <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group bg-gray-50">
                          <img src={p.url} alt="Damage" className="w-full h-full object-cover" />
                          {p.isPending && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                              </svg>
                            </div>
                          )}
                          <button
                            onClick={() => handleDeletePhoto(p)}
                            disabled={deletingPhotoId === p.id}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-sm opacity-90 hover:opacity-100 active:scale-90 transition-transform"
                            aria-label="Delete"
                          >
                            {deletingPhotoId === p.id ? (
                              <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                      <label className="relative aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-primary flex flex-col items-center justify-center gap-1 cursor-pointer active:bg-gray-50 transition-colors">
                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadPhoto('damage', file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Step 3: Sprinkler Photos */}
                  <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 relative transition-all duration-300 ${isStep3Locked ? 'opacity-40 select-none pointer-events-none' : ''}`}>
                    {isStep3Locked && (
                      <div className="absolute top-3 right-3 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-amber-100 flex items-center gap-1 z-10">
                        🔒 Complete Step 2
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">3. Sprinkler Photos</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Upload photos verifying sprinkler conditions</p>
                      </div>
                      {!isStep3Locked && (
                        <div className="flex items-center gap-2">
                          {uploadingGroup === 'splinkers' && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
                          <button
                            onClick={() => updateNoPhotosStep('splinkers', !noPhotosSteps.splinkers)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                              noPhotosSteps.splinkers
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {noPhotosSteps.splinkers ? 'No Photos Checked' : 'No Photos'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Gallery */}
                    <div className="grid grid-cols-4 gap-2">
                      {photosByGroup.splinkers.map(p => (
                        <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group bg-gray-50">
                          <img src={p.url} alt="Sprinkler" className="w-full h-full object-cover" />
                          {p.isPending && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                              </svg>
                            </div>
                          )}
                          <button
                            onClick={() => handleDeletePhoto(p)}
                            disabled={deletingPhotoId === p.id}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-sm opacity-90 hover:opacity-100 active:scale-90 transition-transform"
                            aria-label="Delete"
                          >
                            {deletingPhotoId === p.id ? (
                              <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                      <label className="relative aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-primary flex flex-col items-center justify-center gap-1 cursor-pointer active:bg-gray-50 transition-colors">
                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadPhoto('splinkers', file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Step 4: Extra Photos & Notes */}
                  <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 relative transition-all duration-300 ${isStep4Locked ? 'opacity-40 select-none pointer-events-none' : ''}`}>
                    {isStep4Locked && (
                      <div className="absolute top-3 right-3 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-amber-100 flex items-center gap-1 z-10">
                        🔒 Complete Step 3
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">4. Extra Photos & Notes</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Upload extra photos and add notes below</p>
                      </div>
                      {!isStep4Locked && uploadingGroup === 'extra' && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
                    </div>

                    {/* Gallery */}
                    <div className="grid grid-cols-4 gap-2">
                      {photosByGroup.extra.map(p => (
                        <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group bg-gray-50">
                          <img src={p.url} alt="Extra" className="w-full h-full object-cover" />
                          {p.isPending && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                              </svg>
                            </div>
                          )}
                          <button
                            onClick={() => handleDeletePhoto(p)}
                            disabled={deletingPhotoId === p.id}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-sm opacity-90 hover:opacity-100 active:scale-90 transition-transform"
                            aria-label="Delete"
                          >
                            {deletingPhotoId === p.id ? (
                              <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                      <label className="relative aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-primary flex flex-col items-center justify-center gap-1 cursor-pointer active:bg-gray-50 transition-colors">
                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadPhoto('extra', file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Extra Notes Input Box */}
                    <div className="space-y-1 mt-2">
                      <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">Extra Notes</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Enter any additional job notes..."
                        className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/45 min-h-[90px] bg-gray-50/50"
                      />
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* Save & Complete WO Button */}
            {selectedWO.status !== 'COMPLETED' && (
              <button
                onClick={() => handleUpdateStatus('COMPLETED')}
                disabled={savingWO || !(photosByGroup.repair.length > 0 || noPhotosSteps.repair) || !(photosByGroup.damage.length > 0 || noPhotosSteps.damage) || !(photosByGroup.splinkers.length > 0 || noPhotosSteps.splinkers)}
                className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-primary/25 active:scale-98 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {savingWO ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'SAVE & COMPLETE WORK ORDER'
                )}
              </button>
            )}

            {selectedWO.status === 'COMPLETED' && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                <p className="text-sm text-emerald-800 font-bold">🎉 Work Order Completed</p>
                <p className="text-xs text-emerald-600 mt-1">This job is closed and fount in your records.</p>
              </div>
            )}
          </div>
        )}

        {/* SUB TAB: JOB CHAT */}
        {activeSubTab === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-220px)] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Messages box */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50">
              {loadingWOMessages && (
                <div className="text-center text-gray-400 text-sm py-4">Loading WO Chat...</div>
              )}
              {!loadingWOMessages && woMessages.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-8 px-4">
                  No chat logs for this Work Order yet. Ask a question or report a status below!
                </div>
              )}
              {!loadingWOMessages && woMessages.map(msg => {
                const isMine = msg.sender_id === user?.id;
                const senderName = msg.sender?.nome ?? 'Admin';
                const cf = msg.chat_file;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
                      isMine ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                    }`}>
                      {!isMine && (
                        <p className="text-[10px] font-bold text-gray-400 mb-0.5">{senderName}</p>
                      )}
                      
                      {cf?.file_type === 'image' ? (
                        <a href={cf.public_url} target="_blank" rel="noopener noreferrer">
                          <img src={cf.public_url} alt="Uploaded" className="max-w-full max-h-48 rounded-lg mt-1" />
                        </a>
                      ) : (
                        <p className="break-words whitespace-pre-wrap">{msg.content?.replace(/^\[.*?\]\s*/, '').trim() || msg.content}</p>
                      )}

                      <span className={`text-[9px] block text-right mt-1 opacity-70 ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input message bar */}
            <div className="p-3 border-t border-gray-100 flex gap-2 bg-white shrink-0 items-center">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                placeholder="Type your message about this job..."
                className="flex-grow bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:bg-white"
              />
              <button
                onClick={handleSendChatMessage}
                disabled={!chatInput.trim()}
                className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center active:scale-95 disabled:opacity-50 transition-all shrink-0"
                aria-label="Send message"
              >
                <svg className="w-5 h-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
