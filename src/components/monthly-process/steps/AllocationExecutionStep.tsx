import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Cpu, ArrowRight, CheckCircle, AlertTriangle, Package, Truck } from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess } from '@/types/database'

interface AllocationExecutionStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function AllocationExecutionStep({ process, onNext }: AllocationExecutionStepProps) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready')

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

  const allocateMut = useMutation({
    mutationFn: async () => {
      setPhase('running')

      // Simple allocation algorithm:
      // For each order, find a wholesaler with available quota and create an allocation
      const orders = orderStats ?? []
      if (orders.length === 0) throw new Error('Aucune commande a allouer')

      // Get all wholesalers
      const { data: wholesalers } = await supabase.from('wholesalers').select('id, name, code')
      if (!wholesalers || wholesalers.length === 0) throw new Error('Aucun grossiste disponible')

      // Get quotas for this month
      const monthDate = `${process.year}-${String(process.month).padStart(2, '0')}-01`
      const { data: quotas } = await supabase
        .from('wholesaler_quotas')
        .select('*')
        .eq('month', monthDate)

      // Build quota map: productId -> [{wholesalerId, remaining}]
      const quotaMap = new Map<string, { wholesaler_id: string; remaining: number }[]>()
      for (const q of quotas ?? []) {
        const list = quotaMap.get(q.product_id) ?? []
        list.push({ wholesaler_id: q.wholesaler_id, remaining: q.quota_quantity + (q.extra_available ?? 0) })
        quotaMap.set(q.product_id, list)
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

      for (const order of orders) {
        const available = quotaMap.get(order.product_id)
        let allocatedQty = 0
        let selectedWholesaler = wholesalers[0].id // fallback to first wholesaler

        if (available && available.length > 0) {
          // Find wholesaler with most remaining
          available.sort((a, b) => b.remaining - a.remaining)
          const best = available[0]
          selectedWholesaler = best.wholesaler_id
          allocatedQty = Math.min(order.quantity, best.remaining)
          best.remaining -= allocatedQty
        } else {
          // No quota data - allocate requested as-is with first wholesaler
          allocatedQty = order.quantity
        }

        allocations.push({
          monthly_process_id: process.id,
          order_id: order.id,
          customer_id: order.customer_id,
          product_id: order.product_id,
          wholesaler_id: selectedWholesaler,
          requested_quantity: order.quantity,
          allocated_quantity: allocatedQty,
          status: 'proposed',
          metadata: {},
        })
      }

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
      setPhase('ready')
      toast.error(err.message)
    },
  })

  const orderCount = orderStats?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Lancement de l'Allocation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          L'algorithme va repartir les commandes entre les grossistes selon les quotas disponibles.
        </p>
      </div>

      {existingAllocations != null && existingAllocations > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm">
              <strong>{existingAllocations}</strong> allocations existantes. Relancer l'allocation ajoutera de nouvelles entrees.
            </p>
          </CardContent>
        </Card>
      )}

      {phase === 'ready' && (
        <div className="space-y-4">
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
                  <p className="text-2xl font-bold">Auto</p>
                  <p className="text-xs text-muted-foreground">Repartition par quotas</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="p-6 text-center space-y-4">
              <Cpu className="h-12 w-12 mx-auto text-primary" />
              <div>
                <p className="font-semibold">Pret a lancer l'allocation</p>
                <p className="text-sm text-muted-foreground mt-1">
                  L'algorithme repartira {orderCount} commandes entre les grossistes disponibles.
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
        <div className="py-12 text-center space-y-4">
          <div className="relative mx-auto w-16 h-16">
            <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full" />
            <Cpu className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-lg font-medium">Allocation en cours...</p>
          <p className="text-sm text-muted-foreground">Repartition des commandes entre les grossistes</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="py-8 text-center space-y-4">
          <CheckCircle className="h-14 w-14 text-green-500 mx-auto" />
          <div>
            <p className="text-xl font-semibold">Allocation terminee</p>
            <p className="text-sm text-muted-foreground mt-1">
              {allocateMut.data} allocations generees avec succes.
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
