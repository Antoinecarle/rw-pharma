import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Pill,
  Truck,
  Users,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
  TrendingUp,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react'

function StatSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mt-1" />
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: productCount, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', 'count'],
    queryFn: async () => {
      const { count } = await supabase.from('products').select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: wholesalerCount, isLoading: loadingWholesalers } = useQuery({
    queryKey: ['wholesalers', 'count'],
    queryFn: async () => {
      const { count } = await supabase.from('wholesalers').select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: customerCount, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers', 'count'],
    queryFn: async () => {
      const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: blockedCount, isLoading: loadingBlocked } = useQuery({
    queryKey: ['products', 'blocked', 'count'],
    queryFn: async () => {
      const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_ansm_blocked', true)
      return count ?? 0
    },
  })

  const { data: quotaCount, isLoading: loadingQuotas } = useQuery({
    queryKey: ['quotas', 'count'],
    queryFn: async () => {
      const { count } = await supabase.from('wholesaler_quotas').select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const stats = [
    {
      name: 'Produits',
      value: productCount,
      loading: loadingProducts,
      icon: Pill,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      iconBg: 'bg-emerald-500',
      href: '/products',
      target: 1760,
    },
    {
      name: 'Grossistes',
      value: wholesalerCount,
      loading: loadingWholesalers,
      icon: Truck,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      iconBg: 'bg-blue-500',
      href: '/wholesalers',
    },
    {
      name: 'Clients',
      value: customerCount,
      loading: loadingCustomers,
      icon: Users,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      iconBg: 'bg-violet-500',
      href: '/customers',
    },
    {
      name: 'Quotas actifs',
      value: quotaCount,
      loading: loadingQuotas,
      icon: ClipboardList,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      iconBg: 'bg-amber-500',
      href: '/quotas',
    },
    {
      name: 'Bloques ANSM',
      value: blockedCount,
      loading: loadingBlocked,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      iconBg: 'bg-red-500',
      href: '/products',
      danger: true,
    },
  ]

  const quickActions = [
    {
      name: 'Gerer les produits',
      description: 'Catalogue de 1 760 references, import Excel, filtres avances',
      href: '/products',
      icon: Pill,
      gradient: 'from-emerald-500 to-teal-600',
    },
    {
      name: 'Gerer les grossistes',
      description: 'Alliance, CERP, OCP et autres partenaires francais',
      href: '/wholesalers',
      icon: Truck,
      gradient: 'from-blue-500 to-indigo-600',
    },
    {
      name: 'Gerer les quotas',
      description: 'Quotas mensuels par grossiste et par produit',
      href: '/quotas',
      icon: ClipboardList,
      gradient: 'from-amber-500 to-orange-600',
    },
    {
      name: 'Gerer les clients',
      description: 'Orifarm, MPA, Axicorp et importateurs europeens',
      href: '/customers',
      icon: Users,
      gradient: 'from-violet-500 to-purple-600',
    },
  ]

  const catalogProgress = productCount != null ? Math.min((productCount / 1760) * 100, 100) : 0

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Welcome header */}
      <div className="animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Tableau de bord</h2>
            <p className="text-muted-foreground mt-1">
              Vue d'ensemble des donnees de reference RW Pharma
            </p>
          </div>
          <Link to="/products">
            <Button variant="outline" className="hidden sm:flex gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {stats.map((stat, i) => (
          stat.loading ? (
            <StatSkeleton key={stat.name} />
          ) : (
            <Link key={stat.name} to={stat.href}>
              <Card className={`group hover:shadow-lg hover:shadow-black/5 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 animate-fade-in stagger-${i + 1}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                    {stat.name}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bg} transition-transform group-hover:scale-110`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl md:text-3xl font-bold tabular-nums ${stat.danger && stat.value ? 'text-destructive' : ''}`}>
                    {stat.value ?? 0}
                  </p>
                  {stat.target && (
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={stat.value ? (stat.value / stat.target) * 100 : 0} className="h-1.5" />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        / {stat.target}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        ))}
      </div>

      {/* Catalog progress card */}
      <Card className="animate-fade-in border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-sm">Progression du catalogue</h3>
                <span className="text-sm font-bold text-primary">{catalogProgress.toFixed(0)}%</span>
              </div>
              <Progress value={catalogProgress} className="h-2 mb-1.5" />
              <p className="text-xs text-muted-foreground">
                {productCount ?? 0} produits importes sur 1 760 attendus
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-semibold">Acces rapide</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions.map((action) => (
            <Link key={action.href} to={action.href}>
              <Card className="group hover:shadow-lg hover:shadow-black/5 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 overflow-hidden">
                <CardContent className="flex items-center gap-4 p-4 md:p-5">
                  <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110`}>
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{action.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Separator />

      {/* Info footer */}
      <div className="text-center pb-4 animate-fade-in">
        <p className="text-xs text-muted-foreground">
          RW Pharma &middot; Phase 1 : Setup & Donnees de reference &middot; Courtage pharmaceutique Europe
        </p>
      </div>
    </div>
  )
}
