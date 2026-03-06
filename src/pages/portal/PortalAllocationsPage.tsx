import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileCheck, Search, CheckCircle2, XCircle, Package, BarChart3, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'

const confirmationLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'En attente', variant: 'outline' },
  confirmed: { label: 'Confirmee', variant: 'default' },
  refused: { label: 'Refusee', variant: 'destructive' },
}

export default function PortalAllocationsPage() {
  const { customerId } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [refuseDialog, setRefuseDialog] = useState<{ id: string; productName: string } | null>(null)
  const [refuseNote, setRefuseNote] = useState('')

  const { data: allocations, isLoading } = useQuery({
    queryKey: ['portal-allocations', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('allocations')
        .select('*, products(name, cip13), wholesalers(name)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: 'confirmed' | 'refused'; note?: string }) => {
      const { error } = await supabase
        .from('allocations')
        .update({
          confirmation_status: status,
          confirmation_note: note ?? null,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-allocations'] })
      toast.success('Allocation mise a jour')
    },
    onError: () => toast.error('Erreur lors de la mise a jour'),
  })

  const handleConfirm = (id: string) => {
    updateMutation.mutate({ id, status: 'confirmed' })
  }

  const handleRefuse = () => {
    if (!refuseDialog) return
    updateMutation.mutate({ id: refuseDialog.id, status: 'refused', note: refuseNote })
    setRefuseDialog(null)
    setRefuseNote('')
  }

  const filtered = (allocations ?? []).filter((a: any) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      a.products?.name?.toLowerCase().includes(s) ||
      a.products?.cip13?.includes(s) ||
      a.wholesalers?.name?.toLowerCase().includes(s)
    )
  })

  const totalAllocated = filtered.reduce((s: number, a: any) => s + (a.allocated_quantity || 0), 0)
  const confirmedCount = filtered.filter((a: any) => a.confirmation_status === 'confirmed').length
  const pendingCount = filtered.filter((a: any) => a.confirmation_status === 'pending').length
  const satisfactionRate = filtered.length > 0 ? Math.round((confirmedCount / filtered.length) * 100) : 0

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-6xl">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.08)' }}>
              <FileCheck className="h-4.5 w-4.5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Allocations</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
              <Package className="h-4.5 w-4.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Qte allouee</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{totalAllocated.toLocaleString('fr-FR')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.08)' }}>
              <BarChart3 className="h-4.5 w-4.5 text-yellow-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>En attente</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.08)' }}>
              <ThumbsUp className="h-4.5 w-4.5 text-green-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Taux confirmation</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{satisfactionRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Allocations table */}
      <Card className="ivory-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-[15px]">Mes allocations</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-[12px] w-[200px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileCheck className="h-10 w-10 mb-3" style={{ color: 'var(--ivory-text-muted)', opacity: 0.3 }} />
              <p className="text-[13px] font-medium" style={{ color: 'var(--ivory-text-heading)' }}>Aucune allocation</p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
                Les allocations apparaitront ici apres le processus mensuel.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Produit</TableHead>
                    <TableHead className="text-[11px]">CIP13</TableHead>
                    <TableHead className="text-[11px]">Grossiste</TableHead>
                    <TableHead className="text-[11px] text-right">Qte allouee</TableHead>
                    <TableHead className="text-[11px] text-right">Prix</TableHead>
                    <TableHead className="text-[11px]">Exp.</TableHead>
                    <TableHead className="text-[11px]">Statut</TableHead>
                    <TableHead className="text-[11px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((alloc: any) => {
                    const cs = confirmationLabels[alloc.confirmation_status] ?? confirmationLabels.pending
                    const expiry = alloc.metadata?.expiry_date
                    const lot = alloc.metadata?.lot_number
                    return (
                      <TableRow key={alloc.id}>
                        <TableCell className="text-[12px] font-medium max-w-[200px] truncate">
                          {alloc.products?.name ?? '-'}
                        </TableCell>
                        <TableCell className="text-[12px] font-mono">{alloc.products?.cip13 ?? '-'}</TableCell>
                        <TableCell className="text-[12px]">{alloc.wholesalers?.name ?? '-'}</TableCell>
                        <TableCell className="text-[12px] text-right font-medium">
                          {alloc.allocated_quantity?.toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-[12px] text-right">
                          {alloc.unit_price ? `${Number(alloc.unit_price).toFixed(2)} EUR` : '-'}
                        </TableCell>
                        <TableCell className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                          <div>
                            {expiry ? new Date(expiry).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '-'}
                          </div>
                          {lot && <div className="text-[10px] font-mono opacity-60">Lot: {lot}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cs.variant} className="text-[10px]">{cs.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {alloc.confirmation_status === 'pending' && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleConfirm(alloc.id)}
                                disabled={updateMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setRefuseDialog({ id: alloc.id, productName: alloc.products?.name ?? 'ce produit' })}
                                disabled={updateMutation.isPending}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refuse dialog */}
      <Dialog open={!!refuseDialog} onOpenChange={() => { setRefuseDialog(null); setRefuseNote('') }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Refuser l'allocation</DialogTitle>
          </DialogHeader>
          <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
            Vous etes sur le point de refuser l'allocation pour <strong>{refuseDialog?.productName}</strong>.
          </p>
          <Textarea
            placeholder="Motif du refus (optionnel)..."
            value={refuseNote}
            onChange={(e) => setRefuseNote(e.target.value)}
            className="text-[12px] min-h-[80px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setRefuseDialog(null); setRefuseNote('') }}>
              Annuler
            </Button>
            <Button variant="destructive" size="sm" onClick={handleRefuse} disabled={updateMutation.isPending}>
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
