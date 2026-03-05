import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CheckCircle, ArrowRight, Package, Users, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { MonthlyProcess, Order } from '@/types/database'

interface OrderReviewStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

export default function OrderReviewStep({ process, onNext, onBack }: OrderReviewStepProps) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', process.id, 'review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customer:customers(id, name, code, country), product:products(id, cip13, name)')
        .eq('monthly_process_id', process.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as Order[]
    },
  })

  const validateMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'validated' })
        .eq('monthly_process_id', process.id)
        .eq('status', 'pending')
      if (error) throw error

      await supabase
        .from('monthly_processes')
        .update({ status: 'reviewing_orders', current_step: 3 })
        .eq('id', process.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success('Commandes validees')
      onNext()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const pendingCount = orders?.filter((o) => o.status === 'pending').length ?? 0
  const totalQty = orders?.reduce((sum, o) => sum + o.quantity, 0) ?? 0

  // Group by customer for summary
  const customerSummary = new Map<string, { name: string; code: string; count: number; totalQty: number }>()
  for (const o of orders ?? []) {
    const key = o.customer_id
    const existing = customerSummary.get(key)
    const cust = o.customer as unknown as { name: string; code: string } | undefined
    if (existing) {
      existing.count++
      existing.totalQty += o.quantity
    } else {
      customerSummary.set(key, {
        name: cust?.name ?? 'Inconnu',
        code: cust?.code ?? '?',
        count: 1,
        totalQty: o.quantity,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Revue des Commandes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Verifiez les commandes importees avant de lancer l'allocation.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{orders?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total commandes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{customerSummary.size}</p>
            <p className="text-xs text-muted-foreground">Clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalQty.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-muted-foreground">Quantite totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">En attente</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer summary */}
      {customerSummary.size > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Resume par client</h4>
          <div className="flex flex-wrap gap-2">
            {[...customerSummary.values()].map((c) => (
              <Badge key={c.code} variant="outline" className="gap-1.5 py-1.5 px-3">
                <span className="font-bold">{c.code}</span>
                <span className="text-muted-foreground">{c.count} cmd / {c.totalQty.toLocaleString('fr-FR')} unites</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Orders table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>CIP13</TableHead>
                <TableHead className="hidden md:table-cell">Produit</TableHead>
                <TableHead className="text-right">Quantite</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Prix</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const cust = order.customer as unknown as { code: string } | undefined
                const prod = order.product as unknown as { cip13: string; name: string } | undefined
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm font-medium">{cust?.code ?? '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{prod?.cip13 ?? '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-[200px] truncate">{prod?.name ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{order.quantity.toLocaleString('fr-FR')}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums text-muted-foreground">
                      {order.unit_price != null ? `${order.unit_price.toFixed(2)} EUR` : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.status === 'validated' ? 'default' : 'secondary'} className="text-[10px]">
                        {order.status === 'validated' ? 'Valide' : 'En attente'}
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
            <p className="font-medium">Aucune commande</p>
            <p className="text-sm text-muted-foreground mt-1">Retournez a l'etape precedente pour importer des commandes.</p>
            {onBack && (
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onBack}>
                <ArrowRight className="h-4 w-4 rotate-180" />
                Retour a l'import
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {orders && orders.length > 0 && (
        <div className="flex justify-end gap-3">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={validateMut.isPending}
            className="gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            {pendingCount > 0 ? `Valider ${pendingCount} commandes` : 'Confirmer et continuer'}
            {!validateMut.isPending && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Valider les commandes ?"
        description={`${pendingCount} commandes seront marquees comme validees. Cette action lancera l'etape d'allocation.`}
        onConfirm={() => validateMut.mutate()}
        loading={validateMut.isPending}
        variant="default"
        confirmLabel="Valider les commandes"
        loadingLabel="Validation..."
      />
    </div>
  )
}
