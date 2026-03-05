import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import AnimatedCounter from '@/components/ui/animated-counter'
import ProgressRing from '@/components/ui/progress-ring'
import {
  Pill, Truck, Users, AlertTriangle, ClipboardList,
  ArrowRight, FileSpreadsheet, CalendarRange, Play,
} from 'lucide-react'

function StatSkeleton() {
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-14 mt-1" />
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

  const { data: activeProcess } = useQuery({
    queryKey: ['monthly-processes', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('*')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; month: number; year: number; current_step: number; status: string; orders_count: number; allocations_count: number } | null
    },
  })

  const MONTH_NAMES = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
  const STEP_LABELS = ['Import commandes', 'Revue commandes', 'Allocation', 'Revue allocations', 'Finalisation']

  const stats = [
    { name: 'Produits', value: productCount, loading: loadingProducts, icon: Pill, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/products', target: 1760 },
    { name: 'Grossistes', value: wholesalerCount, loading: loadingWholesalers, icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50', href: '/wholesalers' },
    { name: 'Clients', value: customerCount, loading: loadingCustomers, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', href: '/customers' },
    { name: 'Quotas actifs', value: quotaCount, loading: loadingQuotas, icon: ClipboardList, color: 'text-amber-600', bg: 'bg-amber-50', href: '/quotas' },
    { name: 'Bloques ANSM', value: blockedCount, loading: loadingBlocked, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', href: '/products', danger: true },
  ]

  const quickActions = [
    { name: 'Allocations mensuelles', description: 'Lancer ou continuer un processus d\'allocation', href: '/monthly-processes', icon: CalendarRange, color: 'text-primary', bg: 'bg-primary/8' },
    { name: 'Gerer les produits', description: 'Catalogue de 1 760 references, import Excel, filtres avances', href: '/products', icon: Pill, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { name: 'Gerer les grossistes', description: 'Alliance, CERP, OCP et autres partenaires francais', href: '/wholesalers', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'Gerer les clients', description: 'Orifarm, MPA, Axicorp et importateurs europeens', href: '/customers', icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
  ]

  const catalogProgress = productCount != null ? Math.min((productCount / 1760) * 100, 100) : 0

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-7 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Tableau de bord</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">Vue d'ensemble des donnees de reference</p>
          </div>
          <Link to="/products">
            <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5 text-[13px] h-8">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Import Excel
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Active process banner */}
      {activeProcess && (
        <Link to={`/monthly-processes/${activeProcess.id}`}>
          <motion.div initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <Card className="border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.05] transition-colors cursor-pointer group">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-center gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                    <Play className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-[13px]">Processus en cours</h3>
                      <Badge variant="secondary" className="text-[10px] h-5">Etape {activeProcess.current_step}/5</Badge>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {MONTH_NAMES[activeProcess.month - 1]} {activeProcess.year} — {STEP_LABELS[activeProcess.current_step - 1]}
                    </p>
                    {/* Step dots */}
                    <div className="flex items-center gap-1 mt-2">
                      {STEP_LABELS.map((label, i) => {
                        const stepNum = i + 1
                        const isCompleted = stepNum < activeProcess.current_step
                        const isCurrent = stepNum === activeProcess.current_step
                        return (
                          <div key={i} className="flex items-center gap-1">
                            <div
                              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                                isCompleted ? 'bg-primary' : isCurrent ? 'bg-primary animate-subtle-pulse' : 'bg-border'
                              }`}
                              title={label}
                            />
                            {i < STEP_LABELS.length - 1 && (
                              <div className={`w-3 h-px ${stepNum < activeProcess.current_step ? 'bg-primary/40' : 'bg-border'}`} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 shrink-0" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((stat, i) => (
          stat.loading ? <StatSkeleton key={stat.name} /> : (
            <Link key={stat.name} to={stat.href}>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              >
                <Card className="group hover:shadow-md hover:shadow-black/[0.03] transition-all duration-200 cursor-pointer h-full border-border/60 hover:border-border">
                  <CardHeader className="flex flex-row items-center justify-between pb-1.5 space-y-0">
                    <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{stat.name}</CardTitle>
                    <div className={`p-1.5 rounded-md ${stat.bg}`}>
                      <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <AnimatedCounter
                      value={stat.value ?? 0}
                      valueClassName={`text-2xl font-semibold tabular-nums ${stat.danger && stat.value ? 'text-destructive' : ''}`}
                    />
                    {stat.target && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <ProgressRing value={stat.value ? (stat.value / stat.target) * 100 : 0} size={22} strokeWidth={2.5} showValue={false} />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">/ {stat.target}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          )
        ))}
      </div>

      {/* Catalog progress */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
        <Card className="border-border/60">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-4">
              <ProgressRing value={catalogProgress} size={56} strokeWidth={5} color="hsl(var(--primary))" />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[13px]">Progression du catalogue</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">{productCount ?? 0} produits importes sur 1 760 attendus</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick actions */}
      <div>
        <h3 className="text-[13px] font-medium text-muted-foreground mb-3">Acces rapide</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {quickActions.map((action, i) => (
            <Link key={action.href} to={action.href}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.3 + i * 0.04 }}
              >
                <Card className="group hover:shadow-md hover:shadow-black/[0.03] transition-all duration-200 cursor-pointer overflow-hidden h-full border-border/60 hover:border-border">
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <div className={`h-9 w-9 rounded-lg ${action.bg} flex items-center justify-center shrink-0`}>
                      <action.icon className={`h-4 w-4 ${action.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[13px]">{action.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      <div className="text-center pt-2 pb-4">
        <p className="text-[11px] text-muted-foreground/50">
          RW Pharma &middot; Phase 1 : Setup & Donnees de reference
        </p>
      </div>
    </div>
  )
}
