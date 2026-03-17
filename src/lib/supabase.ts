import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.')
}

// Simple sequential lock to replace Web Locks API.
// Ensures auth operations (getSession, refreshSession) run one at a time
// without the deadlock that navigator.locks can cause on init.
let authLock: Promise<unknown> = Promise.resolve()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sequentialLock(_name: string, _acquireTimeout: number, fn: () => Promise<any>) {
  const prev = authLock
  let resolve: () => void
  authLock = new Promise<void>(r => { resolve = r })
  return prev.then(fn).finally(() => resolve!())
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'sb-ahpqewiamnulbhboynbv-auth-token',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    lock: sequentialLock as never,
  },
})

