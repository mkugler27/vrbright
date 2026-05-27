import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSync } from '../../context/SyncContext';
import { fetchWorkerName } from '../../services/api';

export function AppShell() {
  const isOnline = useOnlineStatus();
  const { pendingCount } = useSync();
  const [workerName, setWorkerName] = useState('');

  useEffect(() => {
    fetchWorkerName().then(setWorkerName).catch(() => setWorkerName('Worker'));
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="bg-gradient-to-r from-primary-dark to-primary px-5 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">VRBright</h1>
          {workerName && <p className="text-xs text-white/70">{workerName}</p>}
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="bg-white/20 backdrop-blur text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              {pendingCount}
            </span>
          )}
          <span
            className={`w-2.5 h-2.5 rounded-full ring-2 ring-white/30 ${isOnline ? 'bg-green-300' : 'bg-red-400'}`}
            title={isOnline ? 'Online' : 'Offline'}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav className="bg-white border-t border-gray-100 px-6 py-3 flex justify-around sticky bottom-0 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-xs font-medium transition-colors ${isActive ? 'text-primary-dark' : 'text-gray-400'}`
          }
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span>Trabalhos</span>
        </NavLink>
        <NavLink
          to="/sync"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-xs font-medium transition-colors ${isActive ? 'text-primary-dark' : 'text-gray-400'}`
          }
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Sync</span>
        </NavLink>
      </nav>
    </div>
  );
}
