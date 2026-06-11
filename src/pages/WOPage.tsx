import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { fetchTodayWO, type WorkOrderRow } from '../services/workingOrdersApi';
import { getWOCache, saveWOCache } from '../services/db';

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
      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
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

  useEffect(() => {
    const load = async () => {
      // 1) Hydrate from cache
      const cachedWO = await getWOCache(dayKey);
      if (cachedWO.length > 0) {
        setWOs(cachedWO);
        setLoading(false);
      }

      // 2) Network refresh
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
    load();
  }, [user?.email, isOnline, dayKey]);

  const handleRefresh = async () => {
    if (!user?.email || refreshing) return;
    setRefreshing(true);
    try {
      const data = await fetchTodayWO({ workerEmail: user.email });
      setWOs(data);
      await saveWOCache(dayKey, data);
      setLastSync(new Date().toISOString());
      setError('');
    } catch (err) {
      console.error('Manual WO refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white px-5 pt-6 pb-4 sticky top-0 z-10 border-b border-gray-100/80">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Open Work</h1>
          <button
            onClick={handleRefresh}
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
          <p className="text-sm text-gray-500">
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
      <div className="px-4 py-4">
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
              // Group by day, preserving the (already-sorted) order from the API
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
                          {/* Top row: WO number (big) + status badge */}
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">WO</span>
                              <span className="text-2xl font-bold text-gray-900 leading-none tracking-tight">
                                #{wo.codigo_id ?? '—'}
                              </span>
                            </div>
                            <StatusBadge status={wo.status} />
                          </div>

                          {/* Property name */}
                          <h3 className="font-semibold text-gray-900 text-[15px] truncate">
                            {propertyName}
                          </h3>

                          {/* Bottom row: type + priority + apt + open btn */}
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
