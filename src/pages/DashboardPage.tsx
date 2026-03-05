import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { motion } from 'framer-motion'
import AnimatedCounter from '@/components/ui/animated-counter'
import ProgressRing from '@/components/ui/progress-ring'
import {
  Pill, Truck, Users, AlertTriangle, ClipboardList,
  ArrowRight, Sparkles, FileSpreadsheet, CalendarRange, Play,
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
    { name: 'Bloques ANSM', value: blockedCount, loading: loadingBlocked, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', href: '/products', danger: true },
  ]

  const quickActions = [
    { name: 'Allocations mensuelles', description: 'Lancer ou continuer un processus d\'allocation', href: '/monthly-processes', icon: CalendarRange, gradient: 'from-primary to-amber-600' },
    { name: 'Gerer les produits', description: 'Catalogue de 1 760 references, import Excel, filtres avances', href: '/products', icon: Pill, gradient: 'from-emerald-500 to-teal-600' },
    { name: 'Gerer les grossistes', description: 'Alliance, CERP, OCP et autres partenaires francais', href: '/wholesalers', icon: Truck, gradient: 'from-blue-500 to-indigo-600' },
    { name: 'Gerer les clients', description: 'Orifarm, MPA, Axicorp et importateurs europeens', href: '/customers', icon: Users, gradient: 'from-violet-500 to-purple-600' },
  ]

  const catalogProgress = productCount != null ? Math.min((productCount / 1760) * 100, 100) : 0

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Tableau de bord</h2>
            <p className="text-muted-foreground mt-1">Vue d'ensemble des donnees de reference RW Pharma</p>
          </div>
          <Link to="/products">
            <Button variant="outline" className="hidden sm:flex gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Active process hero card */}
      {activeProcess && (
        <Link to={`/monthly-processes/${activeProcess.id}`}>
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-primary/10 to-transparent hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 cursor-pointer group">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                    <Play className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-base">Processus en cours</h3>
                      <Badge variant="secondary" className="text-xs">Etape {activeProcess.current_step}/5</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {MONTH_NAMES[activeProcess.month - 1]} {activeProcess.year} — {STEP_LABELS[activeProcess.current_step - 1]}
                    </p>
                    {/* Stepper dots */}
                    <div className="flex items-center gap-1.5">
                      {STEP_LABELS.map((label, i) => {
                        const stepNum = i + 1
                        const isCompleted = stepNum < activeProcess.current_step
                        const isCurrent = stepNum === activeProcess.current_step
                        return (
                          <div key={i} className="flex items-center gap-1.5">
                            <motion.div
                              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                                isCompleted ? 'bg-primary' : isCurrent ? 'bg-primary' : 'bg-muted'
                              }`}
                              animate={isCurrent ? { scale: [1, 1.3, 1] } : {}}
                              transition={{ repeat: Infinity, duration: 2 }}
                              title={label}
                            />
                            {i < STEP_LABELS.length - 1 && (
                              <div className={`w-4 h-0.5 ${stepNum < activeProcess.current_step ? 'bg-primary' : 'bg-muted'}`} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 shrink-0" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
      )}

      {/* Stats grid with animated counters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {stats.map((stat, i) => (
          stat.loading ? <StatSkeleton key={stat.name} /> : (
            <Link key={stat.name} to={stat.href}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
              >
                <Card className="group hover:shadow-lg hover:shadow-black/5 transition-shadow duration-300 cursor-pointer h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">{stat.name}</CardTitle>
                    <motion.div className={`p-2 rounded-lg ${stat.bg}`} whileHover={{ scale: 1.15, rotate: 5 }}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </motion.div>
                  </CardHeader>
                  <CardContent>
                    <AnimatedCounter
                      value={stat.value ?? 0}
                      valueClassName={`text-2xl md:text-3xl font-bold tabular-nums ${stat.danger && stat.value ? 'text-destructive' : ''}`}
                    />
                    {stat.target && (
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressRing value={stat.value ? (stat.value / stat.target) * 100 : 0} size={28} strokeWidth={3} showValue={false} />
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

      {/* Catalog progress with ring */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center gap-5">
              <ProgressRing value={catalogProgress} size={72} strokeWidth={7} color="hsl(var(--primary))" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Progression du catalogue</h3>
                <p className="text-xs text-muted-foreground mt-1">{productCount ?? 0} produits importes sur 1 760 attendus</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick actions with hover animations */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-semibold">Acces rapide</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions.map((action, i) => (
            <Link key={action.href} to={action.href}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.06 }}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
              >
                <Card className="group hover:shadow-lg hover:shadow-black/5 transition-shadow duration-300 cursor-pointer overflow-hidden h-full">
                  <CardContent className="flex items-center gap-4 p-4 md:p-5">
                    <motion.div
                      className={`h-11 w-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shrink-0 shadow-sm`}
                      whileHover={{ scale: 1.1, rotate: 3 }}
                      transition={{ type: 'spring', stiffness: 400 }}
                    >
                      <action.icon className="h-5 w-5 text-white" />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{action.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      <Separator />

      <div className="text-center pb-4">
        <p className="text-xs text-muted-foreground">
          RW Pharma &middot; Phase 1 : Setup & Donnees de reference &middot; Courtage pharmaceutique Europe
        </p>
      </div>
    </div>
  )
}
