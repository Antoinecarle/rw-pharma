import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  FileCheck, Search, CheckCircle2, XCircle, Package, BarChart3, ThumbsUp,
  ChevronDown, AlertTriangle, Save, Boxes, Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ──────────────────────────────────────────────────────────

interface AllocRow {
  id: string
  customer_id: string
  product_id: string
  wholesaler_id: string
  stock_id: string | null
  requested_quantity: number
  allocated_quantity: number
  client_sold_quantity: number
  confirmation_status: string
  confirmation_note: string | null
  confirmed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  products: { name: string; cip13: string; is_ansm_blocked: boolean } | null
  wholesalers: { name: string; code: string } | null
}

interface ProductGroup {
  productId: string
  productName: string
  cip13: string
  isAnsmBlocked: boolean
  totalAllocated: number
  totalSold: number
  totalRemaining: number
  allocations: AllocRow[]
}

const confirmationLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'En attente', variant: 'outline' },
  confirmed: { label: 'Confirmee', variant: 'default' },
  refused: { label: 'Refusee', variant: 'destructive' },
}

function getExpiryStatus(dateStr: string): 'danger' | 'warning' | 'ok' {
  const exp = new Date(dateStr)
  const now = new Date()
  const diffMonths = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth())
  if (diffMonths <= 3) return 'danger'
  if (diffMonths <= 6) return 'warning'
  return 'ok'
}

const EXPIRY_COLORS = {
  danger: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  ok: 'bg-emerald-100 text-emerald-700 border-emerald-200',
} as const

function formatExpiry(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

// ── Component ──────────────────────────────────────────────────────

export default function PortalAllocationsPage() {
  const { customerId } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [editingSold, setEditingSold] = useState<Map<string, number>>(new Map())
  const [refuseDialog, setRefuseDialog] = useState<{ id: string; productName: string } | null>(null)
  const [refuseNote, setRefuseNote] = useState('')

  // Fetch allocations
  const { data: allocations, isLoading } = useQuery({
    queryKey: ['portal-allocations', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const all: AllocRow[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('allocations')
          .select('id, customer_id, product_id, wholesaler_id, stock_id, requested_quantity, allocated_quantity, client_sold_quantity, confirmation_status, confirmation_note, confirmed_at, metadata, created_at, products(name, cip13, is_ansm_blocked), wholesalers(name, code)')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...(data as unknown as AllocRow[]))
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
    enabled: !!customerId,
  })

  // Confirm/Refuse mutations
  const updateConfirmMutation = useMutation({
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

  // Save sold quantity mutation
  const updateSoldMutation = useMutation({
    mutationFn: async ({ id, soldQty }: { id: string; soldQty: number }) => {
      const { error } = await supabase
        .from('allocations')
        .update({ client_sold_quantity: soldQty })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal-allocations'] })
      setEditingSold(prev => {
        const next = new Map(prev)
        next.delete(variables.id)
        return next
      })
      toast.success('Quantite vendue enregistree')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })

  const handleConfirm = (id: string) => {
    updateConfirmMutation.mutate({ id, status: 'confirmed' })
  }

  const handleRefuse = () => {
    if (!refuseDialog) return
    updateConfirmMutation.mutate({ id: refuseDialog.id, status: 'refused', note: refuseNote })
    setRefuseDialog(null)
    setRefuseNote('')
  }

  const handleSoldChange = (allocId: string, value: string) => {
    const num = parseInt(value, 10)
    if (isNaN(num) || num < 0) return
    setEditingSold(prev => new Map(prev).set(allocId, num))
  }

  const handleSaveSold = (alloc: AllocRow) => {
    const soldQty = editingSold.get(alloc.id)
    if (soldQty === undefined) return
    if (soldQty > alloc.allocated_quantity) {
      toast.error(`La quantite vendue ne peut pas depasser ${alloc.allocated_quantity}`)
      return
    }
    updateSoldMutation.mutate({ id: alloc.id, soldQty })
  }

  // Group by product
  const productGroups = useMemo(() => {
    if (!allocations) return []
    const groups = new Map<string, ProductGroup>()

    for (const a of allocations) {
      const key = a.product_id
      const sold = editingSold.has(a.id) ? editingSold.get(a.id)! : a.client_sold_quantity
      const remaining = Math.max(0, a.allocated_quantity - sold)

      const existing = groups.get(key)
      if (existing) {
        existing.totalAllocated += a.allocated_quantity
        existing.totalSold += sold
        existing.totalRemaining += remaining
        existing.allocations.push(a)
      } else {
        groups.set(key, {
          productId: key,
          productName: a.products?.name ?? '?',
          cip13: a.products?.cip13 ?? '?',
          isAnsmBlocked: a.products?.is_ansm_blocked ?? false,
          totalAllocated: a.allocated_quantity,
          totalSold: sold,
          totalRemaining: remaining,
          allocations: [a],
        })
      }
    }

    return [...groups.values()].sort((a, b) => b.totalAllocated - a.totalAllocated)
  }, [allocations, editingSold])

  // Filter
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return productGroups
    const q = search.toLowerCase()
    return productGroups.filter(
      g => g.productName.toLowerCase().includes(q) ||
        g.cip13.includes(q) ||
        g.allocations.some(a => a.wholesalers?.name?.toLowerCase().includes(q) || a.wholesalers?.code?.toLowerCase().includes(q))
    )
  }, [productGroups, search])

  // KPIs
  const totalAllocations = allocations?.length ?? 0
  const totalAllocated = productGroups.reduce((s, g) => s + g.totalAllocated, 0)
  const totalSold = productGroups.reduce((s, g) => s + g.totalSold, 0)
  const totalRemaining = productGroups.reduce((s, g) => s + g.totalRemaining, 0)
  const confirmedCount = allocations?.filter(a => a.confirmation_status === 'confirmed').length ?? 0
  const pendingCount = allocations?.filter(a => a.confirmation_status === 'pending').length ?? 0

  const handleExportAllocations = () => {
    if (!allocations?.length) return
    const rows = allocations.map(a => ({
      'CIP13': a.products?.cip13 ?? '',
      'Produit': a.products?.name ?? '',
      'Grossiste': a.wholesalers?.name ?? '',
      'Qte allouee': a.allocated_quantity,
      'Statut': confirmationLabels[a.confirmation_status]?.label ?? a.confirmation_status,
      'N° lot': (a.metadata?.lot_number as string) ?? '',
      'Expiration': (a.metadata?.expiry_date as string) ? new Date(a.metadata!.expiry_date as string).toLocaleDateString('fr-FR') : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Allocations')
    XLSX.writeFile(wb, `allocations_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-6xl">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: FileCheck, color: 'rgba(13,148,136,0.08)', iconColor: 'var(--ivory-accent)', label: 'Allocations', value: totalAllocations },
          { icon: Package, color: 'rgba(59,130,246,0.08)', iconColor: '#3b82f6', label: 'Qte allouee', value: totalAllocated },
          { icon: Boxes, color: 'rgba(139,92,246,0.08)', iconColor: '#8b5cf6', label: 'Qte vendue', value: totalSold },
          { icon: BarChart3, color: 'rgba(245,158,11,0.08)', iconColor: '#f59e0b', label: 'Restant', value: totalRemaining },
          { icon: ThumbsUp, color: 'rgba(34,197,94,0.08)', iconColor: '#22c55e', label: 'Confirmees', value: confirmedCount },
          { icon: AlertTriangle, color: 'rgba(234,179,8,0.08)', iconColor: '#eab308', label: 'En attente', value: pendingCount },
        ].map(stat => (
          <Card key={stat.label} className="ivory-card">
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: stat.color }}>
                <stat.icon className="h-4 w-4" style={{ color: stat.iconColor }} />
              </div>
              <div>
                <p className="text-[10px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>{stat.label}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--ivory-text-heading)' }}>{stat.value.toLocaleString('fr-FR')}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Export */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par produit, CIP13, grossiste..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-[12px] gap-1.5 shrink-0"
          onClick={handleExportAllocations}
          disabled={!allocations?.length}
        >
          <Download className="h-3.5 w-3.5" />
          Export Excel
        </Button>
      </div>

      {/* Product accordion */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filteredGroups.length === 0 ? (
        <Card className="ivory-card-empty">
          <CardContent className="p-8 text-center">
            <FileCheck className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--ivory-text-muted)', opacity: 0.3 }} />
            <p className="font-medium" style={{ color: 'var(--ivory-text-heading)' }}>
              {search ? `Aucun resultat pour "${search}"` : 'Aucune allocation'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
              Les allocations apparaitront ici apres le processus mensuel.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(group => {
            const isExpanded = expandedProducts.has(group.productId)

            return (
              <Card key={group.productId} className="overflow-hidden">
                {/* Product header */}
                <button
                  type="button"
                  onClick={() => toggleProduct(group.productId)}
                  className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{group.productName}</span>
                      {group.isAnsmBlocked && (
                        <Tooltip>
                          <TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" /></TooltipTrigger>
                          <TooltipContent>Produit bloque ANSM</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{group.cip13}</span>
                  </div>

                  <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Alloue</p>
                      <p className="text-sm font-bold tabular-nums text-emerald-600">{group.totalAllocated.toLocaleString('fr-FR')}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Vendu</p>
                      <p className="text-sm font-bold tabular-nums text-blue-600">{group.totalSold.toLocaleString('fr-FR')}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Restant</p>
                      <p className="text-sm font-bold tabular-nums text-amber-600">{group.totalRemaining.toLocaleString('fr-FR')}</p>
                    </div>
                  </div>

                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {group.allocations.length} lot{group.allocations.length > 1 ? 's' : ''}
                  </Badge>
                </button>

                {/* Mobile summary */}
                {!isExpanded && (
                  <div className="flex sm:hidden items-center gap-3 px-4 pb-3 text-xs">
                    <span className="text-emerald-600">Alloue: <b>{group.totalAllocated}</b></span>
                    <span className="text-blue-600">Vendu: <b>{group.totalSold}</b></span>
                    <span className="text-amber-600">Restant: <b>{group.totalRemaining}</b></span>
                  </div>
                )}

                {/* Expanded lot details */}
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
                              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">N° lot</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Expiration</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Grossiste</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Alloue</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Vendu</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Restant</th>
                              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Statut</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.allocations.map(alloc => {
                              const cs = confirmationLabels[alloc.confirmation_status] ?? confirmationLabels.pending
                              const expiry = (alloc.metadata?.expiry_date as string) ?? null
                              const lot = (alloc.metadata?.lot_number as string) ?? null
                              const expiryStatus = expiry ? getExpiryStatus(expiry) : null
                              const currentSold = editingSold.has(alloc.id) ? editingSold.get(alloc.id)! : alloc.client_sold_quantity
                              const remaining = Math.max(0, alloc.allocated_quantity - currentSold)
                              const isEditing = editingSold.has(alloc.id)

                              return (
                                <tr key={alloc.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2.5 font-mono text-xs">{lot ?? '-'}</td>
                                  <td className="px-4 py-2.5">
                                    {expiry && expiryStatus ? (
                                      <Badge variant="outline" className={`text-[10px] ${EXPIRY_COLORS[expiryStatus]}`}>
                                        {formatExpiry(expiry)}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <Badge variant="outline" className="text-[10px]">
                                      {alloc.wholesalers?.code ?? alloc.wholesalers?.name ?? '-'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-600">
                                    {alloc.allocated_quantity.toLocaleString('fr-FR')}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={alloc.allocated_quantity}
                                        value={currentSold}
                                        onChange={e => handleSoldChange(alloc.id, e.target.value)}
                                        className="w-20 h-7 text-xs text-right tabular-nums"
                                      />
                                      {isEditing && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                          onClick={() => handleSaveSold(alloc)}
                                          disabled={updateSoldMutation.isPending}
                                        >
                                          <Save className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums font-bold">
                                    <span className={remaining === 0 ? 'text-muted-foreground' : 'text-amber-600'}>
                                      {remaining.toLocaleString('fr-FR')}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <Badge variant={cs.variant} className="text-[10px]">{cs.label}</Badge>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    {alloc.confirmation_status === 'pending' && (
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
                                          size="sm" variant="ghost"
                                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                          onClick={() => handleConfirm(alloc.id)}
                                          disabled={updateConfirmMutation.isPending}
                                        >
                                          <CheckCircle2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm" variant="ghost"
                                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                          onClick={() => setRefuseDialog({ id: alloc.id, productName: alloc.products?.name ?? 'ce produit' })}
                                          disabled={updateConfirmMutation.isPending}
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            )
          })}
        </div>
      )}

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
            <Button variant="destructive" size="sm" onClick={handleRefuse} disabled={updateConfirmMutation.isPending}>
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
