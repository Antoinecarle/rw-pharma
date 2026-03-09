import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ShoppingCart, Search, Upload, Package, TrendingUp, Clock } from 'lucide-react'
import { toast } from 'sonner'

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'En attente', variant: 'outline' },
  validated: { label: 'Validee', variant: 'default' },
  rejected: { label: 'Rejetee', variant: 'destructive' },
  allocated: { label: 'Allouee', variant: 'secondary' },
}

export default function PortalOrdersPage() {
  const { customerId } = useAuth()
  const [search, setSearch] = useState('')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['portal-orders', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('orders')
        .select('*, products(name, cip13)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const { data: currentProcess } = useQuery({
    queryKey: ['portal-current-process'],
    queryFn: async () => {
      const { data } = await supabase
        .from('monthly_processes')
        .select('id, month, year, status')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  const filteredOrders = (orders ?? []).filter((o: any) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      o.products?.name?.toLowerCase().includes(s) ||
      o.products?.cip13?.includes(s)
    )
  })

  const totalQty = filteredOrders.reduce((sum: number, o: any) => sum + (o.quantity || 0), 0)
  const totalValue = filteredOrders.reduce((sum: number, o: any) => sum + (o.quantity || 0) * (o.unit_price || 0), 0)

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-6xl">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.08)' }}>
              <ShoppingCart className="h-4.5 w-4.5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Lignes de commande</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{filteredOrders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
              <Package className="h-4.5 w-4.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Quantite totale</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{totalQty.toLocaleString('fr-FR')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.08)' }}>
              <TrendingUp className="h-4.5 w-4.5 text-yellow-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Valeur estimee</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>
                {totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current month info */}
      {currentProcess && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px]" style={{ background: 'rgba(13,148,136,0.04)', border: '1px solid rgba(13,148,136,0.1)' }}>
          <Clock className="h-3.5 w-3.5" style={{ color: 'var(--ivory-accent)' }} />
          <span style={{ color: 'var(--ivory-text-heading)' }}>
            Mois en cours : <strong>{new Date(currentProcess.year, currentProcess.month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
          </span>
          <Badge variant="outline" className="ml-2 text-[10px]">{currentProcess.status}</Badge>
        </div>
      )}

      {/* Orders table */}
      <Card className="ivory-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-[15px]">Mes commandes</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-[12px] w-[200px]"
                />
              </div>
              <Button size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => toast.info('Upload de commande bientot disponible')}>
                <Upload className="h-3.5 w-3.5" />
                Deposer un fichier
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="h-10 w-10 mb-3" style={{ color: 'var(--ivory-text-muted)', opacity: 0.3 }} />
              <p className="text-[13px] font-medium" style={{ color: 'var(--ivory-text-heading)' }}>Aucune commande</p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
                Vos commandes apparaitront ici une fois deposees.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Produit</TableHead>
                    <TableHead className="text-[11px]">CIP13</TableHead>
                    <TableHead className="text-[11px] text-right">Quantite</TableHead>
                    <TableHead className="text-[11px] text-right">Prix unitaire</TableHead>
                    <TableHead className="text-[11px]">Statut</TableHead>
                    <TableHead className="text-[11px]">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order: any) => {
                    const status = statusLabels[order.status] ?? statusLabels.pending
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="text-[12px] font-medium max-w-[250px] truncate">
                          {order.products?.name ?? '-'}
                        </TableCell>
                        <TableCell className="text-[12px] font-mono">{order.products?.cip13 ?? '-'}</TableCell>
                        <TableCell className="text-[12px] text-right font-medium">{order.quantity?.toLocaleString('fr-FR')}</TableCell>
                        <TableCell className="text-[12px] text-right">
                          {order.unit_price ? `${Number(order.unit_price).toFixed(2)} EUR` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                          {new Date(order.created_at).toLocaleDateString('fr-FR')}
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
    </div>
  )
}
