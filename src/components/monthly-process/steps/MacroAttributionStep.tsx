import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import GaugeChart from '@/components/ui/gauge-chart'
import {
  ArrowRight, ArrowLeft, Zap, Users, Package, Warehouse,
  AlertTriangle, Check, Pencil, X, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess } from '@/types/database'

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

export default function MacroAttributionStep({ process, onNext, onBack }: MacroAttributionStepProps) {
  const queryClient = useQueryClient()
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ productId: string; wholesalerId: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const isProcessLocked = process.status === 'completed' || process.status === 'finalizing'

  // Load existing macro attributions from process metadata
  const existingMacro = (process.metadata?.macro_attributions as MacroMap) ?? {}
  const [macroMap, setMacroMap] = useState<MacroMap>(existingMacro)

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

  // Auto-attribution: distribute demand across quotas proportionally
  const autoAttribute = useCallback(() => {
    const newMap: MacroMap = {}
    for (const demand of demands) {
      const supply = supplyByProduct.get(demand.productId) ?? []
      if (supply.length === 0) continue

      const totalSupply = supply.reduce((s, q) => s + q.total, 0)
      let remaining = demand.totalQuantity

      newMap[demand.productId] = {}
      for (const q of supply) {
        // Proportional: each wholesaler gets share proportional to their quota
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
      // Assign remainder to first wholesaler with capacity
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
    toast.success('Attribution automatique effectuee')
  }, [demands, supplyByProduct])

  // Reset
  const resetAttribution = () => {
    setMacroMap({})
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
  }

  const cancelEdit = () => setEditingCell(null)

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

  const isLoading = ordersLoading || quotasLoading
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
      <div>
        <h3 className="text-lg font-semibold">Attribution Macro — Commandes ↔ Quotas</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Attribuez les commandes aux quotas grossistes avant l'export. L'auto-attribution repartit proportionnellement.
        </p>
      </div>

      {/* Client navigation */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Filtrer par client</h4>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCustomerId(null)}
          >
            <Badge
              variant={selectedCustomerId === null ? 'default' : 'outline'}
              className={`py-1.5 px-3 cursor-pointer transition-all ${selectedCustomerId === null ? 'ring-2 ring-primary/30' : 'hover:bg-muted'}`}
            >
              <Users className="h-3 w-3 mr-1" /> Tous ({customers.length})
            </Badge>
          </button>
          {customers.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCustomerId(selectedCustomerId === c.id ? null : c.id)}
            >
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
            <p className="text-[10px] text-muted-foreground">Grossistes dispo</p>
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
          <Button onClick={autoAttribute} className="gap-1.5" variant="default">
            <Zap className="h-4 w-4" /> Auto-attribution
          </Button>
          {hasAttribution && (
            <Button onClick={resetAttribution} variant="outline" className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Reinitialiser
            </Button>
          )}
        </div>
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
                {wholesalerColumns.map(ws => (
                  <TableHead key={ws.id} className="text-center min-w-[90px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help font-bold">{ws.code}</span>
                      </TooltipTrigger>
                      <TooltipContent>{ws.name}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                ))}
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

                return (
                  <TableRow key={demand.productId} className={isFull ? '' : 'bg-amber-50/20 dark:bg-amber-950/10'}>
                    <TableCell className="sticky left-0 bg-background z-10 font-mono text-xs font-medium">
                      {demand.cip13}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {demand.productName}
                      <div className="flex gap-0.5 mt-0.5">
                        {demand.customers.map(c => (
                          <Badge key={c.id} variant="outline" className="text-[8px] py-0 px-1">
                            {c.code}: {c.quantity}
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

                      if (!hasQuota) {
                        return (
                          <TableCell key={ws.id} className="text-center text-muted-foreground/30 text-xs">
                            —
                          </TableCell>
                        )
                      }

                      return (
                        <TableCell key={ws.id} className="text-center p-1">
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
                              onClick={() => !isProcessLocked && startEdit(demand.productId, ws.id, assignedQty)}
                              disabled={isProcessLocked}
                            >
                              <div className="tabular-nums text-sm font-medium">
                                {assignedQty > 0 ? (
                                  <span className={assignedQty > quota.total ? 'text-red-600' : 'text-green-700 dark:text-green-400'}>
                                    {assignedQty.toLocaleString('fr-FR')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">0</span>
                                )}
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                /{quota.total.toLocaleString('fr-FR')}
                              </div>
                              {!isProcessLocked && assignedQty === 0 && (
                                <Pencil className="h-2.5 w-2.5 mx-auto opacity-0 group-hover:opacity-40 transition-opacity" />
                              )}
                            </button>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right tabular-nums font-medium text-sm">
                      <span className={isFull ? 'text-green-600' : 'text-amber-600'}>
                        {attributed.toLocaleString('fr-FR')}
                      </span>
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
          {!hasAttribution && (
            <Button variant="outline" onClick={onNext} className="gap-1.5">
              Passer <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {hasAttribution && (
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              Sauvegarder et continuer
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
