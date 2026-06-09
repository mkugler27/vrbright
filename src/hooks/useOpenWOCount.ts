import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';

const CACHE_KEY = 'vrbright_wo_count';

interface CachedCount {
  count: number;
  cached_at: string;
  userId: string;
}

const SMALL_LIMIT = 5;

export function useOpenWOCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as CachedCount;
      if (parsed.userId !== user?.id_bubble) return 0;
      return parsed.count;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (!user?.token || !user.id_bubble) return;

    const ctrl = new AbortController();

    const fetchCount = async () => {
      const constraints = JSON.stringify([
        { key: 'qual_pintor', constraint_type: 'equals', value: user.id_bubble },
        { key: 'status', constraint_type: 'not equal', value: 'COMPLETED' },
        { key: 'liberado_para_pintor', constraint_type: 'equals', value: true },
        { key: 'deletado', constraint_type: 'equals', value: false },
        { key: 'esconder_complain_calendario', constraint_type: 'equals', value: false },
      ]);
      // Small limit — we only need `response.count`, the total matching rows.
      // Bubble returns `count` independent of limit/pagination.
      const params = new URLSearchParams({ constraints, limit: String(SMALL_LIMIT) });
      try {
        const res = await fetch(`${API_BASE_URL}/obj/workingorders?${params.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
          },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { response: { count?: number } };
        const total = typeof json.response.count === 'number' ? json.response.count : 0;
        const entry: CachedCount = {
          count: total,
          cached_at: new Date().toISOString(),
          userId: user.id_bubble,
        };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        } catch {
          // localStorage may be full or disabled; non-fatal
        }
        setCount(total);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        console.warn('Failed to fetch WO count:', err);
      }
    };

    fetchCount();
    return () => ctrl.abort();
  }, [user?.token, user?.id_bubble]);

  return count;
}
