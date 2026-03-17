import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import GaugeChart from '@/components/ui/gauge-chart'
import {
  ArrowRight, ArrowLeft, Zap, Users, Package, Warehouse,
  AlertTriangle, Check, Pencil, X, RotateCcw, BarChart3, TrendingUp,
  AlertCircle, Info, Loader2, History,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess } from '@/types/database'
import { useManualAttributions } from '@/hooks/useManualAttributions'
import ManualAttributionEditor from '@/components/monthly-process/ManualAttributionEditor'

interface MacroAttributionStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

interface OrderDemand {
  productId: string
  cip13: string
  productName: string
  totalQuantity: number
  customers: { id: string; code: string; name: string; quantity: number }[]
}

interface QuotaSupply {
  wholesalerId: string
  wholesalerCode: string
  wholesalerName: string
  productId: string
  cip13: string
  productName: string
  quotaQuantity: number
  extraAvailable: number
  total: number
}

// macro_attributions stored in process.metadata:
// { [productId]: { [wholesalerId]: quantity } }
type MacroMap = Record<string, Record<string, number>>

type AutoStrategy = 'proportional' | 'top_first' | 'max_coverage'

const AUTO_STRATEGIES: { value: AutoStrategy; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'proportional', label: 'Proportionnelle', description: 'Repartir au prorata des disponibilites', icon: BarChart3 },
  { value: 'top_first', label: 'Top grossiste d\'abord', description: 'Remplir la plus grosse disponibilite en priorite', icon: TrendingUp },
  { value: 'max_coverage', label: 'Max couverture', description: 'Couvrir un maximum de produits', icon: Zap },
]

export default function MacroAttributionStep({ process, onNext, onBack }: MacroAttributionStepProps) {
  const queryClient = useQueryClient()
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ productId: string; wholesalerId: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [autoStrategy, setAutoStrategy] = useState<AutoStrategy>('proportional')
  const [showStrategyPicker, setShowStrategyPicker] = useState(false)
  const isProcessLocked = process.status === 'completed' || process.status === 'finalizing'

  // Load existing macro attributions from process metadata
  const existingMacro = (process.metadata?.macro_attributions as MacroMap) ?? {}
  const [macroMap, setMacroMap] = useState<MacroMap>(existingMacro)

  // Track manual edits count (macro inline edits)
  const [manualEditsCount, setManualEditsCount] = useState(0)

  // Manual attributions (per-client, persisted in DB)
  const {
    manualAttrs, isLoading: manualLoading, upsert, isUpserting,
    deactivate, getForCell, getTotalManual,
  } = useManualAttributions(process.id)
  const [manualEditingCell, setManualEditingCell] = useState<{ productId: string; wholesalerId: string } | null>(null)
  const [showManualHistory, setShowManualHistory] = useState(false)

  // Are we in manual-per-client mode? (client selected + not locked)
  const isManualMode = !!selectedCustomerId && !isProcessLocked

  // Fetch orders
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', process.id, 'macro'],
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

  // Fetch quotas for this month
  const monthDate = `${process.year}-${String(process.month).padStart(2, '0')}-01`
  const { data: quotas, isLoading: quotasLoading } = useQuery({
    queryKey: ['wholesaler-quotas', monthDate, 'macro'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wholesaler_quotas')
        .select('wholesaler_id, product_id, quota_quantity, extra_available, wholesaler:wholesalers(id, name, code), product:products(id, cip13, name)')
        .eq('month', monthDate)
      if (error) throw error
      return data ?? []
    },
  })

  // Aggregate demand per product
  const demands = useMemo(() => {
    if (!orders) return []
    const map = new Map<string, OrderDemand>()
    for (const o of orders) {
      const prod = o.product as any
      const cust = o.customer as any
      const existing = map.get(o.product_id)
      if (existing) {
        existing.totalQuantity += o.quantity
        const custEntry = existing.customers.find(c => c.id === o.customer_id)
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

  // Filter demands by selected customer
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

  // Build supply map (quota per product per wholesaler)
  const supplyByProduct = useMemo(() => {
    if (!quotas) return new Map<string, QuotaSupply[]>()
    const map = new Map<string, QuotaSupply[]>()
    for (const q of quotas) {
      const ws = q.wholesaler as any
      const prod = q.product as any
      const total = (q.quota_quantity ?? 0) + (q.extra_available ?? 0)
      if (total <= 0) continue
      const list = map.get(q.product_id) ?? []
      list.push({
        wholesalerId: q.wholesaler_id,
        wholesalerCode: ws?.code ?? '?',
        wholesalerName: ws?.name ?? '?',
        productId: q.product_id,
        cip13: prod?.cip13 ?? '?',
        productName: prod?.name ?? '?',
        quotaQuantity: q.quota_quantity ?? 0,
        extraAvailable: q.extra_available ?? 0,
        total,
      })
      map.set(q.product_id, list)
    }
    return map
  }, [quotas])

  // Get unique customers
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

  // Get unique wholesalers from quotas for column headers
  const wholesalerColumns = useMemo(() => {
    if (!quotas) return []
    const map = new Map<string, { id: string; code: string; name: string }>()
    for (const q of quotas) {
      const ws = q.wholesaler as any
      if (!map.has(q.wholesaler_id)) {
        map.set(q.wholesaler_id, { id: q.wholesaler_id, code: ws?.code ?? '?', name: ws?.name ?? '?' })
      }
    }
    return [...map.values()]
  }, [quotas])

  // ── Wholesaler usage summary ──────────────────────────────────────
  const wholesalerSummary = useMemo(() => {
    const summary = new Map<string, { total: number; used: number }>()

    // Total quotas per wholesaler
    if (quotas) {
      for (const q of quotas) {
        const total = (q.quota_quantity ?? 0) + (q.extra_available ?? 0)
        const existing = summary.get(q.wholesaler_id) ?? { total: 0, used: 0 }
        existing.total += total
        summary.set(q.wholesaler_id, existing)
      }
    }

    // Used per wholesaler from macroMap
    for (const productMap of Object.values(macroMap)) {
      for (const [wsId, qty] of Object.entries(productMap)) {
        const existing = summary.get(wsId) ?? { total: 0, used: 0 }
        existing.used += qty
        summary.set(wsId, existing)
      }
    }

    return summary
  }, [quotas, macroMap])

  // Products with demand but no quota
  const productsWithoutQuota = useMemo(() => {
    return demands.filter(d => {
      const supply = supplyByProduct.get(d.productId) ?? []
      return supply.length === 0
    })
  }, [demands, supplyByProduct])

  // Detect over-quota cells
  const overQuotaCells = useMemo(() => {
    const cells: { productId: string; wholesalerId: string; assigned: number; quota: number }[] = []
    for (const [productId, wsMap] of Object.entries(macroMap)) {
      const supply = supplyByProduct.get(productId) ?? []
      for (const [wsId, qty] of Object.entries(wsMap)) {
        const q = supply.find(s => s.wholesalerId === wsId)
        if (q && qty > q.total) {
          cells.push({ productId, wholesalerId: wsId, assigned: qty, quota: q.total })
        }
      }
    }
    return cells
  }, [macroMap, supplyByProduct])

  // ── Auto-attribution strategies ───────────────────────────────────

  const autoAttribute = useCallback((strategy: AutoStrategy) => {
    const newMap: MacroMap = {}

    for (const demand of demands) {
      const supply = supplyByProduct.get(demand.productId) ?? []
      if (supply.length === 0) continue

      newMap[demand.productId] = {}
      let remaining = demand.totalQuantity

      if (strategy === 'proportional') {
        // Proportional: each wholesaler gets share proportional to their quota
        const totalSupply = supply.reduce((s, q) => s + q.total, 0)
        for (const q of supply) {
          const share = Math.min(
            Math.round((q.total / totalSupply) * demand.totalQuantity),
            q.total,
            remaining,
          )
          if (share > 0) {
            newMap[demand.productId][q.wholesalerId] = share
            remaining -= share
          }
        }
      } else if (strategy === 'top_first') {
        // Top first: fill biggest quota first, then next, etc.
        const sorted = [...supply].sort((a, b) => b.total - a.total)
        for (const q of sorted) {
          const assign = Math.min(remaining, q.total)
          if (assign > 0) {
            newMap[demand.productId][q.wholesalerId] = assign
            remaining -= assign
          }
          if (remaining <= 0) break
        }
      } else if (strategy === 'max_coverage') {
        // Max coverage: spread evenly to use as many wholesalers as possible
        const perWs = Math.floor(remaining / supply.length)
        let leftover = remaining - perWs * supply.length
        for (const q of supply) {
          const assign = Math.min(perWs + (leftover > 0 ? 1 : 0), q.total, remaining)
          if (assign > 0) {
            newMap[demand.productId][q.wholesalerId] = assign
            remaining -= assign
            if (leftover > 0) leftover--
          }
          if (remaining <= 0) break
        }
      }

      // Assign any remainder to first wholesaler with capacity
      if (remaining > 0) {
        for (const q of supply) {
          const current = newMap[demand.productId][q.wholesalerId] ?? 0
          const capacity = q.total - current
          const extra = Math.min(remaining, capacity)
          if (extra > 0) {
            newMap[demand.productId][q.wholesalerId] = current + extra
            remaining -= extra
          }
          if (remaining <= 0) break
        }
      }
    }
    setMacroMap(newMap)
    setManualEditsCount(0)
    const stratLabel = AUTO_STRATEGIES.find(s => s.value === strategy)?.label ?? strategy
    toast.success(`Attribution "${stratLabel}" effectuee`)
  }, [demands, supplyByProduct])

  // Reset
  const resetAttribution = () => {
    setMacroMap({})
    setManualEditsCount(0)
    toast.info('Attribution reinitialise')
  }

  // Save to process metadata
  const saveMut = useMutation({
    mutationFn: async () => {
      const currentMeta = (process.metadata ?? {}) as Record<string, unknown>
      const { error } = await supabase
        .from('monthly_processes')
        .update({
          metadata: { ...currentMeta, macro_attributions: macroMap },
        })
        .eq('id', process.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes', process.id] })
      toast.success('Attribution sauvegardee')
      onNext()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Stats
  const totalDemand = demands.reduce((s, d) => s + d.totalQuantity, 0)
  const totalAttributed = Object.values(macroMap).reduce((s, ws) =>
    s + Object.values(ws).reduce((s2, q) => s2 + q, 0), 0)
  const coverageRate = totalDemand > 0 ? (totalAttributed / totalDemand) * 100 : 0
  const productsFullyCovered = demands.filter(d => {
    const attributed = Object.values(macroMap[d.productId] ?? {}).reduce((s, q) => s + q, 0)
    return attributed >= d.totalQuantity
  }).length

  // Edit cell
  const startEdit = (productId: string, wholesalerId: string, currentValue: number) => {
    if (isProcessLocked) return
    setEditingCell({ productId, wholesalerId })
    setEditValue(String(currentValue))
  }

  const saveEdit = () => {
    if (!editingCell) return
    const val = parseInt(editValue, 10)
    if (isNaN(val) || val < 0) { toast.error('Valeur invalide'); return }

    // Check quota
    const supply = supplyByProduct.get(editingCell.productId) ?? []
    const q = supply.find(s => s.wholesalerId === editingCell.wholesalerId)
    if (q && val > q.total) {
      toast.warning(`Attention : ${val} depasse le quota de ${q.total} pour ${q.wholesalerCode}`)
    }

    setMacroMap(prev => {
      const next = { ...prev }
      if (!next[editingCell.productId]) next[editingCell.productId] = {}
      if (val === 0) {
        delete next[editingCell.productId][editingCell.wholesalerId]
        if (Object.keys(next[editingCell.productId]).length === 0) delete next[editingCell.productId]
      } else {
        next[editingCell.productId] = { ...next[editingCell.productId], [editingCell.wholesalerId]: val }
      }
      return next
    })
    setEditingCell(null)
    setManualEditsCount(prev => prev + 1)
  }

  const cancelEdit = () => setEditingCell(null)

  const isLoading = ordersLoading || quotasLoading || manualLoading
  const hasAttribution = Object.keys(macroMap).length > 0

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Attribution Macro</h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (demands.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Attribution Macro</h3>
          <p className="text-sm text-muted-foreground mt-1">Aucune commande validee. Retournez a l'etape precedente.</p>
        </div>
        <div className="flex gap-3">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
          )}
          <Button variant="outline" onClick={onNext} className="gap-1.5">
            Passer <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Attribution Macro — Commandes ↔ Quotas</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Attribuez les commandes aux quotas grossistes avant l'export.
          Cliquez sur une cellule pour modifier manuellement, ou utilisez l'auto-attribution.
        </p>
      </div>

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Package className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{filteredDemands.length}</p>
            <p className="text-[10px] text-muted-foreground">Produits demandes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{(selectedCustomerId ? filteredDemands : demands).reduce((s, d) => s + d.totalQuantity, 0).toLocaleString('fr-FR')}</p>
            <p className="text-[10px] text-muted-foreground">Demande totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Warehouse className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{wholesalerColumns.length}</p>
            <p className="text-[10px] text-muted-foreground">Grossistes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-xl font-bold ${productsFullyCovered === demands.length ? 'text-green-600' : 'text-amber-600'}`}>
              {productsFullyCovered}/{demands.length}
            </p>
            <p className="text-[10px] text-muted-foreground">Produits couverts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2 flex flex-col items-center">
            <GaugeChart value={coverageRate} size={80} strokeWidth={7} label="Couverture" />
          </CardContent>
        </Card>
      </div>

      {/* Action buttons: strategy picker */}
      {!isProcessLocked && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              onClick={() => setShowStrategyPicker(!showStrategyPicker)}
              className="gap-1.5"
              variant="default"
            >
              <Zap className="h-4 w-4" /> Auto-attribution
            </Button>
            {hasAttribution && (
              <Button onClick={resetAttribution} variant="outline" className="gap-1.5">
                <RotateCcw className="h-4 w-4" /> Reinitialiser
              </Button>
            )}
            {manualEditsCount > 0 && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Pencil className="h-3 w-3" /> {manualEditsCount} modification{manualEditsCount > 1 ? 's' : ''} manuelle{manualEditsCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {/* Strategy picker dropdown */}
          {showStrategyPicker && (
            <Card className="border-primary/20">
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Choisir une strategie d'attribution</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {AUTO_STRATEGIES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        setAutoStrategy(s.value)
                        autoAttribute(s.value)
                        setShowStrategyPicker(false)
                      }}
                      className={`p-3 rounded-lg border-2 text-left transition-all hover:border-primary/40 hover:bg-primary/5 ${
                        autoStrategy === s.value ? 'border-primary/30 bg-primary/5' : 'border-border'
                      }`}
                    >
                      <s.icon className="h-4 w-4 text-primary mb-1" />
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Manual mode indicator */}
      {isManualMode && (
        <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/20">
          <CardContent className="p-3 flex items-center gap-3">
            <Pencil className="h-4 w-4 text-blue-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                Mode edition manuelle — {customers.find(c => c.id === selectedCustomerId)?.code}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Cliquez sur une cellule pour attribuer manuellement une quantite a ce client. Chaque edition cree une ligne datee dans l'export.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {manualAttrs.length > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <History className="h-3 w-3" /> {manualAttrs.length} edition{manualAttrs.length > 1 ? 's' : ''}
                </Badge>
              )}
              {manualAttrs.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setShowManualHistory(!showManualHistory)}>
                  <History className="h-3 w-3" /> {showManualHistory ? 'Masquer' : 'Historique'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual attribution history panel */}
      {showManualHistory && manualAttrs.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Historique des editions manuelles ({manualAttrs.length})
            </p>
            <div className="border rounded-lg overflow-x-auto max-h-[250px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">CIP13</TableHead>
                    <TableHead className="text-xs">Produit</TableHead>
                    <TableHead className="text-xs">Client</TableHead>
                    <TableHead className="text-xs">Grossiste</TableHead>
                    <TableHead className="text-xs text-right">Demandee</TableHead>
                    <TableHead className="text-xs text-right">Fournisseur</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manualAttrs.map(attr => (
                    <TableRow key={attr.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(attr.edited_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{attr.product?.cip13 ?? '?'}</TableCell>
                      <TableCell className="text-xs truncate max-w-[150px]">{attr.product?.name ?? '?'}</TableCell>
                      <TableCell className="text-xs font-medium">{attr.customer?.code ?? '?'}</TableCell>
                      <TableCell className="text-xs">{attr.wholesaler?.code ?? '?'}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{attr.requested_quantity.toLocaleString('fr-FR')}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-medium">{attr.supplier_quantity.toLocaleString('fr-FR')}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => deactivate(attr.id)}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-0.5"
                          title="Desactiver cette edition"
                        >
                          <X className="h-3 w-3" /> Retirer
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Over-quota warnings */}
      {overQuotaCells.length > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="p-3 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                {overQuotaCells.length} depassement{overQuotaCells.length > 1 ? 's' : ''} de quota
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {overQuotaCells.slice(0, 5).map(c => {
                  const ws = wholesalerColumns.find(w => w.id === c.wholesalerId)
                  return (
                    <Badge key={`${c.productId}-${c.wholesalerId}`} variant="outline" className="text-xs border-red-200 text-red-700">
                      {ws?.code}: {c.assigned}/{c.quota}
                    </Badge>
                  )
                })}
                {overQuotaCells.length > 5 && (
                  <Badge variant="outline" className="text-xs border-red-200 text-red-700">+{overQuotaCells.length - 5} autres</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wholesaler usage summary */}
      {hasAttribution && wholesalerColumns.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Utilisation des quotas par grossiste
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {wholesalerColumns.map(ws => {
                const s = wholesalerSummary.get(ws.id)
                if (!s || s.total === 0) return null
                const pct = Math.round((s.used / s.total) * 100)
                const isOver = s.used > s.total
                return (
                  <div key={ws.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-bold cursor-help">{ws.code}</span>
                        </TooltipTrigger>
                        <TooltipContent>{ws.name}</TooltipContent>
                      </Tooltip>
                      <span className={`tabular-nums font-medium ${isOver ? 'text-red-600' : pct > 90 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {pct}%
                      </span>
                    </div>
                    <Progress value={Math.min(pct, 100)} className={`h-1.5 ${isOver ? '[&>div]:bg-red-500' : pct > 90 ? '[&>div]:bg-amber-500' : ''}`} />
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {s.used.toLocaleString('fr-FR')} / {s.total.toLocaleString('fr-FR')}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Products without quota warning */}
      {productsWithoutQuota.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {productsWithoutQuota.length} produit{productsWithoutQuota.length > 1 ? 's' : ''} commande{productsWithoutQuota.length > 1 ? 's' : ''} sans disponibilite
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Ces produits ne peuvent pas etre attribues. Verifiez les quotas a l'etape 1.
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {productsWithoutQuota.slice(0, 10).map(d => (
                  <Badge key={d.productId} variant="outline" className="text-[10px] border-amber-200 text-amber-700">
                    {d.cip13} ({d.totalQuantity} u.)
                  </Badge>
                ))}
                {productsWithoutQuota.length > 10 && (
                  <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700">+{productsWithoutQuota.length - 10}</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attribution matrix: Products (rows) × Wholesalers (columns) */}
      {filteredDemands.length > 0 && wholesalerColumns.length > 0 && (
        <div className="border rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[100px]">CIP13</TableHead>
                <TableHead className="min-w-[150px]">Produit</TableHead>
                <TableHead className="text-right min-w-[80px]">Demande</TableHead>
                {wholesalerColumns.map(ws => {
                  const s = wholesalerSummary.get(ws.id)
                  const pct = s && s.total > 0 ? Math.round((s.used / s.total) * 100) : 0
                  return (
                    <TableHead key={ws.id} className="text-center min-w-[90px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <span className="font-bold">{ws.code}</span>
                            {hasAttribution && (
                              <div className={`text-[9px] font-normal ${pct > 100 ? 'text-red-600' : pct > 90 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                {pct}% utilise
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div>
                            <p className="font-medium">{ws.name}</p>
                            {s && <p className="text-xs">{s.used.toLocaleString('fr-FR')} / {s.total.toLocaleString('fr-FR')} utilises</p>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  )
                })}
                <TableHead className="text-right min-w-[80px]">Attribue</TableHead>
                <TableHead className="text-right min-w-[60px]">Reste</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDemands.map(demand => {
                const supply = supplyByProduct.get(demand.productId) ?? []
                const attributed = Object.values(macroMap[demand.productId] ?? {}).reduce((s, q) => s + q, 0)
                const remaining = demand.totalQuantity - attributed
                const isFull = remaining <= 0
                const pctCovered = demand.totalQuantity > 0 ? Math.min(100, Math.round((attributed / demand.totalQuantity) * 100)) : 0

                return (
                  <TableRow key={demand.productId} className={isFull ? '' : 'bg-amber-50/20 dark:bg-amber-950/10'}>
                    <TableCell className="sticky left-0 bg-background z-10 font-mono text-xs font-medium">
                      {demand.cip13}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                      <div className="truncate" title={demand.productName}>{demand.productName}</div>
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {demand.customers.map(c => (
                          <Badge key={c.id} variant="outline" className="text-[9px] py-0 px-1.5 font-medium">
                            {c.code}: {c.quantity.toLocaleString('fr-FR')}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-sm">
                      {demand.totalQuantity.toLocaleString('fr-FR')}
                    </TableCell>
                    {wholesalerColumns.map(ws => {
                      const quota = supply.find(s => s.wholesalerId === ws.id)
                      const assignedQty = macroMap[demand.productId]?.[ws.id] ?? 0
                      const isEditing = editingCell?.productId === demand.productId && editingCell?.wholesalerId === ws.id
                      const hasQuota = quota && quota.total > 0
                      const isOverQuota = hasQuota && assignedQty > quota.total

                      // Manual attribution for this cell (when client selected)
                      const manualAttr = selectedCustomerId ? getForCell(demand.productId, ws.id, selectedCustomerId) : null
                      const manualTotalForCell = getTotalManual(demand.productId, ws.id)
                      const hasManualAttr = !!manualAttr
                      const isManualEditing = manualEditingCell?.productId === demand.productId && manualEditingCell?.wholesalerId === ws.id

                      // Customer demand for the selected customer on this product
                      const customerDemandQty = selectedCustomerId
                        ? (demand.customers.find(c => c.id === selectedCustomerId)?.quantity ?? 0)
                        : 0

                      if (!hasQuota) {
                        return (
                          <TableCell key={ws.id} className="text-center text-muted-foreground/30 text-xs">
                            —
                          </TableCell>
                        )
                      }

                      // ── Manual mode (client selected): show ManualAttributionEditor ──
                      if (isManualMode && isManualEditing) {
                        return (
                          <TableCell key={ws.id} className="p-1 bg-blue-50/40 dark:bg-blue-950/20">
                            <ManualAttributionEditor
                              existing={manualAttr}
                              maxRequested={customerDemandQty}
                              maxSupplier={quota.total}
                              isSaving={isUpserting}
                              onSave={(reqQty, supQty) => {
                                upsert({
                                  productId: demand.productId,
                                  customerId: selectedCustomerId!,
                                  wholesalerId: ws.id,
                                  requestedQuantity: reqQty,
                                  supplierQuantity: supQty,
                                })
                                setManualEditingCell(null)
                              }}
                              onCancel={() => setManualEditingCell(null)}
                            />
                          </TableCell>
                        )
                      }

                      return (
                        <TableCell key={ws.id} className={`text-center p-1 ${
                          isOverQuota ? 'bg-red-50/50 dark:bg-red-950/20'
                          : hasManualAttr ? 'bg-blue-50/30 dark:bg-blue-950/10'
                          : ''
                        }`}>
                          {isEditing && !isManualMode ? (
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
                                max={quota.total}
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
                              onClick={() => {
                                if (isProcessLocked) return
                                if (isManualMode) {
                                  setManualEditingCell({ productId: demand.productId, wholesalerId: ws.id })
                                  setEditingCell(null)
                                } else {
                                  startEdit(demand.productId, ws.id, assignedQty)
                                  setManualEditingCell(null)
                                }
                              }}
                              disabled={isProcessLocked}
                            >
                              {/* Manual attribution badge (when client selected and manual attr exists) */}
                              {hasManualAttr && (
                                <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-0.5">
                                  <Pencil className="h-2 w-2" />
                                  {manualAttr.supplier_quantity.toLocaleString('fr-FR')}
                                </div>
                              )}
                              <div className="tabular-nums text-sm font-medium">
                                {assignedQty > 0 ? (
                                  <span className={isOverQuota ? 'text-red-600 font-bold' : 'text-green-700 dark:text-green-400'}>
                                    {assignedQty.toLocaleString('fr-FR')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">0</span>
                                )}
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                /{quota.total.toLocaleString('fr-FR')}
                                {manualTotalForCell > 0 && !hasManualAttr && (
                                  <span className="text-blue-500 ml-0.5" title="Total editions manuelles sur cette cellule">
                                    ({manualTotalForCell})
                                  </span>
                                )}
                              </div>
                              {isOverQuota && (
                                <AlertCircle className="h-2.5 w-2.5 mx-auto text-red-500 mt-0.5" />
                              )}
                              {!isProcessLocked && assignedQty === 0 && !hasManualAttr && !isOverQuota && (
                                <Pencil className="h-2.5 w-2.5 mx-auto opacity-0 group-hover:opacity-40 transition-opacity" />
                              )}
                            </button>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right tabular-nums font-medium text-sm">
                      <div className={isFull ? 'text-green-600' : 'text-amber-600'}>
                        {attributed.toLocaleString('fr-FR')}
                      </div>
                      {hasAttribution && (
                        <div className="w-12 ml-auto mt-0.5">
                          <Progress value={pctCovered} className={`h-1 ${isFull ? '[&>div]:bg-green-500' : '[&>div]:bg-amber-500'}`} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {remaining > 0 ? (
                        <span className="text-red-500 font-medium">{remaining.toLocaleString('fr-FR')}</span>
                      ) : remaining === 0 ? (
                        <Check className="h-4 w-4 text-green-600 mx-auto" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-blue-500 font-medium">+{Math.abs(remaining).toLocaleString('fr-FR')}</span>
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
      )}

      {/* No quotas warning */}
      {wholesalerColumns.length === 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Aucun quota disponible</p>
              <p className="text-xs text-muted-foreground">Importez des quotas a l'etape 1 pour pouvoir faire l'attribution.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info box about editing */}
      {!isProcessLocked && hasAttribution && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            <strong>Astuce :</strong> Cliquez sur n'importe quelle cellule pour modifier la quantite attribuee.
            Les depassements de quota sont signales en rouge. L'attribution est sauvegardee uniquement quand vous cliquez "Sauvegarder et continuer".
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          {onBack && (
            <Button variant="outline" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onNext} className="gap-1.5">
            {hasAttribution ? 'Passer sans sauvegarder' : 'Passer'} <ArrowRight className="h-4 w-4" />
          </Button>
          {hasAttribution && (
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="gap-1.5"
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Sauvegarder et continuer
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
