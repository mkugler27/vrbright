import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { getSupabaseUserByEmail } from '../services/chatApi';
import { getCachedUsers, saveCachedUsers } from '../services/db';
export interface AuthUser {
  id: string;           // Supabase Auth uid
  email: string;
  nome: string;
  tipo_user_bubble?: string;  // Owner, Director, Manager, Supervisor, Worker, Helper, Trainee
  profile_picture?: string;
  bubble_id?: string;
  ativo?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = 'vrbright_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (!parsed || !parsed.id || parsed.id === 'undefined' || parsed.id === 'null') {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const setUser = useCallback((user: AuthUser | null) => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setUserState(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUserState(null);
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setUserState(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Silent Sync on Mount
  useEffect(() => {
    let mounted = true;
    async function syncProfile() {
      if (!user?.email) return;
      const profile = await getSupabaseUserByEmail(user.email);
      if (!mounted || !profile) return;
      
      setUser({
        id: user.id,
        email: user.email,
        nome: profile.nome || user.email.split('@')[0],
        profile_picture: profile.avatar_url,
        tipo_user_bubble: profile.tipo_user_bubble,
        bubble_id: profile.bubble_id,
        ativo: profile.ativo !== false
      });
    }
    syncProfile();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount, deliberately avoiding user dependency loop

  // Realtime Sync for `users` table
  useEffect(() => {
    const channel = supabase.channel('public:users')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        async (payload) => {
          const updatedUser = payload.new;
          
          // 1. Is it the current logged-in user?
          if (user && updatedUser.id === user.id) {
            const newNome = updatedUser.nome || user.email.split('@')[0];
            const newAtivo = updatedUser.ativo !== false;
            if (
              user.nome !== newNome ||
              user.profile_picture !== updatedUser.avatar_url ||
              user.tipo_user_bubble !== updatedUser.tipo_user_bubble ||
              user.bubble_id !== updatedUser.bubble_id ||
              user.ativo !== newAtivo
            ) {
              setUser({
                id: user.id,
                email: user.email,
                nome: newNome,
                profile_picture: updatedUser.avatar_url,
                tipo_user_bubble: updatedUser.tipo_user_bubble,
                bubble_id: updatedUser.bubble_id,
                ativo: newAtivo
              });
            }
          }

          // 2. Always update IndexedDB silently so Chat/Team reflects the new data
          try {
            const cachedUsers = await getCachedUsers();
            const index = cachedUsers.findIndex(u => u.id === updatedUser.id);
            if (index !== -1) {
              cachedUsers[index] = { ...cachedUsers[index], ...updatedUser };
              await saveCachedUsers(cachedUsers);
              
              // Dispatch a custom event so the UI (like ChatPage/TeamPage) can refresh if they are open
              window.dispatchEvent(new CustomEvent('vrbright:users_updated', { detail: updatedUser }));
            }
          } catch (err) {
            console.warn('Failed to update IndexedDB from realtime user patch', err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, setUser, logout]);


  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}