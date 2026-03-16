import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Wholesaler, Product, WholesalerQuota, WholesalerQuotaInsert } from '@/types/database'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
const WHOLESALER_COLORS = ['#3B82F6', '#0D9488', '#059669', '#F59E0B', '#EC4899', '#06B6D4', '#F97316', '#10B981']

function TableSkeleton() {
  return (<>{Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i} style={{ borderBottom: '1px dashed rgba(0,0,0,0.04)' }}>
      <TableCell><Skeleton className="h-4 w-20 rounded-md" /></TableCell>
      <TableCell><Skeleton className="h-4 w-28 rounded-md" /></TableCell>
      <TableCell><Skeleton className="h-4 w-40 rounded-md" /></TableCell>
      <TableCell><Skeleton className="h-4 w-12 rounded-md" /></TableCell>
      <TableCell><Skeleton className="h-4 w-12 rounded-md" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16 rounded-md" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16 rounded-md" /></TableCell>
    </TableRow>
  ))}</>)
}

const rowVariants: import('framer-motion').Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.025, duration: 0.25, ease: [0.2, 0.9, 0.2, 1] as [number, number, number, number] } }),
}

export default function QuotasPage() {
  const queryClient = useQueryClient()
  const [wholesalerFilter, setWholesalerFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7) + '-01')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WholesalerQuota | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<WholesalerQuotaInsert>({ wholesaler_id: '', product_id: '', month: monthFilter, quota_quantity: 0, extra_available: 0, quota_used: 0, monthly_process_id: null, import_file_name: null, metadata: {} })

  const { data: wholesalers } = useQuery({ queryKey: ['wholesalers'], queryFn: async () => { const { data, error } = await supabase.from('wholesalers').select('*').order('name'); if (error) throw error; return data as Wholesaler[] } })
  const { data: products } = useQuery({ queryKey: ['products', 'all-for-select'], staleTime: 1000 * 60 * 30, queryFn: async () => {
    // Paginate to get all products (1733 rows > Supabase 1000 cap)
    const all: Pick<Product, 'id' | 'cip13' | 'name'>[] = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await supabase.from('products').select('id, cip13, name').order('name').range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      all.push(...data as Pick<Product, 'id' | 'cip13' | 'name'>[])
      if (data.length < pageSize) break
      from += pageSize
    }
    return all
  } })

  const { data: quotas, isLoading } = useQuery({
    queryKey: ['quotas', wholesalerFilter, monthFilter, search, page],
    queryFn: async () => {
      let query = supabase.from('wholesaler_quotas').select(`*, wholesaler:wholesalers(id, name, code), product:products(id, cip13, name)`, { count: 'exact' }).eq('month', monthFilter).order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (wholesalerFilter !== 'all') query = query.eq('wholesaler_id', wholesalerFilter)
      const { data, count, error } = await query
      if (error) throw error
      let filtered = data as (WholesalerQuota & { wholesaler: { id: string; name: string; code: string | null }; product: { id: string; cip13: string; name: string } })[]
      if (search) { const s = search.toLowerCase(); filtered = filtered.filter(q => q.product.name.toLowerCase().includes(s) || q.product.cip13.includes(s)) }
      return { data: filtered, count: count ?? 0 }
    },
  })

  const upsert = useMutation({
    mutationFn: async (q: WholesalerQuotaInsert & { id?: string }) => { if (q.id) { const { id, ...rest } = q; const { error } = await supabase.from('wholesaler_quotas').update(rest).eq('id', id); if (error) throw error } else { const { error } = await supabase.from('wholesaler_quotas').insert(q); if (error) throw error } },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quotas'] }); setDialogOpen(false); toast.success(editing ? 'Disponibilite modifiee' : 'Disponibilite creee') },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('wholesaler_quotas').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quotas'] }); toast.success('Disponibilite supprimee') },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => { setEditing(null); setForm({ wholesaler_id: wholesalerFilter !== 'all' ? wholesalerFilter : '', product_id: '', month: monthFilter, quota_quantity: 0, extra_available: 0, quota_used: 0, monthly_process_id: null, import_file_name: null, metadata: {} }); setDialogOpen(true) }
  const openEdit = (q: WholesalerQuota) => { setEditing(q); setForm({ wholesaler_id: q.wholesaler_id, product_id: q.product_id, month: q.month, quota_quantity: q.quota_quantity, extra_available: q.extra_available, quota_used: q.quota_used, monthly_process_id: q.monthly_process_id, import_file_name: q.import_file_name, metadata: q.metadata }); setDialogOpen(true) }
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); upsert.mutate(editing ? { ...form, id: editing.id } : form) }

  const totalPages = Math.ceil((quotas?.count ?? 0) / PAGE_SIZE)
  const monthOptions = Array.from({ length: 24 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() + 12 - i); d.setDate(1); return d.toISOString().slice(0, 10) })
  const currentMonthLabel = new Date(monthFilter).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const wholesalerColorMap = useMemo(() => { const map: Record<string, string> = {}; wholesalers?.forEach((w, i) => { map[w.id] = WHOLESALER_COLORS[i % WHOLESALER_COLORS.length] }); return map }, [wholesalers])
  const totalQuota = quotas?.data.reduce((s, q) => s + q.quota_quantity, 0) ?? 0
  const totalExtra = quotas?.data.reduce((s, q) => s + q.extra_available, 0) ?? 0

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))' }}>
              <ClipboardList className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Disponibilites grossistes</h2>
              <p className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--ivory-text-muted)' }}><Calendar className="h-3 w-3" />{currentMonthLabel} &middot; {quotas?.count ?? 0} disponibilites</p>
            </div>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5 text-[13px] h-9 rounded-xl shadow-sm" style={{ background: 'linear-gradient(180deg, var(--ivory-accent), var(--ivory-accent-hover))', color: 'white' }}><Plus className="h-3.5 w-3.5" /> Ajouter</Button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }} className="relative z-10">
        <div className="ivory-glass" style={{ padding: '10px' }}><MonthStrip value={monthFilter} onChange={(v) => { setMonthFilter(v); setPage(0) }} months={monthOptions} /></div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }} className="flex gap-3 items-center flex-wrap relative z-10">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ivory-text-muted)' }} />
          <Input placeholder="Rechercher produit..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} className="pl-10 h-10 text-[13px] rounded-xl bg-white" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'var(--ivory-shadow-sm)' }} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" onClick={() => { setWholesalerFilter('all'); setPage(0) }} className={`ivory-chip ${wholesalerFilter === 'all' ? 'active' : ''}`}>Tous</button>
          {wholesalers?.map((w) => (<button key={w.id} type="button" onClick={() => { setWholesalerFilter(w.id); setPage(0) }} className={`ivory-chip ${wholesalerFilter === w.id ? 'active' : ''}`}><span className="w-2 h-2 rounded-full" style={{ background: wholesalerColorMap[w.id] }} />{w.code ?? w.name}</button>))}
        </div>
      </motion.div>

      {quotas && quotas.data.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex gap-3 flex-wrap relative z-10">
          <div className="ivory-stat-pill"><span className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Dispo</span><span className="font-bold tabular-nums text-[13px]" style={{ color: 'var(--ivory-text-heading)' }}>{totalQuota.toLocaleString('fr-FR')}</span></div>
          {totalExtra > 0 && <div className="ivory-stat-pill"><span className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Extra</span><span className="font-bold tabular-nums text-[13px]" style={{ color: 'var(--ivory-teal)' }}>+{totalExtra.toLocaleString('fr-FR')}</span></div>}
          <div className="ivory-stat-pill"><span className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Total</span><span className="font-bold tabular-nums text-[13px]" style={{ color: 'var(--ivory-accent)' }}>{(totalQuota + totalExtra).toLocaleString('fr-FR')}</span></div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }} className="ivory-glass overflow-hidden relative z-10" style={{ padding: 0 }}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent" style={{ background: 'rgba(248,247,244,0.8)' }}>
              <TableHead className="ivory-table-head py-3.5 px-4">Grossiste</TableHead>
              <TableHead className="ivory-table-head py-3.5">CIP13</TableHead>
              <TableHead className="ivory-table-head py-3.5">Produit</TableHead>
              <TableHead className="ivory-table-head py-3.5 text-right">Dispo</TableHead>
              <TableHead className="ivory-table-head py-3.5 text-right">Extra</TableHead>
              <TableHead className="ivory-table-head py-3.5 text-right">Total</TableHead>
              <TableHead className="ivory-table-head py-3.5 text-right">Utilise</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableSkeleton /> : !quotas?.data.length ? (
              <TableRow><TableCell colSpan={8} className="text-center py-20">
                <motion.div className="flex flex-col items-center gap-3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.06)' }}><Package className="h-7 w-7" style={{ color: 'var(--ivory-text-muted)' }} /></div>
                  <p className="ivory-heading text-[14px]">Aucune disponibilite pour {currentMonthLabel}</p>
                  <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Ajoutez des disponibilites</p>
                  <Button size="sm" onClick={openCreate} className="mt-2 gap-1.5 text-[12px] h-8 rounded-xl" style={{ background: 'var(--ivory-accent)', color: 'white' }}><Plus className="h-3 w-3" /> Ajouter</Button>
                </motion.div>
              </TableCell></TableRow>
            ) : quotas.data.map((q, i) => {
              const total = q.quota_quantity + q.extra_available
              const color = wholesalerColorMap[q.wholesaler_id] ?? '#94A3B8'
              return (
                <motion.tr key={q.id} custom={i} variants={rowVariants} initial="hidden" animate="visible" className="group ivory-table-row">
                  <TableCell className="px-4"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /><span className="ivory-mono text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: `${color}12`, color }}>{q.wholesaler?.code ?? q.wholesaler?.name ?? '-'}</span></div></TableCell>
                  <TableCell><span className="ivory-mono text-[12px] font-medium px-2 py-0.5 rounded-md" style={{ color: 'var(--ivory-accent)', background: 'rgba(13,148,136,0.06)' }}>{q.product?.cip13 ?? '-'}</span></TableCell>
                  <TableCell><span className="text-[13px] font-medium max-w-[200px] truncate block" style={{ color: 'var(--ivory-text-heading)' }}>{q.product?.name ?? '-'}</span></TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-[13px]" style={{ color: 'var(--ivory-text-heading)' }}>{q.quota_quantity === 0 || q.quota_quantity == null ? <span className="text-lg" title="Deplafonne">∞</span> : q.quota_quantity}</TableCell>
                  <TableCell className="text-right tabular-nums text-[13px]">{q.extra_available > 0 ? <span style={{ color: 'var(--ivory-teal)' }}>+{q.extra_available}</span> : <span style={{ color: 'var(--ivory-text-muted)' }}>{q.extra_available}</span>}</TableCell>
                  <TableCell className="text-right"><span className="font-bold tabular-nums text-[13px]" style={{ color: 'var(--ivory-text-heading)' }}>{total}</span></TableCell>
                  <TableCell className="text-right tabular-nums text-[13px]">{q.quota_used > 0 ? <span style={{ color: q.quota_used >= total ? 'rgb(220,38,38)' : 'var(--ivory-accent)' }}>{q.quota_used}/{total}</span> : <span style={{ color: 'var(--ivory-text-muted)' }}>0</span>}</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-[rgba(13,148,136,0.06)]" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} /></Button></TooltipTrigger><TooltipContent>Modifier</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button></TooltipTrigger><TooltipContent>Supprimer</TooltipContent></Tooltip>
                    </div>
                  </TableCell>
                </motion.tr>
              )
            })}
          </TableBody>
        </Table>
      </motion.div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between relative z-10">
          <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Page <span className="font-semibold" style={{ color: 'var(--ivory-text-heading)' }}>{page + 1}</span> / {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 text-[12px] rounded-lg" disabled={page === 0} onClick={() => setPage(page - 1)}>Precedent</Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => { const p = totalPages <= 7 ? i : page <= 3 ? i : page >= totalPages - 4 ? totalPages - 7 + i : page - 3 + i; return <Button key={p} variant={p === page ? 'default' : 'ghost'} size="sm" className="w-8 h-8 p-0 text-[12px] rounded-lg" style={p === page ? { background: 'var(--ivory-accent)', color: 'white' } : {}} onClick={() => setPage(p)}>{p + 1}</Button> })}
            <Button variant="outline" size="sm" className="h-8 text-[12px] rounded-lg" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Suivant</Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 ivory-heading text-base"><div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.08)' }}><ClipboardList className="h-4 w-4 text-amber-500" /></div>{editing ? 'Modifier la disponibilite' : 'Nouvelle disponibilite'}</DialogTitle>
            <DialogDescription className="text-[13px]">{editing ? 'Modifiez la quantite' : 'Definissez une disponibilite mensuelle'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5"><Label className="text-[13px] font-medium">Grossiste *</Label><Select value={form.wholesaler_id} onValueChange={(v) => setForm({ ...form, wholesaler_id: v })}><SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Selectionner" /></SelectTrigger><SelectContent>{wholesalers?.map((w) => <SelectItem key={w.id} value={w.id}><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: wholesalerColorMap[w.id] }} />{w.name}</div></SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-[13px] font-medium">Produit *</Label><ProductCombobox products={products ?? []} value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] font-medium">Mois *</Label><Select value={form.month} onValueChange={(v) => setForm({ ...form, month: v })}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{monthOptions.map((m) => <SelectItem key={m} value={m}>{new Date(m).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-[13px] font-medium">Quantite *</Label><StepperInput value={form.quota_quantity} onChange={(v) => setForm({ ...form, quota_quantity: v ?? 0 })} min={0} max={9999} step={10} presets={[{ label: '50', value: 50 }, { label: '100', value: 100 }, { label: '500', value: 500 }]} /></div>
              <div className="space-y-1.5"><Label className="text-[13px] font-medium">Extra</Label><StepperInput value={form.extra_available} onChange={(v) => setForm({ ...form, extra_available: v ?? 0 })} min={0} max={9999} step={5} presets={[{ label: '10', value: 10 }, { label: '25', value: 25 }, { label: '50', value: 50 }]} /></div>
            </div>
            {(form.quota_quantity > 0 || form.extra_available > 0) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-xl p-3.5 flex items-center justify-between" style={{ background: 'rgba(248,247,244,0.8)' }}>
                <span className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Total</span>
                <motion.span key={form.quota_quantity + form.extra_available} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="font-bold text-lg tabular-nums ivory-heading">{form.quota_quantity + form.extra_available}</motion.span>
              </motion.div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px] rounded-xl">Annuler</Button>
              <Button type="submit" size="sm" disabled={upsert.isPending || !form.wholesaler_id || !form.product_id} className="text-[13px] rounded-xl" style={{ background: 'var(--ivory-accent)', color: 'white' }}>{upsert.isPending ? 'Enregistrement...' : editing ? 'Modifier' : 'Creer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Supprimer la disponibilite" description="Action irreversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  )
}
