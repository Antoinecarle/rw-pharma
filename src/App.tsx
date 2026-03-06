import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Toaster } from '@/components/ui/sonner'
import Layout from '@/components/Layout'
import PortalLayout from '@/components/portal/PortalLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ProductsPage from '@/pages/ProductsPage'
import WholesalersPage from '@/pages/WholesalersPage'
import CustomersPage from '@/pages/CustomersPage'
import QuotasPage from '@/pages/QuotasPage'
import MonthlyProcessesPage from '@/pages/MonthlyProcessesPage'
import MonthlyProcessDetailPage from '@/pages/MonthlyProcessDetailPage'
import AllocationDashboardPage from '@/pages/AllocationDashboardPage'
import AnsmPage from '@/pages/AnsmPage'
import PortalOrdersPage from '@/pages/portal/PortalOrdersPage'
import PortalAllocationsPage from '@/pages/portal/PortalAllocationsPage'
import PortalStockPage from '@/pages/portal/PortalStockPage'
import PortalDocumentsPage from '@/pages/portal/PortalDocumentsPage'
import AcceptInvitationPage from '@/pages/portal/AcceptInvitationPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
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

function AppRoutes() {
  const { user, loading, role } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={role === 'customer' ? '/portal' : '/'} replace /> : <LoginPage />
      } />

      {/* Invitation acceptance (public) */}
      <Route path="/invite/:token" element={<AcceptInvitationPage />} />

      {/* Admin routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="wholesalers" element={<WholesalersPage />} />
        <Route path="quotas" element={<QuotasPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="monthly-processes" element={<MonthlyProcessesPage />} />
        <Route path="monthly-processes/:id" element={<MonthlyProcessDetailPage />} />
        <Route path="allocation-dashboard" element={<AllocationDashboardPage />} />
        <Route path="ansm" element={<AnsmPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Customer portal routes */}
      <Route
        path="/portal"
        element={
          <CustomerRoute>
            <PortalLayout />
          </CustomerRoute>
        }
      >
        <Route index element={<PortalOrdersPage />} />
        <Route path="allocations" element={<PortalAllocationsPage />} />
        <Route path="stock" element={<PortalStockPage />} />
        <Route path="documents" element={<PortalDocumentsPage />} />
      </Route>
    </Routes>
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
