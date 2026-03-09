import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import AnimatedCounter from '@/components/ui/animated-counter'
import GaugeChart from '@/components/ui/gauge-chart'
import HorizontalBarChart from '@/components/ui/horizontal-bar'
import { CheckCircle, ArrowRight, BarChart3, Truck, AlertTriangle, Pencil, Check, X, Users, Boxes, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'
import FinalAllocationConfirmationModal from '@/components/allocations/FinalAllocationConfirmationModal'
import type { MonthlyProcess, Allocation, Wholesaler } from '@/types/database'

interface AllocationReviewStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

type ViewMode = 'all' | 'partial' | 'by_lot'

interface EditState {
  allocId: string
  field: 'quantity' | 'wholesaler'
  value: string
}

const cardVariants: import('framer-motion').Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.08, type: 'spring' as const, stiffness: 300, damping: 25 },
  }),
}

export default function AllocationReviewStep({ process, onNext, onBack }: AllocationReviewStepProps) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [pendingEdits, setPendingEdits] = useState(0)

  const { data: allocations, isLoading } = useQuery({
    queryKey: ['allocations', process.id, 'review'],
    queryFn: async () => {
      const all: any[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('allocations')
          .select('*, customer:customers(id, name, code), product:products(id, cip13, name), wholesaler:wholesalers(id, name, code)')
          .eq('monthly_process_id', process.id)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }
      return all as unknown as Allocation[]
    },
  })

  const { data: allWholesalers } = useQuery({
    queryKey: ['wholesalers', 'all'],
    queryFn: async () => {
      const { data } = await supabase.from('wholesalers').select('id, name, code')
      return (data ?? []) as Pick<Wholesaler, 'id' | 'name' | 'code'>[]
    },
  })

  const editQtyMut = useMutation({
    mutationFn: async ({ allocId, newQty }: { allocId: string; newQty: number }) => {
      const { error } = await supabase
        .from('allocations')
        .update({ allocated_quantity: newQty })
        .eq('id', allocId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      setEditState(null)
      setPendingEdits(prev => prev + 1)
      toast.success('Quantite mise a jour')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const editWsMut = useMutation({
    mutationFn: async ({ allocId, newWsId }: { allocId: string; newWsId: string }) => {
      const { error } = await supabase
        .from('allocations')
        .update({ wholesaler_id: newWsId })
        .eq('id', allocId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      setEditState(null)
      setPendingEdits(prev => prev + 1)
      toast.success('Grossiste mis a jour')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const confirmMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('allocations')
        .update({ status: 'confirmed' })
        .eq('monthly_process_id', process.id)
        .eq('status', 'proposed')
      if (error) throw error

      await supabase
        .from('monthly_processes')
        .update({ status: 'reviewing_allocations', phase: 'allocation' })
        .eq('id', process.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success('Allocations confirmees')
      onNext()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Deduplicate requested_quantity per order_id (one order can generate multiple allocation rows)
  const totalRequested = useMemo(() => {
    const byOrder = new Map<string, number>()
    for (const a of allocations ?? []) {
      if (!byOrder.has(a.order_id)) byOrder.set(a.order_id, a.requested_quantity)
    }
    return [...byOrder.values()].reduce((s, v) => s + v, 0)
  }, [allocations])
  const totalAllocated = allocations?.reduce((s, a) => s + a.allocated_quantity, 0) ?? 0
  const fulfillmentRate = totalRequested > 0 ? ((totalAllocated / totalRequested) * 100) : 0
  const fulfillmentRateStr = fulfillmentRate.toFixed(1)

  // Group by wholesaler
  const wholesalerSummary = new Map<string, { name: string; code: string; count: number; totalQty: number }>()
  for (const a of allocations ?? []) {
    const key = a.wholesaler_id
    const w = a.wholesaler as unknown as { name: string; code: string } | undefined
    const existing = wholesalerSummary.get(key)
    if (existing) {
      existing.count++
      existing.totalQty += a.allocated_quantity
    } else {
      wholesalerSummary.set(key, { name: w?.name ?? '', code: w?.code ?? '?', count: 1, totalQty: a.allocated_quantity })
    }
  }

  // Group by customer with fulfillment % (deduplicate requested per order_id)
  const customerSummary = useMemo(() => {
    const map = new Map<string, { name: string; code: string; count: number; totalQty: number; totalReq: number; seenOrders: Set<string> }>()
    for (const a of allocations ?? []) {
      const key = a.customer_id
      const c = a.customer as unknown as { name: string; code: string } | undefined
      const existing = map.get(key)
      if (existing) {
        existing.count++
        existing.totalQty += a.allocated_quantity
        if (!existing.seenOrders.has(a.order_id)) {
          existing.totalReq += a.requested_quantity
          existing.seenOrders.add(a.order_id)
        }
      } else {
        map.set(key, { name: c?.name ?? '', code: c?.code ?? '?', count: 1, totalQty: a.allocated_quantity, totalReq: a.requested_quantity, seenOrders: new Set([a.order_id]) })
      }
    }
    // Strip seenOrders from result
    const result = new Map<string, { name: string; code: string; count: number; totalQty: number; totalReq: number }>()
    for (const [k, v] of map) {
      result.set(k, { name: v.name, code: v.code, count: v.count, totalQty: v.totalQty, totalReq: v.totalReq })
    }
    return result
  }, [allocations])

  // Under-allocated products
  const productCoverage = useMemo(() => {
    const map = new Map<string, { name: string; cip13: string; req: number; alloc: number }>()
    for (const a of allocations ?? []) {
      const prod = a.product as unknown as { cip13: string; name: string } | undefined
      const existing = map.get(a.product_id)
      if (existing) {
        existing.req += a.requested_quantity
        existing.alloc += a.allocated_quantity
      } else {
        map.set(a.product_id, {
          name: prod?.name ?? '',
          cip13: prod?.cip13 ?? '',
          req: a.requested_quantity,
          alloc: a.allocated_quantity,
        })
      }
    }
    return map
  }, [allocations])

  const underAllocated = useMemo(() => {
    return [...productCoverage.entries()]
      .filter(([, p]) => p.req > 0 && (p.alloc / p.req) < 0.5)
      .sort((a, b) => (a[1].alloc / a[1].req) - (b[1].alloc / b[1].req))
      .slice(0, 5)
  }, [productCoverage])

  const lotAllocCount = allocations?.filter(a => (a.metadata as Record<string, unknown>)?.lot_number).length ?? 0
  const proposedCount = allocations?.filter((a) => a.status === 'proposed').length ?? 0

  // Consolidated lot view (Notion spec: Lot, Produit, Exp, Stock total, Grossistes, A allouer)
  const lotConsolidated = useMemo(() => {
    const map = new Map<string, {
      lotNumber: string
      productName: string
      productCip13: string
      expiryDate: string
      totalStock: number
      wholesalers: Map<string, { code: string; qty: number }>
      allocations: { customerCode: string; qty: number; price: number | null; status: string }[]
      totalAllocated: number
    }>()

    for (const a of allocations ?? []) {
      const meta = (a.metadata ?? {}) as Record<string, unknown>
      const lotNumber = meta.lot_number as string | undefined
      if (!lotNumber) continue

      const prod = a.product as unknown as { cip13: string; name: string } | undefined
      const ws = a.wholesaler as unknown as { code: string } | undefined
      const cust = a.customer as unknown as { code: string } | undefined
      const key = `${lotNumber}::${a.product_id}`

      if (!map.has(key)) {
        map.set(key, {
          lotNumber,
          productName: prod?.name ?? '?',
          productCip13: prod?.cip13 ?? '?',
          expiryDate: (meta.expiry_date as string) ?? '',
          totalStock: 0,
          wholesalers: new Map(),
          allocations: [],
          totalAllocated: 0,
        })
      }

      const lot = map.get(key)!
      lot.totalAllocated += a.allocated_quantity

      // Track wholesaler contributions
      if (ws?.code) {
        const existing = lot.wholesalers.get(ws.code)
        if (existing) existing.qty += a.allocated_quantity
        else lot.wholesalers.set(ws.code, { code: ws.code, qty: a.allocated_quantity })
      }

      lot.allocations.push({
        customerCode: cust?.code ?? '?',
        qty: a.allocated_quantity,
        price: a.prix_applique,
        status: a.status,
      })
    }

    return [...map.values()].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  }, [allocations])

  const filteredAllocations = useMemo(() => {
    if (!allocations) return []
    switch (viewMode) {
      case 'by_lot':
        return [] // Handled separately by lotGroups
      case 'partial':
        return allocations.filter(a => a.allocated_quantity < a.requested_quantity)
      case 'all':
      default:
        return allocations
    }
  }, [allocations, viewMode])

  const startEdit = (allocId: string, field: 'quantity' | 'wholesaler', currentValue: string) => {
    setEditState({ allocId, field, value: currentValue })
  }

  const cancelEdit = () => setEditState(null)

  const saveEdit = () => {
    if (!editState) return
    if (editState.field === 'quantity') {
      const newQty = parseInt(editState.value, 10)
      if (isNaN(newQty) || newQty < 0) { toast.error('Quantite invalide'); return }
      editQtyMut.mutate({ allocId: editState.allocId, newQty })
    } else {
      editWsMut.mutate({ allocId: editState.allocId, newWsId: editState.value })
    }
  }

  // Build bar chart data
  const wholesalerBarData = [...wholesalerSummary.values()].map(w => ({
    label: w.name,
    code: w.code,
    value: w.totalQty,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Revue des Allocations</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Verifiez et ajustez la repartition proposee avant confirmation.
          {pendingEdits > 0 && (
            <Badge variant="secondary" className="ml-2 gap-1">
              <Pencil className="h-3 w-3" /> {pendingEdits} modifications
            </Badge>
          )}
        </p>
      </div>

      {/* KPI cards with gauge */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <AnimatedCounter
                value={allocations?.length ?? 0}
                className="justify-center"
                valueClassName="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground">Allocations</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 text-center">
              <AnimatedCounter
                value={totalRequested}
                className="justify-center"
                valueClassName="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground">Demande</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 text-center">
              <AnimatedCounter
                value={totalAllocated}
                className="justify-center"
                valueClassName="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground">Alloue</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-3 flex flex-col items-center">
              <GaugeChart
                value={fulfillmentRate}
                size={100}
                strokeWidth={8}
                label="Couverture"
              />
            </CardContent>
          </Card>
        </motion.div>
        {lotAllocCount > 0 && (
          <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
            <Card>
              <CardContent className="p-4 text-center">
                <Boxes className="h-5 w-5 mx-auto text-violet-600 mb-1" />
                <AnimatedCounter
                  value={lotAllocCount}
                  className="justify-center"
                  valueClassName="text-2xl font-bold"
                />
                <p className="text-xs text-muted-foreground">Via lots (FEFO)</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Under-allocated products alert */}
      {underAllocated.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-amber-200/60 bg-amber-50/30">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold">{underAllocated.length} produits avec couverture &lt; 50%</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {underAllocated.map(([id, p]) => {
                  const rate = p.req > 0 ? Math.round((p.alloc / p.req) * 100) : 0
                  return (
                    <Tooltip key={id}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700 cursor-help">
                          <span className="font-mono text-[10px]">{p.cip13}</span>
                          <span className="font-bold">{rate}%</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.alloc.toLocaleString('fr-FR')} / {p.req.toLocaleString('fr-FR')} unites</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Summaries with bar charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {wholesalerBarData.length > 0 && (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> Par grossiste
            </h4>
            <HorizontalBarChart
              items={wholesalerBarData}
              formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
            />
          </motion.div>
        )}
        {customerSummary.size > 0 && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Par client
            </h4>
            <HorizontalBarChart
              items={[...customerSummary.values()].map(c => ({
                label: c.name,
                code: c.code,
                value: c.totalQty,
              }))}
              formatValue={(v: number, item?: { label: string; code?: string; value: number }) => {
                const cust = [...customerSummary.values()].find(c => c.name === item?.label)
                const pct = cust && cust.totalReq > 0 ? Math.round((cust.totalQty / cust.totalReq) * 100) : 0
                return `${v.toLocaleString('fr-FR')} u. (${pct}%)`
              }}
            />
          </motion.div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: 'all' as ViewMode, label: `Toutes (${allocations?.length ?? 0})` },
            { value: 'by_lot' as ViewMode, label: `Par lot (${lotConsolidated.length})` },
            { value: 'partial' as ViewMode, label: `Sous-allouees (${allocations?.filter(a => a.allocated_quantity < a.requested_quantity).length ?? 0})` },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setViewMode(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                viewMode === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground sm:ml-auto flex items-center gap-1.5">
          <Pencil className="h-3 w-3" /> Cliquez sur une cellule pour modifier
        </span>
      </div>

      {/* Consolidated lot view */}
      {viewMode === 'by_lot' && lotConsolidated.length > 0 && (
        <div className="border rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead>Exp</TableHead>
                <TableHead>Grossistes</TableHead>
                <TableHead className="text-right">Alloue</TableHead>
                <TableHead>Repartition clients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotConsolidated.map((lot) => {
                const isExpiringSoon = lot.expiryDate && (() => {
                  const exp = new Date(lot.expiryDate)
                  const now = new Date()
                  const diffMonths = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth())
                  return diffMonths <= 3
                })()
                return (
                  <TableRow key={`${lot.lotNumber}::${lot.productCip13}`}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[10px] gap-0.5">
                        <Boxes className="h-2.5 w-2.5" />
                        {lot.lotNumber}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-mono text-xs">{lot.productCip13}</span>
                        <p className="text-xs text-muted-foreground truncate max-w-[160px]">{lot.productName}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs tabular-nums flex items-center gap-1 ${isExpiringSoon ? 'text-red-600 font-semibold' : ''}`}>
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) : '-'}
                        {isExpiringSoon && <AlertTriangle className="h-3 w-3 text-red-500" />}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {[...lot.wholesalers.values()].map(ws => (
                          <Badge key={ws.code} variant="outline" className="text-[9px] gap-0.5">
                            {ws.code} ({ws.qty})
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {lot.totalAllocated.toLocaleString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {lot.allocations.map((alloc, i) => (
                          <Badge
                            key={i}
                            variant={alloc.status === 'confirmed' ? 'default' : alloc.status === 'rejected' ? 'destructive' : 'secondary'}
                            className="text-[9px] gap-0.5"
                          >
                            {alloc.customerCode}: {alloc.qty}u.
                            {alloc.price != null && <span className="text-muted-foreground ml-0.5">@{alloc.price}€</span>}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Allocations table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : viewMode !== 'by_lot' && (allocations?.length ?? 0) > 0 && filteredAllocations.length > 0 ? (
        <div className="border rounded-lg overflow-x-auto max-h-[450px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>CIP13</TableHead>
                <TableHead className="hidden md:table-cell">Produit</TableHead>
                <TableHead>Grossiste</TableHead>
                <TableHead className="hidden lg:table-cell">Lot</TableHead>
                <TableHead className="hidden lg:table-cell">Expiry</TableHead>
                <TableHead className="text-right">Demande</TableHead>
                <TableHead className="text-right">Alloue</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAllocations.map((alloc) => {
                const cust = alloc.customer as unknown as { code: string } | undefined
                const prod = alloc.product as unknown as { cip13: string; name: string } | undefined
                const ws = alloc.wholesaler as unknown as { code: string } | undefined
                const isFull = alloc.allocated_quantity >= alloc.requested_quantity
                const isEditingQty = editState?.allocId === alloc.id && editState.field === 'quantity'
                const isEditingWs = editState?.allocId === alloc.id && editState.field === 'wholesaler'

                return (
                  <TableRow key={alloc.id} className={!isFull ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}>
                    <TableCell className="font-mono text-sm font-medium">{cust?.code ?? '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{prod?.cip13 ?? '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-[180px] truncate">{prod?.name ?? '-'}</TableCell>

                    <TableCell className="min-w-[120px]">
                      {isEditingWs ? (
                        <div className="flex items-center gap-1">
                          <Select
                            value={editState.value}
                            onValueChange={(v) => setEditState({ ...editState, value: v })}
                          >
                            <SelectTrigger className="h-7 text-xs w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(allWholesalers ?? []).map(w => (
                                <SelectItem key={w.id} value={w.id}>{w.code ?? w.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveEdit}>
                            <Check className="h-3 w-3 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="font-medium text-sm hover:text-primary transition-colors flex items-center gap-1 group"
                          onClick={() => startEdit(alloc.id, 'wholesaler', alloc.wholesaler_id)}
                        >
                          {ws?.code ?? '-'}
                          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      )}
                    </TableCell>

                    {(() => {
                      const meta = (alloc.metadata ?? {}) as Record<string, unknown>
                      const lotNumber = meta.lot_number as string | undefined
                      const expiryDate = meta.expiry_date as string | undefined
                      return (
                        <>
                          <TableCell className="hidden lg:table-cell">
                            {lotNumber ? (
                              <Badge variant="secondary" className="text-[10px] gap-0.5 font-mono">
                                <Boxes className="h-2.5 w-2.5" />
                                {lotNumber.length > 8 ? lotNumber.slice(0, 8) + '...' : lotNumber}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {expiryDate ? (
                              <span className="text-xs tabular-nums flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                {new Date(expiryDate).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                        </>
                      )
                    })()}
                    <TableCell className="text-right tabular-nums">{alloc.requested_quantity.toLocaleString('fr-FR')}</TableCell>

                    <TableCell className="text-right min-w-[100px]">
                      {isEditingQty ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            value={editState.value}
                            onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                            className="h-7 w-20 text-xs text-right"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit()
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveEdit}>
                            <Check className="h-3 w-3 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`tabular-nums font-medium hover:text-primary transition-colors group inline-flex items-center gap-1 ${isFull ? '' : 'text-amber-600'}`}
                          onClick={() => startEdit(alloc.id, 'quantity', String(alloc.allocated_quantity))}
                        >
                          {alloc.allocated_quantity.toLocaleString('fr-FR')}
                          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={alloc.status === 'confirmed' ? 'default' : alloc.status === 'rejected' ? 'destructive' : 'secondary'}
                        className="text-[10px]"
                      >
                        {alloc.status === 'confirmed' ? 'Confirme' : alloc.status === 'rejected' ? 'Rejete' : 'Propose'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : viewMode !== 'by_lot' && (allocations?.length ?? 0) === 0 ? (
        <Card className="ivory-card-empty">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Aucune allocation</p>
            <p className="text-sm text-muted-foreground mt-1">Lancez l'allocation a l'etape precedente.</p>
            {onBack && (
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onBack}>
                <ArrowRight className="h-4 w-4 rotate-180" />
                Retour a l'allocation
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {allocations && allocations.length > 0 ? (
        <div className="flex justify-end gap-3">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={confirmMut.isPending}
            className="gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            {proposedCount > 0 ? `Confirmer ${proposedCount} allocations` : 'Continuer'}
            {!confirmMut.isPending && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      ) : null}

      <FinalAllocationConfirmationModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        proposedCount={proposedCount}
        totalAllocations={allocations?.length ?? 0}
        totalRequested={totalRequested}
        totalAllocated={totalAllocated}
        fulfillmentRate={fulfillmentRateStr}
        wholesalerSummary={[...wholesalerSummary.values()]}
        customerSummary={[...customerSummary.values()]}
        onConfirm={() => confirmMut.mutate()}
        onBack={() => { setConfirmOpen(false); onBack?.() }}
        loading={confirmMut.isPending}
      />
    </div>
  )
}
