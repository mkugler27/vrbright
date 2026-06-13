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
      realtime: { worker: false },
    })
  : (createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { worker: false },
    }) as SupabaseClient)


export type User = {
  id: string
  nome: string
  email: string
  tipo_user_bubble?: string  // Owner, Director, Manager, Supervisor, Worker, Helper, Trainee
  avatar_url?: string
  bubble_id?: string
}