import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import AnimatedCounter from '@/components/ui/animated-counter'
import { ChevronDown, AlertTriangle, Search, Warehouse } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ──────────────────────────────────────────────────────────

interface StockLotViewProps {
  /** Filter by monthly process (optional — if omitted shows all stock) */
  processId?: string
  /** Max height for the scrollable area */
  maxHeight?: string
  /** Show KPI header cards */
  showKpis?: boolean
  /** Compact mode (less padding) */
  compact?: boolean
}

interface StockRow {
  id: string
  wholesaler_id: string
  product_id: string | null
  cip13: string
  lot_number: string
  expiry_date: string
  quantity: number
  status: string
  wholesaler: { id: string; name: string; code: string | null } | null
  product: { id: string; name: string; cip13: string; is_ansm_blocked: boolean } | null
}

interface AllocationByStock {
  stock_id: string
  total_allocated: number
}

interface ProductGroup {
  productId: string
  productName: string
  cip13: string
  isAnsmBlocked: boolean
  totalQty: number
  totalAllocated: number
  totalRemaining: number
  lotCount: number
  lots: LotRow[]
}

interface LotRow {
  id: string
  lotNumber: string
  expiryDate: string
  wholesalerCode: string
  wholesalerName: string
  quantity: number
  allocated: number
  remaining: number
  expiryStatus: 'danger' | 'warning' | 'ok'
}

// ── Helpers ────────────────────────────────────────────────────────

function getExpiryStatus(dateStr: string): 'danger' | 'warning' | 'ok' {
  const exp = new Date(dateStr)
  const now = new Date()
  const diffMonths = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth())
  if (diffMonths <= 3) return 'danger'
  if (diffMonths <= 6) return 'warning'
  return 'ok'
}

function formatExpiry(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

const EXPIRY_COLORS = {
  danger: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  ok: 'bg-emerald-100 text-emerald-700 border-emerald-200',
} as const

// ── Component ──────────────────────────────────────────────────────

export default function StockLotView({
  processId,
  maxHeight = '600px',
  showKpis = true,
  compact = false,
}: StockLotViewProps) {
  const [search, setSearch] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())

  // Fetch collected stock
  const { data: stocks, isLoading: loadingStock } = useQuery({
    queryKey: ['stock-lot-view', processId ?? 'all'],
    queryFn: async () => {
      const all: StockRow[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        let query = supabase
          .from('collected_stock')
          .select('id, wholesaler_id, product_id, cip13, lot_number, expiry_date, quantity, status, wholesaler:wholesalers(id, name, code), product:products(id, name, cip13, is_ansm_blocked)')
          .in('status', ['received', 'partially_allocated', 'allocated'])
          .order('expiry_date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (processId) {
          query = query.eq('monthly_process_id', processId)
        }
        const { data, error } = await query
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...(data as unknown as StockRow[]))
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
  })

  // Fetch allocations grouped by stock_id to know allocated qty per lot
  const stockIds = useMemo(() => stocks?.map(s => s.id) ?? [], [stocks])

  const { data: allocationsByStock } = useQuery({
    queryKey: ['allocations-by-stock', processId ?? 'all', stockIds.length],
    queryFn: async () => {
      if (stockIds.length === 0) return [] as AllocationByStock[]

      // Batch fetch allocations that reference these stock IDs
      const result: AllocationByStock[] = []
      const batchSize = 200
      for (let i = 0; i < stockIds.length; i += batchSize) {
        const batch = stockIds.slice(i, i + batchSize)
        const { data, error } = await supabase
          .from('allocations')
          .select('stock_id, allocated_quantity')
          .in('stock_id', batch)
          .neq('status', 'rejected')
        if (error) throw error
        if (data) {
          // Aggregate by stock_id
          for (const row of data) {
            if (!row.stock_id) continue
            const existing = result.find(r => r.stock_id === row.stock_id)
            if (existing) {
              existing.total_allocated += row.allocated_quantity
            } else {
              result.push({ stock_id: row.stock_id, total_allocated: row.allocated_quantity })
            }
          }
        }
      }
      return result
    },
    enabled: stockIds.length > 0,
  })

  // Build allocation map: stockId -> allocated qty
  const allocationMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of allocationsByStock ?? []) {
      map.set(a.stock_id, a.total_allocated)
    }
    return map
  }, [allocationsByStock])

  // Group by product
  const productGroups = useMemo(() => {
    if (!stocks) return []

    const groups = new Map<string, ProductGroup>()

    for (const s of stocks) {
      const prodKey = s.product?.id ?? s.cip13
      const allocated = allocationMap.get(s.id) ?? 0
      const remaining = Math.max(0, s.quantity - allocated)
      const expiryStatus = getExpiryStatus(s.expiry_date)

      const lot: LotRow = {
        id: s.id,
        lotNumber: s.lot_number,
        expiryDate: s.expiry_date,
        wholesalerCode: s.wholesaler?.code ?? s.wholesaler?.name ?? '?',
        wholesalerName: s.wholesaler?.name ?? '?',
        quantity: s.quantity,
        allocated,
        remaining,
        expiryStatus,
      }

      const existing = groups.get(prodKey)
      if (existing) {
        existing.totalQty += s.quantity
        existing.totalAllocated += allocated
        existing.totalRemaining += remaining
        existing.lotCount++
        existing.lots.push(lot)
      } else {
        groups.set(prodKey, {
          productId: prodKey,
          productName: s.product?.name ?? `CIP13: ${s.cip13}`,
          cip13: s.product?.cip13 ?? s.cip13,
          isAnsmBlocked: s.product?.is_ansm_blocked ?? false,
          totalQty: s.quantity,
          totalAllocated: allocated,
          totalRemaining: remaining,
          lotCount: 1,
          lots: [lot],
        })
      }
    }

    return [...groups.values()].sort((a, b) => b.totalQty - a.totalQty)
  }, [stocks, allocationMap])

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return productGroups
    const q = search.toLowerCase()
    return productGroups.filter(
      g => g.productName.toLowerCase().includes(q) ||
        g.cip13.includes(q) ||
        g.lots.some(l => l.lotNumber.toLowerCase().includes(q) || l.wholesalerCode.toLowerCase().includes(q))
    )
  }, [productGroups, search])

  // Global KPIs
  const kpis = useMemo(() => ({
    totalProducts: productGroups.length,
    totalLots: stocks?.length ?? 0,
    totalQty: productGroups.reduce((s, g) => s + g.totalQty, 0),
    totalAllocated: productGroups.reduce((s, g) => s + g.totalAllocated, 0),
    totalRemaining: productGroups.reduce((s, g) => s + g.totalRemaining, 0),
  }), [productGroups, stocks])

  // Toggle product expand
  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const isLoading = loadingStock

  if (isLoading) {
    return (
      <div className="space-y-3">
        {showKpis && (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        )}
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return (
      <Card className="ivory-card-empty">
        <CardContent className="p-8 text-center">
          <Warehouse className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Aucun stock collecte</p>
          <p className="text-sm text-muted-foreground mt-1">
            {processId ? "Importez le stock recu a l'etape precedente." : "Aucun stock disponible pour le moment."}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI header */}
      {showKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Produits', value: kpis.totalProducts, color: 'text-blue-600' },
            { label: 'Lots', value: kpis.totalLots, color: 'text-violet-600' },
            { label: 'Total', value: kpis.totalQty, color: 'text-slate-700' },
            { label: 'Alloue', value: kpis.totalAllocated, color: 'text-emerald-600' },
            { label: 'Dispo', value: kpis.totalRemaining, color: 'text-amber-600' },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className={`${compact ? 'p-3' : 'p-4'} text-center`}>
                <AnimatedCounter value={kpi.value} className="justify-center" valueClassName={`text-xl font-bold ${kpi.color}`} />
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par produit, CIP13, lot, grossiste..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Product accordion list */}
      <div className={`space-y-2 overflow-y-auto`} style={{ maxHeight }}>
        {filteredGroups.map(group => {
          const isExpanded = expandedProducts.has(group.productId)
          return (
            <Card key={group.productId} className="overflow-hidden">
              {/* Product header (clickable) */}
              <button
                type="button"
                onClick={() => toggleProduct(group.productId)}
                className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors text-left"
              >
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{group.productName}</span>
                    {group.isAnsmBlocked && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex"><AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" /></span>
                        </TooltipTrigger>
                        <TooltipContent>Produit bloque ANSM</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{group.cip13}</span>
                </div>

                {/* Summary badges */}
                <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-sm font-bold tabular-nums">{group.totalQty.toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Alloue</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-600">{group.totalAllocated.toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Dispo</p>
                    <p className="text-sm font-bold tabular-nums text-amber-600">{group.totalRemaining.toLocaleString('fr-FR')}</p>
                  </div>
                </div>

                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {group.lotCount} lot{group.lotCount > 1 ? 's' : ''}
                </Badge>
              </button>

              {/* Mobile summary (visible only on small screens when collapsed) */}
              {!isExpanded && (
                <div className="flex sm:hidden items-center gap-3 px-4 pb-3 text-xs">
                  <span>Total: <b>{group.totalQty}</b></span>
                  <span className="text-emerald-600">Alloue: <b>{group.totalAllocated}</b></span>
                  <span className="text-amber-600">Dispo: <b>{group.totalRemaining}</b></span>
                </div>
              )}

              {/* Expanded lot table */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">N° de lot</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Expiration</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Grossiste</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Quantite</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Alloue</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Restant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lots
                            .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
                            .map(lot => (
                              <tr key={lot.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-xs">{lot.lotNumber}</td>
                                <td className="px-4 py-2.5">
                                  <Badge variant="outline" className={`text-[10px] ${EXPIRY_COLORS[lot.expiryStatus]}`}>
                                    {formatExpiry(lot.expiryDate)}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2.5">
                                  <Badge variant="outline" className="text-[10px]">
                                    {lot.wholesalerCode}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                                  {lot.quantity.toLocaleString('fr-FR')}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-600">
                                  {lot.allocated.toLocaleString('fr-FR')}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-bold">
                                  <span className={lot.remaining === 0 ? 'text-muted-foreground' : 'text-amber-600'}>
                                    {lot.remaining.toLocaleString('fr-FR')}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          )
        })}

        {filteredGroups.length === 0 && search.trim() && (
          <Card className="ivory-card-empty">
            <CardContent className="p-6 text-center">
              <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Aucun resultat pour "{search}"</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
