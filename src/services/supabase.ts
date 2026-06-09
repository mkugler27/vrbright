import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

// Exported so callers can check before performing operations
export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey)

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : (createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as SupabaseClient)

export type User = {
  id: string
  bubble_id: string
  nome: string
  email: string
  role: string
  avatar_url?: string
}