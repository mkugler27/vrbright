// Deprecated — Bubble token is now read from config/api.ts (BUBBLE_TOKEN).
// This file is kept for reference; prefer importing BUBBLE_TOKEN directly.
import { BUBBLE_TOKEN } from '../config/api';

export function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${BUBBLE_TOKEN}`,
  };
}

export function useAuthHeaders(): Record<string, string> {
  // NOTE: user.token is no longer available in AuthContext.
  // All Bubble API calls use BUBBLE_TOKEN from config/api.ts.
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${BUBBLE_TOKEN}`,
  };
}