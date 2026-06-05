// Placeholder — to be rebuilt for Work Orders, Photos, etc.
// Will use Bearer token from AuthContext in the Authorization header.

import { useAuth } from '../context/AuthContext';

export function getAuthHeaders(): Record<string, string> {
  // Lazy access to avoid circular deps in non-React contexts
  // Caller should pass token in or use the hook version below
  return {
    'Content-Type': 'application/json',
  };
}

export function useAuthHeaders(): Record<string, string> {
  const { user } = useAuth();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.token) {
    headers['Authorization'] = `Bearer ${user.token}`;
  }
  return headers;
}