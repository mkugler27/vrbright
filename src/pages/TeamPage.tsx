import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { fetchActiveTeam, type TeamMember } from '../services/teamApi';
import {
  saveTeamCache,
  getTeamCache,
  getTeamLastSync,
  clearTeamCache,
} from '../services/db';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
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

function TeamAvatar({ src, name, size = 'lg' }: { src?: string; name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const normalized = normalizeImageUrl(src);
  const sizes = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };
  if (normalized) {
    return (
      <img
        src={normalized}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover ring-2 ring-white shadow-sm`}
      />
    );
  }
  const initials = name.split(' ').map((p) => p.charAt(0)).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center text-white font-semibold ring-2 ring-white shadow-sm`}
      style={{
        background: 'linear-gradient(135deg, #7DD3C0 0%, #5BB8A5 100%)',
      }}
    >
      {initials}
    </div>
  );
}

const TYPE_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  Owner:     { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    label: 'Owner' },
  Director:  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500', label: 'Director' },
  Manager:   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500',   label: 'Manager' },
  Supervisor:{ bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', label: 'Supervisor' },
  Worker:    { bg: 'bg-primary/15', text: 'text-primary-dark', dot: 'bg-primary',   label: 'Worker' },
  Helper:    { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Helper' },
  Trainee:   { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: 'bg-gray-500',   label: 'Trainee' },
};

function TypeBadge({ type, size = 'sm' }: { type?: string; size?: 'sm' | 'md' }) {
  if (!type) return null;
  const config = TYPE_CONFIG[type] || { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500', label: type };
  const sizeClass = size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-2 py-0.5';
  return (
    <span className={`font-semibold uppercase tracking-wide ${config.bg} ${config.text} ${sizeClass} rounded-full`}>
      {config.label}
    </span>
  );
}

function TypeFilterPopover({
  availableTypes,
  value,
  onChange,
}: {
  availableTypes: string[];
  value: string;
  onChange: (v: string) => void;
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

  const currentLabel = value === 'all' ? 'All types' : value;
  const currentConfig = value === 'all' ? null : TYPE_CONFIG[value];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-xl pl-3 pr-2.5 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
      >
        {value !== 'all' && currentConfig ? (
          <span className={`w-2.5 h-2.5 rounded-full ${currentConfig.dot}`} />
        ) : (
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        )}
        <span className="max-w-[80px] truncate">{currentLabel}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-slideDown">
          <div className="max-h-72 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => {
                onChange('all');
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-colors ${
                value === 'all' ? 'bg-primary/10 text-primary-dark' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
              <span className="flex-1">All types</span>
              {value === 'all' && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            <div className="h-px bg-gray-100 my-1" />

            {availableTypes.map((type) => {
              const config = TYPE_CONFIG[type] || { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500', label: type };
              const isActive = value === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onChange(type);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary/10 text-primary-dark' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
                  <span className="flex-1">{config.label}</span>
                  {isActive && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      // 1) Load cache first (instant)
      const cached = (await getTeamCache()) as TeamMember[];
      const lastSyncIso = (await getTeamLastSync()) ?? null;
      if (cached.length > 0) {
        setTeam(cached);
        setLastSync(lastSyncIso);
        setLoading(false);
      }

      // 2) Try to refresh from network
      if (!user) {
        if (cached.length === 0) {
          setError('Not authenticated');
          setLoading(false);
        }
        return;
      }

      if (cached.length > 0) {
        setRefreshing(true);
      }

      try {
        const data = await fetchActiveTeam();
        setTeam(data);
        await saveTeamCache(data);
        const now = new Date().toISOString();
        setLastSync(now);
        setError('');
      } catch (err) {
        console.warn('Team refresh failed, using cache:', err);
        if (cached.length === 0) {
          setError(isOnline ? 'Failed to load team' : 'Offline — no cached data');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    load();
  }, [user, isOnline]);

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      const data = await fetchActiveTeam();
      setTeam(data);
      await saveTeamCache(data);
      setLastSync(new Date().toISOString());
      setError('');
    } catch (err) {
      console.error('Manual refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleClearCache = () => {
    setShowConfirm(true);
  };

  const executeClearCache = async () => {
    setShowConfirm(false);
    await clearTeamCache();
    setTeam([]);
    setLastSync(null);
  };

  const availableTypes = Array.from(new Set(team.map((m) => m.tipo_user).filter(Boolean))) as string[];

  const filtered = team.filter((m) => {
    if (typeFilter !== 'all' && m.tipo_user !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.Nome.toLowerCase().includes(q) ||
      (m.nickname || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.telefone || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white px-5 pt-6 pb-4 sticky top-0 z-10 border-b border-gray-100/80">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Team</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing || !isOnline}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 active:scale-90 transition-transform disabled:opacity-50"
            aria-label="Refresh team"
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
          <p className="text-sm text-gray-500">{filtered.length} of {team.length} members</p>
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

        {/* Search + Filter */}
        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full bg-gray-100 border-0 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all"
            />
          </div>

          <TypeFilterPopover
            availableTypes={availableTypes}
            value={typeFilter}
            onChange={setTypeFilter}
          />
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

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">
              {search || typeFilter !== 'all' ? 'No members match' : team.length === 0 ? 'No members yet' : 'No members found'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-2.5">
            {filtered.map((member) => (
              <div
                key={member._id}
                className="bg-white rounded-[28px] p-4 shadow-sm border border-gray-100/60 flex items-center gap-3 active:scale-[0.98] transition-transform duration-150"
              >
                <TeamAvatar src={member.profile_picture} name={member.Nome} size="lg" />

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-[15px] truncate">
                    {member.Nome}
                  </h3>
                  {member.nickname && member.nickname !== member.Nome.split(' ')[0] && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">@{member.nickname}</p>
                  )}
                  {member.email && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{member.email}</p>
                  )}
                  {member.telefone && (
                    <p className="text-xs text-gray-600 mt-0.5 font-mono">{member.telefone}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {member.telefone && (
                    <a
                      href={`tel:${member.telefone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary-dark active:scale-90 transition-transform"
                      aria-label={`Call ${member.Nome}`}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                  )}
                  <TypeBadge type={member.tipo_user} />
                </div>
              </div>
            ))}
          </div>
        )}

        {import.meta.env.DEV && team.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={handleClearCache}
              className="text-[10px] text-gray-300 hover:text-gray-500"
            >
              Clear cache (dev)
            </button>
          </div>
        )}

        <ConfirmationModal
          isOpen={showConfirm}
          title="Clear Cache"
          message="Are you sure you want to clear the cached team data? This will force a full refresh on next visit."
          confirmLabel="Clear Cache"
          isDestructive={true}
          onConfirm={executeClearCache}
          onCancel={() => setShowConfirm(false)}
        />
      </div>
    </div>
  );
}