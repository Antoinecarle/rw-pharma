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
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, Pencil, Trash2, ShieldAlert, FileSpreadsheet, Pill, Package } from 'lucide-react'
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
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
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
  const [expiryText, setExpiryText] = useState('')

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
    setExpiryText('')
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
    setExpiryText(Array.isArray(p.expiry_dates) ? p.expiry_dates.join(', ') : '')
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsedExpiry = expiryText.trim()
      ? expiryText.split(/[,\n]+/).map(d => d.trim()).filter(Boolean).map(d => {
          const mmYyyy = d.match(/^(\d{2})\/(\d{4})$/)
          return mmYyyy ? `${mmYyyy[2]}-${mmYyyy[1]}` : d
        })
      : null
    const payload = { ...form, expiry_dates: parsedExpiry }
    upsert.mutate(editing ? { ...payload, id: editing.id } : payload)
  }

  const totalPages = Math.ceil((products?.count ?? 0) / PAGE_SIZE)

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Pill className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Produits</h2>
            <p className="text-sm text-muted-foreground">{products?.count ?? 0} produits au catalogue</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Import Excel</span>
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par CIP13, nom, labo..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="pl-9"
          />
        </div>
        <Select value={labFilter} onValueChange={(v) => { setLabFilter(v); setPage(0) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Laboratoire" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les labos</SelectItem>
            {laboratories?.map((lab) => (
              <SelectItem key={lab} value={lab}>{lab}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={ansm ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => { setAnsm(!ansm); setPage(0) }}
          className="gap-1.5"
        >
          <ShieldAlert className="h-4 w-4" />
          ANSM
          {ansm && <span className="ml-1 text-xs opacity-80">(actif)</span>}
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="font-semibold">CIP13</TableHead>
              <TableHead className="font-semibold">Nom</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Laboratoire</TableHead>
              <TableHead className="font-semibold">PFHT</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">EUNB</TableHead>
              <TableHead className="font-semibold">Statut</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !products?.data.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Aucun produit trouve</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Ajoutez des produits manuellement ou importez un fichier Excel
                      </p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                        <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                        Import Excel
                      </Button>
                      <Button size="sm" onClick={openCreate}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        Ajouter
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              products.data.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell className="font-mono text-sm text-primary font-medium">{p.cip13}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{p.laboratory ?? '-'}</TableCell>
                  <TableCell className="tabular-nums">
                    {p.pfht != null ? (
                      <span className="font-medium">{p.pfht.toFixed(2)} <span className="text-muted-foreground text-xs">EUR</span></span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden lg:table-cell font-mono">{p.eunb ?? '-'}</TableCell>
                  <TableCell>
                    {p.is_ansm_blocked ? (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        Bloque
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-200">
                        Actif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifier</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Pill className="h-4 w-4 text-primary" />
              </div>
              {editing ? 'Modifier le produit' : 'Nouveau produit'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Modifiez les informations du produit' : 'Remplissez les informations du nouveau produit'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CIP13 *</Label>
                <Input
                  value={form.cip13}
                  onChange={(e) => setForm({ ...form, cip13: e.target.value })}
                  placeholder="3400930000000"
                  required
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>CIP7</Label>
                <Input
                  value={form.cip7 ?? ''}
                  onChange={(e) => setForm({ ...form, cip7: e.target.value || null })}
                  placeholder="3000000"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nom du produit"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Laboratoire</Label>
                <Input
                  value={form.laboratory ?? ''}
                  onChange={(e) => setForm({ ...form, laboratory: e.target.value || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>PFHT (EUR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.pfht ?? ''}
                  onChange={(e) => setForm({ ...form, pfht: e.target.value ? parseFloat(e.target.value) : null })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>EUNB</Label>
              <Input
                value={form.eunb ?? ''}
                onChange={(e) => setForm({ ...form, eunb: e.target.value || null })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Dates d'expiration</Label>
              <Textarea
                value={expiryText}
                onChange={(e) => setExpiryText(e.target.value)}
                placeholder="2025-06, 2025-09 ou 06/2025, 09/2025"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">Format : YYYY-MM ou MM/YYYY, separes par virgules</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="ansm-switch" className="cursor-pointer">Bloque ANSM</Label>
                <p className="text-xs text-muted-foreground">Interdit a l'export</p>
              </div>
              <Switch
                id="ansm-switch"
                checked={form.is_ansm_blocked}
                onCheckedChange={(checked) => setForm({ ...form, is_ansm_blocked: checked })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
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
