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
    // Bypass Web Locks API to prevent deadlock on session init
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock: (async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn()
    }) as any,
  },
})

// ── Visibility-based session guard ──────────────────────────────
// When the tab regains focus, ensure the Supabase session is still
// valid BEFORE any React Query refetch fires.
// Listeners can register via onSessionReady() to know when it's safe.
let sessionReadyCallbacks: Array<() => void> = []
export function onSessionReady(cb: () => void) {
  sessionReadyCallbacks.push(cb)
  return () => { sessionReadyCallbacks = sessionReadyCallbacks.filter(c => c !== cb) }
}

let refreshing = false
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || refreshing) return
  refreshing = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      // Check if access token is close to expiry (< 60s remaining)
      const exp = session.expires_at ?? 0
      const nowSec = Math.floor(Date.now() / 1000)
      if (exp - nowSec < 60) {
        await supabase.auth.refreshSession()
      }
    }
  } catch {
    // Ignore — auth handler will deal with failures
  } finally {
    refreshing = false
    sessionReadyCallbacks.forEach(cb => cb())
  }
})
