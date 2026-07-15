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
  ativo?: boolean
  telefone?: string
  emergency_contact?: string
  emergency_name?: string
  nickname?: string
  company_name?: string
  ein?: string
  address?: string
  dob?: string
  date_hired?: string
  fired_date?: string
  works_comp_url?: string
  works_comp_valid_until?: string
  insurance_url?: string
  insurance_valid_until?: string
  requires_password_change?: boolean
}