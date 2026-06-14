import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { type Conversation } from '../../services/chatApi';

interface WOListViewProps {
  onSelect: (conv: Conversation) => void;
}

export function WOListView({ onSelect }: WOListViewProps) {
  const { user } = useAuth();
  const [woConvs, setWoConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        .order('updated_at', { ascending: false });
        
      if (error) {
        console.error('[WOListView] Error loading WO conversations:', error);
      } else {
        // Only show WOs that belong to this worker or if admin?
        // Wait, RLS already filters work_orders by worker_email for workers.
        // For Admins, RLS would need to allow all. We assume RLS is correct.
        // Also, inner join behavior in Postgrest might return null work_orders if RLS blocks.
        const validWOs = data?.filter(c => c.work_orders) || [];
        setWoConvs(validWOs);
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

  return (
    <div className="flex flex-col">
      {woConvs.map(conv => {
        const wo = conv.work_orders;
        const raw = wo.raw_data || {};
        
        // Status Colors
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
            onClick={() => onSelect(conv as Conversation)}
            className="w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 flex flex-col gap-2 transition-colors"
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
