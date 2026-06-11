import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, BUBBLE_TOKEN } from '../config/api';

const CACHE_KEY = 'vrbright_wo_count';

interface CachedCount {
  count: number;
  cached_at: string;
  email: string;
}

const SMALL_LIMIT = 5;

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
      const constraints = JSON.stringify([
        { key: 'worker_email', constraint_type: 'equals', value: user.email },
        { key: 'status', constraint_type: 'not equal', value: 'COMPLETED' },
        { key: 'liberado_para_pintor', constraint_type: 'equals', value: true },
        { key: 'deletado', constraint_type: 'equals', value: false },
        { key: 'esconder_complain_calendario', constraint_type: 'equals', value: false },
      ]);
      const params = new URLSearchParams({ constraints, limit: String(SMALL_LIMIT) });
      try {
        const res = await fetch(`${API_BASE_URL}/obj/workingorders?${params.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${BUBBLE_TOKEN}`,
          },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { response: { results: unknown[]; remaining?: number; count?: number } };
        // `remaining` = how many records exist beyond the current page.
        // Total = results returned + remaining.
        const returned = Array.isArray(json.response.results) ? json.response.results.length : 0;
        const remaining = typeof json.response.remaining === 'number' ? json.response.remaining : 0;
        const total = returned + remaining;
        const entry: CachedCount = {
          count: total,
          cached_at: new Date().toISOString(),
          email: user.email,
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
  }, [user?.email]);

  return count;
}
