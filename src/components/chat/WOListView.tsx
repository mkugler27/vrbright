import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { type Conversation } from '../../services/chatApi';

interface WOListViewProps {
  onSelect: (conv: Conversation) => void;
  currentUserId?: string | null;
  className?: string;
  onWoConvsLoaded?: (convs: any[]) => void;
}

export function WOListView({ onSelect, currentUserId, className = '', onWoConvsLoaded }: WOListViewProps) {
  const { user } = useAuth();
  const [woConvs, setWoConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filterWorker, setFilterWorker] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const isAdmin = ['Admin', 'Owner', 'Director'].includes(user?.tipo_user_bubble || '');

  useEffect(() => {
    if (!user) return;
    
    async function load() {
      // Fetch conversations of type 'wo' and join with work_orders
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          work_orders (*)
        `)
        .eq('tipo', 'wo')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('[WOListView] Error loading WO conversations:', error);
      } else {
        // Only show WOs that belong to this worker or if admin?
        // Wait, RLS already filters work_orders by worker_email for workers.
        // For Admins, RLS would need to allow all. We assume RLS is correct.
        // Also, inner join behavior in Postgrest might return null work_orders if RLS blocks.
        if (data) {
          const validWOs = data.filter(c => c.work_orders);
          setWoConvs(validWOs);
          if (onWoConvsLoaded) onWoConvsLoaded(validWOs);
        }
      }
      setLoading(false);
    }
    
    load();

    // Subscribe to changes in work_orders
    const channel = supabase.channel('public:work_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        load();
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
        Nenhuma Work Order encontrada.
      </div>
    );
  }

  const uniqueWorkers = Array.from(new Set(woConvs.map(c => c.work_orders?.worker_email).filter(Boolean)));
  
  const filteredConvs = woConvs.filter(c => {
    const wo = c.work_orders;
    if (!wo) return false;
    if (filterWorker !== 'ALL' && wo.worker_email !== filterWorker) return false;
    if (filterStatus !== 'ALL' && wo.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="flex flex-col">
      {isAdmin && (
        <div className="bg-gray-100 border-b border-gray-200 p-3 flex flex-col gap-2 shadow-sm sticky top-0 z-10">
          <div className="text-xs font-bold text-gray-500 uppercase">Filtros de Administração</div>
          <div className="flex gap-2">
            <select 
              value={filterWorker} 
              onChange={e => setFilterWorker(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-md shadow-sm p-1.5 bg-white text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">Todos os Workers</option>
              {uniqueWorkers.map(w => (
                <option key={w as string} value={w as string}>{w}</option>
              ))}
            </select>
            <select 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-md shadow-sm p-1.5 bg-white text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">Qualquer Status</option>
              <option value="NOT STARTED">Not Started</option>
              <option value="IN PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>
      )}
      
      {filteredConvs.length === 0 && (
        <div className="p-8 text-center text-gray-500 text-sm">
          Nenhuma Work Order atende a estes filtros.
        </div>
      )}
      {filteredConvs.map((conv) => {
        const wo = conv.work_orders;
        const raw = typeof wo.raw_data === 'string' ? JSON.parse(wo.raw_data) : wo.raw_data || {};
        const isCompleted = wo.status === 'COMPLETED';
        const isInProgress = wo.status === 'IN PROGRESS';
        const isNotStarted = wo.status === 'NOT STARTED';
        
        const statusColor = isCompleted 
          ? 'bg-green-100 text-green-700' 
          : isInProgress 
            ? 'bg-blue-100 text-blue-700' 
            : 'bg-yellow-100 text-yellow-700';

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv as Conversation)}
            className={`w-full text-left p-4 border-b border-gray-100 flex flex-col gap-2 transition-colors hover:bg-gray-50`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-800">#{wo.codigo_id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${statusColor}`}>
                  {wo.status}
                </span>
              </div>
              <span className="text-xs text-gray-400 font-medium">
                {wo.data ? new Date(wo.data).toLocaleDateString() : ''}
              </span>
            </div>
            
            {isAdmin && wo.worker_email && (
              <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit mt-1">
                Resp: {wo.worker_email}
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
              <p className="text-xs text-gray-400 truncate mt-1">
                {conv.last_message}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
