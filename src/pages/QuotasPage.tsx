import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Wholesaler, Product, WholesalerQuota, WholesalerQuotaInsert } from '@/types/database'
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
import { Plus, Pencil, Trash2, Search, ClipboardList, Calendar, Package } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ConfirmDialog'

const PAGE_SIZE = 50

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

  const [productSearch, setProductSearch] = useState('')
  const filteredProducts = products?.filter((p) => {
    if (!productSearch) return true
    const s = productSearch.toLowerCase()
    return p.name.toLowerCase().includes(s) || p.cip13.includes(s)
  }).slice(0, 50)

  const currentMonthLabel = new Date(monthFilter).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Quotas grossistes</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {currentMonthLabel} &middot; {quotas?.count ?? 0} quotas
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {/* Filters */}
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
        <Select value={wholesalerFilter} onValueChange={(v) => { setWholesalerFilter(v); setPage(0) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Grossiste" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les grossistes</SelectItem>
            {wholesalers?.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); setPage(0) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Mois" />
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

      {/* Table */}
      <div className="border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="font-semibold">Grossiste</TableHead>
              <TableHead className="font-semibold">CIP13</TableHead>
              <TableHead className="font-semibold">Produit</TableHead>
              <TableHead className="font-semibold text-right">Quota</TableHead>
              <TableHead className="font-semibold text-right">Extra</TableHead>
              <TableHead className="font-semibold text-right">Total</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !quotas?.data.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
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
              quotas.data.map((q) => {
                const total = q.quota_quantity + q.extra_available
                return (
                  <TableRow key={q.id} className="group">
                    <TableCell>
                      <Badge variant="secondary" className="font-medium">
                        {q.wholesaler?.code ?? q.wholesaler?.name ?? '-'}
                      </Badge>
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
                  </TableRow>
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Precedent
            </Button>
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
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Produit *</Label>
              <Input
                placeholder="Rechercher un produit (CIP13, nom)..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="mb-2"
              />
              <Select
                value={form.product_id}
                onValueChange={(v) => setForm({ ...form, product_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner un produit" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProducts?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs text-muted-foreground mr-2">{p.cip13}</span>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantite quota *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.quota_quantity}
                  onChange={(e) => setForm({ ...form, quota_quantity: parseInt(e.target.value) || 0 })}
                  required
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label>Extra disponible</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.extra_available}
                  onChange={(e) => setForm({ ...form, extra_available: parseInt(e.target.value) || 0 })}
                  className="tabular-nums"
                />
              </div>
            </div>
            {(form.quota_quantity > 0 || form.extra_available > 0) && (
              <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total disponible</span>
                <span className="font-bold text-lg tabular-nums">{form.quota_quantity + form.extra_available}</span>
              </div>
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
