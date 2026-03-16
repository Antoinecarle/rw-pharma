import { useState, useMemo, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { runAllocation, computeStats, type AllocationStrategy, type AllocationLog, type DryRunStats, type AllocationV3Config, type CustomerWholesalerMap, DEFAULT_V3_CONFIG } from '@/lib/allocation-engine'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import GaugeChart from '@/components/ui/gauge-chart'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import {
  Cpu, ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, Truck, Zap,
  Users, BarChart3, Eye, Settings2, Boxes, ShieldCheck, Play, ChevronRight,
  Package, Warehouse, Calendar, Pencil, Check, X, RotateCcw, AlertCircle,
  SlidersHorizontal, Shield, Clock, Hash, DollarSign, Percent,
} from 'lucide-react'
import AllocationVisualizer from '@/components/allocations/AllocationVisualizer'
import { toast } from 'sonner'
import { createNotification } from '@/lib/notifications'
import type { MonthlyProcess } from '@/types/database'

// ── Types ──────────────────────────────────────────────────────────

const STRATEGIES: { value: AllocationStrategy; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'balanced', label: 'Equilibree', description: 'Repartir entre grossistes + round-robin clients', icon: BarChart3 },
  { value: 'top_clients', label: 'Priorite top clients', description: 'Servir les clients prioritaires en premier', icon: Users },
  { value: 'max_coverage', label: 'Max couverture', description: 'Petites commandes en premier pour couvrir plus', icon: Zap },
]

const STEP_LABELS = ['Configurer', 'Attribuer', 'Simuler', 'Lancer'] as const

const SMALL_LOT_THRESHOLD = 50
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

interface OrderDemand {
  productId: string
  cip13: string
  productName: string
  totalQuantity: number
  customers: { id: string; code: string; name: string; quantity: number }[]
}

// lot_attributions: { [productId]: { [customerId]: { [lotId]: quantity } } }
type LotAttrMap = Record<string, Record<string, Record<string, number>>>

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
  const [internalStep, setInternalStep] = useState<1 | 2 | 3 | 4>(1)
  const [phase, setPhase] = useState<'config' | 'running' | 'done'>('config')
  const [strategy, setStrategy] = useState<AllocationStrategy>('balanced')
  const [excludedWholesalers, setExcludedWholesalers] = useState<Set<string>>(new Set())
  const [dryRunResult, setDryRunResult] = useState<DryRunStats | null>(null)
  const [allocationLogs, setAllocationLogs] = useState<AllocationLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [showVisualizer, setShowVisualizer] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Lot attribution state
  const [lotAttrMap, setLotAttrMap] = useState<LotAttrMap>({})
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ productId: string; customerId: string; lotId: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // V3 config state
  const [v3Enabled, setV3Enabled] = useState(false)
  const [v3Config, setV3Config] = useState<AllocationV3Config>({ ...DEFAULT_V3_CONFIG })

  const updateV3 = (partial: Partial<AllocationV3Config>) => {
    setV3Config(prev => ({ ...prev, ...partial }))
    setDryRunResult(null)
  }

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
    queryKey: ['orders', process.id, 'allocation-visual'],
    queryFn: async () => {
      const all: any[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, product_id, customer_id, quantity, customer:customers(id, name, code), product:products(id, cip13, name)')
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
    queryKey: ['collected_stock', process.id, 'visual'],
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

  const { data: wholesalers } = useQuery({
    queryKey: ['wholesalers', 'all'],
    queryFn: async () => {
      const { data } = await supabase.from('wholesalers').select('id, name, code')
      return data ?? []
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

  // ── Derived Data ──────────────────────────────────────────────────

  const demands = useMemo(() => {
    if (!orders) return []
    const map = new Map<string, OrderDemand>()
    for (const o of orders) {
      const prod = o.product as any
      const cust = o.customer as any
      const existing = map.get(o.product_id)
      if (existing) {
        existing.totalQuantity += o.quantity
        const custEntry = existing.customers.find((c: any) => c.id === o.customer_id)
        if (custEntry) custEntry.quantity += o.quantity
        else existing.customers.push({ id: o.customer_id, code: cust?.code ?? '?', name: cust?.name ?? '?', quantity: o.quantity })
      } else {
        map.set(o.product_id, {
          productId: o.product_id,
          cip13: prod?.cip13 ?? '?',
          productName: prod?.name ?? '?',
          totalQuantity: o.quantity,
          customers: [{ id: o.customer_id, code: cust?.code ?? '?', name: cust?.name ?? '?', quantity: o.quantity }],
        })
      }
    }
    return [...map.values()].sort((a, b) => b.totalQuantity - a.totalQuantity)
  }, [orders])

  const filteredDemands = useMemo(() => {
    if (!selectedCustomerId) return demands
    return demands
      .map(d => {
        const custOrders = d.customers.filter(c => c.id === selectedCustomerId)
        if (custOrders.length === 0) return null
        return { ...d, totalQuantity: custOrders.reduce((s, c) => s + c.quantity, 0), customers: custOrders }
      })
      .filter(Boolean) as OrderDemand[]
  }, [demands, selectedCustomerId])

  const customers = useMemo(() => {
    if (!orders) return []
    const map = new Map<string, { id: string; code: string; name: string; totalQty: number }>()
    for (const o of orders) {
      const cust = o.customer as any
      const existing = map.get(o.customer_id)
      if (existing) existing.totalQty += o.quantity
      else map.set(o.customer_id, { id: o.customer_id, code: cust?.code ?? '?', name: cust?.name ?? '?', totalQty: o.quantity })
    }
    return [...map.values()].sort((a, b) => b.totalQty - a.totalQty)
  }, [orders])

  // Lots grouped by product
  const lotsByProduct = useMemo(() => {
    if (!stockLots) return new Map<string, StockLot[]>()
    const map = new Map<string, StockLot[]>()
    for (const lot of stockLots) {
      if (excludedWholesalers.has(lot.wholesaler_id)) continue
      const list = map.get(lot.product_id) ?? []
      list.push(lot)
      map.set(lot.product_id, list)
    }
    return map
  }, [stockLots, excludedWholesalers])

  // Stats
  const orderCount = orderStats?.length ?? 0
  const pendingOrders = orderStats?.filter(o => o.status === 'validated' || o.status === 'pending') ?? []
  const allocatableCount = pendingOrders.length
  const uniqueProducts = new Set(orderStats?.map(o => o.product_id)).size
  const activeWholesalers = (wholesalers?.length ?? 0) - excludedWholesalers.size
  const stockCount = stockLots?.length ?? 0

  // Attribution stats
  const totalDemand = demands.reduce((s, d) => s + d.totalQuantity, 0)
  const totalAttributed = useMemo(() => {
    let sum = 0
    for (const product of Object.values(lotAttrMap)) {
      for (const customer of Object.values(product)) {
        for (const qty of Object.values(customer)) {
          sum += qty
        }
      }
    }
    return sum
  }, [lotAttrMap])
  const coverageRate = totalDemand > 0 ? (totalAttributed / totalDemand) * 100 : 0

  const fulfillmentNum = dryRunResult ? parseFloat(dryRunResult.fulfillmentRate) : 0
  const fulfillmentColor = fulfillmentNum >= 90 ? 'text-green-600' : fulfillmentNum >= 70 ? 'text-amber-600' : 'text-red-600'
  const selectedStrategyLabel = STRATEGIES.find(s => s.value === strategy)?.label ?? strategy

  // ── Lot Attribution Logic ─────────────────────────────────────────

  // Get how much of a lot is already assigned across all customers
  const getLotUsed = useCallback((lotId: string) => {
    let used = 0
    for (const product of Object.values(lotAttrMap)) {
      for (const customer of Object.values(product)) {
        used += customer[lotId] ?? 0
      }
    }
    return used
  }, [lotAttrMap])

  // Get how much is attributed to a specific customer for a product
  const getCustomerAttributed = useCallback((productId: string, customerId: string) => {
    const product = lotAttrMap[productId]
    if (!product) return 0
    const customer = product[customerId]
    if (!customer) return 0
    return Object.values(customer).reduce((s, q) => s + q, 0)
  }, [lotAttrMap])

  // Auto-attribute: FEFO logic — assign lots to customers proportionally
  const autoAttribute = useCallback(() => {
    const newMap: LotAttrMap = {}

    for (const demand of demands) {
      const lots = lotsByProduct.get(demand.productId) ?? []
      if (lots.length === 0) continue

      newMap[demand.productId] = {}

      // Sort customers by demand desc (biggest first)
      const sortedCustomers = [...demand.customers].sort((a, b) => b.quantity - a.quantity)

      // Track lot remaining
      const lotRemaining = new Map<string, number>()
      for (const lot of lots) {
        lotRemaining.set(lot.id, lot.quantity)
      }

      for (const cust of sortedCustomers) {
        newMap[demand.productId][cust.id] = {}
        let remaining = cust.quantity

        // FEFO: lots already sorted by expiry_date
        for (const lot of lots) {
          if (remaining <= 0) break
          const lotRem = lotRemaining.get(lot.id) ?? 0
          if (lotRem <= 0) continue

          const assign = Math.min(remaining, lotRem)
          newMap[demand.productId][cust.id][lot.id] = assign
          lotRemaining.set(lot.id, lotRem - assign)
          remaining -= assign
        }
      }
    }

    setLotAttrMap(newMap)
    toast.success('Attribution FEFO automatique effectuee')
  }, [demands, lotsByProduct])

  const resetAttribution = () => {
    setLotAttrMap({})
    toast.info('Attribution reinitialise')
  }

  // Edit cell
  const startEdit = (productId: string, customerId: string, lotId: string, currentValue: number) => {
    if (isProcessLocked) return
    setEditingCell({ productId, customerId, lotId })
    setEditValue(String(currentValue))
  }

  const saveEdit = () => {
    if (!editingCell) return
    const val = parseInt(editValue, 10)
    if (isNaN(val) || val < 0) { toast.error('Valeur invalide'); return }

    const { productId, customerId, lotId } = editingCell
    // Check lot capacity
    const lot = stockLots?.find(l => l.id === lotId)
    if (lot) {
      const currentAssigned = lotAttrMap[productId]?.[customerId]?.[lotId] ?? 0
      const otherUsed = getLotUsed(lotId) - currentAssigned
      if (val + otherUsed > lot.quantity) {
        toast.error(`Capacite lot depassee (${lot.quantity} dispo, ${otherUsed} deja attribues)`)
        return
      }
    }

    setLotAttrMap(prev => {
      const next = { ...prev }
      if (!next[productId]) next[productId] = {}
      if (!next[productId][customerId]) next[productId][customerId] = {}

      if (val === 0) {
        delete next[productId][customerId][lotId]
        if (Object.keys(next[productId][customerId]).length === 0) delete next[productId][customerId]
        if (Object.keys(next[productId]).length === 0) delete next[productId]
      } else {
        next[productId] = { ...next[productId] }
        next[productId][customerId] = { ...next[productId][customerId], [lotId]: val }
      }
      return next
    })
    setEditingCell(null)
  }

  const cancelEdit = () => setEditingCell(null)

  // ── Wholesaler Toggle ─────────────────────────────────────────────

  const toggleWholesaler = (id: string) => {
    setExcludedWholesalers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setDryRunResult(null)
  }

  // ── Allocation Mutations ──────────────────────────────────────────

  const dryRunMut = useMutation({
    mutationFn: async () => {
      const { allocations, logs } = await runAllocation(
        process.id, process.month, process.year, strategy, excludedWholesalers, true,
      )
      setAllocationLogs(logs)
      return computeStats(allocations, logs, wholesalers ?? [])
    },
    onSuccess: (result) => {
      setDryRunResult(result)
      toast.success('Simulation terminee')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const allocateMut = useMutation({
    mutationFn: async () => {
      if (isProcessLocked) {
        throw new Error('Ce processus est deja termine. Impossible de relancer l\'allocation.')
      }
      setPhase('running')
      setShowLogs(true)

      const { allocations, logs } = await runAllocation(
        process.id, process.month, process.year, strategy, excludedWholesalers, false,
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
      setPhase('config')
      toast.error(err.message)
    },
  })

  // ── Stepper ───────────────────────────────────────────────────────

  const StepperHeader = () => (
    <div className="flex items-center gap-1 sm:gap-2">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3 | 4
        const isActive = internalStep === stepNum
        const isDone = internalStep > stepNum
        return (
          <div key={label} className="flex items-center gap-1 sm:gap-2">
            {idx > 0 && (
              <ChevronRight className={`h-4 w-4 shrink-0 ${isDone ? 'text-primary' : 'text-muted-foreground/40'}`} />
            )}
            <button
              type="button"
              onClick={() => { if (isDone) setInternalStep(stepNum) }}
              disabled={!isDone}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isDone
                    ? 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer'
                    : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              <span className={`flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold ${
                isActive ? 'bg-primary-foreground/20' : isDone ? 'bg-primary/20' : 'bg-muted-foreground/20'
              }`}>
                {isDone ? '✓' : stepNum}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )

  const ConfigSummary = () => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>{orderCount} commandes</span>
      <span className="text-muted-foreground/40">&middot;</span>
      <span>{activeWholesalers} grossistes</span>
      <span className="text-muted-foreground/40">&middot;</span>
      <span>{uniqueProducts} produits</span>
      {stockCount > 0 && (
        <>
          <span className="text-muted-foreground/40">&middot;</span>
          <span>{stockCount} lots</span>
        </>
      )}
    </div>
  )

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

      {/* ═══ Config phase: 4-step wizard ═══ */}
      {phase === 'config' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <StepperHeader />
          </div>

          {/* ═══ Step 1: Configurer ═══ */}
          {internalStep === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">Configuration de l'allocation</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Choisissez la methode de repartition et les sources d'approvisionnement.
                </p>
              </div>

              {/* Strategy selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Methode de repartition</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {STRATEGIES.map((s) => {
                    const isSelected = strategy === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => { setStrategy(s.value); setDryRunResult(null) }}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/30 hover:bg-muted/30'
                        }`}
                      >
                        <s.icon className={`h-5 w-5 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <p className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Wholesaler selection */}
              {wholesalers && wholesalers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" /> Sources d'approvisionnement
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {wholesalers.map((w) => {
                      const excluded = excludedWholesalers.has(w.id)
                      return (
                        <label
                          key={w.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                            excluded ? 'border-muted bg-muted/30 opacity-50' : 'border-border hover:border-primary/30'
                          }`}
                        >
                          <Checkbox
                            checked={!excluded}
                            onCheckedChange={() => toggleWholesaler(w.id)}
                          />
                          <span className="text-sm font-medium">{w.code ?? w.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Engine features */}
              <div className="flex flex-wrap gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1 text-xs">
                      <ShieldCheck className="h-3 w-3" /> Dispos strictes
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>L'algorithme respecte les disponibilites grossistes et ne depasse jamais les limites</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className={`gap-1 text-xs ${stockCount > 0 ? 'border-green-200 text-green-700' : ''}`}>
                      <Boxes className="h-3 w-3" /> FEFO {stockCount > 0 ? 'actif' : 'aucun lot'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>First Expiry First Out — les lots proches de l'expiration sont alloues en priorite</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Users className="h-3 w-3" /> Priorite multi-niveaux
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Scoring base sur is_top_client + priority_level (1-5) + max_allocation_pct</TooltipContent>
                </Tooltip>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <ConfigSummary />
                <Button onClick={() => setInternalStep(2)} className="gap-2">
                  Suivant : Attribuer <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Step 2: Attribuer (NEW — split-pane visual) ═══ */}
          {internalStep === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Attribution Commandes ↔ Lots</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Attribuez les lots de stock aux commandes clients. L'auto-attribution utilise la logique FEFO.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInternalStep(1)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Configuration
                </button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : (
                <>
                  {/* Client navigation */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Filtrer par client</h4>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setSelectedCustomerId(null)}>
                        <Badge
                          variant={selectedCustomerId === null ? 'default' : 'outline'}
                          className={`py-1.5 px-3 cursor-pointer transition-all ${selectedCustomerId === null ? 'ring-2 ring-primary/30' : 'hover:bg-muted'}`}
                        >
                          <Users className="h-3 w-3 mr-1" /> Tous ({customers.length})
                        </Badge>
                      </button>
                      {customers.map(c => (
                        <button key={c.id} type="button" onClick={() => setSelectedCustomerId(selectedCustomerId === c.id ? null : c.id)}>
                          <Badge
                            variant={selectedCustomerId === c.id ? 'default' : 'outline'}
                            className={`py-1.5 px-3 cursor-pointer transition-all ${selectedCustomerId === c.id ? 'ring-2 ring-primary/30' : 'hover:bg-muted'}`}
                          >
                            <span className="font-bold">{c.code}</span>
                            <span className="ml-1 text-xs opacity-70">{c.totalQty.toLocaleString('fr-FR')} u.</span>
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* KPI cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <Package className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xl font-bold">{filteredDemands.length}</p>
                        <p className="text-[10px] text-muted-foreground">Produits</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <Boxes className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xl font-bold">{stockCount}</p>
                        <p className="text-[10px] text-muted-foreground">Lots disponibles</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-xl font-bold">{totalAttributed.toLocaleString('fr-FR')}</p>
                        <p className="text-[10px] text-muted-foreground">Unites attribuees</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-2 flex flex-col items-center">
                        <GaugeChart value={coverageRate} size={80} strokeWidth={7} label="Couverture" />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Action buttons */}
                  {!isProcessLocked && (
                    <div className="flex gap-2">
                      <Button onClick={autoAttribute} className="gap-1.5" variant="default" disabled={stockCount === 0}>
                        <Zap className="h-4 w-4" /> Auto-attribution FEFO
                      </Button>
                      {Object.keys(lotAttrMap).length > 0 && (
                        <Button onClick={resetAttribution} variant="outline" className="gap-1.5">
                          <RotateCcw className="h-4 w-4" /> Reinitialiser
                        </Button>
                      )}
                    </div>
                  )}

                  {/* No stock warning */}
                  {stockCount === 0 && (
                    <Card className="border-amber-200 bg-amber-50/30">
                      <CardContent className="p-4 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">Aucun lot de stock disponible</p>
                          <p className="text-xs text-muted-foreground">L'allocation se fera uniquement par disponibilites grossistes. Vous pouvez passer cette etape.</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* ── Split-pane: Product rows with lot columns ── */}
                  {filteredDemands.length > 0 && stockCount > 0 && (
                    <div className="space-y-4">
                      {filteredDemands.map(demand => {
                        const lots = lotsByProduct.get(demand.productId) ?? []
                        if (lots.length === 0) return null

                        // Group lots by wholesaler
                        const lotsByWholesaler = new Map<string, StockLot[]>()
                        for (const lot of lots) {
                          const list = lotsByWholesaler.get(lot.wholesaler_id) ?? []
                          list.push(lot)
                          lotsByWholesaler.set(lot.wholesaler_id, list)
                        }

                        const allCustomersForProduct = selectedCustomerId
                          ? demand.customers.filter(c => c.id === selectedCustomerId)
                          : demand.customers

                        return (
                          <Card key={demand.productId} className="overflow-hidden">
                            {/* Product header */}
                            <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="font-mono text-xs">{demand.cip13}</Badge>
                                <span className="text-sm font-semibold truncate max-w-[300px]">{demand.productName}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>Demande: <strong className="text-foreground">{demand.totalQuantity.toLocaleString('fr-FR')}</strong></span>
                                <span className="text-muted-foreground/40">|</span>
                                <span>{lots.length} lot{lots.length > 1 ? 's' : ''}</span>
                              </div>
                            </div>

                            <CardContent className="p-0">
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="min-w-[80px] sticky left-0 bg-background z-10">Client</TableHead>
                                      <TableHead className="text-right min-w-[70px]">Demande</TableHead>
                                      {/* One column per lot, grouped by wholesaler */}
                                      {[...lotsByWholesaler.entries()].map(([, wsLots]) => (
                                        wsLots.map(lot => {
                                          const months = monthsUntilExpiry(lot.expiry_date)
                                          const isShortExpiry = months <= SHORT_EXPIRY_MONTHS
                                          const isSmallLot = lot.quantity < SMALL_LOT_THRESHOLD
                                          const lotUsed = getLotUsed(lot.id)
                                          const lotRemaining = lot.quantity - lotUsed

                                          return (
                                            <TableHead key={lot.id} className="text-center min-w-[110px] px-2">
                                              <div className="space-y-0.5">
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <span className="font-bold text-xs cursor-help">{lot.wholesaler_code}</span>
                                                  </TooltipTrigger>
                                                  <TooltipContent>{lot.wholesaler_name}</TooltipContent>
                                                </Tooltip>
                                                <div className="text-[10px] font-mono text-muted-foreground">{lot.lot_number.slice(0, 12)}</div>
                                                <div className="flex items-center justify-center gap-1">
                                                  <span className={`text-[10px] ${isShortExpiry ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                                    <Calendar className="h-2.5 w-2.5 inline mr-0.5" />
                                                    {formatExpiry(lot.expiry_date)}
                                                  </span>
                                                </div>
                                                <div className="flex items-center justify-center gap-1">
                                                  <span className={`text-[10px] font-medium ${lotRemaining <= 0 ? 'text-red-600' : lotRemaining < lot.quantity * 0.2 ? 'text-amber-600' : 'text-green-600'}`}>
                                                    {lotRemaining}/{lot.quantity}
                                                  </span>
                                                  {isSmallLot && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <span><AlertCircle className="h-3 w-3 text-amber-500" /></span>
                                                      </TooltipTrigger>
                                                      <TooltipContent>Petit lot (&lt;{SMALL_LOT_THRESHOLD})</TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                  {isShortExpiry && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <span><Calendar className="h-3 w-3 text-red-500" /></span>
                                                      </TooltipTrigger>
                                                      <TooltipContent>Expiration &lt;{SHORT_EXPIRY_MONTHS} mois ({months} mois)</TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                </div>
                                              </div>
                                            </TableHead>
                                          )
                                        })
                                      ))}
                                      <TableHead className="text-right min-w-[80px]">Attribue</TableHead>
                                      <TableHead className="text-right min-w-[60px]">Reste</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {allCustomersForProduct.map(cust => {
                                      const custAttributed = getCustomerAttributed(demand.productId, cust.id)
                                      const custRemaining = cust.quantity - custAttributed
                                      const isFull = custRemaining <= 0

                                      return (
                                        <TableRow key={cust.id} className={isFull ? '' : 'bg-amber-50/20 dark:bg-amber-950/10'}>
                                          <TableCell className="sticky left-0 bg-background z-10">
                                            <Badge variant="outline" className="text-xs font-bold">{cust.code}</Badge>
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums font-semibold text-sm">
                                            {cust.quantity.toLocaleString('fr-FR')}
                                          </TableCell>

                                          {/* Lot cells */}
                                          {[...lotsByWholesaler.entries()].map(([, wsLots]) => (
                                            wsLots.map(lot => {
                                              const assignedQty = lotAttrMap[demand.productId]?.[cust.id]?.[lot.id] ?? 0
                                              const isEditing = editingCell?.productId === demand.productId
                                                && editingCell?.customerId === cust.id
                                                && editingCell?.lotId === lot.id
                                              const lotUsed = getLotUsed(lot.id)
                                              const lotRemaining = lot.quantity - lotUsed

                                              return (
                                                <TableCell key={lot.id} className="text-center p-1">
                                                  {isEditing ? (
                                                    <div className="flex items-center gap-0.5 justify-center">
                                                      <Input
                                                        type="number"
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        className="h-7 w-16 text-xs text-center"
                                                        autoFocus
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
                                                      className={`w-full text-center py-1 rounded transition-colors group ${
                                                        isProcessLocked ? 'cursor-default' : 'hover:bg-primary/5 cursor-pointer'
                                                      }`}
                                                      onClick={() => !isProcessLocked && startEdit(demand.productId, cust.id, lot.id, assignedQty)}
                                                      disabled={isProcessLocked}
                                                    >
                                                      <div className="tabular-nums text-sm font-medium">
                                                        {assignedQty > 0 ? (
                                                          <span className={assignedQty > lotRemaining + assignedQty ? 'text-red-600' : 'text-green-700 dark:text-green-400'}>
                                                            {assignedQty.toLocaleString('fr-FR')}
                                                          </span>
                                                        ) : (
                                                          <span className="text-muted-foreground/30">—</span>
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
                                          ))}

                                          <TableCell className="text-right tabular-nums font-medium text-sm">
                                            <span className={isFull ? 'text-green-600' : 'text-amber-600'}>
                                              {custAttributed.toLocaleString('fr-FR')}
                                            </span>
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums text-sm">
                                            {custRemaining > 0 ? (
                                              <span className="text-red-500 font-medium">{custRemaining.toLocaleString('fr-FR')}</span>
                                            ) : custRemaining === 0 ? (
                                              <Check className="h-4 w-4 text-green-600 mx-auto" />
                                            ) : (
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <span className="text-blue-500 font-medium">+{Math.abs(custRemaining).toLocaleString('fr-FR')}</span>
                                                </TooltipTrigger>
                                                <TooltipContent>Sur-attribution</TooltipContent>
                                              </Tooltip>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}

                      {/* Products without lots */}
                      {(() => {
                        const noLotProducts = filteredDemands.filter(d => (lotsByProduct.get(d.productId) ?? []).length === 0)
                        if (noLotProducts.length === 0) return null
                        return (
                          <Card className="border-muted">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Warehouse className="h-4 w-4 text-muted-foreground" />
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
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-muted-foreground">
                      {totalAttributed > 0 && (
                        <span>{totalAttributed.toLocaleString('fr-FR')} unites attribuees via lots ({Math.round(coverageRate)}%)</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {stockCount === 0 && (
                        <Button variant="outline" onClick={() => setInternalStep(3)} className="gap-1.5">
                          Passer <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                      <Button onClick={() => setInternalStep(3)} className="gap-2">
                        Suivant : Simuler <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ Step 3: Simuler ═══ */}
          {internalStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Simulation</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">{selectedStrategyLabel}</Badge>
                    <span className="text-sm text-muted-foreground">{activeWholesalers} grossistes</span>
                    {totalAttributed > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Boxes className="h-3 w-3" /> {totalAttributed.toLocaleString('fr-FR')} pre-attribues
                      </Badge>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInternalStep(2)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Modifier l'attribution
                </button>
              </div>

              {/* Simulate button */}
              <Card className="ivory-card-highlight">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Lancez la simulation pour previsualiser les resultats</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Aucune donnee ne sera modifiee</p>
                    </div>
                    <Button
                      onClick={() => dryRunMut.mutate()}
                      disabled={dryRunMut.isPending || allocatableCount === 0 || isProcessLocked}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      {dryRunMut.isPending ? 'Simulation...' : 'Lancer la simulation'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Dry run results */}
              {dryRunResult && (
                <Card className="ivory-card-highlight">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">Resultat de la simulation</h4>
                      {dryRunResult.lotAllocations > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-auto gap-1">
                          <Boxes className="h-3 w-3" /> {dryRunResult.lotAllocations} lots alloues
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="text-center">
                        <p className="text-xl font-bold">{dryRunResult.totalAllocations}</p>
                        <p className="text-xs text-muted-foreground">Allocations</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-xl font-bold ${fulfillmentColor}`}>{dryRunResult.fulfillmentRate}%</p>
                        <p className="text-xs text-muted-foreground">Couverture</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">{dryRunResult.totalAllocated.toLocaleString('fr-FR')}</p>
                        <p className="text-xs text-muted-foreground">Unites allouees</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-xl font-bold ${dryRunResult.zeroProducts > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {dryRunResult.zeroProducts}
                        </p>
                        <p className="text-xs text-muted-foreground">Produits a 0%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-violet-600">{dryRunResult.lotAllocations}</p>
                        <p className="text-xs text-muted-foreground">Via lots</p>
                      </div>
                    </div>

                    <div>
                      <Progress value={Math.min(fulfillmentNum, 100)} className="h-2" />
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{dryRunResult.totalAllocated.toLocaleString('fr-FR')} allouees</span>
                        <span>{dryRunResult.totalRequested.toLocaleString('fr-FR')} demandees</span>
                      </div>
                    </div>

                    {/* Quota utilization */}
                    {dryRunResult.quotaUtilization.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Utilisation des disponibilites</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dryRunResult.quotaUtilization.map(q => {
                            const pct = q.total > 0 ? Math.round((q.used / q.total) * 100) : 0
                            return (
                              <Badge key={q.wholesalerCode} variant="outline" className={`text-xs gap-1 ${pct > 90 ? 'border-red-200 text-red-700' : pct > 70 ? 'border-amber-200 text-amber-700' : ''}`}>
                                <span className="font-bold">{q.wholesalerCode}</span>
                                {pct}% ({q.used}/{q.total})
                              </Badge>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Breakdowns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Par grossiste</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dryRunResult.byWholesaler.map(w => (
                            <Badge key={w.code} variant="outline" className="text-xs gap-1">
                              <span className="font-bold">{w.code}</span>
                              {w.qty.toLocaleString('fr-FR')} u.
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Par client (priorite)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dryRunResult.byCustomer.map(c => (
                            <Tooltip key={c.code}>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs gap-1 cursor-help">
                                  <span className="font-bold">{c.code}</span>
                                  {c.qty.toLocaleString('fr-FR')} u.
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Score priorite: {c.priority}</TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Visualizer */}
              {dryRunResult && allocationLogs.length > 0 && !showVisualizer && (
                <Button variant="outline" onClick={() => setShowVisualizer(true)} className="gap-2">
                  <Play className="h-4 w-4" />
                  Visualiser l'execution ({allocationLogs.length} etapes)
                </Button>
              )}

              {showVisualizer && allocationLogs.length > 0 && (
                <AllocationVisualizer logs={allocationLogs} onClose={() => setShowVisualizer(false)} />
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setInternalStep(4)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Passer directement au lancement
                </button>
                <Button
                  onClick={() => setInternalStep(4)}
                  disabled={!dryRunResult}
                  className="gap-2"
                >
                  Valider et continuer <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Step 4: Lancer ═══ */}
          {internalStep === 4 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Lancement de l'allocation</h3>
                  {dryRunResult && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-sm text-green-600 font-medium">Simulation validee</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setInternalStep(3)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Retour a la simulation
                </button>
              </div>

              {/* Warning if no simulation */}
              {!dryRunResult && (
                <Card className="border-amber-200/60 bg-amber-50/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Vous n'avez pas simule — les resultats ne sont pas previsibles. <button type="button" onClick={() => setInternalStep(3)} className="underline font-medium hover:text-amber-900">Revenir a la simulation</button>
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Recap */}
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Recapitulatif</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Methode</p>
                      <p className="text-sm font-medium">{selectedStrategyLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Grossistes</p>
                      <p className="text-sm font-medium">{activeWholesalers} actifs</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Commandes</p>
                      <p className="text-sm font-medium">{orderCount} ({allocatableCount} a traiter)</p>
                    </div>
                    {dryRunResult && (
                      <div>
                        <p className="text-xs text-muted-foreground">Couverture estimee</p>
                        <p className={`text-sm font-medium ${fulfillmentColor}`}>{dryRunResult.fulfillmentRate}%</p>
                      </div>
                    )}
                  </div>
                  {totalAttributed > 0 && (
                    <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                      <Boxes className="h-4 w-4" />
                      <span>{totalAttributed.toLocaleString('fr-FR')} unites pre-attribuees via lots</span>
                    </div>
                  )}
                  {dryRunResult && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline" className="text-xs">{dryRunResult.totalAllocations} allocations prevues</Badge>
                      <Badge variant="outline" className="text-xs">{dryRunResult.totalAllocated.toLocaleString('fr-FR')} unites</Badge>
                      {dryRunResult.lotAllocations > 0 && (
                        <Badge variant="outline" className="text-xs">{dryRunResult.lotAllocations} via lots</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Launch CTA */}
              <Card className="ivory-card-highlight">
                <CardContent className="p-6 text-center space-y-4">
                  <Cpu className="h-12 w-12 mx-auto text-primary" />
                  <div>
                    <p className="font-semibold">
                      {dryRunResult ? 'Pret a lancer — simulation validee' : 'Lancer sans simulation'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Cette action generera les allocations et mettra a jour les commandes.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => allocateMut.mutate()}
                    disabled={allocatableCount === 0 || isProcessLocked || allocateMut.isPending}
                    className="gap-2"
                  >
                    <Cpu className="h-4 w-4" />
                    {isProcessLocked ? 'Processus termine' : allocateMut.isPending ? 'Allocation...' : 'Confirmer et lancer'}
                  </Button>
                </CardContent>
              </Card>
            </div>
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

          {showLogs && allocationLogs.length > 0 && (
            <Card className="max-h-48 overflow-hidden">
              <CardContent className="p-0">
                <div ref={logRef} className="overflow-y-auto max-h-48 p-3 space-y-0.5 font-mono text-[11px]">
                  {allocationLogs.slice(-30).map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.full ? 'text-green-600' : 'text-amber-600'}`}>
                      <span className="text-muted-foreground w-6 text-right shrink-0">{Math.max(0, allocationLogs.length - 30) + i + 1}</span>
                      <span>[{log.customer}]</span>
                      <span className="truncate flex-1">{log.product}...</span>
                      <span>→ {log.wholesaler}</span>
                      {log.lot && <span className="text-violet-500">L:{log.lot.slice(0, 6)}</span>}
                      <span className="tabular-nums">{log.allocated}/{log.requested}</span>
                      <span>{log.full ? '✓' : '⚠'}</span>
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
              {allocateMut.data} allocations generees avec la strategie "{selectedStrategyLabel}".
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            {allocationLogs.length > 0 && (
              <Button variant="outline" onClick={() => setShowVisualizer(v => !v)} className="gap-2">
                <Play className="h-4 w-4" />
                {showVisualizer ? 'Masquer' : 'Visualiser'}
              </Button>
            )}
            <Button onClick={onNext} size="lg" className="gap-2">
              Voir les resultats <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {showVisualizer && allocationLogs.length > 0 && (
            <AllocationVisualizer logs={allocationLogs} onClose={() => setShowVisualizer(false)} />
          )}
        </div>
      )}
    </div>
  )
}
