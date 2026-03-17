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
  Pencil, Check, X, RotateCcw,
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
const LOT_GROUP_COLORS = [
  { bg: 'bg-blue-50', border: 'border-l-blue-300', header: 'bg-blue-50' },
  { bg: 'bg-green-50', border: 'border-l-green-300', header: 'bg-green-50' },
  { bg: 'bg-yellow-50', border: 'border-l-yellow-300', header: 'bg-yellow-50' },
  { bg: 'bg-purple-50', border: 'border-l-purple-300', header: 'bg-purple-50' },
  { bg: 'bg-rose-50', border: 'border-l-rose-300', header: 'bg-rose-50' },
]

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
    is_top: boolean
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
        is_top: cust?.is_top_client ?? false,
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
          status: 'allocating_lots',
          current_step: Math.max(10, process.current_step),
          phase: 'allocation',
        })
        .eq('id', process.id)

      return { count: totalInserted, allocations, logs }
    },
    onSuccess: ({ count, allocations: newAllocs, logs: newLogs }) => {
      setPhase('done')
      setAllocationLogs(newLogs)

      // Rebuild allocMap from fresh allocations so the table reflects the new strategy
      const freshMap: Record<string, Record<string, Record<string, number>>> = {}
      for (const a of newAllocs) {
        if (!a.stock_id) continue
        if (!freshMap[a.product_id]) freshMap[a.product_id] = {}
        if (!freshMap[a.product_id][a.customer_id]) freshMap[a.product_id][a.customer_id] = {}
        freshMap[a.product_id][a.customer_id][a.stock_id] = (freshMap[a.product_id][a.customer_id][a.stock_id] ?? 0) + a.allocated_quantity
      }
      setAllocMap(freshMap)

      // Invalidate all related queries so UI refreshes completely
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
      queryClient.invalidateQueries({ queryKey: ['collected_stock', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${count} allocations generees (strategie: ${strategy})`)
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
              {!isProcessLocked && Object.keys(allocMap).length > 0 && (
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-3 w-3" /> Modifications non sauvegardees — lancez l'allocation pour persister
                </Badge>
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
                      <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between gap-5">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] bg-muted border border-border rounded-md px-2 py-1 text-muted-foreground tracking-wider">{demand.cip13}</span>
                          <span className="text-[17px] font-bold tracking-tight truncate max-w-[350px]">{demand.productName}</span>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Demande</div>
                            <div className="text-xl font-bold tabular-nums text-blue-700">{demand.totalQuantity.toLocaleString('fr-FR')}</div>
                          </div>
                          {groupedLots.length > 0 && (
                            <>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lots</div>
                                <div className="text-xl font-bold tabular-nums">{groupedLots.length}</div>
                                <div className="text-[11px] text-muted-foreground">{groupedLots.reduce((s, gl) => s + gl.sources.length, 0)} grossistes</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stock</div>
                                <div className="text-xl font-bold tabular-nums">{totalStock.toLocaleString('fr-FR')}</div>
                              </div>
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
                          <div className="overflow-x-auto" style={{ fontSize: '12px' }}>
                            <Table>
                              <TableHeader>
                                {/* Row 1: grouped lot headers */}
                                <TableRow className="border-b-0">
                                  <TableHead rowSpan={2} className="min-w-[110px] sticky left-0 bg-background z-10">Client</TableHead>
                                  <TableHead rowSpan={2} className="text-center w-[52px] bg-green-50/30">Prix</TableHead>
                                  <TableHead rowSpan={2} className="text-center w-[40px]">Lot≥</TableHead>
                                  <TableHead rowSpan={2} className="text-center w-[52px]">Exp≥</TableHead>
                                  <TableHead rowSpan={2} className="text-center w-[52px] border-r-2 border-r-border">Dem.</TableHead>
                                  {groupedLots.map((gl, glIdx) => {
                                    const months = monthsUntilExpiry(gl.expiry_date)
                                    const isShortExpiry = months <= SHORT_EXPIRY_MONTHS
                                    const lotUsed = getGroupedLotUsed(gl)
                                    const lotColor = LOT_GROUP_COLORS[glIdx % LOT_GROUP_COLORS.length]

                                    return (
                                      <TableHead
                                        key={gl.lot_number}
                                        colSpan={gl.sources.length}
                                        className={`text-center px-2 border-l-2 ${lotColor.border} ${lotColor.header}`}
                                      >
                                        <div className="space-y-1">
                                          <div className="flex items-center justify-center gap-1">
                                            <span className="font-mono text-xs font-bold">{gl.lot_number}</span>
                                            {gl.sources.length > 1 && (
                                              <span className="text-[7px] font-bold uppercase bg-green-600 text-white px-1 py-0 rounded-sm">{gl.sources.length} gross.</span>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-center gap-1.5">
                                            <span className={`text-[10px] font-semibold ${isShortExpiry ? 'text-red-600' : months <= 12 ? 'text-amber-600' : 'text-green-700'}`}>
                                              {isShortExpiry ? '⚠' : months <= 12 ? '🕐' : '✓'} {formatExpiry(gl.expiry_date)}
                                            </span>
                                            <span className="text-[10px] font-semibold text-blue-700 bg-white px-1 py-0 rounded border border-border">{gl.total_qty}</span>
                                          </div>
                                          <Progress value={gl.total_qty > 0 ? Math.min(Math.round((lotUsed / gl.total_qty) * 100), 100) : 0} className="h-1 mx-auto max-w-[80px]" />
                                        </div>
                                      </TableHead>
                                    )
                                  })}
                                  <TableHead rowSpan={2} className="text-center min-w-[60px] border-l-2 border-l-border">Attr.</TableHead>
                                  <TableHead rowSpan={2} className="text-center min-w-[60px]">Reste</TableHead>
                                  <TableHead rowSpan={2} className="text-center w-[36px]">✓</TableHead>
                                </TableRow>
                                {/* Row 2: per-wholesaler sub-headers */}
                                <TableRow>
                                  {groupedLots.map((gl, glIdx) => {
                                    const lotColor = LOT_GROUP_COLORS[glIdx % LOT_GROUP_COLORS.length]
                                    return gl.sources.map(src => {
                                      const srcUsed = Object.values(allocMap).reduce((sum, custMap) =>
                                        sum + Object.values(custMap).reduce((s2, stockMap) => s2 + (stockMap[src.stock_id] ?? 0), 0), 0)
                                      return (
                                        <TableHead key={src.stock_id} className={`text-center px-1 min-w-[70px] border-l ${lotColor.header}`}>
                                          <span className="text-[10px] font-bold uppercase">{src.wholesaler_code}</span>
                                          <div className="font-mono text-[9px] text-muted-foreground">{srcUsed}/{src.quantity}</div>
                                        </TableHead>
                                      )
                                    })
                                  })}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {demand.customers.map(cust => {
                                  const custAttributed = getCustomerAttributed(demand.productId, cust.id)
                                  const custRemaining = cust.quantity - custAttributed
                                  const isFull = custRemaining <= 0

                                  return (
                                    <TableRow key={cust.id} className={`transition-colors duration-100 ${isFull ? 'bg-green-50/20 dark:bg-green-950/10' : 'hover:bg-gray-50/60'}`}>
                                      {/* Client name cell */}
                                      <TableCell className="sticky left-0 bg-background z-10 py-1.5 text-left min-w-[130px] px-2.5">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                          {cust.is_top && <span className="w-[5px] h-3.5 bg-amber-400 rounded-sm shrink-0" />}
                                          <span className="text-[13px] font-bold tracking-wide whitespace-nowrap">{cust.code}</span>
                                          {cust.is_top && <span className="text-amber-500 text-[10px]">★</span>}
                                          {cust.order_multiple != null && <span className="text-[8px] font-bold bg-purple-600 text-white px-1 py-0 rounded tracking-wide whitespace-nowrap">×{cust.order_multiple}</span>}
                                        </div>
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {cust.unit_price != null && (
                                            <span className="inline-flex items-center text-[11px] font-bold text-green-800 bg-green-50 border border-green-200 px-1.5 py-0 rounded whitespace-nowrap">
                                              {Math.round(cust.unit_price)}&nbsp;€
                                            </span>
                                          )}
                                          {cust.min_batch != null && (
                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-muted-foreground bg-gray-100 px-1 py-0 rounded whitespace-nowrap">
                                              <span className="text-[8px] uppercase opacity-65 tracking-wide">lot≥</span>{cust.min_batch}
                                            </span>
                                          )}
                                          {cust.min_expiry_months != null && (
                                            <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0 rounded whitespace-nowrap ${
                                              cust.min_expiry_months > 6 ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50'
                                            }`}>
                                              <span className="text-[8px] uppercase opacity-65 tracking-wide">exp≥</span>
                                              {`${String(new Date(Date.now() + cust.min_expiry_months * 30 * 86400000).getMonth() + 1).padStart(2, '0')}/${String(new Date(Date.now() + cust.min_expiry_months * 30 * 86400000).getFullYear()).slice(2)}`}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      {/* Prix */}
                                      <TableCell className="text-center py-1.5 font-mono text-xs font-bold text-green-800 bg-green-50 border-r border-r-gray-100 whitespace-nowrap">
                                        {cust.unit_price != null ? `${Math.round(cust.unit_price)} €` : '—'}
                                      </TableCell>
                                      {/* Lot≥ */}
                                      <TableCell className={`text-center py-1.5 font-mono text-[11px] font-semibold ${cust.min_batch != null ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                                        {cust.min_batch ?? '—'}
                                      </TableCell>
                                      {/* Exp≥ */}
                                      <TableCell className={`text-center py-1.5 text-[11px] font-semibold whitespace-nowrap ${cust.min_expiry_months && cust.min_expiry_months > 6 ? 'text-amber-600' : 'text-green-700'}`}>
                                        {cust.min_expiry_months ? `${String(new Date(Date.now() + cust.min_expiry_months * 30 * 86400000).getMonth() + 1).padStart(2, '0')}/${String(new Date(Date.now() + cust.min_expiry_months * 30 * 86400000).getFullYear()).slice(2)}` : '—'}
                                      </TableCell>
                                      {/* Dem. */}
                                      <TableCell className="text-center py-1.5 border-r-2 border-r-border">
                                        <span className="text-[13px] font-bold tabular-nums">{cust.quantity.toLocaleString('fr-FR')}</span>
                                      </TableCell>

                                      {/* Lot cells */}
                                      {groupedLots.map((gl, glIdx) => {
                                        void glIdx // lot index used for header colors only
                                        // Check expiry refused for this client × this lot
                                        const expiryRefused = cust.min_expiry_months
                                          ? monthsUntilExpiry(gl.expiry_date) < cust.min_expiry_months
                                          : false

                                        return gl.sources.map(src => {
                                          const isOpen = isClientWholesalerOpen(cust.id, src.wholesaler_id)
                                          const assignedQty = allocMap[demand.productId]?.[cust.id]?.[src.stock_id] ?? 0
                                          const isEditing = editingCell?.productId === demand.productId
                                            && editingCell?.customerId === cust.id
                                            && editingCell?.stockId === src.stock_id

                                          // Disabled: not open
                                          if (!isOpen) {
                                            return (
                                              <TableCell key={src.stock_id} className="text-center p-1 border-l min-w-[68px]"
                                                style={{ background: 'repeating-linear-gradient(-45deg, #f3f4f6, #f3f4f6 3px, #eaebee 3px, #eaebee 6px)' }}>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <span className="text-gray-300 text-xs font-semibold">✕</span>
                                                  </TooltipTrigger>
                                                  <TooltipContent>{cust.code} non ouvert chez {src.wholesaler_code}</TooltipContent>
                                                </Tooltip>
                                              </TableCell>
                                            )
                                          }

                                          // Blocked: expiry refused
                                          if (expiryRefused && assignedQty === 0) {
                                            return (
                                              <TableCell key={src.stock_id} className="text-center p-1 border-l bg-red-50 min-w-[68px]">
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <span className="text-[8px] font-bold text-red-600 uppercase leading-tight block tracking-wide">exp.<br/>refusee</span>
                                                  </TooltipTrigger>
                                                  <TooltipContent>{formatExpiry(gl.expiry_date)} &lt; exp. min {cust.min_expiry_months} mois</TooltipContent>
                                                </Tooltip>
                                              </TableCell>
                                            )
                                          }

                                          return (
                                            <TableCell key={src.stock_id} className={`text-center p-1 border-l min-w-[68px] ${expiryRefused && assignedQty > 0 ? 'bg-amber-50/40' : ''}`}>
                                              {isEditing ? (
                                                <div className="flex items-center gap-0.5 justify-center">
                                                  <Input
                                                    type="number"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    className="h-7 w-14 text-xs text-center font-mono border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-sm"
                                                    autoFocus
                                                    min={0}
                                                    onKeyDown={e => {
                                                      if (e.key === 'Enter') saveEdit()
                                                      if (e.key === 'Escape') cancelEdit()
                                                    }}
                                                  />
                                                  <button type="button" onClick={saveEdit} className="p-0.5 hover:text-green-600"><Check className="h-3 w-3" /></button>
                                                  <button type="button" onClick={cancelEdit} className="p-0.5 hover:text-red-600"><X className="h-3 w-3" /></button>
                                                </div>
                                              ) : (
                                                <button
                                                  type="button"
                                                  className={`w-14 mx-auto text-center py-1 rounded-md transition-all duration-150 group ${
                                                    assignedQty > 0
                                                      ? 'bg-blue-50 border border-blue-400 shadow-sm hover:border-blue-500 hover:shadow-md'
                                                      : `bg-white border border-dashed border-gray-300 ${isProcessLocked ? 'cursor-default' : 'hover:border-blue-400 hover:bg-blue-50/40 hover:border-solid hover:shadow-sm cursor-pointer'}`
                                                  } ${isProcessLocked ? 'cursor-default' : 'cursor-pointer'}`}
                                                  onClick={() => !isProcessLocked && startEdit(demand.productId, cust.id, src.stock_id, assignedQty)}
                                                  disabled={isProcessLocked}
                                                >
                                                  {assignedQty > 0 ? (
                                                    <span className={`font-mono text-xs font-bold tabular-nums ${
                                                      assignedQty > src.quantity ? 'text-red-600' :
                                                      'text-blue-700'
                                                    }`}>
                                                      {assignedQty.toLocaleString('fr-FR')}
                                                    </span>
                                                  ) : (
                                                    <span className="text-gray-400 text-xs group-hover:text-blue-400 transition-colors">&mdash;</span>
                                                  )}
                                                  {!isProcessLocked && assignedQty === 0 && (
                                                    <Pencil className="h-2.5 w-2.5 mx-auto text-gray-300 opacity-0 group-hover:opacity-100 group-hover:text-blue-400 transition-all" />
                                                  )}
                                                </button>
                                              )}
                                            </TableCell>
                                          )
                                        })
                                      })}

                                      {/* Attr. */}
                                      <TableCell className="text-center tabular-nums font-bold text-[13px] border-l-2 border-l-border text-blue-700 py-1.5">
                                        {custAttributed.toLocaleString('fr-FR')}
                                      </TableCell>
                                      {/* Reste */}
                                      <TableCell className="text-center tabular-nums font-bold text-[13px] py-1.5">
                                        <span className={custRemaining > cust.quantity * 0.5 ? 'text-red-600' : custRemaining > 0 ? 'text-amber-600' : 'text-green-600'}>
                                          {custRemaining > 0 ? custRemaining.toLocaleString('fr-FR') : custRemaining === 0 ? '0' : `+${Math.abs(custRemaining).toLocaleString('fr-FR')}`}
                                        </span>
                                      </TableCell>
                                      {/* ✓ validate */}
                                      <TableCell className="text-center">
                                        <button
                                          type="button"
                                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs transition-all ${
                                            isFull ? 'border-green-500 bg-green-500 text-white' : 'border-border bg-white hover:border-green-400 hover:bg-green-50 hover:text-green-600 text-transparent'
                                          }`}
                                          title={isFull ? 'Complet' : 'Non complet'}
                                        >✓</button>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                                {/* ═══ FOOTER ROW ═══ */}
                                <TableRow className="border-t-2 border-t-border bg-muted/50">
                                  <TableCell className="sticky left-0 bg-muted/50 z-10 text-[10px] uppercase tracking-wider font-bold text-muted-foreground border-r-2 border-r-border" colSpan={5}>
                                    Total / dispo
                                  </TableCell>
                                  {groupedLots.map(gl =>
                                    gl.sources.map(src => {
                                      const srcUsed = Object.values(allocMap).reduce((sum, custMap) =>
                                        sum + Object.values(custMap).reduce((s2, stockMap) => s2 + (stockMap[src.stock_id] ?? 0), 0), 0)
                                      return (
                                        <TableCell key={`footer-${src.stock_id}`} className="text-center font-mono text-[11px] font-bold border-l py-2">
                                          <span className={srcUsed > src.quantity ? 'text-red-600' : srcUsed === src.quantity ? 'text-green-700' : 'text-muted-foreground'}>
                                            {srcUsed}
                                          </span>
                                          <span className="text-muted-foreground/50">/{src.quantity}</span>
                                        </TableCell>
                                      )
                                    })
                                  )}
                                  {(() => {
                                    const totalAttr = demand.customers.reduce((s, c) => s + getCustomerAttributed(demand.productId, c.id), 0)
                                    const totalReste = demand.totalQuantity - totalAttr
                                    return (
                                      <>
                                        <TableCell className="text-center font-bold text-[14px] text-blue-700 border-l-2 border-l-border py-2">
                                          {totalAttr.toLocaleString('fr-FR')}
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-[14px] py-2">
                                          <span className={totalReste > 0 ? 'text-red-600' : 'text-green-600'}>
                                            {totalReste.toLocaleString('fr-FR')}
                                          </span>
                                        </TableCell>
                                      </>
                                    )
                                  })()}
                                  <TableCell />
                                </TableRow>
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
                    variant="outline"
                    onClick={onNext}
                    className="gap-2"
                  >
                    Passer <ArrowRight className="h-4 w-4" />
                  </Button>
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
      {phase === 'done' && (() => {
        const noMatchLogs = allocationLogs.filter(l => l.reason === 'no_match')
        const totalAllocated = allocateMut.data?.count ?? 0
        const allUnmatched = totalAllocated === 0 && noMatchLogs.length > 0

        return (
          <div className="py-8 text-center space-y-4">
            {allUnmatched ? (
              <>
                <div className="h-16 w-16 rounded-2xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center mx-auto">
                  <AlertTriangle className="h-8 w-8 text-amber-600" />
                </div>
                <div>
                  <p className="text-xl font-semibold">Aucune allocation possible</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Les produits commandes ne correspondent a aucun stock ni quota disponible.
                    <br />Verifiez que les fichiers de stock et de commande/nego contiennent les memes CIP13.
                  </p>
                </div>
                <Card className="border-amber-200/60 bg-amber-50/30 max-w-lg mx-auto">
                  <CardContent className="p-4 text-left">
                    <p className="text-sm font-medium text-amber-800 mb-2">{noMatchLogs.length} commande(s) sans correspondance :</p>
                    <ul className="text-xs text-amber-700 space-y-1 max-h-40 overflow-y-auto">
                      {noMatchLogs.slice(0, 20).map((l, i) => (
                        <li key={i}>
                          <span className="font-mono">{l.productCip13}</span> — {l.productName} ({l.customerName}, {l.requested} u.)
                        </li>
                      ))}
                      {noMatchLogs.length > 20 && (
                        <li className="text-amber-500">... et {noMatchLogs.length - 20} autre(s)</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <div className="h-16 w-16 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <p className="text-xl font-semibold">Allocation terminee</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {totalAllocated} allocations generees avec la strategie "{STRATEGIES.find(s => s.value === strategy)?.label ?? strategy}".
                  </p>
                </div>
                {noMatchLogs.length > 0 && (
                  <Card className="border-amber-200/60 bg-amber-50/30 max-w-lg mx-auto">
                    <CardContent className="p-4 text-left">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">
                            {noMatchLogs.length} commande(s) non allouee(s) — aucun stock/quota correspondant
                          </p>
                          <ul className="text-xs text-amber-700 mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                            {noMatchLogs.slice(0, 10).map((l, i) => (
                              <li key={i}>
                                <span className="font-mono">{l.productCip13}</span> — {l.productName} ({l.customerName}, {l.requested} u.)
                              </li>
                            ))}
                            {noMatchLogs.length > 10 && (
                              <li className="text-amber-500">... et {noMatchLogs.length - 10} autre(s)</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
            <Button onClick={onNext} size="lg" className="gap-2">
              Voir les resultats <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )
      })()}
    </div>
  )
}
