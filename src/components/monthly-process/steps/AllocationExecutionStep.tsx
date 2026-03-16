import { useState, useMemo, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { runAllocation, type AllocationStrategy, type AllocationLog, type CustomerWholesalerMap } from '@/lib/allocation-engine'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Cpu, ArrowRight, CheckCircle, AlertTriangle,
  BarChart3, Users, Zap, Package, Boxes,
  Calendar, Pencil, Check, X, RotateCcw, AlertCircle,
  Lock, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { createNotification } from '@/lib/notifications'
import type { MonthlyProcess } from '@/types/database'

// ── Types ──────────────────────────────────────────────────────────

const STRATEGIES: { value: AllocationStrategy; label: string; icon: typeof Zap }[] = [
  { value: 'balanced', label: 'Equilibree', icon: BarChart3 },
  { value: 'top_clients', label: 'Priorite top clients', icon: Users },
  { value: 'max_coverage', label: 'Max couverture', icon: Zap },
]

const SHORT_EXPIRY_MONTHS = 10

interface AllocationExecutionStepProps {
  process: MonthlyProcess
  onNext: () => void
}

interface StockLot {
  id: string
  wholesaler_id: string
  wholesaler_code: string
  wholesaler_name: string
  product_id: string
  lot_number: string
  expiry_date: string
  quantity: number
}

// Grouped lot: same lot_number at different wholesalers = one logical column
interface GroupedLot {
  lot_number: string
  expiry_date: string
  total_qty: number
  sources: { stock_id: string; wholesaler_id: string; wholesaler_code: string; wholesaler_name: string; quantity: number }[]
}

interface OrderDemand {
  productId: string
  cip13: string
  productName: string
  totalQuantity: number
  customers: {
    id: string
    code: string
    name: string
    quantity: number
    unit_price: number | null
    min_batch: number | null
    order_multiple: number | null
    min_expiry_months: number | null
  }[]
}

// allocations: { [productId]: { [customerId]: { [stockId]: quantity } } }
type AllocMap = Record<string, Record<string, Record<string, number>>>

// ── Helpers ─────────────────────────────────────────────────────────

function monthsUntilExpiry(expiryDate: string): number {
  const now = new Date()
  const exp = new Date(expiryDate)
  return (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth())
}

function formatExpiry(expiryDate: string): string {
  const d = new Date(expiryDate)
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

// ── Component ───────────────────────────────────────────────────────

export default function AllocationExecutionStep({ process, onNext }: AllocationExecutionStepProps) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<'edit' | 'running' | 'done'>('edit')
  const [strategy, setStrategy] = useState<AllocationStrategy>('balanced')
  const [allocationLogs, setAllocationLogs] = useState<AllocationLog[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Allocation map state
  const [allocMap, setAllocMap] = useState<AllocMap>({})
  const [editingCell, setEditingCell] = useState<{ productId: string; customerId: string; stockId: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  const isProcessLocked = process.status === 'completed' || process.status === 'finalizing'

  // ── Data Queries ──────────────────────────────────────────────────

  const { data: existingAllocations } = useQuery({
    queryKey: ['allocations', process.id, 'count'],
    queryFn: async () => {
      const { data } = await supabase
        .from('allocations')
        .select('id')
        .eq('monthly_process_id', process.id)
        .limit(1)
      return data?.length ?? 0
    },
  })

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', process.id, 'allocation-fine'],
    queryFn: async () => {
      const all: any[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, product_id, customer_id, quantity, unit_price, metadata, customer:customers(id, name, code, min_lot_acceptable, allocation_preferences), product:products(id, cip13, name)')
          .eq('monthly_process_id', process.id)
          .neq('status', 'rejected')
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

  const { data: stockLots, isLoading: stockLoading } = useQuery({
    queryKey: ['collected_stock', process.id, 'fine'],
    queryFn: async () => {
      const all: any[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('collected_stock')
          .select('id, wholesaler_id, product_id, lot_number, expiry_date, quantity, status, wholesaler:wholesalers(id, name, code)')
          .eq('monthly_process_id', process.id)
          .in('status', ['received', 'partially_allocated'])
          .order('expiry_date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }
      return all.map((s: any) => ({
        id: s.id,
        wholesaler_id: s.wholesaler_id,
        wholesaler_code: (s.wholesaler as any)?.code ?? '?',
        wholesaler_name: (s.wholesaler as any)?.name ?? '?',
        product_id: s.product_id,
        lot_number: s.lot_number,
        expiry_date: s.expiry_date,
        quantity: s.quantity,
      })) as StockLot[]
    },
  })

  const { data: _wholesalersList } = useQuery({
    queryKey: ['wholesalers', 'all'],
    queryFn: async () => {
      const { data } = await supabase.from('wholesalers').select('id, name, code')
      return data ?? []
    },
  })

  // Customer-wholesaler open links
  const { data: customerWholesalerLinks } = useQuery({
    queryKey: ['customer_wholesalers', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customer_wholesalers').select('*')
      if (error) throw error
      return data as { id: string; customer_id: string; wholesaler_id: string; is_open: boolean; notes: string | null }[]
    },
  })

  const { data: orderStats } = useQuery({
    queryKey: ['orders', process.id, 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_id, product_id, quantity, status')
        .eq('monthly_process_id', process.id)
        .neq('status', 'rejected')
      if (error) throw error
      return data ?? []
    },
  })

  // ── Derived: is client x wholesaler open? ─────────────────────────

  const isClientWholesalerOpen = useCallback((customerId: string, wholesalerId: string): boolean => {
    if (!customerWholesalerLinks) return true // default open if no data
    const link = customerWholesalerLinks.find(
      l => l.customer_id === customerId && l.wholesaler_id === wholesalerId
    )
    return link ? link.is_open : true // default open if no explicit link
  }, [customerWholesalerLinks])

  // Build CustomerWholesalerMap for the engine
  const customerWholesalerMap = useMemo((): CustomerWholesalerMap | undefined => {
    if (!customerWholesalerLinks || customerWholesalerLinks.length === 0) return undefined
    const map: CustomerWholesalerMap = new Map()
    for (const link of customerWholesalerLinks) {
      if (!link.is_open) continue
      if (!map.has(link.customer_id)) map.set(link.customer_id, new Set())
      map.get(link.customer_id)!.add(link.wholesaler_id)
    }
    return map
  }, [customerWholesalerLinks])

  // ── Derived: grouped lots per product ─────────────────────────────

  const groupedLotsByProduct = useMemo(() => {
    if (!stockLots) return new Map<string, GroupedLot[]>()
    const map = new Map<string, Map<string, GroupedLot>>()

    for (const lot of stockLots) {
      if (!map.has(lot.product_id)) map.set(lot.product_id, new Map())
      const productMap = map.get(lot.product_id)!
      // Group key: lot_number (same lot# at diff wholesalers = one column)
      const key = lot.lot_number

      if (productMap.has(key)) {
        const g = productMap.get(key)!
        g.total_qty += lot.quantity
        g.sources.push({
          stock_id: lot.id,
          wholesaler_id: lot.wholesaler_id,
          wholesaler_code: lot.wholesaler_code,
          wholesaler_name: lot.wholesaler_name,
          quantity: lot.quantity,
        })
      } else {
        productMap.set(key, {
          lot_number: lot.lot_number,
          expiry_date: lot.expiry_date,
          total_qty: lot.quantity,
          sources: [{
            stock_id: lot.id,
            wholesaler_id: lot.wholesaler_id,
            wholesaler_code: lot.wholesaler_code,
            wholesaler_name: lot.wholesaler_name,
            quantity: lot.quantity,
          }],
        })
      }
    }

    const result = new Map<string, GroupedLot[]>()
    for (const [productId, lotMap] of map) {
      const lots = [...lotMap.values()].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
      result.set(productId, lots)
    }
    return result
  }, [stockLots])

  // ── Derived: demands (product-level with enriched customer info) ──

  const demands = useMemo(() => {
    if (!orders) return []
    const map = new Map<string, OrderDemand>()
    for (const o of orders) {
      const prod = o.product as any
      const cust = o.customer as any
      const prefs = cust?.allocation_preferences ?? {}
      const meta = o.metadata ?? {}

      const custEntry = {
        id: o.customer_id,
        code: cust?.code ?? '?',
        name: cust?.name ?? '?',
        quantity: o.quantity,
        unit_price: o.unit_price,
        min_batch: (meta as any).min_batch_quantity ?? cust?.min_lot_acceptable ?? null,
        order_multiple: (meta as any).order_multiple ?? null,
        min_expiry_months: (prefs as any).preferred_expiry_months ?? null,
      }

      const existing = map.get(o.product_id)
      if (existing) {
        existing.totalQuantity += o.quantity
        const ec = existing.customers.find(c => c.id === o.customer_id)
        if (ec) {
          ec.quantity += o.quantity
          if (o.unit_price && !ec.unit_price) ec.unit_price = o.unit_price
        } else {
          existing.customers.push(custEntry)
        }
      } else {
        map.set(o.product_id, {
          productId: o.product_id,
          cip13: prod?.cip13 ?? '?',
          productName: prod?.name ?? '?',
          totalQuantity: o.quantity,
          customers: [custEntry],
        })
      }
    }
    return [...map.values()].sort((a, b) => b.totalQuantity - a.totalQuantity)
  }, [orders])

  // Filter demands by search
  const filteredDemands = useMemo(() => {
    if (!searchQuery.trim()) return demands
    const q = searchQuery.toLowerCase()
    return demands.filter(d =>
      d.productName.toLowerCase().includes(q) ||
      d.cip13.includes(q) ||
      d.customers.some(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    )
  }, [demands, searchQuery])

  // ── Stats ─────────────────────────────────────────────────────────

  const orderCount = orderStats?.length ?? 0
  const pendingOrders = orderStats?.filter(o => o.status === 'validated' || o.status === 'pending') ?? []
  const allocatableCount = pendingOrders.length
  const uniqueProducts = new Set(orderStats?.map(o => o.product_id)).size
  const stockCount = stockLots?.length ?? 0

  const totalDemand = demands.reduce((s, d) => s + d.totalQuantity, 0)
  const totalAttributed = useMemo(() => {
    let sum = 0
    for (const product of Object.values(allocMap)) {
      for (const customer of Object.values(product)) {
        for (const qty of Object.values(customer)) {
          sum += qty
        }
      }
    }
    return sum
  }, [allocMap])
  const coverageRate = totalDemand > 0 ? (totalAttributed / totalDemand) * 100 : 0

  // Per-client progress
  const clientProgress = useMemo(() => {
    const map = new Map<string, { demanded: number; allocated: number; code: string }>()
    for (const d of demands) {
      for (const c of d.customers) {
        const existing = map.get(c.id) ?? { demanded: 0, allocated: 0, code: c.code }
        existing.demanded += c.quantity
        map.set(c.id, existing)
      }
    }
    for (const [, customers] of Object.entries(allocMap)) {
      for (const [custId, stocks] of Object.entries(customers)) {
        const existing = map.get(custId)
        if (existing) {
          existing.allocated += Object.values(stocks).reduce((s, q) => s + q, 0)
        }
      }
    }
    return map
  }, [demands, allocMap])

  // ── Lot usage tracking ────────────────────────────────────────────

  const getStockUsed = useCallback((stockId: string) => {
    let used = 0
    for (const product of Object.values(allocMap)) {
      for (const customer of Object.values(product)) {
        used += customer[stockId] ?? 0
      }
    }
    return used
  }, [allocMap])

  const getCustomerAttributed = useCallback((productId: string, customerId: string) => {
    const product = allocMap[productId]
    if (!product) return 0
    const customer = product[customerId]
    if (!customer) return 0
    return Object.values(customer).reduce((s, q) => s + q, 0)
  }, [allocMap])

  const getGroupedLotUsed = useCallback((groupedLot: GroupedLot) => {
    return groupedLot.sources.reduce((s, src) => s + getStockUsed(src.stock_id), 0)
  }, [getStockUsed])

  // ── Auto-allocate using FEFO ──────────────────────────────────────

  const autoAllocate = useCallback(() => {
    const newMap: AllocMap = {}

    for (const demand of demands) {
      const groupedLots = groupedLotsByProduct.get(demand.productId) ?? []
      if (groupedLots.length === 0) continue

      newMap[demand.productId] = {}

      const stockRemaining = new Map<string, number>()
      for (const gl of groupedLots) {
        for (const src of gl.sources) {
          stockRemaining.set(src.stock_id, src.quantity)
        }
      }

      const sortedCustomers = [...demand.customers].sort((a, b) => b.quantity - a.quantity)

      for (const cust of sortedCustomers) {
        newMap[demand.productId][cust.id] = {}
        let remaining = cust.quantity

        for (const gl of groupedLots) {
          if (remaining <= 0) break

          // Check expiry min constraint
          if (cust.min_expiry_months && monthsUntilExpiry(gl.expiry_date) < cust.min_expiry_months) {
            continue
          }

          for (const src of gl.sources) {
            if (remaining <= 0) break
            if (!isClientWholesalerOpen(cust.id, src.wholesaler_id)) continue

            const lotRem = stockRemaining.get(src.stock_id) ?? 0
            if (lotRem <= 0) continue

            const assign = Math.min(remaining, lotRem)
            if (assign > 0) {
              newMap[demand.productId][cust.id][src.stock_id] = assign
              stockRemaining.set(src.stock_id, lotRem - assign)
              remaining -= assign
            }
          }
        }
      }
    }

    setAllocMap(newMap)
    toast.success('Auto-attribution FEFO effectuee')
  }, [demands, groupedLotsByProduct, isClientWholesalerOpen])

  const resetAllocation = () => {
    setAllocMap({})
    toast.info('Attribution reinitialise')
  }

  // ── Cell editing ──────────────────────────────────────────────────

  const startEdit = (productId: string, customerId: string, stockId: string, currentValue: number) => {
    if (isProcessLocked) return
    setEditingCell({ productId, customerId, stockId })
    setEditValue(String(currentValue))
  }

  const saveEdit = () => {
    if (!editingCell) return
    const val = parseInt(editValue, 10)
    if (isNaN(val) || val < 0) { toast.error('Valeur invalide'); return }

    const { productId, customerId, stockId } = editingCell

    const currentAssigned = allocMap[productId]?.[customerId]?.[stockId] ?? 0
    const otherUsed = getStockUsed(stockId) - currentAssigned

    // Find stock entry original quantity
    let stockQty = 0
    for (const lots of groupedLotsByProduct.values()) {
      for (const gl of lots) {
        for (const src of gl.sources) {
          if (src.stock_id === stockId) { stockQty = src.quantity; break }
        }
      }
    }

    if (val + otherUsed > stockQty) {
      toast.error(`Stock depasse (${stockQty} dispo, ${otherUsed} deja attribues)`)
      return
    }

    // Validate min_batch
    const demand = demands.find(d => d.productId === productId)
    const cust = demand?.customers.find(c => c.id === customerId)
    if (cust?.min_batch && val > 0 && val < cust.min_batch) {
      toast.warning(`Inferieur au lot minimum (${cust.min_batch}) — enregistre mais attention`)
    }

    // Validate order_multiple
    if (cust?.order_multiple && val > 0 && val % cust.order_multiple !== 0) {
      toast.warning(`Non multiple de ${cust.order_multiple} — enregistre mais attention`)
    }

    setAllocMap(prev => {
      const next = { ...prev }
      if (!next[productId]) next[productId] = {}
      if (!next[productId][customerId]) next[productId][customerId] = {}

      if (val === 0) {
        delete next[productId][customerId][stockId]
        if (Object.keys(next[productId][customerId]).length === 0) delete next[productId][customerId]
        if (Object.keys(next[productId]).length === 0) delete next[productId]
      } else {
        next[productId] = { ...next[productId] }
        next[productId][customerId] = { ...next[productId][customerId], [stockId]: val }
      }
      return next
    })
    setEditingCell(null)
  }

  const cancelEdit = () => setEditingCell(null)

  // ── Allocation mutation (run engine + persist) ────────────────────

  const allocateMut = useMutation({
    mutationFn: async () => {
      if (isProcessLocked) {
        throw new Error('Ce processus est deja termine. Impossible de relancer l\'allocation.')
      }
      setPhase('running')

      // Clean up previous allocation run (if any) — reset stock + orders + delete old allocations
      await supabase.from('allocations').delete().eq('monthly_process_id', process.id)
      await supabase.from('collected_stock').update({ status: 'received' }).eq('monthly_process_id', process.id).in('status', ['allocated', 'partially_allocated'])
      await supabase.from('orders').update({ allocated_quantity: 0, status: 'validated' }).eq('monthly_process_id', process.id).in('status', ['allocated', 'partially_allocated'])

      const { allocations, logs } = await runAllocation(
        process.id, process.month, process.year, strategy, new Set(), false,
        undefined, customerWholesalerMap,
      )
      setAllocationLogs(logs)

      const batchSize = 100
      let totalInserted = 0
      for (let i = 0; i < allocations.length; i += batchSize) {
        const batch = allocations.slice(i, i + batchSize)
        const { error, data } = await supabase.from('allocations').insert(batch).select('id')
        if (error) throw error
        totalInserted += data?.length ?? batch.length
      }

      await supabase
        .from('monthly_processes')
        .update({
          allocations_count: totalInserted,
          status: process.current_step > 8 ? process.status : 'allocating_lots',
          current_step: Math.max(8, process.current_step),
          phase: process.current_step > 8 ? process.phase : 'allocation',
        })
        .eq('id', process.id)

      return totalInserted
    },
    onSuccess: (count) => {
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${count} allocations generees`)
      createNotification({
        type: 'info',
        title: 'Allocation terminee',
        message: `${count} allocations generees pour le processus ${process.month}/${process.year}.`,
      })
    },
    onError: (err: Error) => {
      setPhase('edit')
      toast.error(err.message)
    },
  })

  const isLoading = ordersLoading || stockLoading

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Banner: existing allocations */}
      {existingAllocations != null && existingAllocations > 0 && (
        <Card className={allocatableCount === 0 ? 'border-green-200/60 bg-green-50/30' : 'border-amber-200/60 bg-amber-50/30'}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {allocatableCount === 0 ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <p className="text-sm">
                    Allocation terminee — <strong>{orderCount}</strong> commandes traitees.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <p className="text-sm">
                    <strong>{existingAllocations}</strong> allocations existantes. Relancer ajoutera de nouvelles entrees.
                  </p>
                </>
              )}
            </div>
            {allocatableCount === 0 && (
              <Button onClick={onNext} size="sm" className="gap-2 shrink-0">
                Voir les resultats <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ Edit phase: single flat view ═══ */}
      {phase === 'edit' && (
        <div className="space-y-6">
          {/* Header: strategy + controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Allocation fine par lot</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {orderCount} commandes &middot; {uniqueProducts} produits &middot; {stockCount} lots
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={strategy} onValueChange={(v) => setStrategy(v as AllocationStrategy)}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Strategie" />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      <div className="flex items-center gap-2">
                        <s.icon className="h-3.5 w-3.5" />
                        <span>{s.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isProcessLocked && (
                <>
                  <Button onClick={autoAllocate} className="gap-1.5" disabled={stockCount === 0}>
                    <Zap className="h-4 w-4" /> Auto-attribuer
                  </Button>
                  {Object.keys(allocMap).length > 0 && (
                    <Button onClick={resetAllocation} variant="outline" className="gap-1.5">
                      <RotateCcw className="h-4 w-4" /> Reinitialiser
                    </Button>
                  )}
                </>
              )}
              {isProcessLocked && (
                <Badge variant="outline" className="gap-1 text-amber-700 border-amber-200">
                  <Lock className="h-3 w-3" /> Processus verrouille
                </Badge>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher produit, CIP13, client..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9 w-[260px]"
              />
            </div>
          </div>

          {/* Global progress bar */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Couverture globale</span>
                <span className="font-bold">{totalAttributed.toLocaleString('fr-FR')} / {totalDemand.toLocaleString('fr-FR')} u. ({Math.round(coverageRate)}%)</span>
              </div>
              <Progress value={Math.min(coverageRate, 100)} className="h-2.5" />

              {/* Per-client mini progress */}
              <div className="flex flex-wrap gap-3 pt-1">
                {[...clientProgress.entries()]
                  .sort((a, b) => b[1].demanded - a[1].demanded)
                  .map(([custId, { demanded, allocated, code }]) => {
                    const pct = demanded > 0 ? Math.round((allocated / demanded) * 100) : 0
                    return (
                      <div key={custId} className="flex items-center gap-2 min-w-[140px]">
                        <Badge variant="outline" className="text-xs font-bold shrink-0">{code}</Badge>
                        <div className="flex-1 min-w-[60px]">
                          <Progress value={Math.min(pct, 100)} className="h-1.5" />
                        </div>
                        <span className={`text-xs tabular-nums font-medium ${pct >= 100 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {pct}%
                        </span>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* No stock warning */}
              {stockCount === 0 && (
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Aucun lot de stock disponible</p>
                      <p className="text-xs text-muted-foreground">L'allocation se fera uniquement par disponibilites. Utilisez "Valider et lancer" pour lancer l'algo sur les dispos.</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Product cards with lot table ── */}
              <div className="space-y-4">
                {filteredDemands.map(demand => {
                  const groupedLots = groupedLotsByProduct.get(demand.productId) ?? []
                  const totalStock = groupedLots.reduce((s, gl) => s + gl.total_qty, 0)

                  return (
                    <Card key={demand.productId} className="overflow-hidden">
                      {/* Product header */}
                      <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono text-xs">{demand.cip13}</Badge>
                          <span className="text-sm font-semibold truncate max-w-[300px]">{demand.productName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>Demande: <strong className="text-foreground">{demand.totalQuantity.toLocaleString('fr-FR')}</strong></span>
                          {groupedLots.length > 0 && (
                            <>
                              <span className="text-muted-foreground/40">|</span>
                              <span>Stock: <strong className="text-foreground">{totalStock.toLocaleString('fr-FR')}</strong></span>
                              <span className="text-muted-foreground/40">|</span>
                              <span>{groupedLots.length} lot{groupedLots.length > 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <CardContent className="p-0">
                        {groupedLots.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Pas de lot disponible — allocation par disponibilites uniquement
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                {/* Row 1: grouped lot headers */}
                                <TableRow className="border-b-0">
                                  <TableHead rowSpan={2} className="min-w-[150px] sticky left-0 bg-background z-10 border-r">
                                    Client
                                  </TableHead>
                                  {groupedLots.map(gl => {
                                    const months = monthsUntilExpiry(gl.expiry_date)
                                    const isShortExpiry = months <= SHORT_EXPIRY_MONTHS
                                    const lotUsed = getGroupedLotUsed(gl)
                                    const lotRemaining = gl.total_qty - lotUsed
                                    const lotPct = gl.total_qty > 0 ? Math.round((lotUsed / gl.total_qty) * 100) : 0

                                    return (
                                      <TableHead
                                        key={gl.lot_number}
                                        colSpan={gl.sources.length}
                                        className="text-center px-2 border-l"
                                      >
                                        <div className="space-y-1">
                                          <div className="font-mono text-xs font-bold">{gl.lot_number}</div>
                                          <div className="flex items-center justify-center gap-1.5">
                                            <span className={`text-[10px] ${isShortExpiry ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                              <Calendar className="h-2.5 w-2.5 inline mr-0.5" />
                                              {formatExpiry(gl.expiry_date)}
                                            </span>
                                            {isShortExpiry && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span><AlertCircle className="h-3 w-3 text-red-500" /></span>
                                                </TooltipTrigger>
                                                <TooltipContent>Expiration dans {months} mois</TooltipContent>
                                              </Tooltip>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-center gap-1">
                                            <span className={`text-[10px] font-medium ${lotRemaining <= 0 ? 'text-red-600' : lotRemaining < gl.total_qty * 0.2 ? 'text-amber-600' : 'text-green-600'}`}>
                                              {lotRemaining}/{gl.total_qty}
                                            </span>
                                          </div>
                                          <Progress value={Math.min(lotPct, 100)} className="h-1 mx-auto max-w-[80px]" />
                                        </div>
                                      </TableHead>
                                    )
                                  })}
                                  <TableHead rowSpan={2} className="text-right min-w-[80px] border-l">
                                    Attribue
                                  </TableHead>
                                  <TableHead rowSpan={2} className="text-center min-w-[80px] border-l">
                                    Progres
                                  </TableHead>
                                </TableRow>
                                {/* Row 2: per-wholesaler sub-headers */}
                                <TableRow>
                                  {groupedLots.map(gl =>
                                    gl.sources.map(src => (
                                      <TableHead key={src.stock_id} className="text-center px-1 min-w-[90px] border-l">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="text-[10px] font-bold cursor-help">{src.wholesaler_code}</span>
                                          </TooltipTrigger>
                                          <TooltipContent>{src.wholesaler_name} ({src.quantity} u.)</TooltipContent>
                                        </Tooltip>
                                        <div className="text-[9px] text-muted-foreground">{src.quantity} u.</div>
                                      </TableHead>
                                    ))
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {demand.customers.map(cust => {
                                  const custAttributed = getCustomerAttributed(demand.productId, cust.id)
                                  const custRemaining = cust.quantity - custAttributed
                                  const custPct = cust.quantity > 0 ? Math.min(Math.round((custAttributed / cust.quantity) * 100), 100) : 0
                                  const isFull = custRemaining <= 0

                                  return (
                                    <TableRow key={cust.id} className={isFull ? 'bg-green-50/20 dark:bg-green-950/10' : ''}>
                                      {/* Client info cell */}
                                      <TableCell className="sticky left-0 bg-background z-10 border-r py-2">
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <Badge variant="outline" className="text-xs font-bold">{cust.code}</Badge>
                                            {isFull && <Check className="h-3 w-3 text-green-600" />}
                                          </div>
                                          <div className="text-[10px] text-muted-foreground space-y-0">
                                            <div>Dem: <strong className="text-foreground">{cust.quantity.toLocaleString('fr-FR')}</strong></div>
                                            {cust.unit_price != null && <div>Prix: {cust.unit_price.toFixed(2)} EUR</div>}
                                            {cust.min_batch != null && <div>Min lot: {cust.min_batch}</div>}
                                            {cust.order_multiple != null && <div>Mult: x{cust.order_multiple}</div>}
                                            {cust.min_expiry_months != null && (
                                              <div>Exp min: {cust.min_expiry_months} mois</div>
                                            )}
                                          </div>
                                        </div>
                                      </TableCell>

                                      {/* Lot cells */}
                                      {groupedLots.map(gl =>
                                        gl.sources.map(src => {
                                          const isOpen = isClientWholesalerOpen(cust.id, src.wholesaler_id)
                                          const assignedQty = allocMap[demand.productId]?.[cust.id]?.[src.stock_id] ?? 0
                                          const isEditing = editingCell?.productId === demand.productId
                                            && editingCell?.customerId === cust.id
                                            && editingCell?.stockId === src.stock_id

                                          // Check expiry warning
                                          const expiryWarning = cust.min_expiry_months
                                            ? monthsUntilExpiry(gl.expiry_date) < cust.min_expiry_months
                                            : false

                                          if (!isOpen) {
                                            return (
                                              <TableCell key={src.stock_id} className="text-center p-1 border-l">
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <div className="w-full h-full min-h-[32px] bg-muted/60 rounded flex items-center justify-center cursor-not-allowed">
                                                      <Lock className="h-3 w-3 text-muted-foreground/40" />
                                                    </div>
                                                  </TooltipTrigger>
                                                  <TooltipContent>{cust.code} ne travaille pas avec {src.wholesaler_code}</TooltipContent>
                                                </Tooltip>
                                              </TableCell>
                                            )
                                          }

                                          return (
                                            <TableCell key={src.stock_id} className={`text-center p-1 border-l ${expiryWarning && assignedQty > 0 ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
                                              {isEditing ? (
                                                <div className="flex items-center gap-0.5 justify-center">
                                                  <Input
                                                    type="number"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    className="h-7 w-16 text-xs text-center"
                                                    autoFocus
                                                    min={0}
                                                    onKeyDown={e => {
                                                      if (e.key === 'Enter') saveEdit()
                                                      if (e.key === 'Escape') cancelEdit()
                                                    }}
                                                  />
                                                  <button type="button" onClick={saveEdit} className="p-0.5 hover:text-green-600">
                                                    <Check className="h-3 w-3" />
                                                  </button>
                                                  <button type="button" onClick={cancelEdit} className="p-0.5 hover:text-red-600">
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              ) : (
                                                <button
                                                  type="button"
                                                  className={`w-full text-center py-1.5 rounded transition-colors group ${
                                                    isProcessLocked ? 'cursor-default' : 'hover:bg-primary/5 cursor-pointer'
                                                  }`}
                                                  onClick={() => !isProcessLocked && startEdit(demand.productId, cust.id, src.stock_id, assignedQty)}
                                                  disabled={isProcessLocked}
                                                >
                                                  <div className="tabular-nums text-sm font-medium">
                                                    {assignedQty > 0 ? (
                                                      <span className={
                                                        assignedQty > src.quantity ? 'text-red-600' :
                                                        expiryWarning ? 'text-amber-600' :
                                                        'text-green-700 dark:text-green-400'
                                                      }>
                                                        {assignedQty.toLocaleString('fr-FR')}
                                                      </span>
                                                    ) : (
                                                      <span className="text-muted-foreground/30">&mdash;</span>
                                                    )}
                                                  </div>
                                                  {!isProcessLocked && assignedQty === 0 && (
                                                    <Pencil className="h-2.5 w-2.5 mx-auto opacity-0 group-hover:opacity-40 transition-opacity" />
                                                  )}
                                                </button>
                                              )}
                                            </TableCell>
                                          )
                                        })
                                      )}

                                      {/* Attributed total */}
                                      <TableCell className="text-right tabular-nums font-medium text-sm border-l">
                                        <span className={isFull ? 'text-green-600' : custAttributed > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                                          {custAttributed.toLocaleString('fr-FR')}
                                        </span>
                                        {custRemaining > 0 && (
                                          <div className="text-[10px] text-red-500">-{custRemaining.toLocaleString('fr-FR')}</div>
                                        )}
                                        {custRemaining < 0 && (
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <div className="text-[10px] text-blue-500">+{Math.abs(custRemaining).toLocaleString('fr-FR')}</div>
                                            </TooltipTrigger>
                                            <TooltipContent>Sur-attribution</TooltipContent>
                                          </Tooltip>
                                        )}
                                      </TableCell>

                                      {/* Progress bar */}
                                      <TableCell className="border-l">
                                        <div className="flex items-center gap-1.5 min-w-[70px]">
                                          <Progress value={custPct} className="h-1.5 flex-1" />
                                          <span className={`text-[10px] tabular-nums font-medium ${isFull ? 'text-green-600' : 'text-muted-foreground'}`}>
                                            {custPct}%
                                          </span>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}

                {/* Products without lots */}
                {(() => {
                  const noLotProducts = filteredDemands.filter(d => (groupedLotsByProduct.get(d.productId) ?? []).length === 0)
                  if (noLotProducts.length === 0) return null
                  return (
                    <Card className="border-muted">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Boxes className="h-4 w-4 text-muted-foreground" />
                          <h4 className="text-sm font-semibold text-muted-foreground">
                            {noLotProducts.length} produit{noLotProducts.length > 1 ? 's' : ''} sans lot — allocation par disponibilites uniquement
                          </h4>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {noLotProducts.slice(0, 20).map(d => (
                            <Badge key={d.productId} variant="outline" className="text-xs gap-1">
                              <span className="font-mono">{d.cip13}</span>
                              <span className="text-muted-foreground">{d.totalQuantity} u.</span>
                            </Badge>
                          ))}
                          {noLotProducts.length > 20 && (
                            <Badge variant="outline" className="text-xs">+{noLotProducts.length - 20} autres</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}
              </div>

              {/* Validate button */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {totalAttributed > 0 && (
                    <span>{totalAttributed.toLocaleString('fr-FR')} unites attribuees ({Math.round(coverageRate)}% couverture)</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => allocateMut.mutate()}
                    disabled={allocatableCount === 0 || isProcessLocked || allocateMut.isPending}
                    className="gap-2"
                  >
                    <Cpu className="h-4 w-4" />
                    {isProcessLocked ? 'Processus termine' : allocateMut.isPending ? 'Allocation...' : 'Valider et lancer l\'allocation'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Running phase ─── */}
      {phase === 'running' && (
        <div className="py-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="relative mx-auto w-16 h-16">
              <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full" />
              <Cpu className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-lg font-medium">Allocation en cours...</p>
            <p className="text-sm text-muted-foreground">Repartition des {orderCount} commandes</p>
          </div>

          {allocationLogs.length > 0 && (
            <Card className="max-h-48 overflow-hidden">
              <CardContent className="p-0">
                <div ref={logRef} className="overflow-y-auto max-h-48 p-3 space-y-0.5 font-mono text-[11px]">
                  {allocationLogs.slice(-30).map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.full ? 'text-green-600' : 'text-amber-600'}`}>
                      <span className="text-muted-foreground w-6 text-right shrink-0">{Math.max(0, allocationLogs.length - 30) + i + 1}</span>
                      <span>[{log.customer}]</span>
                      <span className="truncate flex-1">{log.product}...</span>
                      <span>&rarr; {log.wholesaler}</span>
                      {log.lot && <span className="text-violet-500">L:{log.lot.slice(0, 6)}</span>}
                      <span className="tabular-nums">{log.allocated}/{log.requested}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Done phase ─── */}
      {phase === 'done' && (
        <div className="py-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-xl font-semibold">Allocation terminee</p>
            <p className="text-sm text-muted-foreground mt-1">
              {allocateMut.data} allocations generees avec la strategie "{STRATEGIES.find(s => s.value === strategy)?.label ?? strategy}".
            </p>
          </div>
          <Button onClick={onNext} size="lg" className="gap-2">
            Voir les resultats <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
