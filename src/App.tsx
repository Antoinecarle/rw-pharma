import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Toaster } from '@/components/ui/sonner'
import Layout from '@/components/Layout'

// Lazy-loaded pages — split into separate chunks
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ProductsPage = lazy(() => import('@/pages/ProductsPage'))
const WholesalersPage = lazy(() => import('@/pages/WholesalersPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const QuotasPage = lazy(() => import('@/pages/QuotasPage'))
const MonthlyProcessesPage = lazy(() => import('@/pages/MonthlyProcessesPage'))
const MonthlyProcessDetailPage = lazy(() => import('@/pages/MonthlyProcessDetailPage'))
const AllocationDashboardPage = lazy(() => import('@/pages/AllocationDashboardPage'))
const AnsmPage = lazy(() => import('@/pages/AnsmPage'))
const PortalLayout = lazy(() => import('@/components/portal/PortalLayout'))
const PortalOrdersPage = lazy(() => import('@/pages/portal/PortalOrdersPage'))
const PortalAllocationsPage = lazy(() => import('@/pages/portal/PortalAllocationsPage'))
const PortalStockPage = lazy(() => import('@/pages/portal/PortalStockPage'))
const PortalDocumentsPage = lazy(() => import('@/pages/portal/PortalDocumentsPage'))
const AcceptInvitationPage = lazy(() => import('@/pages/portal/AcceptInvitationPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
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
  return <Suspense fallback={<div className="flex items-center justify-center py-24"><p className="text-sm text-muted-foreground">Chargement...</p></div>}>{children}</Suspense>
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
          <Route path="quotas" element={<LazyPage><QuotasPage /></LazyPage>} />
          <Route path="customers" element={<LazyPage><CustomersPage /></LazyPage>} />
          <Route path="monthly-processes" element={<LazyPage><MonthlyProcessesPage /></LazyPage>} />
          <Route path="monthly-processes/:id" element={<LazyPage><MonthlyProcessDetailPage /></LazyPage>} />
          <Route path="allocation-dashboard" element={<LazyPage><AllocationDashboardPage /></LazyPage>} />
          <Route path="ansm" element={<LazyPage><AnsmPage /></LazyPage>} />
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
