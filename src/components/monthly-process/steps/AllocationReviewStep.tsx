import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CheckCircle, ArrowRight, BarChart3, Truck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import FinalAllocationConfirmationModal from '@/components/allocations/FinalAllocationConfirmationModal'
import type { MonthlyProcess, Allocation } from '@/types/database'

interface AllocationReviewStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

export default function AllocationReviewStep({ process, onNext, onBack }: AllocationReviewStepProps) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: allocations, isLoading } = useQuery({
    queryKey: ['allocations', process.id, 'review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('*, customer:customers(id, name, code), product:products(id, cip13, name), wholesaler:wholesalers(id, name, code)')
        .eq('monthly_process_id', process.id)
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as unknown as Allocation[]
    },
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
  const fulfillmentRate = totalRequested > 0 ? ((totalAllocated / totalRequested) * 100).toFixed(1) : '0'

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

  const proposedCount = allocations?.filter((a) => a.status === 'proposed').length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Revue des Allocations</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Verifiez la repartition proposee avant confirmation.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{allocations?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Allocations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalRequested.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-muted-foreground">Demande</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalAllocated.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-muted-foreground">Alloue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${parseFloat(fulfillmentRate) >= 90 ? 'text-green-600' : parseFloat(fulfillmentRate) >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
              {fulfillmentRate}%
            </p>
            <p className="text-xs text-muted-foreground">Taux de couverture</p>
          </CardContent>
        </Card>
      </div>

      {/* Wholesaler summary */}
      {wholesalerSummary.size > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Truck className="h-4 w-4" /> Repartition par grossiste
          </h4>
          <div className="flex flex-wrap gap-2">
            {[...wholesalerSummary.values()].map((w) => (
              <Badge key={w.code} variant="outline" className="gap-1.5 py-1.5 px-3">
                <span className="font-bold">{w.code}</span>
                <span className="text-muted-foreground">{w.count} alloc / {w.totalQty.toLocaleString('fr-FR')} unites</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Allocations table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : allocations && allocations.length > 0 ? (
        <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
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
              {allocations.map((alloc) => {
                const cust = alloc.customer as unknown as { code: string } | undefined
                const prod = alloc.product as unknown as { cip13: string; name: string } | undefined
                const ws = alloc.wholesaler as unknown as { code: string } | undefined
                const isFull = alloc.allocated_quantity >= alloc.requested_quantity
                return (
                  <TableRow key={alloc.id}>
                    <TableCell className="font-mono text-sm font-medium">{cust?.code ?? '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{prod?.cip13 ?? '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-[180px] truncate">{prod?.name ?? '-'}</TableCell>
                    <TableCell className="font-medium">{ws?.code ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{alloc.requested_quantity.toLocaleString('fr-FR')}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${isFull ? '' : 'text-amber-600'}`}>
                      {alloc.allocated_quantity.toLocaleString('fr-FR')}
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
        fulfillmentRate={fulfillmentRate}
        wholesalerSummary={[...wholesalerSummary.values()]}
        customerSummary={[...customerSummary.values()]}
        onConfirm={() => confirmMut.mutate()}
        onBack={() => { setConfirmOpen(false); onBack?.() }}
        loading={confirmMut.isPending}
      />
    </div>
  )
}
