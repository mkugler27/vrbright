import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { saveCachedConversations, getCachedConversations } from '../../services/db';
import { type Conversation } from '../../services/chatApi';

interface WOListViewProps {
  onSelect: (conv: Conversation) => void;
  currentUserId?: string | null;
  className?: string;
  onWoConvsLoaded?: (convs: any[]) => void;
}

function FilterPopover({
  options,
  value,
  onChange,
  allLabel,
  icon,
}: {
  options: { label: string; value: string; dotColor?: string }[];
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [open]);

  const selectedOption = options.find(o => o.value === value);
  const currentLabel = value === 'ALL' ? allLabel : (selectedOption?.label || value);
  const currentDot = value !== 'ALL' && selectedOption?.dotColor ? (
    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${selectedOption.dotColor}`} />
  ) : null;

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 hover:border-blue-400 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {currentDot || icon}
          <span className="truncate">{currentLabel}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-slideDown max-h-64 overflow-y-auto">
          <div className="p-1.5 flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => {
                onChange('ALL');
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                value === 'ALL' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="flex-1 truncate">{allLabel}</span>
              {value === 'ALL' && (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            
            {options.length > 0 && <div className="h-px bg-gray-100 my-1" />}

            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${
                  value === opt.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.dotColor && (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotColor}`} />
                )}
                <span className="flex-1 truncate">{opt.label}</span>
                {value === opt.value && (
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function WOListView({ onSelect, onWoConvsLoaded }: WOListViewProps) {
  const { user } = useAuth();
  const [woConvs, setWoConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [workerNames, setWorkerNames] = useState<Record<string, string>>({});
  
  const [filterWorker, setFilterWorker] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const isAdmin = ['Admin', 'Owner', 'Director'].includes(user?.tipo_user_bubble || '');

  const loadData = async (isManualSync = false) => {
    if (!user) return;
    if (isManualSync) setLoading(true);
    
    if (!navigator.onLine) {
      if (isManualSync) alert("You are offline. Cannot sync right now.");
        try {
          const cached = await getCachedConversations();
          const validWOs = cached
            .filter(c => c.tipo === 'wo' && c.work_orders)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setWoConvs(validWOs);
          if (onWoConvsLoaded) onWoConvsLoaded(validWOs);
        } catch (e) {
          console.warn('Failed to load WO cache', e);
        }
        setLoading(false);
        return;
      }

      const [ { data, error }, { data: usersData }, { data: myParticipations } ] = await Promise.all([
        supabase
          .from('conversations')
          .select(`
            *,
            work_orders (*)
          `)
          .eq('tipo', 'wo')
          .order('created_at', { ascending: false }),
        supabase.from('users').select('email, nome'),
        supabase.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', user.id)
      ]);
        
      if (error) {
        console.error('[WOListView] Error loading WO conversations:', error);
      } else {
        const names: Record<string, string> = {};
        if (usersData) {
          usersData.forEach(u => {
            if (u.email) names[u.email.toLowerCase()] = u.nome || u.email;
          });
          setWorkerNames(names);
        }

        if (data) {
          const validWOs = data.filter(c => c.work_orders).map(c => {
            const workerEmail = c.work_orders?.worker_email;
            const workerName = workerEmail ? (names[workerEmail.toLowerCase()] || workerEmail) : null;
            const myPart = myParticipations?.find(p => p.conversation_id === c.id);
            const lastRead = myPart?.last_read_at ?? '1970-01-01';
            const unreadCount = (c.last_message_at && c.last_message_at > lastRead) ? 1 : 0;
            return {
              ...c,
              unread_count: unreadCount,
              participants: workerEmail ? [{ email: workerEmail, nome: workerName }] : []
            };
          });
          setWoConvs(validWOs);
          saveCachedConversations(validWOs).catch(console.warn);
          if (onWoConvsLoaded) onWoConvsLoaded(validWOs);
        }
      }
      setLoading(false);
    }
    
  useEffect(() => {
    if (!user) return;
    
    loadData();

    // Subscribe to changes in work_orders and new messages
    const channel = supabase.channel('wolist_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (woConvs.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        No Work Orders found.
      </div>
    );
  }

  const uniqueWorkers = Array.from(new Set(woConvs.map(c => c.work_orders?.worker_email?.toLowerCase()).filter(Boolean)));
  
  const filteredConvs = woConvs.filter(c => {
    const wo = c.work_orders;
    if (!wo) return false;
    if (filterWorker !== 'ALL' && wo.worker_email?.toLowerCase() !== filterWorker) return false;
    if (filterStatus !== 'ALL' && wo.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="flex flex-col">
      <div className="bg-white border-b border-gray-100 p-2 flex justify-end sticky top-0 z-20">
        <button 
          onClick={() => loadData(true)} 
          disabled={loading} 
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Syncing...' : 'Sync'}
        </button>
      </div>
      {isAdmin && (
        <div className="bg-gray-50 border-b border-gray-200 p-3 flex flex-col gap-2 shadow-sm sticky top-0 z-10">
          <div className="text-xs font-bold text-gray-500 uppercase px-1">Admin Filters</div>
          <div className="flex flex-wrap gap-2">
            <FilterPopover 
              allLabel="All Workers"
              value={filterWorker}
              onChange={setFilterWorker}
              options={uniqueWorkers.map(w => {
                const email = w as string;
                return { label: workerNames[email] || email, value: email };
              })}
              icon={<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
            />
            <FilterPopover 
              allLabel="All Statuses"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { label: 'Not Started', value: 'NOT STARTED', dotColor: 'bg-yellow-400' },
                { label: 'In Progress', value: 'IN PROGRESS', dotColor: 'bg-blue-500' },
                { label: 'Completed', value: 'COMPLETED', dotColor: 'bg-green-500' },
              ]}
              icon={<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </div>
        </div>
      )}
      
      {filteredConvs.length === 0 && (
        <div className="p-8 text-center text-gray-500 text-sm">
          No Work Orders match these filters.
        </div>
      )}
      
      <div className="p-3 flex flex-col gap-3">
        {filteredConvs.map((conv) => {
        const wo = conv.work_orders;
        const raw = typeof wo.raw_data === 'string' ? JSON.parse(wo.raw_data) : wo.raw_data || {};
        const isCompleted = wo.status === 'COMPLETED';
        const isInProgress = wo.status === 'IN PROGRESS';
        
        const statusColor = isCompleted 
          ? 'bg-green-100 text-green-700' 
          : isInProgress 
            ? 'bg-blue-100 text-blue-700' 
            : 'bg-yellow-100 text-yellow-700';

        return (
          <button
            key={conv.id}
            onClick={() => {
              setWoConvs(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
              onSelect(conv as Conversation);
            }}
            className="w-full text-left p-4 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col gap-2 transition-all duration-200 hover:border-blue-300 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-800">#{wo.codigo_id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${statusColor}`}>
                  {wo.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">
                  {wo.data ? new Date(wo.data).toLocaleDateString() : ''}
                </span>
                {conv.unread_count > 0 && (
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                )}
              </div>
            </div>
            
            {isAdmin && wo.worker_email && (
              <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit mt-1">
                Worker: {workerNames[wo.worker_email.toLowerCase()] || wo.worker_email}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <p className="text-sm text-gray-600 font-medium">
                {raw.qual_condo_txt_nick || raw.qual_condo_txt || 'No condo specified'}
              </p>
              {raw.apt && (
                <p className="text-xs text-gray-500">
                  Apt: {raw.apt}
                </p>
              )}
              {raw.tipo_JOB && (
                <p className="text-xs text-gray-500">
                  Job: {raw.tipo_JOB}
                </p>
              )}
            </div>
            
            {conv.last_message && (
              <p className={`text-xs truncate mt-1 ${conv.unread_count > 0 ? 'text-gray-800 font-bold' : 'text-gray-400 font-normal'}`}>
                {conv.last_message}
              </p>
            )}
          </button>
        );
      })}
      </div>
    </div>
  );
}
