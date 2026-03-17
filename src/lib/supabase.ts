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

// ── Tab visibility handler ──────────────────────────────────────
// Stop auto-refresh when tab is hidden, restart when visible.
// This prevents Supabase's internal visibilitychange handler from
// conflicting with any data-fetching that happens on tab focus.
// After session is refreshed, we notify listeners (React Query).
let visibilityCallbacks: Array<() => void> = []
export function onTabVisible(cb: () => void) {
  visibilityCallbacks.push(cb)
  return () => { visibilityCallbacks = visibilityCallbacks.filter(c => c !== cb) }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    supabase.auth.startAutoRefresh()
    // Small delay to let Supabase finish its token refresh before
    // React Query refetches (which internally call getSession)
    setTimeout(() => {
      visibilityCallbacks.forEach(cb => cb())
    }, 300)
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

