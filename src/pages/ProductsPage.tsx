import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Product, ProductInsert } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import TagInput from '@/components/ui/tag-input'
import { Plus, Search, Pencil, Trash2, ShieldAlert, FileSpreadsheet, Pill, Package, X } from 'lucide-react'
import { toast } from 'sonner'
import ExcelImport from '@/components/ExcelImport'
import ConfirmDialog from '@/components/ConfirmDialog'

const PAGE_SIZE = 50

const emptyProduct: ProductInsert = {
  cip13: '',
  cip7: null,
  name: '',
  eunb: null,
  pfht: null,
  laboratory: null,
  is_ansm_blocked: false,
  expiry_dates: null,
  metadata: {},
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-36" /></TableCell>
          <TableCell className="hidden md:table-cell"><Skeleton className="h-3.5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-14" /></TableCell>
          <TableCell className="hidden lg:table-cell"><Skeleton className="h-3.5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-12" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-14" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [labFilter, setLabFilter] = useState<string>('all')
  const [ansm, setAnsm] = useState(false)
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductInsert>(emptyProduct)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expiryTags, setExpiryTags] = useState<string[]>([])

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, labFilter, ansm, page],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .order('name')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (search) {
        query = query.or(`cip13.ilike.%${search}%,name.ilike.%${search}%,laboratory.ilike.%${search}%`)
      }
      if (labFilter && labFilter !== 'all') {
        query = query.eq('laboratory', labFilter)
      }
      if (ansm) {
        query = query.eq('is_ansm_blocked', true)
      }

      const { data, count, error } = await query
      if (error) throw error
      return { data: data as Product[], count: count ?? 0 }
    },
  })

  const { data: laboratories } = useQuery({
    queryKey: ['products', 'laboratories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('laboratory')
        .not('laboratory', 'is', null)
        .order('laboratory')
      if (error) throw error
      const unique = [...new Set(data.map(r => r.laboratory).filter(Boolean))] as string[]
      return unique
    },
  })

  const upsert = useMutation({
    mutationFn: async (product: ProductInsert & { id?: string }) => {
      if (product.id) {
        const { id, ...rest } = product
        const { error } = await supabase.from('products').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert(product)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setDialogOpen(false)
      toast.success(editing ? 'Produit modifie' : 'Produit cree')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produit supprime')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyProduct)
    setExpiryTags([])
    setDialogOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      cip13: p.cip13,
      cip7: p.cip7,
      name: p.name,
      eunb: p.eunb,
      pfht: p.pfht,
      laboratory: p.laboratory,
      is_ansm_blocked: p.is_ansm_blocked,
      expiry_dates: p.expiry_dates,
      metadata: p.metadata,
    })
    setExpiryTags(Array.isArray(p.expiry_dates) ? p.expiry_dates : [])
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...form, expiry_dates: expiryTags.length > 0 ? expiryTags : null }
    upsert.mutate(editing ? { ...payload, id: editing.id } : payload)
  }

  const topLabs = (laboratories ?? []).slice(0, 8)
  const totalPages = Math.ceil((products?.count ?? 0) / PAGE_SIZE)

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-5 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Pill className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">Produits</h2>
            <p className="text-[12px] text-muted-foreground">{products?.count ?? 0} produits au catalogue</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5 text-[13px] h-8">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import Excel</span>
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5 text-[13px] h-8">
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2.5">
        <div className="flex gap-2.5 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              placeholder="Rechercher par CIP13, nom, labo..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="pl-9 h-9 text-[13px]"
            />
          </div>
          <div className="flex rounded-lg border border-border/80 overflow-hidden">
            <button
              type="button"
              onClick={() => { setAnsm(false); setPage(0) }}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                !ansm ? 'bg-foreground text-background' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => { setAnsm(true); setPage(0) }}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors flex items-center gap-1 ${
                ansm ? 'bg-destructive text-destructive-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              <ShieldAlert className="h-3 w-3" />
              ANSM
            </button>
          </div>
        </div>

        {topLabs.length > 0 && (
          <div className="flex gap-1 items-center flex-wrap">
            <span className="text-[11px] text-muted-foreground/70 mr-0.5">Labos :</span>
            <button
              type="button"
              onClick={() => { setLabFilter('all'); setPage(0) }}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                labFilter === 'all'
                  ? 'bg-foreground text-background'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              Tous
            </button>
            {topLabs.map((lab) => (
              <button
                key={lab}
                type="button"
                onClick={() => { setLabFilter(labFilter === lab ? 'all' : lab); setPage(0) }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                  labFilter === lab
                    ? 'bg-foreground text-background'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {lab}
                {labFilter === lab && <X className="h-2.5 w-2.5 ml-0.5 inline" />}
              </button>
            ))}
            {(laboratories?.length ?? 0) > 8 && (
              <Select value={labFilter} onValueChange={(v) => { setLabFilter(v); setPage(0) }}>
                <SelectTrigger className="h-6 w-auto border-dashed text-[11px] gap-1 px-2">
                  <SelectValue placeholder={`+${(laboratories?.length ?? 0) - 8}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les labos</SelectItem>
                  {laboratories?.map((lab) => (
                    <SelectItem key={lab} value={lab}>{lab}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border border-border/60 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CIP13</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nom</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">Laboratoire</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">PFHT</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground hidden lg:table-cell">EUNB</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Statut</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !products?.data.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-14">
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
                      <Package className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="font-medium text-[13px] text-foreground">Aucun produit trouve</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Ajoutez des produits ou importez un fichier Excel
                      </p>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="text-[12px] h-7">
                        <FileSpreadsheet className="h-3 w-3 mr-1" />
                        Import Excel
                      </Button>
                      <Button size="sm" onClick={openCreate} className="text-[12px] h-7">
                        <Plus className="h-3 w-3 mr-1" />
                        Ajouter
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              products.data.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell className="font-mono text-[12px] text-primary font-medium">{p.cip13}</TableCell>
                  <TableCell className="text-[13px] font-medium max-w-[200px] truncate">{p.name}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground hidden md:table-cell">{p.laboratory ?? '-'}</TableCell>
                  <TableCell className="tabular-nums text-[12px]">
                    {p.pfht != null ? (
                      <span className="font-medium">{p.pfht.toFixed(2)} <span className="text-muted-foreground/60">EUR</span></span>
                    ) : (
                      <span className="text-muted-foreground/40">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground hidden lg:table-cell font-mono">{p.eunb ?? '-'}</TableCell>
                  <TableCell>
                    {p.is_ansm_blocked ? (
                      <Badge variant="destructive" className="gap-1 text-[10px] h-5 px-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-300 animate-subtle-pulse" />
                        Bloque
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-100 gap-1 text-[10px] h-5 px-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Actif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifier</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Supprimer</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">{page * PAGE_SIZE + 1}</span>-<span className="font-medium text-foreground">{Math.min((page + 1) * PAGE_SIZE, products?.count ?? 0)}</span> sur <span className="font-medium text-foreground">{products?.count ?? 0}</span>
          </p>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Precedent
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) {
                pageNum = i
              } else if (page < 3) {
                pageNum = i
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 7 + i
              } else {
                pageNum = page - 3 + i
              }
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? 'default' : 'ghost'}
                  size="sm"
                  className="w-7 h-7 p-0 text-[11px]"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </Button>
              )
            })}
            <Button variant="outline" size="sm" className="h-7 text-[12px]" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center">
                <Pill className="h-3.5 w-3.5 text-primary" />
              </div>
              {editing ? 'Modifier le produit' : 'Nouveau produit'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {editing ? 'Modifiez les informations du produit' : 'Remplissez les informations du nouveau produit'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">CIP13 *</Label>
                <Input
                  value={form.cip13}
                  onChange={(e) => setForm({ ...form, cip13: e.target.value })}
                  placeholder="3400930000000"
                  required
                  className="font-mono text-[13px] h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">CIP7</Label>
                <Input
                  value={form.cip7 ?? ''}
                  onChange={(e) => setForm({ ...form, cip7: e.target.value || null })}
                  placeholder="3000000"
                  className="font-mono text-[13px] h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Nom *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nom du produit"
                required
                className="text-[13px] h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Laboratoire</Label>
                <Input
                  value={form.laboratory ?? ''}
                  onChange={(e) => setForm({ ...form, laboratory: e.target.value || null })}
                  className="text-[13px] h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">PFHT (EUR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.pfht ?? ''}
                  onChange={(e) => setForm({ ...form, pfht: e.target.value ? parseFloat(e.target.value) : null })}
                  className="text-[13px] h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">EUNB</Label>
              <Input
                value={form.eunb ?? ''}
                onChange={(e) => setForm({ ...form, eunb: e.target.value || null })}
                className="font-mono text-[13px] h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Dates d'expiration</Label>
              <TagInput
                value={expiryTags}
                onChange={setExpiryTags}
                placeholder="Saisir MM/YYYY puis Entree..."
              />
              <p className="text-[11px] text-muted-foreground/70">Format : MM/YYYY ou YYYY-MM</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="ansm-switch" className="cursor-pointer text-[13px]">Bloque ANSM</Label>
                <p className="text-[11px] text-muted-foreground">Interdit a l'export</p>
              </div>
              <Switch
                id="ansm-switch"
                checked={form.is_ansm_blocked}
                onCheckedChange={(checked) => setForm({ ...form, is_ansm_blocked: checked })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px]">
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={upsert.isPending} className="text-[13px]">
                {upsert.isPending ? 'Enregistrement...' : editing ? 'Modifier' : 'Creer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ExcelImport open={importOpen} onOpenChange={setImportOpen} />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Supprimer le produit"
        description="Cette action est irreversible. Le produit et ses quotas associes seront supprimes."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
      />
    </div>
  )
}
