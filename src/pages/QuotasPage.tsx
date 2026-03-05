import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Wholesaler, Product, WholesalerQuota, WholesalerQuotaInsert } from '@/types/database'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import MonthStrip from '@/components/ui/month-strip'
import StepperInput from '@/components/ui/stepper-input'
import { Plus, Pencil, Trash2, Search, ClipboardList, Calendar, Package } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ConfirmDialog'
import ProductCombobox from '@/components/quotas/ProductCombobox'

const PAGE_SIZE = 50

const WHOLESALER_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500',
]

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, duration: 0.2 },
  }),
}

export default function QuotasPage() {
  const queryClient = useQueryClient()
  const [wholesalerFilter, setWholesalerFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>(
    new Date().toISOString().slice(0, 7) + '-01'
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WholesalerQuota | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<WholesalerQuotaInsert>({
    wholesaler_id: '',
    product_id: '',
    month: monthFilter,
    quota_quantity: 0,
    extra_available: 0,
    metadata: {},
  })

  const { data: wholesalers } = useQuery({
    queryKey: ['wholesalers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wholesalers').select('*').order('name')
      if (error) throw error
      return data as Wholesaler[]
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products', 'all-for-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, cip13, name')
        .order('name')
        .limit(2000)
      if (error) throw error
      return data as Pick<Product, 'id' | 'cip13' | 'name'>[]
    },
  })

  const { data: quotas, isLoading } = useQuery({
    queryKey: ['quotas', wholesalerFilter, monthFilter, search, page],
    queryFn: async () => {
      let query = supabase
        .from('wholesaler_quotas')
        .select(`
          *,
          wholesaler:wholesalers(id, name, code),
          product:products(id, cip13, name)
        `, { count: 'exact' })
        .eq('month', monthFilter)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (wholesalerFilter && wholesalerFilter !== 'all') {
        query = query.eq('wholesaler_id', wholesalerFilter)
      }

      const { data, count, error } = await query
      if (error) throw error

      let filtered = data as (WholesalerQuota & {
        wholesaler: { id: string; name: string; code: string | null }
        product: { id: string; cip13: string; name: string }
      })[]

      if (search) {
        const s = search.toLowerCase()
        filtered = filtered.filter(
          (q) =>
            q.product.name.toLowerCase().includes(s) ||
            q.product.cip13.includes(s)
        )
      }

      return { data: filtered, count: count ?? 0 }
    },
  })

  const upsert = useMutation({
    mutationFn: async (q: WholesalerQuotaInsert & { id?: string }) => {
      if (q.id) {
        const { id, ...rest } = q
        const { error } = await supabase.from('wholesaler_quotas').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('wholesaler_quotas').insert(q)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotas'] })
      setDialogOpen(false)
      toast.success(editing ? 'Quota modifie' : 'Quota cree')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wholesaler_quotas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotas'] })
      toast.success('Quota supprime')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({
      wholesaler_id: wholesalerFilter !== 'all' ? wholesalerFilter : '',
      product_id: '',
      month: monthFilter,
      quota_quantity: 0,
      extra_available: 0,
      metadata: {},
    })
    setDialogOpen(true)
  }

  const openEdit = (q: WholesalerQuota) => {
    setEditing(q)
    setForm({
      wholesaler_id: q.wholesaler_id,
      product_id: q.product_id,
      month: q.month,
      quota_quantity: q.quota_quantity,
      extra_available: q.extra_available,
      metadata: q.metadata,
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    upsert.mutate(editing ? { ...form, id: editing.id } : form)
  }

  const totalPages = Math.ceil((quotas?.count ?? 0) / PAGE_SIZE)

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i + 1)
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })

  const currentMonthLabel = new Date(monthFilter).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  // Build wholesaler color map for colored dots
  const wholesalerColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    wholesalers?.forEach((w, i) => {
      map[w.id] = WHOLESALER_COLORS[i % WHOLESALER_COLORS.length]
    })
    return map
  }, [wholesalers])

  // Summary stats
  const totalQuota = quotas?.data.reduce((s, q) => s + q.quota_quantity, 0) ?? 0
  const totalExtra = quotas?.data.reduce((s, q) => s + q.extra_available, 0) ?? 0

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-5 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <ClipboardList className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">Quotas grossistes</h2>
            <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {currentMonthLabel} &middot; {quotas?.count ?? 0} quotas
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 text-[13px] h-8">
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </Button>
      </div>

      {/* Month strip */}
      <div className="rounded-xl border bg-card p-2">
        <MonthStrip
          value={monthFilter}
          onChange={(v) => { setMonthFilter(v); setPage(0) }}
          months={monthOptions}
        />
      </div>

      {/* Filters + summary */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher produit..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="pl-9"
          />
        </div>

        {/* Wholesaler chip filter */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => { setWholesalerFilter('all'); setPage(0) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              wholesalerFilter === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted text-muted-foreground'
            }`}
          >
            Tous
          </button>
          {wholesalers?.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => { setWholesalerFilter(w.id); setPage(0) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                wholesalerFilter === w.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${wholesalerColorMap[w.id]}`} />
              {w.code ?? w.name}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats bar */}
      {quotas && quotas.data.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-4 items-center text-sm"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
            <span className="text-muted-foreground">Quota total:</span>
            <span className="font-bold tabular-nums">{totalQuota.toLocaleString('fr-FR')}</span>
          </div>
          {totalExtra > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50">
              <span className="text-muted-foreground">Extra:</span>
              <span className="font-bold tabular-nums text-emerald-600">+{totalExtra.toLocaleString('fr-FR')}</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-bold tabular-nums text-primary">{(totalQuota + totalExtra).toLocaleString('fr-FR')}</span>
          </div>
        </motion.div>
      )}

      {/* Table */}
      <div className="border border-border/60 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Grossiste</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CIP13</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Produit</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Quota</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Extra</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Total</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !quotas?.data.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <motion.div
                      className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                    >
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </motion.div>
                    <div>
                      <p className="font-semibold">Aucun quota pour {currentMonthLabel}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Ajoutez des quotas pour ce mois
                      </p>
                    </div>
                    <Button size="sm" onClick={openCreate} className="mt-2 gap-1.5">
                      <Plus className="h-4 w-4" />
                      Ajouter un quota
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              quotas.data.map((q, i) => {
                const total = q.quota_quantity + q.extra_available
                const colorClass = wholesalerColorMap[q.wholesaler_id] ?? 'bg-gray-400'
                return (
                  <motion.tr
                    key={q.id}
                    custom={i}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    className="group border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
                        <Badge variant="secondary" className="font-medium">
                          {q.wholesaler?.code ?? q.wholesaler?.name ?? '-'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-primary">{q.product?.cip13 ?? '-'}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{q.product?.name ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{q.quota_quantity}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {q.extra_available > 0 ? (
                        <span className="text-emerald-600">+{q.extra_available}</span>
                      ) : (
                        q.extra_available
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 font-bold tabular-nums">
                        {total}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Modifier</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(q.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Supprimer</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </motion.tr>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page <span className="font-medium text-foreground">{page + 1}</span> sur <span className="font-medium text-foreground">{totalPages}</span>
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Precedent
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i : page <= 3 ? i : page >= totalPages - 4 ? totalPages - 7 + i : page - 3 + i
              return (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'outline'}
                  size="sm"
                  className="w-8 px-0"
                  onClick={() => setPage(p)}
                >
                  {p + 1}
                </Button>
              )
            })}
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-amber-600" />
              </div>
              {editing ? 'Modifier le quota' : 'Nouveau quota'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Modifiez la quantite allouee' : 'Definissez un quota mensuel pour un grossiste et un produit'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Grossiste *</Label>
              <Select
                value={form.wholesaler_id}
                onValueChange={(v) => setForm({ ...form, wholesaler_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner un grossiste" />
                </SelectTrigger>
                <SelectContent>
                  {wholesalers?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${wholesalerColorMap[w.id]}`} />
                        {w.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Produit *</Label>
              <ProductCombobox
                products={products ?? []}
                value={form.product_id}
                onValueChange={(v) => setForm({ ...form, product_id: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Mois *</Label>
              <Select
                value={form.month}
                onValueChange={(v) => setForm({ ...form, month: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {new Date(m).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stepper inputs for quota and extra */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantite quota *</Label>
                <StepperInput
                  value={form.quota_quantity}
                  onChange={(v) => setForm({ ...form, quota_quantity: v ?? 0 })}
                  min={0}
                  max={9999}
                  step={10}
                  presets={[
                    { label: '50', value: 50 },
                    { label: '100', value: 100 },
                    { label: '500', value: 500 },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label>Extra disponible</Label>
                <StepperInput
                  value={form.extra_available}
                  onChange={(v) => setForm({ ...form, extra_available: v ?? 0 })}
                  min={0}
                  max={9999}
                  step={5}
                  presets={[
                    { label: '10', value: 10 },
                    { label: '25', value: 25 },
                    { label: '50', value: 50 },
                  ]}
                />
              </div>
            </div>

            {(form.quota_quantity > 0 || form.extra_available > 0) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-lg bg-muted/50 p-3 flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground">Total disponible</span>
                <motion.span
                  key={form.quota_quantity + form.extra_available}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="font-bold text-lg tabular-nums"
                >
                  {form.quota_quantity + form.extra_available}
                </motion.span>
              </motion.div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={upsert.isPending || !form.wholesaler_id || !form.product_id}>
                {upsert.isPending ? 'Enregistrement...' : editing ? 'Modifier' : 'Creer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Supprimer le quota"
        description="Cette action est irreversible. Le quota sera definitivement supprime."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
      />
    </div>
  )
}
