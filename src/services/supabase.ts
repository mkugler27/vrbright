import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

// Exported so callers can check before performing operations
export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey)

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : (createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { persistSession: true, autoRefreshToken: true },
    }) as SupabaseClient)

export type User = {
  id: string
  nome: string
  email: string
  role: 'worker' | 'supervisor' | 'admin'
  avatar_url?: string
  bubble_id?: string // só supervisor precisa
}