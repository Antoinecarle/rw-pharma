import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type UserRole = 'admin' | 'customer'

interface AuthContext {
  user: User | null
  session: Session | null
  loading: boolean
  role: UserRole
  customerId: string | null
  customerName: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContext | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>('admin')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState<string | null>(null)

  const resolveRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('customer_users')
        .select('customer_id, customers(name)')
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (!error && data) {
        setRole('customer')
        setCustomerId(data.customer_id)
        setCustomerName((data.customers as any)?.name ?? null)
        return
      }
    } catch {
      // Fallback to admin on any error
    }
    setRole('admin')
    setCustomerId(null)
    setCustomerName(null)
  }

  useEffect(() => {
    // Safety timeout: force loading=false after 3s no matter what
    const timeout = setTimeout(() => setLoading(false), 3000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await resolveRole(session.user.id)
    }).catch(() => {
      // Session retrieval failed, clear state
      setSession(null)
      setUser(null)
    }).finally(() => {
      clearTimeout(timeout)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await resolveRole(session.user.id)
      }
      setLoading(false)
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, role, customerId, customerName, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
