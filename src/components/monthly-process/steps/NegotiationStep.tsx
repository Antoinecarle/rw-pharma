import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowRight, ArrowLeft, Package, Search, CheckCircle, Circle,
  Ban, AlertTriangle, Pencil, X, Check, TrendingUp, Star,
  ChevronLeft, ChevronRight, Clock, MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess, Order, Product } from '@/types/database'

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
  clientCount: number
}

interface EditingCell {
  orderId: string
  field: 'quantity' | 'unit_price' | 'nego_comment'
  value: string
}

interface WholesalerInfo {
  id: string
  code: string
  name: string
}

interface QuotaForProduct {
  wholesalerId: string
  quotaQuantity: number
  extraAvailable: number
}

// --------------- Component ---------------

export default function NegotiationStep({ process, onNext, onBack }: NegotiationStepProps) {
  const queryClient = useQueryClient()
  const [negoFilter, setNegoFilter] = useState<NegoFilter>('all')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNextWarning, setShowNextWarning] = useState(false)
  const [showOnlyCommented, setShowOnlyCommented] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

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
          .select('*, customer:customers(id, name, code, country, is_top_client, min_lot_acceptable, allocation_preferences), product:products(id, cip13, name, is_ansm_blocked, is_discontinued, pfht)')
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

  // customers for filter chips are derived from orders (see orderCustomers memo below)

  // ── Fetch wholesalers ──
  const { data: wholesalers } = useQuery({
    queryKey: ['wholesalers-list-nego'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wholesalers')
        .select('id, name, code')
        .order('code')
      if (error) throw error
      return (data ?? []) as WholesalerInfo[]
    },
  })

  // ── Fetch quotas for this month ──
  const monthDate = `${process.year}-${String(process.month).padStart(2, '0')}-01`
  const { data: quotas } = useQuery({
    queryKey: ['wholesaler-quotas', monthDate, 'nego'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wholesaler_quotas')
        .select('wholesaler_id, product_id, quota_quantity, extra_available')
        .eq('month', monthDate)
      if (error) throw error
      return (data ?? []) as { wholesaler_id: string; product_id: string; quota_quantity: number; extra_available: number }[]
    },
  })

  // ── Fetch customer-wholesaler links ──
  const { data: cwLinks } = useQuery({
    queryKey: ['customer_wholesalers', 'all', 'nego'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customer_wholesalers').select('*')
      if (error) throw error
      return data as { id: string; customer_id: string; wholesaler_id: string; is_open: boolean }[]
    },
  })

  // ── Macro attributions from process metadata (read-only in negotiation) ──
  const macroMap = useMemo(() => {
    return (process.metadata?.macro_attributions as Record<string, Record<string, number>>) ?? {}
  }, [process.metadata])

  // ── Build quota lookup: productId -> QuotaForProduct[] ──
  const quotasByProduct = useMemo(() => {
    if (!quotas) return new Map<string, QuotaForProduct[]>()
    const map = new Map<string, QuotaForProduct[]>()
    for (const q of quotas) {
      const existing = map.get(q.product_id) ?? []
      existing.push({
        wholesalerId: q.wholesaler_id,
        quotaQuantity: q.quota_quantity,
        extraAvailable: q.extra_available,
      })
      map.set(q.product_id, existing)
    }
    return map
  }, [quotas])

  // ── Wholesalers that have quotas (to show as columns) ──
  const activeWholesalers = useMemo(() => {
    if (!wholesalers || !quotas) return []
    const wsIdsWithQuotas = new Set(quotas.map(q => q.wholesaler_id))
    return wholesalers.filter(w => wsIdsWithQuotas.has(w.id))
  }, [wholesalers, quotas])

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
        existing.clientCount = new Set(existing.orders.map(o => o.customer_id)).size
        if (order.unit_price != null && (existing.bestPrice == null || order.unit_price > existing.bestPrice)) {
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
          clientCount: 1,
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

  // ── Unique customers that appear in orders (for filter chips) ──
  const orderCustomers = useMemo(() => {
    if (!orders) return []
    const custMap = new Map<string, { id: string; code: string; name: string }>()
    for (const o of orders) {
      const c = o.customer as unknown as { id: string; code: string; name: string } | undefined
      if (c && !custMap.has(c.id)) {
        custMap.set(c.id, { id: c.id, code: c.code, name: c.name })
      }
    }
    return [...custMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [orders])

  // ── Count of products that have at least one order with a comment ──
  const commentedProductCount = useMemo(() => {
    return productGroups.filter(g => g.orders.some(o => o.nego_comment && o.nego_comment.trim() !== '')).length
  }, [productGroups])

  // ── Filter groups (for left panel list) ──
  const filteredGroups = useMemo(() => {
    let result = productGroups

    // Filter by client — show only products that this client ordered
    if (selectedCustomerId !== 'all') {
      result = result.filter(g => g.orders.some(o => o.customer_id === selectedCustomerId))
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

    // Filter by commented products only
    if (showOnlyCommented) {
      result = result.filter(g => g.orders.some(o => o.nego_comment && o.nego_comment.trim() !== ''))
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
  }, [productGroups, selectedCustomerId, negoFilter, showOnlyCommented, searchQuery])

  // ── Auto-select first product ──
  useEffect(() => {
    if (filteredGroups.length > 0 && (!selectedProductId || !filteredGroups.find(g => g.productId === selectedProductId))) {
      setSelectedProductId(filteredGroups[0].productId)
    }
  }, [filteredGroups, selectedProductId])

  // ── Progress stats ──
  const validatedCount = productGroups.filter(g => g.negoStatus === 'validated').length
  const pendingCount = productGroups.filter(g => g.negoStatus === 'pending' || g.negoStatus === 'mixed').length
  const inProgressCount = productGroups.filter(g => g.negoStatus === 'in_progress' || g.negoStatus === 'mixed').length
  const totalCount = productGroups.length

  // ── Selected group and its detail orders ──
  const selectedGroup = useMemo(() => {
    if (!selectedProductId) return null
    // Use the full productGroups (not filtered) to get all orders for this product
    return productGroups.find(g => g.productId === selectedProductId) ?? null
  }, [productGroups, selectedProductId])

  // ── Detail orders (filtered by selected customer if any, but show all in detail) ──
  const detailOrders = useMemo(() => {
    if (!selectedGroup) return []
    return selectedGroup.orders.sort((a, b) => {
      const ca = a.customer as unknown as { code: string; is_top_client?: boolean } | undefined
      const cb = b.customer as unknown as { code: string; is_top_client?: boolean } | undefined
      // Top clients first
      if (ca?.is_top_client && !cb?.is_top_client) return -1
      if (!ca?.is_top_client && cb?.is_top_client) return 1
      return (ca?.code ?? '').localeCompare(cb?.code ?? '')
    })
  }, [selectedGroup])

  // ── Navigation between products ──
  const currentIndex = filteredGroups.findIndex(g => g.productId === selectedProductId)
  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedProductId(filteredGroups[currentIndex - 1].productId)
      setEditing(null)
    }
  }, [currentIndex, filteredGroups])
  const goToNext = useCallback(() => {
    if (currentIndex < filteredGroups.length - 1) {
      setSelectedProductId(filteredGroups[currentIndex + 1].productId)
      setEditing(null)
    }
  }, [currentIndex, filteredGroups])

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
        if (isNaN(newQty) || newQty < 0) throw new Error('Quantité invalide')
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
      toast.success('Modification enregistrée')
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

  // ── Validate single order ──
  const validateOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .update({
          nego_status: 'validated',
          nego_updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', process.id, 'negotiation'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Unvalidate single order ──
  const unvalidateOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('orders')
        .update({
          nego_status: 'pending',
          nego_updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', process.id, 'negotiation'] })
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

  const cancelRef = useRef(false)
  const cancelEdit = useCallback(() => {
    cancelRef.current = true
    setEditing(null)
    setTimeout(() => { cancelRef.current = false }, 100)
  }, [])

  const handleBlurSave = useCallback(() => {
    // Delay to let cancel button click fire first
    setTimeout(() => {
      if (!cancelRef.current && editing) {
        confirmEdit()
      }
    }, 150)
  }, [editing, confirmEdit])

  // ── Check if customer-wholesaler link is open ──
  const isWholesalerOpenForCustomer = useCallback((customerId: string, wholesalerId: string) => {
    if (!cwLinks) return true
    const link = cwLinks.find(l => l.customer_id === customerId && l.wholesaler_id === wholesalerId)
    return link ? link.is_open : true
  }, [cwLinks])

  // ── Get macro attribution qty for product-wholesaler ──
  const getMacroQty = useCallback((productId: string, wholesalerId: string) => {
    return macroMap[productId]?.[wholesalerId] ?? 0
  }, [macroMap])

  // ── Get quota for a product-wholesaler ──
  const getQuota = useCallback((productId: string, wholesalerId: string) => {
    const pq = quotasByProduct.get(productId)
    if (!pq) return null
    return pq.find(q => q.wholesalerId === wholesalerId) ?? null
  }, [quotasByProduct])

  // ── Per-client breakdown of macro attributions ──
  // Distributes each wholesaler's macro qty across clients (priority first, then by price desc)
  // Returns: { [customerId]: { [wholesalerId]: attributedQty } }
  const clientBreakdown = useMemo(() => {
    if (!selectedGroup || activeWholesalers.length === 0) return {} as Record<string, Record<string, number>>

    const productId = selectedGroup.productId
    const result: Record<string, Record<string, number>> = {}

    // Sort orders: top clients first, then by price descending
    const sortedOrders = [...selectedGroup.orders].sort((a, b) => {
      const ca = a.customer as unknown as { is_top_client?: boolean } | undefined
      const cb = b.customer as unknown as { is_top_client?: boolean } | undefined
      if (ca?.is_top_client && !cb?.is_top_client) return -1
      if (!ca?.is_top_client && cb?.is_top_client) return 1
      // Higher price = higher priority
      const pa = a.unit_price ?? 0
      const pb = b.unit_price ?? 0
      if (pb !== pa) return pb - pa
      return 0
    })

    // Track remaining demand per customer
    const remainingDemand: Record<string, number> = {}
    for (const order of sortedOrders) {
      remainingDemand[order.customer_id] = order.quantity
      result[order.customer_id] = {}
    }

    // Track remaining stock per wholesaler (from macro allocations)
    const remainingStock: Record<string, number> = {}
    for (const ws of activeWholesalers) {
      remainingStock[ws.id] = getMacroQty(productId, ws.id)
    }

    // Distribute: for each client (priority order), allocate from open wholesalers
    for (const order of sortedOrders) {
      const customerId = order.customer_id
      if (remainingDemand[customerId] <= 0) continue

      for (const ws of activeWholesalers) {
        if (remainingDemand[customerId] <= 0) break
        if (remainingStock[ws.id] <= 0) continue
        if (!isWholesalerOpenForCustomer(customerId, ws.id)) continue

        const alloc = Math.min(remainingDemand[customerId], remainingStock[ws.id])
        result[customerId][ws.id] = alloc
        remainingDemand[customerId] -= alloc
        remainingStock[ws.id] -= alloc
      }
    }

    return result
  }, [selectedGroup, activeWholesalers, macroMap, cwLinks, getMacroQty, isWholesalerOpenForCustomer])

  // Helper to get per-client per-wholesaler attribution
  const getClientWsQty = useCallback((customerId: string, wholesalerId: string) => {
    return clientBreakdown[customerId]?.[wholesalerId] ?? 0
  }, [clientBreakdown])

  // ── Render ──

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Négociation</h3>
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
          <h3 className="text-lg font-semibold">Négociation</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Aucune commande trouvée pour ce processus. Vérifiez que les commandes ont été importées et validées.
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

  // ── Status icon for left panel ──
  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'validated') return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
    if (status === 'in_progress' || status === 'mixed') return <Clock className="h-4 w-4 text-amber-500 shrink-0" />
    return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
  }

  // Count validated orders in selected group
  const selectedValidatedOrders = selectedGroup
    ? selectedGroup.orders.filter(o => (o.nego_status || 'pending') === 'validated').length
    : 0

  return (
    <div className="space-y-4">
      {/* Header + progress */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Négociation</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Produit par produit : ajustez les quantités, prix, et validez.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{validatedCount}/{totalCount} produits</p>
            <div className="h-1.5 w-32 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${totalCount > 0 ? (validatedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex h-[calc(100vh-280px)] gap-0 border rounded-lg overflow-hidden bg-background">
        {/* ── LEFT PANEL ── */}
        <div className="w-[340px] shrink-0 border-r flex flex-col bg-muted/20">
          {/* Search */}
          <div className="p-3 border-b space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="CIP13 ou nom..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Client filter chips */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setSelectedCustomerId('all')}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                  selectedCustomerId === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Tous
              </button>
              {orderCustomers.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(c.id === selectedCustomerId ? 'all' : c.id)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                    selectedCustomerId === c.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {c.code}
                </button>
              ))}
              {commentedProductCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOnlyCommented(v => !v)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center gap-1 ${
                    showOnlyCommented
                      ? 'bg-amber-500 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <MessageSquare className="h-2.5 w-2.5" />
                  Avec commentaire
                  <span className={`text-[10px] px-1 rounded-full ${showOnlyCommented ? 'bg-amber-600 text-white' : 'bg-muted-foreground/20'}`}>
                    {commentedProductCount}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex border-b text-xs">
            {([
              { key: 'all' as NegoFilter, label: 'Tous', count: totalCount },
              { key: 'pending' as NegoFilter, label: 'A traiter', count: pendingCount },
              { key: 'in_progress' as NegoFilter, label: 'En cours', count: inProgressCount },
              { key: 'validated' as NegoFilter, label: 'Valides', count: validatedCount },
            ]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setNegoFilter(tab.key)}
                className={`flex-1 py-2 text-center font-medium transition-colors border-b-2 ${
                  negoFilter === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Product list */}
          <ScrollArea className="flex-1" ref={listRef}>
            <div className="divide-y">
              {filteredGroups.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Aucun produit
                </div>
              ) : (
                filteredGroups.map(group => {
                  const isSelected = group.productId === selectedProductId
                  return (
                    <button
                      key={group.productId}
                      type="button"
                      onClick={() => { setSelectedProductId(group.productId); setEditing(null) }}
                      className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-muted/60 ${
                        isSelected ? 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <StatusIcon status={group.negoStatus} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate leading-tight">{group.productName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[11px] text-muted-foreground">{group.cip13}</span>
                            {group.isAnsmBlocked && (
                              <span className="text-red-500"><Ban className="h-3 w-3" /></span>
                            )}
                            {group.isDiscontinued && (
                              <span className="text-amber-500"><AlertTriangle className="h-3 w-3" /></span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-sm font-semibold">{group.totalQty.toLocaleString('fr-FR')}</p>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className="text-[11px] text-muted-foreground">{group.clientCount} client{group.clientCount > 1 ? 's' : ''}</span>
                            {group.bestPrice != null && (
                              <span className="text-[11px] font-mono text-green-600">{group.bestPrice.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>

          {/* Left panel footer */}
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {filteredGroups.length} produits affiches
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedGroup ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Sélectionnez un produit</p>
              </div>
            </div>
          ) : (
            <>
              {/* Product header */}
              <div className="px-4 py-3 border-b bg-muted/10">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-xs shrink-0">{selectedGroup.cip13}</Badge>
                      <h4 className="text-base font-semibold truncate">{selectedGroup.productName}</h4>
                      {selectedGroup.isAnsmBlocked && (
                        <Badge variant="destructive" className="text-[10px]">ANSM</Badge>
                      )}
                      {selectedGroup.isDiscontinued && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Arrete</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Demande : <strong className="text-foreground">{selectedGroup.totalQty.toLocaleString('fr-FR')}</strong>
                      </span>
                      {selectedGroup.bestPrice != null && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          Best : <strong className="text-green-700">{selectedGroup.bestPrice.toFixed(2)} EUR</strong>
                        </span>
                      )}
                      <span>{selectedGroup.clientCount} client{selectedGroup.clientCount > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedGroup.negoStatus !== 'validated' && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => validateProductMutation.mutate(selectedGroup.productId)}
                        disabled={validateProductMutation.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Valider ({selectedValidatedOrders}/{detailOrders.length})
                      </Button>
                    )}
                    {selectedGroup.negoStatus === 'validated' && (
                      <Badge className="bg-green-100 text-green-700 border-green-200">Valide</Badge>
                    )}
                  </div>
                </div>

                {/* Summary bar: pre-allocation by wholesaler */}
                {activeWholesalers.length > 0 && (
                  <div className="flex items-center gap-3 mt-2 text-[11px]">
                    <span className="text-muted-foreground shrink-0">Pre-alloc :</span>
                    {activeWholesalers.map(ws => {
                      const macroQty = getMacroQty(selectedGroup.productId, ws.id)
                      const quota = getQuota(selectedGroup.productId, ws.id)
                      if (!quota && macroQty === 0) return null
                      return (
                        <span key={ws.id} className="flex items-center gap-1">
                          <span className="font-medium">{ws.code}</span>
                          <span className="font-mono">{macroQty}</span>
                          {quota && (
                            <span className="text-muted-foreground">/{quota.quotaQuantity + quota.extraAvailable}</span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Detail table */}
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    {/* Banner row: FOURNISSEURS — ATTRIBUÉ / DISPO */}
                    {activeWholesalers.length > 0 && (
                      <TableRow className="border-b-0">
                        <TableHead colSpan={6} className="bg-background border-b-0" />
                        <TableHead
                          colSpan={activeWholesalers.length}
                          className="text-center text-[10px] font-bold uppercase tracking-widest py-1.5 border-b-0"
                          style={{ background: 'rgba(59,130,246,0.06)', color: '#6b7280' }}
                        >
                          Fournisseurs — Attribue / Dispo
                        </TableHead>
                        <TableHead className="bg-background border-b-0" />
                        <TableHead className="bg-background border-b-0" />
                        <TableHead className="bg-background border-b-0" />
                      </TableRow>
                    )}
                    <TableRow>
                      <TableHead className="text-[11px] w-10 text-center px-2">
                        <Tooltip>
                          <TooltipTrigger asChild><span>V</span></TooltipTrigger>
                          <TooltipContent>Valider ce client</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-[11px]">Client</TableHead>
                      <TableHead className="text-[11px] text-right">Prix</TableHead>
                      <TableHead className="text-[11px] text-right">Qte</TableHead>
                      <TableHead className="text-[11px] text-right">Lot min</TableHead>
                      <TableHead className="text-[11px] text-right border-r-2">Exp&ge;</TableHead>
                      {/* Wholesaler columns with dispo total */}
                      {activeWholesalers.map(ws => {
                        const wsQuota = getQuota(selectedGroup?.productId ?? '', ws.id)
                        const wsDispo = wsQuota ? wsQuota.quotaQuantity + wsQuota.extraAvailable : 0
                        return (
                          <TableHead key={ws.id} className="text-[11px] text-center px-1.5 min-w-[68px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-center leading-tight">
                                  <span className="font-bold uppercase">{ws.code?.substring(0, 5) ?? ws.name.substring(0, 5)}</span>
                                  <span className="text-[10px] text-muted-foreground font-normal tabular-nums">
                                    {wsDispo > 0 ? wsDispo.toLocaleString('fr-FR') : ''}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>{ws.name} — Dispo: {wsDispo.toLocaleString('fr-FR')}</TooltipContent>
                            </Tooltip>
                          </TableHead>
                        )
                      })}
                      <TableHead className="text-[11px] text-center font-bold uppercase">Attr.</TableHead>
                      <TableHead className="text-[11px] text-center">Aj. prix</TableHead>
                      <TableHead className="text-[11px]">Commentaire</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailOrders.map(order => {
                      const cust = order.customer as unknown as {
                        id: string; code: string; name: string; is_top_client?: boolean; min_lot_acceptable?: number | null; allocation_preferences?: { preferred_expiry_months?: number } | null
                      } | undefined
                      const isEditingQty = editing?.orderId === order.id && editing.field === 'quantity'
                      const isEditingPrice = editing?.orderId === order.id && editing.field === 'unit_price'
                      const isEditingComment = editing?.orderId === order.id && editing.field === 'nego_comment'
                      const qtyModified = order.nego_original_qty != null && order.quantity !== order.nego_original_qty
                      const priceModified = order.nego_original_price != null && order.unit_price !== order.nego_original_price
                      const isBestPrice = selectedGroup.bestPrice != null && order.unit_price != null && order.unit_price === selectedGroup.bestPrice && detailOrders.length > 1
                      const isValidated = (order.nego_status || 'pending') === 'validated'
                      // Count how many orders this customer has across all products
                      const customerOrderCount = orders?.filter(o => o.customer_id === order.customer_id).length ?? 0
                      // Preferred expiry months
                      const prefExpMonths = cust?.allocation_preferences?.preferred_expiry_months ?? null
                      const expDate = prefExpMonths != null ? (() => {
                        const d = new Date()
                        d.setMonth(d.getMonth() + prefExpMonths)
                        return d
                      })() : null
                      const expLabel = expDate ? `${String(expDate.getMonth() + 1).padStart(2, '0')}/${String(expDate.getFullYear()).slice(2)}` : null
                      const expColorClass = prefExpMonths != null ? (prefExpMonths >= 6 ? 'text-green-600' : prefExpMonths >= 3 ? 'text-amber-600' : 'text-red-600') : 'text-muted-foreground'
                      // Sum of per-client wholesaler attributions for this row
                      const rowAttrTotal = activeWholesalers.reduce((sum, ws) => {
                        return sum + getClientWsQty(order.customer_id, ws.id)
                      }, 0)

                      return (
                        <TableRow
                          key={order.id}
                          className={`${isValidated ? 'bg-green-50 dark:bg-green-950/20' : ''} ${qtyModified || priceModified ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}`}
                        >
                          {/* Validate checkbox */}
                          <TableCell className="text-center px-2">
                            <Checkbox
                              checked={isValidated}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  validateOrderMutation.mutate(order.id)
                                } else {
                                  unvalidateOrderMutation.mutate(order.id)
                                }
                              }}
                              disabled={validateOrderMutation.isPending || unvalidateOrderMutation.isPending}
                              className="h-4 w-4"
                            />
                          </TableCell>

                          {/* Client */}
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-xs">{cust?.code ?? '?'}</span>
                              {cust?.is_top_client && (
                                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                              )}
                              {customerOrderCount > 1 && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                  x{customerOrderCount}
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* Price */}
                          <TableCell className="text-right">
                            {isEditingPrice ? (
                              <div className="flex items-center gap-1 justify-end">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editing.value}
                                  onChange={e => setEditing({ ...editing, value: e.target.value })}
                                  className="w-20 h-6 text-[11px] text-right"
                                  autoFocus
                                  onBlur={handleBlurSave}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') confirmEdit()
                                    if (e.key === 'Escape') cancelEdit()
                                  }}
                                />
                                <button type="button" onClick={confirmEdit} className="text-green-600 hover:text-green-800">
                                  <Check className="h-3 w-3" />
                                </button>
                                <button type="button" onClick={cancelEdit} className="text-muted-foreground">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:bg-blue-50/60 hover:shadow-sm rounded px-1 py-0.5 transition-all duration-150 group border border-transparent hover:border-blue-200"
                                onClick={() => startEdit(order.id, 'unit_price', order.unit_price != null ? String(order.unit_price) : '')}
                              >
                                <span className={`font-mono text-xs ${isBestPrice ? 'text-green-700 font-bold' : priceModified ? 'text-blue-700 font-medium' : ''}`}>
                                  {order.unit_price != null ? order.unit_price.toFixed(2) : '-'}
                                </span>
                                {isBestPrice && (
                                  <Badge className="text-[8px] px-1 py-0 h-3.5 bg-green-100 text-green-700 border-green-200">BEST</Badge>
                                )}
                                <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                              </button>
                            )}
                          </TableCell>

                          {/* Quantity */}
                          <TableCell className="text-right">
                            {isEditingQty ? (
                              <div className="flex items-center gap-1 justify-end">
                                <Input
                                  type="number"
                                  value={editing.value}
                                  onChange={e => setEditing({ ...editing, value: e.target.value })}
                                  className="w-16 h-6 text-[11px] text-right font-bold"
                                  autoFocus
                                  onBlur={handleBlurSave}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') confirmEdit()
                                    if (e.key === 'Escape') cancelEdit()
                                  }}
                                />
                                <button type="button" onClick={confirmEdit} className="text-green-600 hover:text-green-800">
                                  <Check className="h-3 w-3" />
                                </button>
                                <button type="button" onClick={cancelEdit} className="text-muted-foreground">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:bg-blue-50/60 hover:shadow-sm rounded px-1 py-0.5 transition-all duration-150 group border border-transparent hover:border-blue-200"
                                onClick={() => startEdit(order.id, 'quantity', String(order.quantity))}
                              >
                                <span className={`font-mono text-xs font-bold ${qtyModified ? 'text-blue-700' : ''}`}>
                                  {order.quantity.toLocaleString('fr-FR')}
                                </span>
                                {qtyModified && (
                                  <span className="text-[9px] text-blue-400 line-through font-mono">
                                    {order.nego_original_qty?.toLocaleString('fr-FR')}
                                  </span>
                                )}
                                <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                              </button>
                            )}
                          </TableCell>

                          {/* Min lot */}
                          <TableCell className="text-right">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {cust?.min_lot_acceptable != null ? cust.min_lot_acceptable.toLocaleString('fr-FR') : '-'}
                            </span>
                          </TableCell>

                          {/* Exp>= (preferred expiry as MM/YY) */}
                          <TableCell className="text-right border-r-2">
                            <span className={`font-mono text-[11px] ${expColorClass}`}>
                              {expLabel ?? '-'}
                            </span>
                          </TableCell>

                          {/* Wholesaler columns — per-client breakdown (read-only) */}
                          {activeWholesalers.map(ws => {
                            const clientQty = getClientWsQty(order.customer_id, ws.id)
                            const isOpen = isWholesalerOpenForCustomer(order.customer_id, ws.id)

                            return (
                              <TableCell key={ws.id} className="text-center px-1">
                                {!isOpen ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="inline-flex items-center justify-center w-[60px] h-7 rounded-md text-xs font-semibold text-gray-300"
                                        style={{ background: 'repeating-linear-gradient(-45deg, #f5f5f5, #f5f5f5 3px, #eaeaea 3px, #eaeaea 6px)' }}
                                      >✕</span>
                                    </TooltipTrigger>
                                    <TooltipContent>Grossiste non ouvert pour {cust?.code}</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span
                                    className={`inline-flex items-center justify-center w-[60px] h-7 rounded-md font-mono text-[11px] ${
                                      clientQty > 0
                                        ? 'border border-blue-300 bg-white text-blue-700 font-bold shadow-sm'
                                        : 'border border-dashed border-gray-300 text-gray-300'
                                    }`}
                                  >
                                    {clientQty > 0 ? clientQty.toLocaleString('fr-FR') : '\u2014'}
                                  </span>
                                )}
                              </TableCell>
                            )
                          })}

                          {/* Attr. total (sum of wholesaler inputs for this row) */}
                          <TableCell className="text-center">
                            <span className={`font-mono text-[11px] ${rowAttrTotal > 0 ? 'text-blue-700 font-bold' : 'text-muted-foreground/40'}`}>
                              {rowAttrTotal > 0 ? rowAttrTotal.toLocaleString('fr-FR') : '0'}
                            </span>
                          </TableCell>

                          {/* Aj. prix (adjusted price input) */}
                          <TableCell className="text-center">
                            <input
                              type="number"
                              step="0.01"
                              defaultValue={order.unit_price != null ? order.unit_price.toFixed(2) : ''}
                              placeholder="\u2014"
                              className="w-[52px] h-7 text-center font-mono text-[11px] border border-gray-200 rounded bg-background hover:border-blue-300 hover:bg-blue-50/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all duration-150 outline-none"
                              onBlur={(e) => {
                                const newVal = e.target.value
                                if (newVal && order.unit_price != null && parseFloat(newVal) !== order.unit_price) {
                                  editMutation.mutate({ orderId: order.id, field: 'unit_price', value: newVal })
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                            />
                          </TableCell>

                          {/* Comment */}
                          <TableCell>
                            {isEditingComment ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={editing.value}
                                  onChange={e => setEditing({ ...editing, value: e.target.value })}
                                  className="h-6 text-[11px] min-w-[120px]"
                                  placeholder="Commentaire..."
                                  autoFocus
                                  onBlur={handleBlurSave}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') confirmEdit()
                                    if (e.key === 'Escape') cancelEdit()
                                  }}
                                />
                                <button type="button" onClick={confirmEdit} className="text-green-600">
                                  <Check className="h-3 w-3" />
                                </button>
                                <button type="button" onClick={cancelEdit} className="text-muted-foreground">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:bg-blue-50/60 hover:shadow-sm rounded px-1 py-0.5 transition-all duration-150 group text-[11px] text-muted-foreground max-w-[140px] border border-transparent hover:border-blue-200"
                                onClick={() => startEdit(order.id, 'nego_comment', order.nego_comment ?? '')}
                              >
                                <span className="truncate group-hover:text-foreground transition-colors">{order.nego_comment || 'Ajouter...'}</span>
                                <Pencil className="h-2.5 w-2.5 shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 group-hover:text-blue-400 transition-all" />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {/* Footer row: sum of per-client attributions vs dispo */}
                    {activeWholesalers.length > 0 && selectedGroup && (
                      <TableRow className="bg-muted/30 border-t-2 font-medium">
                        <TableCell colSpan={6} className="text-[11px] text-muted-foreground font-semibold text-right pr-2">
                          Total / dispo
                        </TableCell>
                        {activeWholesalers.map(ws => {
                          // Sum of what was actually distributed to clients from this wholesaler
                          const distributedQty = detailOrders.reduce((sum, o) => sum + getClientWsQty(o.customer_id, ws.id), 0)
                          const quota = getQuota(selectedGroup.productId, ws.id)
                          const total = quota ? quota.quotaQuantity + quota.extraAvailable : 0
                          const macroQty = getMacroQty(selectedGroup.productId, ws.id)
                          const isOver = total > 0 && macroQty > total
                          return (
                            <TableCell key={ws.id} className="text-center px-1">
                              {total > 0 || distributedQty > 0 ? (
                                <span className="font-mono text-[11px]">
                                  <span className={`font-bold ${isOver ? 'text-red-600' : 'text-blue-700'}`}>
                                    {distributedQty.toLocaleString('fr-FR')}
                                  </span>
                                  <span className="text-gray-400">/ {total.toLocaleString('fr-FR')}</span>
                                </span>
                              ) : (
                                <span className="text-gray-300 text-[11px]">&mdash;</span>
                              )}
                            </TableCell>
                          )
                        })}
                        <TableCell className="text-center">
                          <span className="font-mono text-[11px] font-bold text-blue-700">
                            {detailOrders.reduce((sum, o) =>
                              sum + activeWholesalers.reduce((wsSum, ws) => wsSum + getClientWsQty(o.customer_id, ws.id), 0)
                            , 0).toLocaleString('fr-FR')}
                          </span>
                        </TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Right panel footer: navigation + validate */}
              <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/10">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrev}
                    disabled={currentIndex <= 0}
                    className="gap-1 h-7 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Précédent
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {currentIndex + 1} / {filteredGroups.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNext}
                    disabled={currentIndex >= filteredGroups.length - 1}
                    className="gap-1 h-7 text-xs"
                  >
                    Suivant <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {selectedGroup.negoStatus !== 'validated' && (
                  <Button
                    size="sm"
                    className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => validateProductMutation.mutate(selectedGroup.productId)}
                    disabled={validateProductMutation.isPending}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Valider ce médicament ({selectedValidatedOrders}/{detailOrders.length} clients)
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          {onBack && (
            <Button variant="outline" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
          )}
        </div>
        <Button
          onClick={() => {
            const notValidated = totalCount - validatedCount
            if (notValidated > 0) {
              setShowNextWarning(true)
            } else {
              onNext()
            }
          }}
          className="gap-2"
        >
          Passer à l'étape suivante <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Warning dialog when unvalidated items remain */}
      <Dialog open={showNextWarning} onOpenChange={setShowNextWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Produits non validés
            </DialogTitle>
            <DialogDescription>
              {totalCount - validatedCount} produit{totalCount - validatedCount > 1 ? 's' : ''} sur {totalCount} n'{totalCount - validatedCount > 1 ? 'ont' : 'a'} pas encore été validé{totalCount - validatedCount > 1 ? 's' : ''} en négociation.
              <br /><br />
              Voulez-vous continuer sans les valider ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowNextWarning(false)}>
              Rester et valider
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setShowNextWarning(false)
                onNext()
              }}
            >
              Continuer quand meme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
