import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import AnimatedCounter from '@/components/ui/animated-counter'
import GaugeChart from '@/components/ui/gauge-chart'
import HorizontalBarChart from '@/components/ui/horizontal-bar'
import StockLotView from '@/components/stock/StockLotView'
import MonthSelector, { type MonthValue, type MonthOption } from '@/components/ui/month-selector'
import { BarChart3, Users, Truck, Package, Boxes, ArrowRight, AlertTriangle, ShieldCheck, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'

const MONTH_NAMES = [
  'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec',
]

const cardVariants: import('framer-motion').Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.08, type: 'spring' as const, stiffness: 300, damping: 25 },
  }),
}

interface ProcessRow {
  id: string
  month: number
  year: number
  status: string
  orders_count: number
  allocations_count: number
}

interface AllocationRow {
  id: string
  monthly_process_id: string
  order_id: string
  customer_id: string
  product_id: string
  wholesaler_id: string
  requested_quantity: number
  allocated_quantity: number
  status: string
  metadata: Record<string, unknown> | null
  customer: { code: string; name: string } | null
  product: { cip13: string; name: string } | null
  wholesaler: { code: string; name: string } | null
}

export default function AllocationDashboardPage() {
  // Fetch all processes
  const { data: processes } = useQuery({
    queryKey: ['monthly-processes', 'all-dashboard'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('id, month, year, status, orders_count, allocations_count')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return data as ProcessRow[]
    },
  })

  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    searchParams.get('process')
  )

  const handleSelectProcess = (processId: string) => {
    setSelectedProcessId(processId)
    setSearchParams({ process: processId }, { replace: true })
  }

  // Selected process, or most recent non-draft
  const activeProcess = selectedProcessId
    ? processes?.find(p => p.id === selectedProcessId)
    : (processes?.find(p => p.status !== 'draft') ?? processes?.[0])

  // Month selector options built from processes
  const monthOptions: MonthOption[] = useMemo(() => {
    if (!processes) return []
    return processes.map(p => ({
      month: p.month,
      year: p.year,
      id: p.id,
      status: p.status === 'completed' ? 'completed' as const : p.status === 'draft' ? 'draft' as const : 'active' as const,
    }))
  }, [processes])

  // Current MonthValue derived from activeProcess
  const currentMonthValue: MonthValue | null = activeProcess
    ? { month: activeProcess.month, year: activeProcess.year }
    : null

  function handleMonthChange(v: MonthValue | null) {
    if (!v) return // no "all" option on this page
    const proc = processes?.find(p => p.month === v.month && p.year === v.year)
    if (proc) handleSelectProcess(proc.id)
  }

  const { data: allocations } = useQuery({
    queryKey: ['allocations', 'dashboard', activeProcess?.id],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      if (!activeProcess) return []
      const all: AllocationRow[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('allocations')
          .select('id, monthly_process_id, order_id, customer_id, product_id, wholesaler_id, requested_quantity, allocated_quantity, status, metadata, customer:customers(code, name), product:products(cip13, name), wholesaler:wholesalers(code, name)')
          .eq('monthly_process_id', activeProcess.id)
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...(data as unknown as AllocationRow[]))
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
    enabled: !!activeProcess,
  })

  // Fetch quota data (paginated)
  const { data: quotas } = useQuery({
    queryKey: ['quotas', 'dashboard'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const all: any[] = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data, error } = await supabase
          .from('wholesaler_quotas')
          .select('wholesaler_id, product_id, quota_quantity, extra_available, wholesaler:wholesalers(code, name)')
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
  })

  // Fetch stock (paginated)
  const { data: stock } = useQuery({
    queryKey: ['collected_stock', 'dashboard'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const all: any[] = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data, error } = await supabase
          .from('collected_stock')
          .select('id, wholesaler_id, product_id, lot_number, expiry_date, quantity, status')
          .in('status', ['received', 'partially_allocated'])
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
  })

  // ── Computed metrics ──────────────────────────────────────────────

  const globalStats = useMemo(() => {
    if (!allocations || allocations.length === 0) {
      return { total: 0, requested: 0, allocated: 0, rate: 0, lotCount: 0, uniqueProducts: 0, uniqueCustomers: 0, uniqueWholesalers: 0 }
    }

    const requested = new Map<string, number>()
    let allocated = 0
    let lotCount = 0
    const products = new Set<string>()
    const customers = new Set<string>()
    const wholesalersSet = new Set<string>()

    for (const a of allocations) {
      if (!requested.has(a.product_id + a.customer_id)) {
        requested.set(a.product_id + a.customer_id, a.requested_quantity)
      }
      allocated += a.allocated_quantity
      products.add(a.product_id)
      customers.add(a.customer_id)
      wholesalersSet.add(a.wholesaler_id)
      if ((a.metadata as Record<string, unknown>)?.lot_number) lotCount++
    }

    const sumRequested = [...requested.values()].reduce((s, v) => s + v, 0)

    return {
      total: allocations.length,
      requested: sumRequested,
      allocated,
      rate: sumRequested > 0 ? (allocated / sumRequested) * 100 : 0,
      lotCount,
      uniqueProducts: products.size,
      uniqueCustomers: customers.size,
      uniqueWholesalers: wholesalersSet.size,
    }
  }, [allocations])

  // Customer breakdown — deduplicate requested_quantity by order_id to avoid inflating demand
  const customerBreakdown = useMemo(() => {
    if (!allocations) return []
    const map = new Map<string, { code: string; name: string; req: number; alloc: number; count: number; seenOrders: Set<string> }>()
    for (const a of allocations) {
      const code = a.customer?.code ?? '?'
      const existing = map.get(code)
      if (existing) {
        if (!existing.seenOrders.has(a.order_id)) {
          existing.req += a.requested_quantity
          existing.seenOrders.add(a.order_id)
        }
        existing.alloc += a.allocated_quantity
        existing.count++
      } else {
        map.set(code, { code, name: a.customer?.name ?? code, req: a.requested_quantity, alloc: a.allocated_quantity, count: 1, seenOrders: new Set([a.order_id]) })
      }
    }
    return [...map.values()].sort((a, b) => b.alloc - a.alloc)
  }, [allocations])

  // Wholesaler breakdown
  const wholesalerBreakdown = useMemo(() => {
    if (!allocations) return []
    const map = new Map<string, { code: string; name: string; qty: number; count: number }>()
    for (const a of allocations) {
      const code = a.wholesaler?.code ?? '?'
      const existing = map.get(code)
      if (existing) {
        existing.qty += a.allocated_quantity
        existing.count++
      } else {
        map.set(code, { code, name: a.wholesaler?.name ?? code, qty: a.allocated_quantity, count: 1 })
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty)
  }, [allocations])

  // Under-allocated products (< 50% coverage)
  const underAllocated = useMemo(() => {
    if (!allocations) return []
    const map = new Map<string, { cip13: string; name: string; req: number; alloc: number }>()
    for (const a of allocations) {
      const key = a.product_id
      const existing = map.get(key)
      if (existing) {
        existing.alloc += a.allocated_quantity
      } else {
        map.set(key, {
          cip13: a.product?.cip13 ?? '?',
          name: a.product?.name ?? '?',
          req: a.requested_quantity,
          alloc: a.allocated_quantity,
        })
      }
    }
    return [...map.values()]
      .filter(p => p.req > 0 && (p.alloc / p.req) < 0.5)
      .sort((a, b) => (a.alloc / a.req) - (b.alloc / b.req))
      .slice(0, 10)
  }, [allocations])

  // Quota utilization
  const quotaUtilization = useMemo(() => {
    if (!quotas || quotas.length === 0) return []
    const map = new Map<string, { code: string; name: string; total: number; used: number }>()
    for (const q of quotas) {
      const ws = q.wholesaler as unknown as { code: string; name: string } | null
      const code = ws?.code ?? '?'
      const total = q.quota_quantity + (q.extra_available ?? 0)
      const existing = map.get(code)
      if (existing) {
        existing.total += total
      } else {
        map.set(code, { code, name: ws?.name ?? code, total, used: 0 })
      }
    }
    // Count used from allocations
    for (const a of allocations ?? []) {
      if ((a.metadata as Record<string, unknown>)?.quota_used) {
        const ws = a.wholesaler?.code ?? '?'
        const existing = map.get(ws)
        if (existing) existing.used += a.allocated_quantity
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [quotas, allocations])

  // Stock summary
  const stockStats = useMemo(() => {
    if (!stock) return { totalLots: 0, totalQty: 0, expiringSoon: 0 }
    const threeMonths = new Date()
    threeMonths.setMonth(threeMonths.getMonth() + 3)
    const threshold = threeMonths.toISOString().slice(0, 10)

    return {
      totalLots: stock.length,
      totalQty: stock.reduce((s, l) => s + l.quantity, 0),
      expiringSoon: stock.filter(l => l.expiry_date <= threshold).length,
    }
  }, [stock])

  const monthLabel = activeProcess
    ? `${MONTH_NAMES[activeProcess.month - 1]} ${activeProcess.year}`
    : '-'

  return (
    <div className="p-4 md:p-7 lg:p-8 space-y-6 max-w-[1400px] mx-auto ivory-page-glow overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.08))' }}>
              <BarChart3 className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Dashboard Allocation</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                Vue consolidee — {monthLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {monthOptions.length > 0 && (
              <MonthSelector
                value={currentMonthValue}
                onChange={handleMonthChange}
                options={monthOptions}
                compact
              />
            )}
            {activeProcess && (
              <Link
                to={`/monthly-processes/${activeProcess.id}`}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline shrink-0"
              >
                Voir le processus <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50', value: globalStats.total, label: 'Allocations' },
          { icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50', value: globalStats.uniqueProducts, label: 'Produits' },
          { icon: Users, color: 'text-teal-600', bg: 'bg-teal-50', value: globalStats.uniqueCustomers, label: 'Clients' },
          { icon: Truck, color: 'text-amber-600', bg: 'bg-amber-50', value: globalStats.uniqueWholesalers, label: 'Grossistes' },
          { icon: Boxes, color: 'text-violet-600', bg: 'bg-violet-50', value: globalStats.lotCount, label: 'Via lots' },
          { icon: ShieldCheck, color: 'text-green-600', bg: 'bg-green-50', value: stockStats.totalLots, label: 'Lots en stock' },
        ].map((stat, i) => (
          <motion.div key={stat.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-xl ${stat.bg} dark:bg-opacity-20 flex items-center justify-center shrink-0`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div>
                  <AnimatedCounter value={stat.value} valueClassName="text-lg font-bold" />
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Coverage gauge + global numbers */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="h-full">
            <CardContent className="p-5 flex flex-col items-center gap-4">
              <GaugeChart
                value={globalStats.rate}
                size={160}
                strokeWidth={14}
                label="Taux de couverture global"
              />
              <div className="w-full space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Demande</span>
                  <span className="font-bold tabular-nums">{globalStats.requested.toLocaleString('fr-FR')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Alloue</span>
                  <span className="font-bold tabular-nums">{globalStats.allocated.toLocaleString('fr-FR')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ecart</span>
                  <span className="font-bold tabular-nums text-amber-600">
                    {(globalStats.requested - globalStats.allocated).toLocaleString('fr-FR')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* By Wholesaler */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="h-full">
            <CardContent className="p-5 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Truck className="h-4 w-4" /> Repartition par grossiste
              </h4>
              {wholesalerBreakdown.length > 0 ? (
                <HorizontalBarChart
                  items={wholesalerBreakdown.map(w => ({ label: w.name, code: w.code, value: w.qty }))}
                  formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune allocation</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* By Customer */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="h-full">
            <CardContent className="p-5 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Repartition par client
              </h4>
              {customerBreakdown.length > 0 ? (
                <HorizontalBarChart
                  items={customerBreakdown.map(c => ({ label: c.name, code: c.code, value: c.alloc }))}
                  formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune allocation</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Customer coverage table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> Couverture par client
                </h4>
                <Badge variant="secondary" className="text-[10px]">{customerBreakdown.length} clients</Badge>
              </div>
              {customerBreakdown.length > 0 ? (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Lignes</TableHead>
                        <TableHead className="text-right">Demande</TableHead>
                        <TableHead className="text-right">Alloue</TableHead>
                        <TableHead className="text-right">Taux</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerBreakdown.map(c => {
                        const rate = c.req > 0 ? Math.round((c.alloc / c.req) * 100) : 0
                        return (
                          <TableRow key={c.code}>
                            <TableCell>
                              <span className="font-mono font-medium text-sm">{c.code}</span>
                              <span className="text-xs text-muted-foreground ml-1.5">{c.name}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{c.count}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{c.req.toLocaleString('fr-FR')}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{c.alloc.toLocaleString('fr-FR')}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={rate >= 80 ? 'default' : rate >= 50 ? 'secondary' : 'destructive'} className="text-[10px]">
                                {rate}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune donnee</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Under-allocated products + Quota utilization */}
        <div className="space-y-5">
          {/* Under-allocated products */}
          {underAllocated.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Card className="border-amber-200/60 bg-amber-50/20">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <h4 className="text-sm font-semibold">{underAllocated.length} produits sous-alloues (&lt; 50%)</h4>
                  </div>
                  <div className="space-y-1.5">
                    {underAllocated.map(p => {
                      const rate = p.req > 0 ? Math.round((p.alloc / p.req) * 100) : 0
                      return (
                        <div key={p.cip13} className="flex items-center gap-2 text-sm min-w-0">
                          <span className="font-mono text-xs text-muted-foreground w-20 sm:w-28 shrink-0 truncate">{p.cip13}</span>
                          <span className="truncate flex-1 min-w-0">{p.name}</span>
                          <div className="w-12 sm:w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <Badge variant="destructive" className="text-[10px] shrink-0">{rate}%</Badge>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Quota utilization */}
          {quotaUtilization.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" /> Utilisation des quotas
                  </h4>
                  <div className="space-y-2">
                    {quotaUtilization.map(q => {
                      const pct = q.total > 0 ? Math.round((q.used / q.total) * 100) : 0
                      return (
                        <div key={q.code} className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <span className="text-sm font-mono font-medium w-12 sm:w-16 shrink-0 truncate">{q.code}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-0">
                            <div
                              className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground shrink-0 text-right hidden sm:inline">
                            {q.used.toLocaleString('fr-FR')} / {q.total.toLocaleString('fr-FR')}
                          </span>
                          <Badge variant={pct > 90 ? 'destructive' : pct > 70 ? 'secondary' : 'default'} className="text-[10px] w-10 justify-center shrink-0">
                            {pct}%
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Stock summary */}
          {stockStats.totalLots > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Boxes className="h-4 w-4" /> Stock disponible
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-xl font-bold">{stockStats.totalLots}</p>
                      <p className="text-[10px] text-muted-foreground">Lots</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold">{stockStats.totalQty.toLocaleString('fr-FR')}</p>
                      <p className="text-[10px] text-muted-foreground">Unites</p>
                    </div>
                    <div className="text-center">
                      <Tooltip>
                        <TooltipTrigger>
                          <p className={`text-xl font-bold ${stockStats.expiringSoon > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            {stockStats.expiringSoon}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>Lots expirant dans les 3 prochains mois</TooltipContent>
                      </Tooltip>
                      <p className="text-[10px] text-muted-foreground">Expiry &lt; 3m</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>

      {/* Stock par lot */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Warehouse className="h-4 w-4" /> Stock collecte par lot
              </h4>
              <Link
                to="/stock"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Voir tout <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <StockLotView
              processId={activeProcess?.id}
              showKpis={false}
              maxHeight="400px"
              compact
            />
          </CardContent>
        </Card>
      </motion.div>

    </div>
  )
}
