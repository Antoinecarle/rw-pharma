import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import AnimatedCounter from '@/components/ui/animated-counter'
import GaugeChart from '@/components/ui/gauge-chart'
import HorizontalBarChart from '@/components/ui/horizontal-bar'
import {
  Pill, Truck, Users, AlertTriangle, ClipboardList,
  ArrowRight, CalendarRange, Play, TrendingUp, TrendingDown,
  Package, BarChart3, Boxes,
} from 'lucide-react'

const MONTH_NAMES = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
const STEP_LABELS = ['Import quotas', 'Import commandes', 'Revue commandes', 'Attribution macro', 'Export grossistes', 'Reception stocks', 'Agregation stock', 'Allocation lots', 'Revue allocations', 'Finalisation']

function StatSkeleton() {
  return (
    <div className="ivory-glass p-5">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3.5 w-16 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-16 rounded-md" />
    </div>
  )
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  const isUp = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${isUp ? 'text-green-600' : 'text-red-500'}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? '+' : ''}{pct}%
    </span>
  )
}

export default function DashboardPage() {
  // Base counts
  const { data: productCount, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }); return count ?? 0 },
  })

  const { data: wholesalerCount, isLoading: loadingWholesalers } = useQuery({
    queryKey: ['wholesalers', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { count } = await supabase.from('wholesalers').select('*', { count: 'exact', head: true }); return count ?? 0 },
  })

  const { data: customerCount, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true }); return count ?? 0 },
  })

  const { data: blockedCount, isLoading: loadingBlocked } = useQuery({
    queryKey: ['products', 'blocked', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { data } = await supabase.from('products').select('id').eq('is_ansm_blocked', true); return data?.length ?? 0 },
  })

  // Active process
  const { data: activeProcess } = useQuery({
    queryKey: ['monthly-processes', 'active'],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes').select('*')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      if (error) throw error
      return data as { id: string; month: number; year: number; current_step: number; status: string; orders_count: number; allocations_count: number; quotas_count: number } | null
    },
  })

  // All processes for evolution metrics
  const { data: allProcesses } = useQuery({
    queryKey: ['monthly-processes', 'dashboard-all'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('id, month, year, status, orders_count, allocations_count')
        .order('year', { ascending: true })
        .order('month', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  // Allocation summary for active process
  const { data: activeAllocStats } = useQuery({
    queryKey: ['allocations', activeProcess?.id, 'dashboard'],
    enabled: !!activeProcess && (activeProcess.allocations_count ?? 0) > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('requested_quantity, allocated_quantity, customer:customers(code, name)')
        .eq('monthly_process_id', activeProcess!.id)
      if (error) throw error
      const totalReq = data?.reduce((s, a) => s + (a.requested_quantity ?? 0), 0) ?? 0
      const totalAlloc = data?.reduce((s, a) => s + (a.allocated_quantity ?? 0), 0) ?? 0
      // Group by customer — deduplicate requested per unique order
      const byCustomer = new Map<string, { code: string; name: string; alloc: number; req: number; seenOrders: Set<string> }>()
      for (const a of data ?? []) {
        const c = a.customer as unknown as { code: string; name: string } | undefined
        const key = c?.code ?? '?'
        if (!byCustomer.has(key)) byCustomer.set(key, { code: key, name: c?.name ?? '?', alloc: 0, req: 0, seenOrders: new Set() })
        const entry = byCustomer.get(key)!
        entry.alloc += a.allocated_quantity ?? 0
        entry.req += a.requested_quantity ?? 0
      }
      return { totalReq, totalAlloc, byCustomer: [...byCustomer.values()] }
    },
  })

  // Monthly orders evolution from processes (skip ones with 0 orders for trend calc)
  const completedProcesses = (allProcesses ?? []).filter(p => p.status === 'completed')
  const completedWithOrders = completedProcesses.filter(p => (p.orders_count ?? 0) > 0)
  const lastCompleted = completedWithOrders[completedWithOrders.length - 1]
  const prevCompleted = completedWithOrders[completedWithOrders.length - 2]

  const totalOrdersAllTime = (allProcesses ?? []).reduce((s, p) => s + (p.orders_count ?? 0), 0)
  const totalAllocsAllTime = (allProcesses ?? []).reduce((s, p) => s + (p.allocations_count ?? 0), 0)

  const fulfillmentRate = activeAllocStats
    ? (activeAllocStats.totalReq > 0 ? (activeAllocStats.totalAlloc / activeAllocStats.totalReq) * 100 : 0)
    : 0

  const stats = [
    { name: 'Produits', value: productCount, loading: loadingProducts, icon: Pill, gradient: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.04))', iconColor: '#0D9488', href: '/products' },
    { name: 'Grossistes', value: wholesalerCount, loading: loadingWholesalers, icon: Truck, gradient: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))', iconColor: '#3B82F6', href: '/wholesalers' },
    { name: 'Clients', value: customerCount, loading: loadingCustomers, icon: Users, gradient: 'linear-gradient(135deg, rgba(5,150,105,0.12), rgba(5,150,105,0.04))', iconColor: '#059669', href: '/customers' },
    { name: 'ANSM bloques', value: blockedCount, loading: loadingBlocked, icon: AlertTriangle, gradient: 'linear-gradient(135deg, rgba(220,74,74,0.10), rgba(220,74,74,0.03))', iconColor: '#DC4A4A', href: '/ansm', danger: true },
  ]

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative z-10">
        <h2 className="ivory-display text-2xl md:text-3xl">Tableau de bord</h2>
        <p className="text-[13px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>Vue operationnelle RW Pharma</p>
      </motion.div>

      {/* Active process banner — PROMINENT */}
      {activeProcess && (
        <Link to={`/monthly-processes/${activeProcess.id}`}>
          <motion.div initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.05 }} className="relative z-10">
            <div className="ivory-glass group cursor-pointer overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.06), rgba(13,148,136,0.02))', borderColor: 'rgba(13,148,136,0.2)' }}>
              <div className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105"
                      style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))' }}>
                      <Play className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="ivory-heading text-[15px]">{MONTH_NAMES[activeProcess.month - 1]} {activeProcess.year}</h3>
                        <span className="ivory-badge" style={{ background: 'rgba(13,148,136,0.08)', color: 'var(--ivory-accent)' }}>
                          Etape {activeProcess.current_step}/10
                        </span>
                      </div>
                      <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                        {STEP_LABELS[activeProcess.current_step - 1]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums">{activeProcess.orders_count ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Commandes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums">{activeProcess.allocations_count ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Allocations</p>
                    </div>
                    {activeAllocStats && activeAllocStats.totalReq > 0 && (
                      <GaugeChart value={fulfillmentRate} size={56} strokeWidth={5} label="" />
                    )}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 hidden sm:block" style={{ color: 'var(--ivory-text-muted)' }} />
                  </div>
                </div>
                {/* Step progress dots */}
                <div className="mt-3.5 flex items-center gap-1.5">
                  {STEP_LABELS.map((label, idx) => {
                    const stepNum = idx + 1
                    const isCompleted = stepNum < activeProcess.current_step
                    const isCurrent = stepNum === activeProcess.current_step
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <div
                          className={`h-2 w-2 rounded-full transition-colors ${isCurrent ? 'animate-subtle-pulse' : ''}`}
                          style={{ background: isCompleted || isCurrent ? 'var(--ivory-accent)' : 'rgba(0,0,0,0.08)' }}
                          title={label}
                        />
                        {idx < STEP_LABELS.length - 1 && (
                          <div className="w-3 h-0.5 rounded-full" style={{ background: isCompleted ? 'rgba(13,148,136,0.3)' : 'rgba(0,0,0,0.04)' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </Link>
      )}

      {/* KPI row: operational metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Commandes totales</span>
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{totalOrdersAllTime.toLocaleString('fr-FR')}</p>
              {lastCompleted && prevCompleted && (
                <TrendBadge current={lastCompleted.orders_count} previous={prevCompleted.orders_count} />
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Sur {(allProcesses ?? []).length} processus</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allocations totales</span>
                <Boxes className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{totalAllocsAllTime.toLocaleString('fr-FR')}</p>
              {lastCompleted && prevCompleted && (
                <TrendBadge current={lastCompleted.allocations_count} previous={prevCompleted.allocations_count} />
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Processus termines : {completedProcesses.length}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Couverture mois</span>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
              {activeAllocStats && activeAllocStats.totalReq > 0 ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">{fulfillmentRate.toFixed(1)}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {activeAllocStats.totalAlloc.toLocaleString('fr-FR')} / {activeAllocStats.totalReq.toLocaleString('fr-FR')} u.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-muted-foreground/40">—</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Aucune allocation en cours</p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Volume demande</span>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              {activeAllocStats && activeAllocStats.totalReq > 0 ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">{activeAllocStats.totalReq.toLocaleString('fr-FR')}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Unites demandees ce mois</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-muted-foreground/40">—</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Pas de donnees</p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Client coverage chart for active process */}
      {activeAllocStats && activeAllocStats.byCustomer.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Couverture par client — {MONTH_NAMES[activeProcess!.month - 1]} {activeProcess!.year}
              </h4>
              <HorizontalBarChart
                completionMode
                items={activeAllocStats.byCustomer
                  .sort((a, b) => {
                    const pctA = a.req > 0 ? (a.alloc / a.req) * 100 : 0
                    const pctB = b.req > 0 ? (b.alloc / b.req) * 100 : 0
                    return pctB - pctA
                  })
                  .map(c => ({
                    label: c.name,
                    code: c.code,
                    value: c.req > 0 ? Math.round((c.alloc / c.req) * 100) : 0,
                  }))}
                formatValue={(v) => `${v}%`}
              />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Monthly evolution chart */}
      {completedProcesses.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4" /> Evolution mensuelle des commandes
              </h4>
              <HorizontalBarChart
                items={completedProcesses.slice(-6).map(p => ({
                  label: `${MONTH_NAMES[p.month - 1]} ${p.year}`,
                  code: `${MONTH_NAMES[p.month - 1]?.slice(0, 3)}`,
                  value: p.orders_count ?? 0,
                }))}
                formatValue={(v) => `${v.toLocaleString('fr-FR')} cmd`}
              />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Reference data stats */}
      <div>
        <div className="flex items-center gap-2 mb-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
            Donnees de reference
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat, i) => (
            stat.loading ? <StatSkeleton key={stat.name} /> : (
              <Link key={stat.name} to={stat.href}>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.05 }}>
                  <div className="ivory-glass group cursor-pointer overflow-hidden p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ivory-text-muted)' }}>
                        {stat.name}
                      </span>
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{ background: stat.gradient }}>
                        <stat.icon className="h-3.5 w-3.5" style={{ color: stat.iconColor }} />
                      </div>
                    </div>
                    <AnimatedCounter
                      value={stat.value ?? 0}
                      valueClassName={`text-xl ivory-heading tabular-nums ${stat.danger && stat.value ? 'text-red-500' : ''}`}
                    />
                  </div>
                </motion.div>
              </Link>
            )
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <div className="flex items-center gap-2 mb-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
            Acces rapide
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { name: 'Allocations', desc: 'Processus mensuel', href: '/monthly-processes', icon: CalendarRange, color: 'var(--ivory-accent)' },
            { name: 'Produits', desc: `${productCount ?? 0} references`, href: '/products', icon: Pill, color: '#0D9488' },
            { name: 'Grossistes', desc: `${wholesalerCount ?? 0} partenaires`, href: '/wholesalers', icon: Truck, color: '#3B82F6' },
            { name: 'Quotas', desc: 'Gestion mensuelle', href: '/quotas', icon: ClipboardList, color: '#F59E0B' },
          ].map((action, i) => (
            <Link key={action.href} to={action.href}>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.05 }}>
                <div className="ivory-glass group cursor-pointer p-3.5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                    style={{ background: `linear-gradient(135deg, ${action.color}20, ${action.color}08)` }}>
                    <action.icon className="h-4 w-4" style={{ color: action.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[12px]" style={{ color: 'var(--ivory-text-heading)' }}>{action.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--ivory-text-muted)' }}>{action.desc}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 shrink-0" style={{ color: 'rgba(0,0,0,0.12)' }} />
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
