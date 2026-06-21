import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
const CACHE_KEY = 'vrbright_wo_count';

interface CachedCount {
  count: number;
  cached_at: string;
  email: string;
}

export function useOpenWOCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as CachedCount;
      if (parsed.email !== user?.email) return 0;
      return parsed.count;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (!user?.email) return;

    const ctrl = new AbortController();

    const fetchCount = async () => {
      try {
        const { count: fetchedCount, error } = await supabase
          .from('work_orders')
          .select('*', { count: 'exact', head: true })
          .eq('worker_email', user.email)
          .neq('status', 'COMPLETED');
          
        if (error) throw error;
        
        const total = fetchedCount || 0;
        const entry: CachedCount = {
          count: total,
          cached_at: new Date().toISOString(),
          email: user.email,
        };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        } catch {}
        setCount(total);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        console.warn('Failed to fetch WO count from Supabase:', err);
      }
    };

    fetchCount();
    
    // Subscribe to realtime changes in Supabase for work_orders
    const channel = supabase
      .channel('public:work_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        fetchCount();
      })
      .subscribe();

    return () => {
      ctrl.abort();
      supabase.removeChannel(channel);
    };
  }, [user?.email]);

  return count;
}
