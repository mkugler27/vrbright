import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSyncQueue } from '../../hooks/useSyncQueue';
import { useUnreadCount } from '../../context/UnreadContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function UserAvatar({ src, name, size = 'md' }: { src?: string; name?: string; size?: 'sm' | 'md' | 'lg' }) {
  const normalized = normalizeImageUrl(src);
  const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-lg' };
  if (normalized) {
    return (
      <img src={normalized} alt={name || 'User'}
        className={`${sizes[size]} rounded-full object-cover bg-white/20 active:scale-95 transition-transform`} />
    );
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-white/20 flex items-center justify-center text-white font-semibold`}>
      {name?.charAt(0).toUpperCase() || 'U'}
    </div>
  );
}

const MENU_ITEMS = [
  { to: '/wo', label: 'Working Orders', icon: <WorksIcon />, primary: true },
  { to: '/chat', label: 'Chat', icon: <ChatIcon />, primary: true },
  { to: '/finance', label: 'Finance', icon: <FinanceIcon />, primary: true },
  { to: '/adjustments', label: 'Adjustment', icon: <AdjustmentIcon />, primary: true },
  { to: '/team', label: 'Team', icon: <TeamIcon /> },
  { to: '/clients', label: 'Clients', icon: <ClientsIcon /> },
  { to: '/pre-proposal', label: 'Pre-Proposal', icon: <ProposalIcon /> },
  { to: '/supervisors', label: 'Supervisors', icon: <SupervisorIcon /> },
  { to: '/dev', label: 'Módulo DEV', icon: <DevIcon /> },
];

export function AppShell() {
  const isOnline = useOnlineStatus();
  useSyncQueue();
  const { count: unreadCount } = useUnreadCount();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [homeClickCount, setHomeClickCount] = useState(0);
  const navigate = useNavigate()

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const handleLogout = () => { logout(); navigate('/login') };
  const handleNav = (to: string) => { setMenuOpen(false); navigate(to); };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-dark to-primary px-5 py-4 flex items-center justify-between sticky top-0 z-20 shadow-md">
        <button onClick={() => setMenuOpen(true)}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
          aria-label="Open menu">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right min-w-0">
            <p className="text-sm font-semibold text-white truncate max-w-[140px]">{user?.nome}</p>
            {user?.email && <p className="text-[10px] text-white/70 truncate max-w-[140px]">{user.email}</p>}
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ring-2 ring-white/30 ${isOnline ? 'bg-green-300' : 'bg-red-400'}`}
            title={isOnline ? 'Online' : 'Offline'} />
          <UserAvatar src={user?.profile_picture} name={user?.nome} size="md" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <Outlet key={homeClickCount === 0 ? 'initial' : `home-${homeClickCount}`} />
      </main>

      {/* Bottom Nav */}
      <nav className="flex-shrink-0 bg-white border-t border-gray-100 px-6 py-2 flex justify-around z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <NavLink to="/" onClick={() => setHomeClickCount(n => n + 1)}
          className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-xs font-medium transition-colors ${isActive ? 'text-primary-dark' : 'text-gray-400'}`}>
          <HomeIcon /><span>Home</span>
        </NavLink>
        <NavLink to="/wo"
          className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-xs font-medium transition-colors ${isActive ? 'text-primary-dark' : 'text-gray-400'}`}>
          <WorksIcon /><span>Works</span>
        </NavLink>
        <NavLink to="/chat"
          className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-xs font-medium transition-colors ${isActive ? 'text-primary-dark' : 'text-gray-400'}`}>
          <ChatIconBadge count={unreadCount} /><span>Chat</span>
        </NavLink>
        <NavLink to="/finance"
          className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-xs font-medium transition-colors ${isActive ? 'text-primary-dark' : 'text-gray-400'}`}>
          <FinanceIcon /><span>Finance</span>
        </NavLink>
      </nav>

      {/* Hamburger Menu Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 flex">
          <div className="w-72 bg-white shadow-2xl flex flex-col animate-slideIn">
            <div className="bg-gradient-to-r from-primary-dark to-primary p-5">
              <div className="flex items-center gap-3">
                <UserAvatar src={user?.profile_picture} name={user?.nome} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{user?.nome}</p>
                  <p className="text-white/70 text-xs truncate">{user?.email}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold px-3 py-2">Main</p>
              {MENU_ITEMS.filter(i => i.primary).map(item => (
                <button key={item.to} onClick={() => handleNav(item.to)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <span className="text-primary-dark">{item.icon}</span>{item.label}
                </button>
              ))}
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold px-3 py-2 mt-3">Other</p>
              {MENU_ITEMS.filter(i => !i.primary).map(item => (
                <button key={item.to} onClick={() => handleNav(item.to)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <span className="text-gray-400">{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100">
              <Button variant="danger" size="md" onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────

function HomeIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function WorksIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function ChatIconBadge({ count }: { count: number }) {
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-sm animate-pulse-subtle">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function FinanceIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ClientsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function ProposalIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function SupervisorIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function AdjustmentIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
    </svg>
  );
}

function DevIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3" />
    </svg>
  );
}