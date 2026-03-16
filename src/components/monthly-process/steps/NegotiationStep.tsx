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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ArrowRight, ArrowLeft, Package, Users, CheckCircle, MessageSquare,
  Filter, Ban, AlertTriangle, Pencil, X, Check, TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess, Order, Customer, Product } from '@/types/database'

// --------------- Types ---------------

interface NegotiationStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

type NegoFilter = 'all' | 'pending' | 'in_progress' | 'validated'

interface ProductGroup {
  productId: string
  cip13: string
  productName: string
  isAnsmBlocked: boolean
  isDiscontinued: boolean
  orders: Order[]
  bestPrice: number | null
  totalQty: number
  negoStatus: 'pending' | 'in_progress' | 'validated' | 'mixed'
}

interface EditingCell {
  orderId: string
  field: 'quantity' | 'unit_price' | 'nego_comment'
  value: string
}

// --------------- Component ---------------

export default function NegotiationStep({ process, onNext, onBack }: NegotiationStepProps) {
  const queryClient = useQueryClient()
  const [negoFilter, setNegoFilter] = useState<NegoFilter>('all')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all')
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // ── Fetch orders with joins ──
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', process.id, 'negotiation'],
    queryFn: async () => {
      const all: Order[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('*, customer:customers(id, name, code, country, is_top_client), product:products(id, cip13, name, is_ansm_blocked, is_discontinued, pfht)')
          .eq('monthly_process_id', process.id)
          .neq('status', 'rejected')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...(data as unknown as Order[]))
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
  })

  // ── Fetch customers for filter ──
  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, code')
        .order('code')
      if (error) throw error
      return data as Pick<Customer, 'id' | 'name' | 'code'>[]
    },
  })

  // ── Group orders by product ──
  const productGroups = useMemo(() => {
    if (!orders || orders.length === 0) return []

    const groupMap = new Map<string, ProductGroup>()

    for (const order of orders) {
      const prod = order.product as unknown as Product | undefined
      const productId = order.product_id
      const existing = groupMap.get(productId)

      if (existing) {
        existing.orders.push(order)
        existing.totalQty += order.quantity
        if (order.unit_price != null && (existing.bestPrice == null || order.unit_price < existing.bestPrice)) {
          existing.bestPrice = order.unit_price
        }
      } else {
        groupMap.set(productId, {
          productId,
          cip13: prod?.cip13 ?? '?',
          productName: prod?.name ?? '?',
          isAnsmBlocked: prod?.is_ansm_blocked ?? false,
          isDiscontinued: (prod as unknown as { is_discontinued?: boolean })?.is_discontinued ?? false,
          orders: [order],
          bestPrice: order.unit_price,
          totalQty: order.quantity,
          negoStatus: 'pending',
        })
      }
    }

    // Compute nego status per product group
    for (const group of groupMap.values()) {
      const statuses = new Set(group.orders.map(o => o.nego_status || 'pending'))
      if (statuses.size === 1) {
        group.negoStatus = [...statuses][0] as ProductGroup['negoStatus']
      } else if (statuses.has('validated') && statuses.size === 1) {
        group.negoStatus = 'validated'
      } else {
        group.negoStatus = 'mixed'
      }
    }

    return [...groupMap.values()].sort((a, b) => b.totalQty - a.totalQty)
  }, [orders])

  // ── Filter groups ──
  const filteredGroups = useMemo(() => {
    let result = productGroups

    // Filter by client
    if (selectedCustomerId !== 'all') {
      result = result
        .map(g => ({
          ...g,
          orders: g.orders.filter(o => o.customer_id === selectedCustomerId),
        }))
        .filter(g => g.orders.length > 0)
    }

    // Filter by nego status
    if (negoFilter !== 'all') {
      result = result.filter(g => {
        if (negoFilter === 'validated') return g.negoStatus === 'validated'
        if (negoFilter === 'pending') return g.negoStatus === 'pending' || g.negoStatus === 'mixed'
        if (negoFilter === 'in_progress') return g.negoStatus === 'in_progress' || g.negoStatus === 'mixed'
        return true
      })
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(g =>
        g.cip13.includes(q) ||
        g.productName.toLowerCase().includes(q)
      )
    }

    return result
  }, [productGroups, selectedCustomerId, negoFilter, searchQuery])

  // ── Progress stats ──
  const validatedCount = productGroups.filter(g => g.negoStatus === 'validated').length
  const totalCount = productGroups.length

  // ── Inline edit mutation ──
  const editMutation = useMutation({
    mutationFn: async ({ orderId, field, value }: { orderId: string; field: string; value: string }) => {
      const order = orders?.find(o => o.id === orderId)
      if (!order) throw new Error('Commande introuvable')

      const updates: Record<string, unknown> = {
        nego_updated_at: new Date().toISOString(),
      }

      if (field === 'quantity') {
        const newQty = parseInt(value, 10)
        if (isNaN(newQty) || newQty < 0) throw new Error('Quantite invalide')
        // Save original on first edit
        if (order.nego_original_qty == null) {
          updates.nego_original_qty = order.quantity
        }
        updates.quantity = newQty
        updates.nego_status = 'in_progress'
      } else if (field === 'unit_price') {
        const newPrice = parseFloat(value)
        if (isNaN(newPrice) || newPrice < 0) throw new Error('Prix invalide')
        if (order.nego_original_price == null && order.unit_price != null) {
          updates.nego_original_price = order.unit_price
        }
        updates.unit_price = newPrice
        updates.nego_status = 'in_progress'
      } else if (field === 'nego_comment') {
        updates.nego_comment = value || null
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', process.id, 'negotiation'] })
      setEditing(null)
      toast.success('Modification enregistree')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Validate product ──
  const validateProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const productOrders = orders?.filter(o => o.product_id === productId) ?? []
      if (productOrders.length === 0) throw new Error('Aucune commande')

      const { error } = await supabase
        .from('orders')
        .update({
          nego_status: 'validated',
          nego_updated_at: new Date().toISOString(),
        })
        .eq('monthly_process_id', process.id)
        .eq('product_id', productId)
        .neq('status', 'rejected')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', process.id, 'negotiation'] })
      toast.success('Produit valide')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Start editing ──
  const startEdit = useCallback((orderId: string, field: EditingCell['field'], currentValue: string) => {
    setEditing({ orderId, field, value: currentValue })
  }, [])

  const confirmEdit = useCallback(() => {
    if (!editing) return
    editMutation.mutate({
      orderId: editing.orderId,
      field: editing.field,
      value: editing.value,
    })
  }, [editing, editMutation])

  const cancelEdit = useCallback(() => {
    setEditing(null)
  }, [])

  // ── Render ──

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Negociation</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Negociation</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Aucune commande trouvee pour ce processus. Verifiez que les commandes ont ete importees et validees.
          </p>
        </div>
        <div className="flex justify-between">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
          )}
          <Button variant="outline" onClick={onNext} className="gap-1.5 ml-auto">
            Passer <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  const negoStatusColor = (status: string) => {
    switch (status) {
      case 'validated': return 'bg-green-100 text-green-700 border-green-200'
      case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'mixed': return 'bg-amber-100 text-amber-700 border-amber-200'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const negoStatusLabel = (status: string) => {
    switch (status) {
      case 'validated': return 'Valide'
      case 'in_progress': return 'En cours'
      case 'mixed': return 'Mixte'
      default: return 'A traiter'
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Negociation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Negociez les quantites et prix produit par produit avec chaque client. Validez chaque produit une fois les conditions acceptees.
        </p>
      </div>

      {/* Progress + summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="ivory-card-highlight">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-green-600 mb-1" />
            <p className="text-2xl font-bold">{validatedCount}/{totalCount}</p>
            <p className="text-xs text-muted-foreground">Produits traites</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{totalCount}</p>
            <p className="text-xs text-muted-foreground">Produits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{new Set(orders.map(o => o.customer_id)).size}</p>
            <p className="text-xs text-muted-foreground">Clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{orders.filter(o => o.nego_comment).length}</p>
            <p className="text-xs text-muted-foreground">Commentaires</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{validatedCount}/{totalCount} produits traites</span>
          <span className="text-muted-foreground">{totalCount > 0 ? Math.round((validatedCount / totalCount) * 100) : 0}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${totalCount > 0 ? (validatedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Rechercher CIP13 ou nom..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-[240px] h-8"
        />
        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
          <SelectTrigger className="w-[180px] h-8">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les clients</SelectItem>
            {(customers ?? []).map(c => (
              <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={negoFilter} onValueChange={(v) => setNegoFilter(v as NegoFilter)}>
          <SelectTrigger className="w-[170px] h-8">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous ({totalCount})</SelectItem>
            <SelectItem value="pending">A traiter ({productGroups.filter(g => g.negoStatus === 'pending' || g.negoStatus === 'mixed').length})</SelectItem>
            <SelectItem value="in_progress">En cours ({productGroups.filter(g => g.negoStatus === 'in_progress' || g.negoStatus === 'mixed').length})</SelectItem>
            <SelectItem value="validated">Valides ({validatedCount})</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredGroups.length} produits affiches
        </span>
      </div>

      {/* Product groups */}
      {filteredGroups.length === 0 ? (
        <Card className="ivory-card-empty">
          <CardContent className="p-8 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Aucun produit avec ce filtre</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => { setNegoFilter('all'); setSelectedCustomerId('all'); setSearchQuery('') }}>
              Reinitialiser les filtres
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map(group => (
            <Card
              key={group.productId}
              className={`transition-colors ${
                group.negoStatus === 'validated'
                  ? 'border-green-200 bg-green-50/30 dark:bg-green-950/20'
                  : group.isAnsmBlocked || group.isDiscontinued
                    ? 'border-red-200 bg-red-50/20 dark:bg-red-950/10'
                    : ''
              }`}
            >
              <CardContent className="p-4">
                {/* Product header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{group.cip13}</span>
                      <span className="text-sm text-muted-foreground truncate">{group.productName}</span>
                      <Badge variant="outline" className={`text-[10px] ${negoStatusColor(group.negoStatus)}`}>
                        {negoStatusLabel(group.negoStatus)}
                      </Badge>
                      {group.isAnsmBlocked && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <Ban className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-medium">ANSM</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Produit bloque par l'ANSM</TooltipContent>
                        </Tooltip>
                      )}
                      {group.isDiscontinued && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-medium">Arrete</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Produit arrete / discontinue</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{group.orders.length} client{group.orders.length > 1 ? 's' : ''}</span>
                      <span>{group.totalQty.toLocaleString('fr-FR')} u. demandees</span>
                      {group.bestPrice != null && (
                        <span className="flex items-center gap-0.5">
                          <TrendingDown className="h-3 w-3 text-green-600" />
                          Meilleur prix : {group.bestPrice.toFixed(2)} EUR
                        </span>
                      )}
                    </div>
                  </div>
                  {group.negoStatus !== 'validated' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shrink-0 text-green-700 border-green-200 hover:bg-green-50"
                      onClick={() => validateProductMutation.mutate(group.productId)}
                      disabled={validateProductMutation.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Valider
                    </Button>
                  )}
                </div>

                {/* Client orders table */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs text-right">Quantite</TableHead>
                        <TableHead className="text-xs text-right">Prix unitaire</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                        <TableHead className="text-xs">Commentaire</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.orders.map(order => {
                        const cust = order.customer as unknown as { code: string; name: string; is_top_client?: boolean } | undefined
                        const isEditingQty = editing?.orderId === order.id && editing.field === 'quantity'
                        const isEditingPrice = editing?.orderId === order.id && editing.field === 'unit_price'
                        const isEditingComment = editing?.orderId === order.id && editing.field === 'nego_comment'
                        const qtyModified = order.nego_original_qty != null && order.quantity !== order.nego_original_qty
                        const priceModified = order.nego_original_price != null && order.unit_price !== order.nego_original_price
                        const isBestPrice = group.bestPrice != null && order.unit_price != null && order.unit_price === group.bestPrice && group.orders.length > 1

                        return (
                          <TableRow key={order.id} className={qtyModified || priceModified ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}>
                            <TableCell className="text-sm">
                              <span className="font-mono font-medium">{cust?.code ?? '?'}</span>
                              {cust?.is_top_client && <span className="ml-1 text-primary text-[9px]">TOP</span>}
                            </TableCell>

                            {/* Quantity cell */}
                            <TableCell className="text-right">
                              {isEditingQty ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <Input
                                    type="number"
                                    value={editing.value}
                                    onChange={e => setEditing({ ...editing, value: e.target.value })}
                                    className="w-20 h-7 text-xs text-right"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') confirmEdit()
                                      if (e.key === 'Escape') cancelEdit()
                                    }}
                                  />
                                  <button type="button" onClick={confirmEdit} className="text-green-600 hover:text-green-800">
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 hover:bg-muted/60 rounded px-1.5 py-0.5 transition-colors group"
                                  onClick={() => startEdit(order.id, 'quantity', String(order.quantity))}
                                >
                                  <span className={`tabular-nums text-sm font-medium ${qtyModified ? 'text-blue-700' : ''}`}>
                                    {order.quantity.toLocaleString('fr-FR')}
                                  </span>
                                  {qtyModified && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-[10px] text-blue-500 line-through">
                                          {order.nego_original_qty?.toLocaleString('fr-FR')}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>Quantite originale</TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              )}
                            </TableCell>

                            {/* Price cell */}
                            <TableCell className="text-right">
                              {isEditingPrice ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editing.value}
                                    onChange={e => setEditing({ ...editing, value: e.target.value })}
                                    className="w-24 h-7 text-xs text-right"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') confirmEdit()
                                      if (e.key === 'Escape') cancelEdit()
                                    }}
                                  />
                                  <button type="button" onClick={confirmEdit} className="text-green-600 hover:text-green-800">
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 hover:bg-muted/60 rounded px-1.5 py-0.5 transition-colors group"
                                  onClick={() => startEdit(order.id, 'unit_price', order.unit_price != null ? String(order.unit_price) : '')}
                                >
                                  <span className={`tabular-nums text-sm ${priceModified ? 'text-blue-700 font-medium' : 'text-muted-foreground'} ${isBestPrice ? 'text-green-700 font-semibold' : ''}`}>
                                    {order.unit_price != null ? `${order.unit_price.toFixed(2)} EUR` : '-'}
                                  </span>
                                  {priceModified && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-[10px] text-blue-500 line-through">
                                          {order.nego_original_price?.toFixed(2)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>Prix original</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {isBestPrice && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <TrendingDown className="h-3 w-3 text-green-600" />
                                      </TooltipTrigger>
                                      <TooltipContent>Meilleur prix</TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              )}
                            </TableCell>

                            {/* Nego status */}
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${negoStatusColor(order.nego_status || 'pending')}`}>
                                {negoStatusLabel(order.nego_status || 'pending')}
                              </Badge>
                            </TableCell>

                            {/* Comment */}
                            <TableCell>
                              {isEditingComment ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editing.value}
                                    onChange={e => setEditing({ ...editing, value: e.target.value })}
                                    className="h-7 text-xs"
                                    placeholder="Commentaire nego..."
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') confirmEdit()
                                      if (e.key === 'Escape') cancelEdit()
                                    }}
                                  />
                                  <button type="button" onClick={confirmEdit} className="text-green-600 hover:text-green-800">
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 hover:bg-muted/60 rounded px-1.5 py-0.5 transition-colors group text-xs text-muted-foreground max-w-[180px]"
                                  onClick={() => startEdit(order.id, 'nego_comment', order.nego_comment ?? '')}
                                >
                                  <span className="truncate">{order.nego_comment || 'Ajouter...'}</span>
                                  <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              )}
                            </TableCell>

                            {/* Actions */}
                            <TableCell>
                              {(qtyModified || priceModified) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                                      <Pencil className="h-3 w-3" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Modifie en nego</TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
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
        <Button onClick={onNext} className="gap-2">
          Passer a l'etape suivante <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
