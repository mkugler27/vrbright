import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
// Use the service role key for the client because we authenticate via Bubble,
// not Supabase Auth. RLS is enforced at the app level (we only expose data
// the logged-in user is allowed to see).
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string)

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

export type User = {
  id: string
  bubble_id: string
  nome: string
  email: string
  role: string
  avatar_url?: string
}