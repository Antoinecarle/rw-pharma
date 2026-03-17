import { lazy, Suspense, Component, useEffect, useState as useReactState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache, keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Toaster } from '@/components/ui/sonner'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

// Lazy-loaded pages — split into separate chunks
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const VibesSelectionPage = lazy(() => import('@/pages/VibesSelectionPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ProductsPage = lazy(() => import('@/pages/ProductsPage'))
const WholesalersPage = lazy(() => import('@/pages/WholesalersPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const QuotasPage = lazy(() => import('@/pages/QuotasPage'))
const MonthlyProcessesPage = lazy(() => import('@/pages/MonthlyProcessesPage'))
const MonthlyProcessDetailPage = lazy(() => import('@/pages/MonthlyProcessDetailPage'))
const AllocationDashboardPage = lazy(() => import('@/pages/AllocationDashboardPage'))
const AnsmPage = lazy(() => import('@/pages/AnsmPage'))
const StockPage = lazy(() => import('@/pages/StockPage'))
const ClientDebtsPage = lazy(() => import('@/pages/ClientDebtsPage'))
const InvoicesPage = lazy(() => import('@/pages/InvoicesPage'))
const PortalLayout = lazy(() => import('@/components/portal/PortalLayout'))
const PortalOrdersPage = lazy(() => import('@/pages/portal/PortalOrdersPage'))
const PortalAllocationsPage = lazy(() => import('@/pages/portal/PortalAllocationsPage'))
const PortalStockPage = lazy(() => import('@/pages/portal/PortalStockPage'))
const PortalDocumentsPage = lazy(() => import('@/pages/portal/PortalDocumentsPage'))
const AcceptInvitationPage = lazy(() => import('@/pages/portal/AcceptInvitationPage'))

// Handle auth errors globally — refresh session instead of showing blank pages
function handleGlobalError(error: unknown) {
  const msg = (error as { message?: string })?.message ?? ''
  const code = (error as { code?: string })?.code ?? ''
  if (msg.includes('JWT') || msg.includes('token') || code === 'PGRST301' || code === '401') {
    supabase.auth.refreshSession().then(({ error: refreshErr }) => {
      if (refreshErr) {
        toast.error('Session expirée, reconnexion nécessaire')
        supabase.auth.signOut({ scope: 'local' })
      } else {
        queryClient.invalidateQueries()
      }
    })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleGlobalError }),
  mutationCache: new MutationCache({ onError: handleGlobalError }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: 2,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (role === 'customer') return <Navigate to="/portal" replace />
  return <>{children}</>
}

function CustomerRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (role !== 'customer') return <Navigate to="/" replace />
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg className="h-6 w-6 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    </div>
  )
}

// Error boundary — catches crashes (failed chunks, runtime errors) and recovers
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    // If it's a chunk loading error, try reloading once
    if (error.message?.includes('Loading chunk') || error.message?.includes('dynamically imported module') || error.message?.includes('Failed to fetch')) {
      const reloaded = sessionStorage.getItem('chunk-reload')
      if (!reloaded) {
        sessionStorage.setItem('chunk-reload', '1')
        window.location.reload()
        return
      }
      sessionStorage.removeItem('chunk-reload')
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <span className="text-2xl">!</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Une erreur est survenue</h2>
          <p className="text-sm text-muted-foreground mb-6">{this.state.error?.message ?? 'Erreur inconnue'}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Recharger la page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <span className="text-2xl font-bold text-muted-foreground">404</span>
      </div>
      <h2 className="text-xl font-bold mb-2">Page introuvable</h2>
      <p className="text-sm text-muted-foreground mb-6">Cette page n'existe pas ou a ete deplacee.</p>
      <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
        Retour au Dashboard
      </Link>
    </div>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="flex items-center justify-center py-24"><p className="text-sm text-muted-foreground">Chargement...</p></div>}>{children}</Suspense>
    </ErrorBoundary>
  )
}

function AppRoutes() {
  const { user, loading, role } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to={role === 'customer' ? '/portal' : '/'} replace /> : <LazyPage><LoginPage /></LazyPage>
        } />

        {/* Vibes selection (temporary) */}
        <Route path="/vibes" element={<LazyPage><VibesSelectionPage /></LazyPage>} />

        {/* Invitation acceptance (public) */}
        <Route path="/invite/:token" element={<LazyPage><AcceptInvitationPage /></LazyPage>} />

        {/* Admin routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<LazyPage><DashboardPage /></LazyPage>} />
          <Route path="products" element={<LazyPage><ProductsPage /></LazyPage>} />
          <Route path="wholesalers" element={<LazyPage><WholesalersPage /></LazyPage>} />
          <Route path="disponibilites" element={<LazyPage><QuotasPage /></LazyPage>} />
          <Route path="quotas" element={<Navigate to="/disponibilites" replace />} />
          <Route path="customers" element={<LazyPage><CustomersPage /></LazyPage>} />
          <Route path="monthly-processes" element={<LazyPage><MonthlyProcessesPage /></LazyPage>} />
          <Route path="monthly-processes/:id" element={<LazyPage><MonthlyProcessDetailPage /></LazyPage>} />
          <Route path="allocation-dashboard" element={<LazyPage><AllocationDashboardPage /></LazyPage>} />
          <Route path="stock" element={<LazyPage><StockPage /></LazyPage>} />
          <Route path="debts" element={<LazyPage><ClientDebtsPage /></LazyPage>} />
          <Route path="ansm" element={<LazyPage><AnsmPage /></LazyPage>} />
          <Route path="facturation" element={<LazyPage><InvoicesPage /></LazyPage>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Customer portal routes */}
        <Route
          path="/portal"
          element={
            <CustomerRoute>
              <LazyPage><PortalLayout /></LazyPage>
            </CustomerRoute>
          }
        >
          <Route index element={<LazyPage><PortalOrdersPage /></LazyPage>} />
          <Route path="allocations" element={<LazyPage><PortalAllocationsPage /></LazyPage>} />
          <Route path="stock" element={<LazyPage><PortalStockPage /></LazyPage>} />
          <Route path="documents" element={<LazyPage><PortalDocumentsPage /></LazyPage>} />
        </Route>
      </Routes>
    </Suspense>
  )
}

// ── DEBUG PANEL (temporary) ────────────────────────────────────
function DebugPanel() {
  const qc = useQueryClient()
  const [info, setInfo] = useReactState('')

  useEffect(() => {
    const update = () => {
      const cache = qc.getQueryCache().getAll()
      const total = cache.length
      const fetching = cache.filter(q => q.state.fetchStatus === 'fetching').length
      const error = cache.filter(q => q.state.status === 'error').length
      const pending = cache.filter(q => q.state.status === 'pending').length
      const success = cache.filter(q => q.state.status === 'success').length
      setInfo(`Q:${total} ok:${success} pend:${pending} fetch:${fetching} err:${error}`)
    }
    update()
    const unsub = qc.getQueryCache().subscribe(update)
    return () => unsub()
  }, [qc])

  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8, zIndex: 99999,
      background: '#1a1a2e', color: '#0f0', fontSize: 11, fontFamily: 'monospace',
      padding: '4px 8px', borderRadius: 6, opacity: 0.85, pointerEvents: 'none',
    }}>
      {info}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
              <Toaster richColors position="top-right" />
              <DebugPanel />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
