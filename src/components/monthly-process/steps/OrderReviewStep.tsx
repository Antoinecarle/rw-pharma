import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { CheckCircle, ArrowRight, Package, Users, AlertTriangle, ShieldAlert, Copy, Filter, XCircle, Ban, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import HorizontalBarChart from '@/components/ui/horizontal-bar'
import type { MonthlyProcess, Order } from '@/types/database'

interface OrderReviewStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

type AnomalyType = 'duplicate' | 'outlier' | 'ansm_blocked' | 'no_documents'

interface Anomaly {
  orderId: string
  type: AnomalyType
  message: string
}

const ANOMALY_LABELS: Record<AnomalyType, { label: string; color: string; icon: typeof AlertTriangle }> = {
  duplicate: { label: 'Doublon', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Copy },
  outlier: { label: 'Outlier quantité', color: 'text-red-600 bg-red-50 border-red-200', icon: AlertTriangle },
  ansm_blocked: { label: 'ANSM bloqué', color: 'text-red-600 bg-red-50 border-red-200', icon: Ban },
  no_documents: { label: 'Documents manquants', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: ShieldAlert },
}

type FilterMode = 'all' | 'anomalies' | 'pending' | 'validated' | 'customer'

export default function OrderReviewStep({ process, onNext, onBack }: OrderReviewStepProps) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [rejectOpen, setRejectOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const isProcessLocked = process.status === 'completed' || process.status === 'finalizing'

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', process.id, 'review'],
    queryFn: async () => {
      const all: Order[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('*, customer:customers(id, name, code, country, is_top_client, documents, min_lot_acceptable), product:products(id, cip13, name, is_ansm_blocked, expiry_dates)')
          .eq('monthly_process_id', process.id)
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

  // Fetch ALL active customers to detect who has no orders
  const { data: allCustomers } = useQuery({
    queryKey: ['customers', 'all-for-review'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, code, is_top_client')
      return (data ?? []) as { id: string; name: string; code: string; is_top_client: boolean }[]
    },
  })

  // Detect anomalies
  const anomalies = useMemo(() => {
    if (!orders || orders.length === 0) return new Map<string, Anomaly[]>()

    const anomalyMap = new Map<string, Anomaly[]>()
    const addAnomaly = (orderId: string, anomaly: Anomaly) => {
      const list = anomalyMap.get(orderId) ?? []
      list.push(anomaly)
      anomalyMap.set(orderId, list)
    }

    // 1. Detect duplicates (same customer + same CIP13)
    const seen = new Map<string, string[]>()
    for (const o of orders) {
      const key = `${o.customer_id}__${o.product_id}`
      const ids = seen.get(key) ?? []
      ids.push(o.id)
      seen.set(key, ids)
    }
    for (const [, ids] of seen) {
      if (ids.length > 1) {
        for (const id of ids) {
          addAnomaly(id, { orderId: id, type: 'duplicate', message: `Doublon : ${ids.length} commandes identiques (meme client + produit)` })
        }
      }
    }

    // 2. Detect outliers (quantity > 3x average for this product)
    const productQty = new Map<string, number[]>()
    for (const o of orders) {
      const list = productQty.get(o.product_id) ?? []
      list.push(o.quantity)
      productQty.set(o.product_id, list)
    }
    for (const o of orders) {
      const quantities = productQty.get(o.product_id) ?? []
      if (quantities.length < 2) continue
      const avg = quantities.reduce((s, q) => s + q, 0) / quantities.length
      if (avg > 0 && o.quantity > avg * 3) {
        addAnomaly(o.id, {
          orderId: o.id,
          type: 'outlier',
          message: `Quantité ${o.quantity.toLocaleString('fr-FR')} = ${(o.quantity / avg).toFixed(1)}x la moyenne (${Math.round(avg).toLocaleString('fr-FR')})`,
        })
      }
    }

    // 3. Detect ANSM-blocked products
    for (const o of orders) {
      const prod = o.product as unknown as { is_ansm_blocked?: boolean } | undefined
      if (prod?.is_ansm_blocked) {
        addAnomaly(o.id, { orderId: o.id, type: 'ansm_blocked', message: 'Produit interdit a l\'export par l\'ANSM' })
      }
    }

    // 4. Detect customers without valid documents
    const checkedCustomers = new Set<string>()
    for (const o of orders) {
      if (checkedCustomers.has(o.customer_id)) continue
      checkedCustomers.add(o.customer_id)
      const cust = o.customer as unknown as { documents?: Record<string, unknown> | null } | undefined
      const docs = cust?.documents
      if (!docs || Object.keys(docs).length === 0) {
        // Mark all orders for this customer
        for (const o2 of orders) {
          if (o2.customer_id === o.customer_id) {
            addAnomaly(o2.id, { orderId: o2.id, type: 'no_documents', message: 'Client sans documents WDA/GDP' })
          }
        }
      }
    }

    return anomalyMap
  }, [orders])

  const anomalyOrders = useMemo(() => {
    return new Set(anomalies.keys())
  }, [anomalies])

  const anomalyStats = useMemo(() => {
    const stats = { duplicate: 0, outlier: 0, ansm_blocked: 0, no_documents: 0 }
    for (const [, list] of anomalies) {
      for (const a of list) {
        stats[a.type]++
      }
    }
    return stats
  }, [anomalies])

  const totalAnomalies = anomalyOrders.size

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
      toast.success('Commandes validées')
      onNext()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const rejectMut = useMutation({
    mutationFn: async () => {
      if (selectedOrders.size === 0) throw new Error('Aucune commande sélectionnée')
      const { error } = await supabase
        .from('orders')
        .update({ status: 'rejected' })
        .in('id', [...selectedOrders])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
      setSelectedOrders(new Set())
      setRejectOpen(false)
      toast.success(`${selectedOrders.size} commandes rejetées`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const pendingCount = orders?.filter((o) => o.status === 'pending').length ?? 0
  const totalQty = orders?.reduce((sum, o) => sum + o.quantity, 0) ?? 0

  // Group by customer for summary (keyed by customer_id) — includes ALL customers
  const customerSummary = useMemo(() => {
    const map = new Map<string, { name: string; code: string; count: number; totalQty: number; isTop: boolean }>()

    // First, seed with ALL customers (0 orders)
    for (const c of allCustomers ?? []) {
      map.set(c.id, {
        name: c.name,
        code: c.code ?? '?',
        count: 0,
        totalQty: 0,
        isTop: c.is_top_client ?? false,
      })
    }

    // Then, overlay with actual order data
    for (const o of orders ?? []) {
      const key = o.customer_id
      const existing = map.get(key)
      const cust = o.customer as unknown as { name: string; code: string; is_top_client?: boolean } | undefined
      if (existing) {
        existing.count++
        existing.totalQty += o.quantity
      } else {
        map.set(key, {
          name: cust?.name ?? 'Inconnu',
          code: cust?.code ?? '?',
          count: 1,
          totalQty: o.quantity,
          isTop: cust?.is_top_client ?? false,
        })
      }
    }
    return map
  }, [orders, allCustomers])

  const customersWithoutOrders = useMemo(() => {
    return [...customerSummary.values()].filter(c => c.count === 0).length
  }, [customerSummary])

  // Filter orders
  const filteredOrders = useMemo(() => {
    if (!orders) return []
    let result = orders
    // Apply customer filter first
    if (filter === 'customer' && selectedCustomerId) {
      result = result.filter(o => o.customer_id === selectedCustomerId)
    } else {
      switch (filter) {
        case 'anomalies': result = result.filter(o => anomalyOrders.has(o.id)); break
        case 'pending': result = result.filter(o => o.status === 'pending'); break
        case 'validated': result = result.filter(o => o.status === 'validated'); break
      }
    }
    return result
  }, [orders, filter, anomalyOrders, selectedCustomerId])

  const toggleSelect = (id: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllAnomalies = () => {
    setSelectedOrders(new Set(anomalyOrders))
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Revue des Commandes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Vérifiez les commandes importées avant de lancer l'allocation.
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
            <p className="text-xs text-muted-foreground">Quantité totale</p>
          </CardContent>
        </Card>
        <Card className={totalAnomalies > 0 ? 'border-amber-200' : ''}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${totalAnomalies > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
            <p className={`text-2xl font-bold ${totalAnomalies > 0 ? 'text-amber-600' : ''}`}>{totalAnomalies}</p>
            <p className="text-xs text-muted-foreground">Anomalies</p>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly breakdown */}
      {totalAnomalies > 0 && (
        <Card className="border-amber-200/60 bg-amber-50/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold">{totalAnomalies} commandes avec anomalies détectées</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {anomalyStats.duplicate > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700">
                  <Copy className="h-3 w-3" /> {anomalyStats.duplicate} doublons
                </Badge>
              )}
              {anomalyStats.outlier > 0 && (
                <Badge variant="outline" className="gap-1 border-red-200 text-red-700">
                  <AlertTriangle className="h-3 w-3" /> {anomalyStats.outlier} outliers
                </Badge>
              )}
              {anomalyStats.ansm_blocked > 0 && (
                <Badge variant="outline" className="gap-1 border-red-200 text-red-700">
                  <Ban className="h-3 w-3" /> {anomalyStats.ansm_blocked} ANSM bloqués
                </Badge>
              )}
              {anomalyStats.no_documents > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700">
                  <ShieldAlert className="h-3 w-3" /> {anomalyStats.no_documents} sans documents
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFilter('anomalies')}>
                <Filter className="h-3.5 w-3.5" />
                Filtrer les anomalies
              </Button>
              {!isProcessLocked && (
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive" onClick={selectAllAnomalies}>
                  <XCircle className="h-3.5 w-3.5" />
                  Sélectionner pour rejet
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missing customers warning banner */}
      {customersWithoutOrders > 0 && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                {customersWithoutOrders} client{customersWithoutOrders > 1 ? 's' : ''} sans commande ce mois-ci
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                Vérifiez que tous les fichiers de commandes ont bien été importés avant de valider.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer summary */}
      {customerSummary.size > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Résumé par client <span className="text-xs font-normal text-muted-foreground">(cliquer pour filtrer)</span></h4>
          <div className="flex flex-wrap gap-2">
            {[...customerSummary.entries()]
              .sort(([, a], [, b]) => {
                // Customers without orders first
                if (a.count === 0 && b.count > 0) return -1
                if (a.count > 0 && b.count === 0) return 1
                return b.totalQty - a.totalQty
              })
              .map(([custId, c]) => {
              const isActive = filter === 'customer' && selectedCustomerId === custId
              const hasNoOrders = c.count === 0
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    if (hasNoOrders) return // Nothing to filter for customers with 0 orders
                    if (isActive) {
                      setFilter('all')
                      setSelectedCustomerId(null)
                    } else {
                      setFilter('customer')
                      setSelectedCustomerId(custId)
                    }
                  }}
                >
                  <Badge
                    variant={hasNoOrders ? 'destructive' : isActive ? 'default' : 'outline'}
                    className={`gap-1.5 py-1.5 px-3 cursor-pointer transition-all ${
                      hasNoOrders
                        ? 'animate-pulse'
                        : isActive
                          ? 'ring-2 ring-primary/30'
                          : 'hover:bg-muted'
                    }`}
                  >
                    {hasNoOrders && <UserX className="h-3 w-3" />}
                    <span className="font-bold">{c.code}</span>
                    {c.isTop && <span className={hasNoOrders ? 'text-red-100 text-[9px]' : 'text-primary text-[9px]'}>TOP</span>}
                    <span className={hasNoOrders ? 'text-red-100' : isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
                      {hasNoOrders ? '0 commandes' : `${c.count} cmd / ${c.totalQty.toLocaleString('fr-FR')} u.`}
                    </span>
                  </Badge>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Horizontal bar chart — only customers with orders */}
      {[...customerSummary.values()].some(c => c.count > 0) && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Volume par client</p>
            <HorizontalBarChart
              items={[...customerSummary.values()]
                .filter(c => c.count > 0)
                .sort((a, b) => b.totalQty - a.totalQty)
                .map(c => ({
                  label: `${c.name}${c.isTop ? ' ★' : ''}`,
                  code: c.code,
                  value: c.totalQty,
                }))}
              formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
            />
          </CardContent>
        </Card>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filter === 'customer' ? 'all' : filter} onValueChange={(v) => { setFilter(v as FilterMode); setSelectedCustomerId(null) }}>
          <SelectTrigger className="w-[200px] h-8">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes ({orders?.length ?? 0})</SelectItem>
            <SelectItem value="anomalies">Anomalies ({totalAnomalies})</SelectItem>
            <SelectItem value="pending">En attente ({pendingCount})</SelectItem>
            <SelectItem value="validated">Validées ({(orders?.length ?? 0) - pendingCount})</SelectItem>
          </SelectContent>
        </Select>
        {filter === 'customer' && selectedCustomerId && (
          <Badge variant="secondary" className="gap-1">
            Client : {customerSummary.get(selectedCustomerId)?.code ?? '?'}
            <button type="button" onClick={() => { setFilter('all'); setSelectedCustomerId(null) }} className="ml-1 hover:text-foreground">
              <XCircle className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {selectedOrders.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedOrders.size} sélectionnées</Badge>
            <Button variant="destructive" size="sm" className="gap-1 h-8" onClick={() => setRejectOpen(true)}>
              <XCircle className="h-3.5 w-3.5" />
              Rejeter
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedOrders(new Set())}>
              Désélectionner
            </Button>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredOrders.length} commandes affichées
        </span>
      </div>

      {/* Orders table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Client</TableHead>
                <TableHead>CIP13</TableHead>
                <TableHead className="hidden md:table-cell">Produit</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Prix</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Lot min.</TableHead>
                <TableHead className="hidden lg:table-cell">Date d'exp. min</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-20">Alertes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const cust = order.customer as unknown as { code: string; min_lot_acceptable?: number | null } | undefined
                const prod = order.product as unknown as { cip13: string; name: string; is_ansm_blocked?: boolean; expiry_dates?: string[] | null } | undefined
                const orderAnomalies = anomalies.get(order.id) ?? []
                const hasAnomaly = orderAnomalies.length > 0
                const isSelected = selectedOrders.has(order.id)
                const isRejected = order.status === 'rejected'

                return (
                  <TableRow
                    key={order.id}
                    className={`${hasAnomaly ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''} ${isRejected ? 'opacity-40 line-through' : ''}`}
                  >
                    <TableCell>
                      {!isRejected && !isProcessLocked && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(order.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">{cust?.code ?? '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{prod?.cip13 ?? '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-[200px] truncate">{prod?.name ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{order.quantity.toLocaleString('fr-FR')}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums text-muted-foreground">
                      {order.unit_price != null ? `${order.unit_price.toFixed(2)} EUR` : '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
                      {(() => {
                        const meta = order.metadata as Record<string, unknown> | undefined
                        const perOrder = meta?.min_batch_quantity != null ? Number(meta.min_batch_quantity) : null
                        const perClient = cust?.min_lot_acceptable ?? null
                        const val = perOrder ?? perClient
                        return val != null ? val.toLocaleString('fr-FR') : '-'
                      })()}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {(() => {
                        const meta = order.metadata as Record<string, unknown> | undefined
                        const perOrder = meta?.min_expiry_date as string | undefined
                        if (perOrder) return perOrder
                        return prod?.expiry_dates && prod.expiry_dates.length > 0
                          ? prod.expiry_dates.sort()[0]
                          : '-'
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={order.status === 'validated' ? 'default' : order.status === 'allocated' ? 'default' : order.status === 'partially_allocated' ? 'secondary' : order.status === 'rejected' ? 'destructive' : 'secondary'}
                        className="text-[10px]"
                      >
                        {order.status === 'validated' ? 'Valide' : order.status === 'allocated' ? 'Alloue' : order.status === 'partially_allocated' ? 'Partiel' : order.status === 'rejected' ? 'Rejete' : 'En attente'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {orderAnomalies.length > 0 && (
                        <div className="flex gap-0.5">
                          {orderAnomalies.map((a, i) => {
                            const cfg = ANOMALY_LABELS[a.type]
                            const Icon = cfg.icon
                            return (
                              <Tooltip key={i}>
                                <TooltipTrigger asChild>
                                  <span className={`inline-flex items-center justify-center h-5 w-5 rounded ${cfg.color} border`}>
                                    <Icon className="h-3 w-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs">
                                  <p className="text-xs font-medium">{cfg.label}</p>
                                  <p className="text-xs text-muted-foreground">{a.message}</p>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card className="ivory-card-empty">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">
              {filter !== 'all' ? 'Aucune commande avec ce filtre' : 'Aucune commande'}
            </p>
            {filter !== 'all' ? (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilter('all')}>
                Voir toutes les commandes
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Retournez à l'étape précédente pour importer des commandes.</p>
            )}
            {filter === 'all' && onBack && (
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onBack}>
                <ArrowRight className="h-4 w-4 rotate-180" />
                Retour à l'import
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!isProcessLocked && (
        <div className="flex justify-end gap-3">
          {orders && orders.length > 0 ? (
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={validateMut.isPending}
              className="gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              {pendingCount > 0 ? `Valider ${pendingCount} commandes` : 'Confirmer et continuer'}
              {!validateMut.isPending && <ArrowRight className="h-4 w-4" />}
            </Button>
          ) : (
            <Button variant="outline" onClick={onNext} className="gap-2">
              Passer <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={pendingCount > 0 ? 'Valider les commandes ?' : 'Confirmer et continuer ?'}
        description={
          pendingCount > 0
            ? `${pendingCount} commandes seront marquées comme validées.${totalAnomalies > 0 ? ` Attention : ${totalAnomalies} anomalies détectées.` : ''} Cette action lancera l'étape suivante.`
            : `Toutes les ${orders?.length ?? 0} commandes sont déjà validées.${totalAnomalies > 0 ? ` Note : ${totalAnomalies} commandes avec anomalies (non bloquant).` : ''} Passer à l'étape suivante ?`
        }
        onConfirm={() => validateMut.mutate()}
        loading={validateMut.isPending}
        variant="default"
        confirmLabel={pendingCount > 0 ? 'Valider les commandes' : 'Continuer'}
        loadingLabel="Validation..."
      />

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Rejeter ${selectedOrders.size} commandes ?`}
        description="Les commandes sélectionnées seront marquées comme rejetées et ne seront pas incluses dans l'allocation."
        onConfirm={() => rejectMut.mutate()}
        loading={rejectMut.isPending}
        variant="destructive"
        confirmLabel="Rejeter"
        loadingLabel="Rejet en cours..."
      />
    </div>
  )
}
