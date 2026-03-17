import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'sb-ahpqewiamnulbhboynbv-auth-token',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Bypass Web Locks API — Supabase nests lock calls internally
    // (getSession inside refreshToken) so any real lock deadlocks.
    // The bypass is safe for a single-tab app.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock: (async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn()
    }) as any,
  },
})

