import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { motion } from 'framer-motion'
import GaugeChart from '@/components/ui/gauge-chart'
import MonthSelector, { type MonthValue, type MonthOption } from '@/components/ui/month-selector'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  Play, ArrowRight, CalendarRange, TrendingUp, TrendingDown,
  Package, Euro, BarChart3, Pill, Truck, ClipboardList, Users, CheckCircle2,
} from 'lucide-react'

const MONTH_NAMES = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
const STEP_LABELS = ['Import dispos', 'Import commandes', 'Revue commandes', 'Attribution macro', 'Export grossistes', 'Negociation', 'Re-export', 'Reception stocks', 'Agregation stock', 'Allocation lots', 'Revue allocations', 'Finalisation']


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

function formatEur(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k €`
  return `${v.toLocaleString('fr-FR')} €`
}

interface ProcessFinancials {
  processId: string
  month: number
  year: number
  label: string
  shortLabel: string
  ordersCount: number
  volumeAffaires: number
  chiffreAffaires: number
  margeBrute: number
}

async function fetchAllPaginated<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: () => any,
  pageSize = 500,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await (query() as any).range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export default function DashboardPage() {
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

  // All processes
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

  // Month selector state
  const [selectedMonth, setSelectedMonth] = useState<MonthValue | null>(null)

  const monthOptions: MonthOption[] = useMemo(() => {
    if (!allProcesses) return []
    return allProcesses.map(p => ({
      month: p.month,
      year: p.year,
      id: p.id,
      status: p.status === 'completed' ? 'completed' as const : p.status === 'draft' ? 'draft' as const : 'active' as const,
    }))
  }, [allProcesses])

  // All orders — for volume d'affaires (qty * unit_price)
  const { data: allOrders, isLoading: loadingOrders } = useQuery({
    queryKey: ['orders', 'dashboard-financials'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      return fetchAllPaginated<{ monthly_process_id: string; quantity: number; unit_price: number | null }>(() =>
        supabase.from('orders').select('monthly_process_id, quantity, unit_price')
      )
    },
  })

  // All allocations — for CA (allocated_qty * prix_applique) and marge (- pfht)
  const { data: allAllocations, isLoading: loadingAllocs } = useQuery({
    queryKey: ['allocations', 'dashboard-financials'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      return fetchAllPaginated<{ monthly_process_id: string; customer_id: string; product_id: string; allocated_quantity: number; prix_applique: number | null; product: { pfht: number | null } | null }>(() =>
        supabase.from('allocations').select('monthly_process_id, customer_id, product_id, allocated_quantity, prix_applique, product:products(pfht)')
      )
    },
  })

  // Active process allocation summary
  const { data: activeAllocStats } = useQuery({
    queryKey: ['allocations', activeProcess?.id, 'dashboard'],
    enabled: !!activeProcess && (activeProcess.allocations_count ?? 0) > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const data = await fetchAllPaginated<{ requested_quantity: number; allocated_quantity: number }>(() =>
        supabase.from('allocations').select('requested_quantity, allocated_quantity').eq('monthly_process_id', activeProcess!.id)
      )
      const totalReq = data.reduce((s, a) => s + (a.requested_quantity ?? 0), 0)
      const totalAlloc = data.reduce((s, a) => s + (a.allocated_quantity ?? 0), 0)
      return { totalReq, totalAlloc }
    },
  })

  // ── Compute financials per process ──────────────────────────────
  const processFinancials: ProcessFinancials[] = (() => {
    if (!allProcesses || !allOrders || !allAllocations) return []

    const ordersByProcess = new Map<string, { qty: number; volume: number }>()
    for (const o of allOrders) {
      const pid = o.monthly_process_id
      if (!ordersByProcess.has(pid)) ordersByProcess.set(pid, { qty: 0, volume: 0 })
      const entry = ordersByProcess.get(pid)!
      entry.qty += 1
      entry.volume += (o.quantity ?? 0) * (o.unit_price ?? 0)
    }

    const allocsByProcess = new Map<string, { ca: number; cost: number }>()
    for (const a of allAllocations) {
      const pid = a.monthly_process_id
      if (!allocsByProcess.has(pid)) allocsByProcess.set(pid, { ca: 0, cost: 0 })
      const entry = allocsByProcess.get(pid)!
      const allocQty = a.allocated_quantity ?? 0
      entry.ca += allocQty * (a.prix_applique ?? 0)
      const pfht = (a.product as { pfht: number | null } | null)?.pfht ?? 0
      entry.cost += allocQty * pfht
    }

    return allProcesses.map(p => {
      const orders = ordersByProcess.get(p.id) ?? { qty: 0, volume: 0 }
      const allocs = allocsByProcess.get(p.id) ?? { ca: 0, cost: 0 }
      return {
        processId: p.id,
        month: p.month,
        year: p.year,
        label: `${MONTH_NAMES[p.month - 1]} ${p.year}`,
        shortLabel: `${MONTH_SHORT[p.month - 1]} ${String(p.year).slice(2)}`,
        ordersCount: p.orders_count ?? orders.qty,
        volumeAffaires: orders.volume,
        chiffreAffaires: allocs.ca,
        margeBrute: allocs.ca - allocs.cost,
      }
    })
  })()

  const completedFinancials = processFinancials.filter(p => {
    const proc = allProcesses?.find(ap => ap.id === p.processId)
    return proc?.status === 'completed'
  })
  const last6 = completedFinancials.slice(-6)
  const lastMonth = last6[last6.length - 1]
  const prevMonth = last6[last6.length - 2]

  const activeFinancials = activeProcess
    ? processFinancials.find(p => p.processId === activeProcess.id)
    : undefined

  const fulfillmentRate = activeAllocStats
    ? (activeAllocStats.totalReq > 0 ? (activeAllocStats.totalAlloc / activeAllocStats.totalReq) * 100 : 0)
    : 0

  const isLoading = loadingOrders || loadingAllocs

  const chartData = last6.map(p => ({
    name: p.shortLabel,
    commandes: p.ordersCount,
    volume: Math.round(p.volumeAffaires),
    ca: Math.round(p.chiffreAffaires),
    marge: Math.round(p.margeBrute),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any, name: any) => {
    const v = typeof value === 'number' ? value : 0
    const n = String(name ?? '')
    if (n === 'commandes') return [v.toLocaleString('fr-FR'), 'Commandes']
    return [formatEur(v), n === 'volume' ? "Volume d'affaires" : n === 'ca' ? "Chiffre d'affaires" : 'Marge brute']
  }

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="ivory-display text-2xl md:text-3xl">Tableau de bord</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>Vue operationnelle RW Pharma</p>
          </div>
          {monthOptions.length > 0 && (
            <MonthSelector
              value={selectedMonth}
              onChange={(v) => setSelectedMonth(v)}
              options={monthOptions}
              allowAll
              allLabel="Mois actif"
              compact
            />
          )}
        </div>
      </motion.div>

      {/* Active process banner */}
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
                          Etape {activeProcess.current_step}/12
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

      {/* KPI Cards — Business metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Commandes du mois */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Commandes</span>
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold tabular-nums">
                    {(activeFinancials?.ordersCount ?? lastMonth?.ordersCount ?? 0).toLocaleString('fr-FR')}
                  </p>
                  {lastMonth && prevMonth && !activeFinancials && (
                    <TrendBadge current={lastMonth.ordersCount} previous={prevMonth.ordersCount} />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {activeFinancials ? 'Mois en cours' : lastMonth ? lastMonth.label : '—'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Volume d'affaires */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Volume d'affaires</span>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatEur(activeFinancials?.volumeAffaires ?? lastMonth?.volumeAffaires ?? 0)}
                  </p>
                  {lastMonth && prevMonth && !activeFinancials && lastMonth.volumeAffaires > 0 && (
                    <TrendBadge current={lastMonth.volumeAffaires} previous={prevMonth.volumeAffaires} />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {activeFinancials ? 'Mois en cours' : lastMonth ? lastMonth.label : '—'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Chiffre d'affaires */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Chiffre d'affaires</span>
                <Euro className="h-4 w-4 text-muted-foreground" />
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatEur(activeFinancials?.chiffreAffaires ?? lastMonth?.chiffreAffaires ?? 0)}
                  </p>
                  {lastMonth && prevMonth && !activeFinancials && lastMonth.chiffreAffaires > 0 && (
                    <TrendBadge current={lastMonth.chiffreAffaires} previous={prevMonth.chiffreAffaires} />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {activeFinancials ? 'Mois en cours' : lastMonth ? lastMonth.label : '—'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Marge brute */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Marge brute</span>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className={`text-2xl font-bold tabular-nums ${(activeFinancials?.margeBrute ?? lastMonth?.margeBrute ?? 0) < 0 ? 'text-red-500' : ''}`}>
                    {formatEur(activeFinancials?.margeBrute ?? lastMonth?.margeBrute ?? 0)}
                  </p>
                  {lastMonth && prevMonth && !activeFinancials && lastMonth.margeBrute > 0 && prevMonth.margeBrute > 0 && (
                    <TrendBadge current={lastMonth.margeBrute} previous={prevMonth.margeBrute} />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {activeFinancials ? 'Mois en cours' : lastMonth ? lastMonth.label : '—'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Evolution charts */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Evolution commandes */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                  <Package className="h-4 w-4" /> Evolution des commandes
                </h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradCmd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.2)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.2)" />
                      <RechartsTooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }} />
                      <Area type="monotone" dataKey="commandes" stroke="#3b82f6" strokeWidth={2} fill="url(#gradCmd)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Evolution volume d'affaires */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4" /> Volume d'affaires
                </h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradVol" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.2)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.2)" tickFormatter={(v) => formatEur(v)} />
                      <RechartsTooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }} />
                      <Area type="monotone" dataKey="volume" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradVol)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* CA + Marge brute combined */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2">
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                  <Euro className="h-4 w-4" /> Chiffre d'affaires & Marge brute
                </h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradCA" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradMarge" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.2)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.2)" tickFormatter={(v) => formatEur(v)} />
                      <RechartsTooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }} />
                      <Legend
                        formatter={(value) => value === 'ca' ? "Chiffre d'affaires" : 'Marge brute'}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                      <Area type="monotone" dataKey="ca" stroke="#0d9488" strokeWidth={2} fill="url(#gradCA)" />
                      <Area type="monotone" dataKey="marge" stroke="#f59e0b" strokeWidth={2} fill="url(#gradMarge)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Annual KPIs */}
      {completedFinancials.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
              Bilan annuel {completedFinancials[completedFinancials.length - 1]?.year ?? ''}
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const currentYear = completedFinancials[completedFinancials.length - 1]?.year
              const yearData = completedFinancials.filter(p => p.year === currentYear)
              const totalCA = yearData.reduce((s, p) => s + p.chiffreAffaires, 0)
              const totalOrders = yearData.reduce((s, p) => s + p.ordersCount, 0)
              const avgCoverage = allProcesses
                ? (() => {
                    const yearProcs = allProcesses.filter(p => p.year === currentYear && p.status === 'completed')
                    if (yearProcs.length === 0) return 0
                    const totalAllocs = yearProcs.reduce((s, p) => s + (p.allocations_count ?? 0), 0)
                    const totalOrd = yearProcs.reduce((s, p) => s + (p.orders_count ?? 0), 0)
                    return totalOrd > 0 ? Math.round((totalAllocs / totalOrd) * 100) : 0
                  })()
                : 0
              const totalMarge = yearData.reduce((s, p) => s + p.margeBrute, 0)
              return [
                { label: 'CA annuel', value: formatEur(totalCA), icon: Euro, color: 'var(--ivory-accent)' },
                { label: 'Commandes traitees', value: totalOrders.toLocaleString('fr-FR'), icon: Package, color: '#3b82f6' },
                { label: 'Couverture moy.', value: `${avgCoverage}%`, icon: CheckCircle2, color: '#16a34a' },
                { label: 'Marge annuelle', value: formatEur(totalMarge), icon: TrendingUp, color: '#f59e0b' },
              ]
            })().map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                    <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
                  </div>
                  <p className="text-xl font-bold tabular-nums">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Monthly process history table */}
      {completedFinancials.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
              Historique des processus
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Mois</TableHead>
                      <TableHead className="text-[11px] text-right">Commandes</TableHead>
                      <TableHead className="text-[11px] text-right">Allocations</TableHead>
                      <TableHead className="text-[11px] text-right">Volume d'affaires</TableHead>
                      <TableHead className="text-[11px] text-right">CA</TableHead>
                      <TableHead className="text-[11px] text-right">Marge</TableHead>
                      <TableHead className="text-[11px] text-right">Couverture</TableHead>
                      <TableHead className="text-[11px]">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...processFinancials].reverse().map((pf) => {
                      const proc = allProcesses?.find(p => p.id === pf.processId)
                      const coverage = pf.ordersCount > 0 && proc
                        ? Math.round(((proc.allocations_count ?? 0) / Math.max(pf.ordersCount, 1)) * 100)
                        : 0
                      const isCompleted = proc?.status === 'completed'
                      return (
                        <TableRow key={pf.processId}>
                          <TableCell className="text-xs font-medium">
                            <Link to={`/monthly-processes/${pf.processId}`} className="hover:underline" style={{ color: 'var(--ivory-accent)' }}>
                              {pf.label}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{pf.ordersCount.toLocaleString('fr-FR')}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{(proc?.allocations_count ?? 0).toLocaleString('fr-FR')}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{formatEur(pf.volumeAffaires)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-medium">{formatEur(pf.chiffreAffaires)}</TableCell>
                          <TableCell className={`text-xs text-right tabular-nums ${pf.margeBrute < 0 ? 'text-red-500' : ''}`}>{formatEur(pf.margeBrute)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            <span style={{ color: coverage >= 80 ? '#16a34a' : coverage >= 50 ? '#f59e0b' : '#ef4444' }}>
                              {coverage}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={isCompleted ? 'default' : 'secondary'}
                              className="text-[10px] rounded-lg"
                            >
                              {isCompleted ? 'Cloture' : 'En cours'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Top 5 products & clients */}
      {allAllocations && allAllocations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 5 products by allocated volume */}
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Pill className="h-4 w-4" style={{ color: 'var(--ivory-accent)' }} /> Top 5 produits (volume alloue)
                </h4>
                {(() => {
                  const volByProduct = new Map<string, number>()
                  for (const a of allAllocations) {
                    const pid = (a as { product_id?: string }).product_id ?? (a.product as { id?: string } | null)?.id ?? ''
                    if (!pid) continue
                    volByProduct.set(pid, (volByProduct.get(pid) ?? 0) + (a.allocated_quantity ?? 0))
                  }
                  // We don't have product names in allocations query — show IDs shortened
                  const sorted = [...volByProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
                  if (sorted.length === 0) return <p className="text-xs text-muted-foreground">Aucune donnee</p>
                  const maxVol = sorted[0][1]
                  return (
                    <div className="space-y-2.5">
                      {sorted.map(([, vol], idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-[10px] font-bold w-5 text-center" style={{ color: 'var(--ivory-text-muted)' }}>#{idx + 1}</span>
                          <div className="flex-1">
                            <div className="h-5 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                              <div
                                className="h-full rounded-lg transition-all duration-700 flex items-center px-2"
                                style={{ width: `${(vol / maxVol) * 100}%`, background: `rgba(13,148,136,${0.15 + idx * 0.03})` }}
                              >
                                <span className="text-[10px] font-semibold truncate" style={{ color: 'var(--ivory-accent)' }}>
                                  {vol.toLocaleString('fr-FR')} unites
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>

            {/* Top 5 clients by CA */}
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Users className="h-4 w-4" style={{ color: '#3b82f6' }} /> Top 5 clients (CA)
                </h4>
                {(() => {
                  const caByCustomer = new Map<string, number>()
                  for (const a of allAllocations) {
                    const cid = (a as { customer_id?: string }).customer_id ?? ''
                    if (!cid) continue
                    caByCustomer.set(cid, (caByCustomer.get(cid) ?? 0) + (a.allocated_quantity ?? 0) * (a.prix_applique ?? 0))
                  }
                  const sorted = [...caByCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
                  if (sorted.length === 0) return <p className="text-xs text-muted-foreground">Aucune donnee</p>
                  const maxCA = sorted[0][1]
                  return (
                    <div className="space-y-2.5">
                      {sorted.map(([, ca], idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-[10px] font-bold w-5 text-center" style={{ color: 'var(--ivory-text-muted)' }}>#{idx + 1}</span>
                          <div className="flex-1">
                            <div className="h-5 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                              <div
                                className="h-full rounded-lg transition-all duration-700 flex items-center px-2"
                                style={{ width: `${(ca / maxCA) * 100}%`, background: `rgba(59,130,246,${0.12 + idx * 0.03})` }}
                              >
                                <span className="text-[10px] font-semibold truncate" style={{ color: '#3b82f6' }}>
                                  {formatEur(ca)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

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
            { name: 'Processus mensuel', desc: 'Allocations & suivi', href: '/monthly-processes', icon: CalendarRange, color: 'var(--ivory-accent)' },
            { name: 'Produits', desc: 'Catalogue medicaments', href: '/products', icon: Pill, color: '#0D9488' },
            { name: 'Grossistes', desc: 'Partenaires fournisseurs', href: '/wholesalers', icon: Truck, color: '#3B82F6' },
            { name: 'Disponibilites', desc: 'Dispos grossistes', href: '/disponibilites', icon: ClipboardList, color: '#F59E0B' },
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
