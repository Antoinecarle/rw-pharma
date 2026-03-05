import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Cpu, ArrowRight, CheckCircle, AlertTriangle, Package, Truck, Zap, Users, BarChart3, Eye, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess } from '@/types/database'

type AllocationStrategy = 'balanced' | 'top_clients' | 'max_coverage'

const STRATEGIES: { value: AllocationStrategy; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'balanced', label: 'Equilibree', description: 'Repartir proportionnellement entre les grossistes', icon: BarChart3 },
  { value: 'top_clients', label: 'Priorite top clients', description: 'Servir les clients prioritaires en premier', icon: Users },
  { value: 'max_coverage', label: 'Max couverture', description: 'Minimiser les produits a 0% de couverture', icon: Zap },
]

interface AllocationLog {
  customer: string
  product: string
  wholesaler: string
  requested: number
  allocated: number
  full: boolean
}

interface DryRunResult {
  totalAllocations: number
  totalRequested: number
  totalAllocated: number
  fulfillmentRate: string
  zeroProducts: number
  byWholesaler: { code: string; count: number; qty: number }[]
  byCustomer: { code: string; count: number; qty: number }[]
}

interface AllocationExecutionStepProps {
  process: MonthlyProcess
  onNext: () => void
}

// Core allocation logic shared by dry-run and real execution
async function runAllocationAlgorithm(
  processId: string,
  month: number,
  year: number,
  strategy: AllocationStrategy,
  excludedWholesalers: Set<string>,
) {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_id, product_id, quantity, customer:customers(id, code, is_top_client)')
    .eq('monthly_process_id', processId)
    .in('status', ['validated', 'pending'])

  const ordersList = orders ?? []
  if (ordersList.length === 0) throw new Error('Aucune commande a allouer')

  const { data: wholesalers } = await supabase.from('wholesalers').select('id, name, code')
  const availableWholesalers = (wholesalers ?? []).filter(w => !excludedWholesalers.has(w.id))
  if (availableWholesalers.length === 0) throw new Error('Aucun grossiste disponible')

  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`
  const { data: quotas } = await supabase
    .from('wholesaler_quotas')
    .select('*')
    .eq('month', monthDate)

  // Build quota map: productId -> [{wholesaler_id, remaining}]
  const quotaMap = new Map<string, { wholesaler_id: string; remaining: number }[]>()
  for (const q of quotas ?? []) {
    if (excludedWholesalers.has(q.wholesaler_id)) continue
    const list = quotaMap.get(q.product_id) ?? []
    list.push({ wholesaler_id: q.wholesaler_id, remaining: q.quota_quantity + (q.extra_available ?? 0) })
    quotaMap.set(q.product_id, list)
  }

  // Sort orders based on strategy
  let sortedOrders = [...ordersList]
  if (strategy === 'top_clients') {
    sortedOrders.sort((a, b) => {
      const aTop = (a.customer as unknown as { is_top_client?: boolean })?.is_top_client ? 0 : 1
      const bTop = (b.customer as unknown as { is_top_client?: boolean })?.is_top_client ? 0 : 1
      return aTop - bTop
    })
  } else if (strategy === 'max_coverage') {
    // Process orders with smaller quantities first to maximize coverage
    sortedOrders.sort((a, b) => a.quantity - b.quantity)
  }

  const wholesalerMap = new Map(availableWholesalers.map(w => [w.id, w]))
  const customerCodeMap = new Map<string, string>()
  for (const o of ordersList) {
    const cust = o.customer as unknown as { id: string; code: string } | undefined
    if (cust) customerCodeMap.set(o.customer_id, cust.code ?? '?')
  }

  const allocations: {
    monthly_process_id: string
    order_id: string
    customer_id: string
    product_id: string
    wholesaler_id: string
    requested_quantity: number
    allocated_quantity: number
    status: 'proposed'
    metadata: Record<string, unknown>
  }[] = []

  const logs: AllocationLog[] = []

  for (const order of sortedOrders) {
    const available = quotaMap.get(order.product_id)
    let allocatedQty = 0
    let selectedWholesaler = availableWholesalers[0].id

    if (available && available.length > 0) {
      if (strategy === 'balanced') {
        // Spread across wholesalers proportionally
        available.sort((a, b) => b.remaining - a.remaining)
      } else {
        available.sort((a, b) => b.remaining - a.remaining)
      }
      const best = available[0]
      selectedWholesaler = best.wholesaler_id
      allocatedQty = Math.min(order.quantity, best.remaining)
      best.remaining -= allocatedQty
    } else {
      allocatedQty = order.quantity
    }

    allocations.push({
      monthly_process_id: processId,
      order_id: order.id,
      customer_id: order.customer_id,
      product_id: order.product_id,
      wholesaler_id: selectedWholesaler,
      requested_quantity: order.quantity,
      allocated_quantity: allocatedQty,
      status: 'proposed',
      metadata: {},
    })

    const ws = wholesalerMap.get(selectedWholesaler)
    logs.push({
      customer: customerCodeMap.get(order.customer_id) ?? '?',
      product: order.product_id.slice(0, 8),
      wholesaler: ws?.code ?? '?',
      requested: order.quantity,
      allocated: allocatedQty,
      full: allocatedQty >= order.quantity,
    })
  }

  return { allocations, logs }
}

export default function AllocationExecutionStep({ process, onNext }: AllocationExecutionStepProps) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<'config' | 'running' | 'done'>('config')
  const [strategy, setStrategy] = useState<AllocationStrategy>('balanced')
  const [excludedWholesalers, setExcludedWholesalers] = useState<Set<string>>(new Set())
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  const [allocationLogs, setAllocationLogs] = useState<AllocationLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const { data: existingAllocations } = useQuery({
    queryKey: ['allocations', process.id, 'count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('allocations')
        .select('*', { count: 'exact', head: true })
        .eq('monthly_process_id', process.id)
      return count ?? 0
    },
  })

  const { data: orderStats } = useQuery({
    queryKey: ['orders', process.id, 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_id, product_id, quantity')
        .eq('monthly_process_id', process.id)
        .in('status', ['validated', 'pending'])
      if (error) throw error
      return data ?? []
    },
  })

  const { data: wholesalers } = useQuery({
    queryKey: ['wholesalers', 'all'],
    queryFn: async () => {
      const { data } = await supabase.from('wholesalers').select('id, name, code')
      return data ?? []
    },
  })

  const toggleWholesaler = (id: string) => {
    setExcludedWholesalers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setDryRunResult(null) // Reset dry run when config changes
  }

  const dryRunMut = useMutation({
    mutationFn: async () => {
      const { allocations, logs } = await runAllocationAlgorithm(
        process.id, process.month, process.year, strategy, excludedWholesalers,
      )
      setAllocationLogs(logs)

      const totalRequested = allocations.reduce((s, a) => s + a.requested_quantity, 0)
      const totalAllocated = allocations.reduce((s, a) => s + a.allocated_quantity, 0)

      // Count zero-coverage products
      const productCoverage = new Map<string, { req: number; alloc: number }>()
      for (const a of allocations) {
        const existing = productCoverage.get(a.product_id) ?? { req: 0, alloc: 0 }
        existing.req += a.requested_quantity
        existing.alloc += a.allocated_quantity
        productCoverage.set(a.product_id, existing)
      }
      const zeroProducts = [...productCoverage.values()].filter(p => p.alloc === 0).length

      // Group by wholesaler
      const byWholesaler = new Map<string, { code: string; count: number; qty: number }>()
      for (const a of allocations) {
        const ws = (wholesalers ?? []).find(w => w.id === a.wholesaler_id)
        const key = a.wholesaler_id
        const existing = byWholesaler.get(key)
        if (existing) { existing.count++; existing.qty += a.allocated_quantity }
        else byWholesaler.set(key, { code: ws?.code ?? '?', count: 1, qty: a.allocated_quantity })
      }

      // Group by customer
      const byCustomer = new Map<string, { code: string; count: number; qty: number }>()
      for (const log of logs) {
        const existing = byCustomer.get(log.customer)
        if (existing) { existing.count++; existing.qty += log.allocated }
        else byCustomer.set(log.customer, { code: log.customer, count: 1, qty: log.allocated })
      }

      return {
        totalAllocations: allocations.length,
        totalRequested,
        totalAllocated,
        fulfillmentRate: totalRequested > 0 ? ((totalAllocated / totalRequested) * 100).toFixed(1) : '0',
        zeroProducts,
        byWholesaler: [...byWholesaler.values()],
        byCustomer: [...byCustomer.values()],
      }
    },
    onSuccess: (result) => {
      setDryRunResult(result)
      toast.success('Simulation terminee')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const allocateMut = useMutation({
    mutationFn: async () => {
      setPhase('running')
      setShowLogs(true)

      const { allocations, logs } = await runAllocationAlgorithm(
        process.id, process.month, process.year, strategy, excludedWholesalers,
      )
      setAllocationLogs(logs)

      // Insert in batches
      const batchSize = 100
      let totalInserted = 0
      for (let i = 0; i < allocations.length; i += batchSize) {
        const batch = allocations.slice(i, i + batchSize)
        const { error, data } = await supabase.from('allocations').insert(batch).select('id')
        if (error) throw error
        totalInserted += data?.length ?? batch.length
      }

      // Update process
      await supabase
        .from('monthly_processes')
        .update({ allocations_count: totalInserted, status: 'allocating', current_step: 4 })
        .eq('id', process.id)

      // Mark orders as allocated
      await supabase
        .from('orders')
        .update({ status: 'allocated' })
        .eq('monthly_process_id', process.id)

      return totalInserted
    },
    onSuccess: (count) => {
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${count} allocations generees`)
    },
    onError: (err: Error) => {
      setPhase('config')
      toast.error(err.message)
    },
  })

  const orderCount = orderStats?.length ?? 0
  const fulfillmentNum = dryRunResult ? parseFloat(dryRunResult.fulfillmentRate) : 0
  const fulfillmentColor = fulfillmentNum >= 90 ? 'text-green-600' : fulfillmentNum >= 70 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Lancement de l'Allocation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez la strategie, simulez, puis lancez l'allocation.
        </p>
      </div>

      {existingAllocations != null && existingAllocations > 0 && (
        <Card className="border-amber-200/60 bg-amber-50/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm">
              <strong>{existingAllocations}</strong> allocations existantes. Relancer ajoutera de nouvelles entrees.
            </p>
          </CardContent>
        </Card>
      )}

      {phase === 'config' && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{orderCount}</p>
                  <p className="text-xs text-muted-foreground">Commandes a traiter</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(wholesalers?.length ?? 0) - excludedWholesalers.size}</p>
                  <p className="text-xs text-muted-foreground">Grossistes actifs</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Strategy selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">Strategie d'allocation</h4>
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

          {/* Wholesaler exclusions */}
          {wholesalers && wholesalers.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" /> Grossistes a inclure
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

          <Separator />

          {/* Dry run */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => dryRunMut.mutate()}
              disabled={dryRunMut.isPending || orderCount === 0}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              {dryRunMut.isPending ? 'Simulation...' : 'Simuler'}
            </Button>
            <span className="text-xs text-muted-foreground">Calculer sans inserer — aucune donnee modifiee</span>
          </div>

          {/* Dry run results */}
          {dryRunResult && (
            <Card className="ivory-card-highlight">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Resultat de la simulation</h4>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                </div>

                {/* Coverage bar */}
                <div>
                  <Progress value={Math.min(fulfillmentNum, 100)} className="h-2" />
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>{dryRunResult.totalAllocated.toLocaleString('fr-FR')} allouees</span>
                    <span>{dryRunResult.totalRequested.toLocaleString('fr-FR')} demandees</span>
                  </div>
                </div>

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
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Par client</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dryRunResult.byCustomer.map(c => (
                        <Badge key={c.code} variant="outline" className="text-xs gap-1">
                          <span className="font-bold">{c.code}</span>
                          {c.qty.toLocaleString('fr-FR')} u.
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Launch button */}
          <Card className="ivory-card-highlight">
            <CardContent className="p-6 text-center space-y-4">
              <Cpu className="h-12 w-12 mx-auto text-primary" />
              <div>
                <p className="font-semibold">
                  {dryRunResult ? 'Pret a lancer — simulation validee' : 'Configurez puis lancez l\'allocation'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Strategie : <strong>{STRATEGIES.find(s => s.value === strategy)?.label}</strong>
                  {' '}&middot; {orderCount} commandes &middot; {(wholesalers?.length ?? 0) - excludedWholesalers.size} grossistes
                </p>
              </div>
              <Button
                size="lg"
                onClick={() => allocateMut.mutate()}
                disabled={orderCount === 0}
                className="gap-2"
              >
                <Cpu className="h-4 w-4" />
                Lancer l'Allocation
              </Button>
            </CardContent>
          </Card>

          {existingAllocations != null && existingAllocations > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" onClick={onNext} className="gap-2">
                Passer a la revue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

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

          {/* Live allocation log */}
          {showLogs && allocationLogs.length > 0 && (
            <Card className="max-h-48 overflow-hidden">
              <CardContent className="p-0">
                <div ref={logRef} className="overflow-y-auto max-h-48 p-3 space-y-0.5 font-mono text-[11px]">
                  {allocationLogs.slice(-30).map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.full ? 'text-green-600' : 'text-amber-600'}`}>
                      <span className="text-muted-foreground w-6 text-right shrink-0">{allocationLogs.length - 30 + i + 1}</span>
                      <span>[{log.customer}]</span>
                      <span className="truncate flex-1">{log.product}...</span>
                      <span>→ {log.wholesaler}</span>
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

      {phase === 'done' && (
        <div className="py-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-xl font-semibold">Allocation terminee</p>
            <p className="text-sm text-muted-foreground mt-1">
              {allocateMut.data} allocations generees avec la strategie "{STRATEGIES.find(s => s.value === strategy)?.label}".
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
