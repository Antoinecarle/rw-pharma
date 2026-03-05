import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Flag, CheckCircle, Download, Package, BarChart3, Users, Truck, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

interface FinalizationStepProps {
  process: MonthlyProcess
}

export default function FinalizationStep({ process }: FinalizationStepProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: stats } = useQuery({
    queryKey: ['monthly-process', process.id, 'final-stats'],
    queryFn: async () => {
      const [ordersRes, allocRes, customersRes, wholesalersRes] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('monthly_process_id', process.id),
        supabase.from('allocations').select('id, allocated_quantity, requested_quantity', { count: 'exact' }).eq('monthly_process_id', process.id),
        supabase.from('orders').select('customer_id').eq('monthly_process_id', process.id),
        supabase.from('allocations').select('wholesaler_id').eq('monthly_process_id', process.id),
      ])

      const allocData = allocRes.data ?? []
      const totalRequested = allocData.reduce((s, a) => s + (a.requested_quantity ?? 0), 0)
      const totalAllocated = allocData.reduce((s, a) => s + (a.allocated_quantity ?? 0), 0)
      const uniqueCustomers = new Set((customersRes.data ?? []).map((o) => o.customer_id)).size
      const uniqueWholesalers = new Set((wholesalersRes.data ?? []).map((a) => a.wholesaler_id)).size

      return {
        orders: ordersRes.count ?? 0,
        allocations: allocRes.count ?? 0,
        totalRequested,
        totalAllocated,
        fulfillmentRate: totalRequested > 0 ? ((totalAllocated / totalRequested) * 100).toFixed(1) : '0',
        uniqueCustomers,
        uniqueWholesalers,
      }
    },
  })

  const finalizeMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('monthly_processes')
        .update({ status: 'completed', current_step: 5 })
        .eq('id', process.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success('Processus termine avec succes')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const isCompleted = process.status === 'completed'
  const monthName = MONTH_NAMES[process.month - 1] ?? ''

  const handleExportCSV = () => {
    // Simple CSV export trigger
    toast.info('Export CSV en preparation...')
    // In a real implementation, this would fetch allocations and generate CSV
    supabase
      .from('allocations')
      .select('*, customer:customers(code, name), product:products(cip13, name), wholesaler:wholesalers(code, name)')
      .eq('monthly_process_id', process.id)
      .then(({ data }) => {
        if (!data || data.length === 0) { toast.error('Aucune donnee a exporter'); return }
        const headers = ['Client', 'CIP13', 'Produit', 'Grossiste', 'Demande', 'Alloue', 'Statut']
        const csvRows = data.map((a: Record<string, unknown>) => {
          const cust = a.customer as { code: string; name: string } | null
          const prod = a.product as { cip13: string; name: string } | null
          const ws = a.wholesaler as { code: string; name: string } | null
          return [
            cust?.code ?? '',
            prod?.cip13 ?? '',
            `"${(prod?.name ?? '').replace(/"/g, '""')}"`,
            ws?.code ?? '',
            a.requested_quantity,
            a.allocated_quantity,
            a.status,
          ].join(';')
        })
        const csv = [headers.join(';'), ...csvRows].join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `allocation-${monthName.toLowerCase()}-${process.year}.csv`
        link.click()
        URL.revokeObjectURL(url)
        toast.success('Fichier CSV telecharge')
      })
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className={`h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-4 ${isCompleted ? 'bg-green-100 dark:bg-green-950' : 'bg-primary/10'}`}>
          {isCompleted ? (
            <CheckCircle className="h-8 w-8 text-green-600" />
          ) : (
            <Flag className="h-8 w-8 text-primary" />
          )}
        </div>
        <h3 className="text-xl font-bold">
          {isCompleted ? 'Processus Termine' : 'Finalisation'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isCompleted
            ? `Allocation de ${monthName} ${process.year} terminee avec succes.`
            : `Resumé du processus d'allocation - ${monthName} ${process.year}`
          }
        </p>
        {isCompleted && (
          <Badge variant="default" className="mt-2">Termine</Badge>
        )}
      </div>

      <Separator />

      {/* Final stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-xl font-bold">{stats?.orders ?? 0}</p>
              <p className="text-xs text-muted-foreground">Commandes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xl font-bold">{stats?.allocations ?? 0}</p>
              <p className="text-xs text-muted-foreground">Allocations</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-violet-600 shrink-0" />
            <div>
              <p className="text-xl font-bold">{stats?.uniqueCustomers ?? 0}</p>
              <p className="text-xs text-muted-foreground">Clients</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Truck className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xl font-bold">{stats?.uniqueWholesalers ?? 0}</p>
              <p className="text-xs text-muted-foreground">Grossistes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quantities */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Taux de couverture</span>
            <span className={`text-lg font-bold ${parseFloat(stats?.fulfillmentRate ?? '0') >= 90 ? 'text-green-600' : parseFloat(stats?.fulfillmentRate ?? '0') >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
              {stats?.fulfillmentRate ?? 0}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(parseFloat(stats?.fulfillmentRate ?? '0'), 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{stats?.totalAllocated?.toLocaleString('fr-FR') ?? 0} unites allouees</span>
            <span>{stats?.totalRequested?.toLocaleString('fr-FR') ?? 0} unites demandees</span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row justify-center gap-3">
        <Button variant="outline" onClick={handleExportCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Exporter en CSV
        </Button>

        {!isCompleted && (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={finalizeMut.isPending}
            className="gap-2"
            size="lg"
          >
            <CheckCircle className="h-4 w-4" />
            Terminer le processus
          </Button>
        )}

        <Button variant="outline" onClick={() => navigate('/monthly-processes')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour a la liste
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Terminer le processus ?"
        description={`Le processus d'allocation de ${monthName} ${process.year} sera marque comme termine. Cette action est irreversible.`}
        onConfirm={() => finalizeMut.mutate()}
        loading={finalizeMut.isPending}
        variant="default"
        confirmLabel="Terminer"
        loadingLabel="Finalisation..."
      />
    </div>
  )
}
