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
import { CheckCircle, ArrowRight, BarChart3, Truck, AlertTriangle, Pencil, Check, X, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'
import FinalAllocationConfirmationModal from '@/components/allocations/FinalAllocationConfirmationModal'
import type { MonthlyProcess, Allocation, Wholesaler } from '@/types/database'

interface AllocationReviewStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

type ViewMode = 'all' | 'partial'

interface EditState {
  allocId: string
  field: 'quantity' | 'wholesaler'
  value: string
}

const cardVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.08, type: 'spring', stiffness: 300, damping: 25 },
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
      const { data, error } = await supabase
        .from('allocations')
        .select('*, customer:customers(id, name, code), product:products(id, cip13, name), wholesaler:wholesalers(id, name, code)')
        .eq('monthly_process_id', process.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Allocation[]
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
        .update({ status: 'reviewing_allocations', current_step: 5 })
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

  const totalRequested = allocations?.reduce((s, a) => s + a.requested_quantity, 0) ?? 0
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

  // Group by customer
  const customerSummary = new Map<string, { name: string; code: string; count: number; totalQty: number }>()
  for (const a of allocations ?? []) {
    const key = a.customer_id
    const c = a.customer as unknown as { name: string; code: string } | undefined
    const existing = customerSummary.get(key)
    if (existing) {
      existing.count++
      existing.totalQty += a.allocated_quantity
    } else {
      customerSummary.set(key, { name: c?.name ?? '', code: c?.code ?? '?', count: 1, totalQty: a.allocated_quantity })
    }
  }

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

  const proposedCount = allocations?.filter((a) => a.status === 'proposed').length ?? 0

  const filteredAllocations = useMemo(() => {
    if (!allocations) return []
    switch (viewMode) {
      case 'partial':
        return allocations.filter(a => a.allocated_quantity < a.requested_quantity)
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="hover:shadow-md transition-shadow">
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
          <Card className="hover:shadow-md transition-shadow">
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
          <Card className="hover:shadow-md transition-shadow">
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
          <Card className="hover:shadow-md transition-shadow">
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
      </div>

      {/* Under-allocated products alert */}
      {underAllocated.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
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
              formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
            />
          </motion.div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {[
            { value: 'all' as ViewMode, label: `Toutes (${allocations?.length ?? 0})` },
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
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
          <Pencil className="h-3 w-3" /> Cliquez sur une cellule pour modifier
        </span>
      </div>

      {/* Allocations table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : filteredAllocations.length > 0 ? (
        <div className="border rounded-lg overflow-x-auto max-h-[450px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>CIP13</TableHead>
                <TableHead className="hidden md:table-cell">Produit</TableHead>
                <TableHead>Grossiste</TableHead>
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
      ) : (
        <Card className="border-dashed">
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
      )}

      {allocations && allocations.length > 0 && (
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
      )}

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
