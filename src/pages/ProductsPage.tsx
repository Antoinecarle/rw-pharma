import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Product, ProductInsert, ProductAuditLog } from '@/types/database'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Search, Pencil, Trash2, ShieldAlert, FileSpreadsheet, Pill, Package, TrendingUp, AlertTriangle, History, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import ExcelImport from '@/components/ExcelImport'
import ConfirmDialog from '@/components/ConfirmDialog'

const PAGE_SIZE = 50

const AUDIT_FIELD_LABELS: Record<string, string> = {
  is_ansm_blocked: 'Statut ANSM',
  is_discontinued: 'Discontinue',
  pfht: 'Prix',
  name: 'Nom',
}

interface LatestExpiry {
  product_id: string
  latest_expiry: string
  latest_lot: string | null
}

interface BestPrice {
  product_id: string
  best_price: number
  best_price_customer: string
  best_price_month: string | null
}

const emptyProduct: ProductInsert = {
  cip13: '',
  cip7: null,
  name: '',
  eunb: null,
  pfht: null,
  laboratory: null,
  is_ansm_blocked: false,
  is_discontinued: false,
  is_demo_generated: false,
  categorie: null,
  expiry_dates: null,
  metadata: {},
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i} className="border-b border-dashed" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
          <TableCell><Skeleton className="h-4 w-28 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40 rounded-md" /></TableCell>
          <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16 rounded-md" /></TableCell>
          <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-16 rounded-md" /></TableCell>
          <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-24 rounded-md" /></TableCell>
          <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-14 rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.025, duration: 0.3, ease: [0.2, 0.9, 0.2, 1] as [number, number, number, number] },
  }),
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ansm' | 'discontinued'>('all')
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductInsert>(emptyProduct)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)

  // ── Latest Expiry view ──────────────────────────────────────
  const { data: expiryMap } = useQuery({
    queryKey: ['product-latest-expiry'],
    queryFn: async () => {
      const { data, error } = await supabase.from('product_latest_expiry').select('*')
      if (error) throw error
      const map = new Map<string, LatestExpiry>()
      for (const row of (data as LatestExpiry[])) {
        map.set(row.product_id, row)
      }
      return map
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Best Price view ─────────────────────────────────────────
  const { data: bestPriceMap } = useQuery({
    queryKey: ['product-best-price'],
    queryFn: async () => {
      const { data, error } = await supabase.from('product_best_price').select('*')
      if (error) throw error
      const map = new Map<string, BestPrice>()
      for (const row of (data as BestPrice[])) {
        map.set(row.product_id, row)
      }
      return map
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .order('name')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (search) {
        query = query.or(`cip13.ilike.%${search}%,name.ilike.%${search}%,laboratory.ilike.%${search}%`)
      }
      if (statusFilter === 'ansm') {
        query = query.eq('is_ansm_blocked', true)
      } else if (statusFilter === 'discontinued') {
        query = query.eq('is_discontinued', true)
      }

      const { data, count, error } = await query
      if (error) throw error
      return { data: data as Product[], count: count ?? 0 }
    },
  })

  const upsert = useMutation({
    mutationFn: async (product: ProductInsert & { id?: string }) => {
      if (product.id) {
        const { id, ...rest } = product
        // Audit trail: log changes to critical fields
        if (editing) {
          const trackedFields = ['is_ansm_blocked', 'is_discontinued', 'pfht', 'name'] as const
          const auditEntries: { product_id: string; field_changed: string; old_value: string | null; new_value: string | null }[] = []
          for (const field of trackedFields) {
            const oldVal = String(editing[field] ?? '')
            const newVal = String(rest[field] ?? '')
            if (oldVal !== newVal) {
              auditEntries.push({ product_id: id, field_changed: field, old_value: oldVal, new_value: newVal })
            }
          }
          if (auditEntries.length > 0) {
            await supabase.from('product_audit_log').insert(auditEntries)
          }
        }
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

  // ── Audit log for current product ────────────────────────────
  const { data: auditLog, isLoading: auditLoading } = useQuery({
    queryKey: ['product-audit-log', editing?.id],
    queryFn: async () => {
      if (!editing) return []
      const { data, error } = await supabase
        .from('product_audit_log')
        .select('*')
        .eq('product_id', editing.id)
        .order('changed_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as ProductAuditLog[]
    },
    enabled: !!editing && dialogOpen,
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyProduct)
    setAuditOpen(false)
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
      is_discontinued: p.is_discontinued,
      is_demo_generated: p.is_demo_generated,
      categorie: p.categorie,
      expiry_dates: p.expiry_dates,
      metadata: p.metadata,
    })
    setAuditOpen(false)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    upsert.mutate(editing ? { ...form, id: editing.id } : form)
  }

  const formatExpiry = useMemo(() => (dateStr: string) => {
    const d = new Date(dateStr)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${mm}/${yyyy}`
  }, [])

  const getExpiryColor = useMemo(() => (dateStr: string) => {
    const now = new Date()
    const expiry = new Date(dateStr)
    if (expiry < now) return '#DC4A4A' // red - expired
    const sixMonths = new Date()
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    if (expiry < sixMonths) return '#D97706' // amber - <6 months
    return 'var(--ivory-text-muted)' // normal
  }, [])

  const totalPages = Math.ceil((products?.count ?? 0) / PAGE_SIZE)
  const catalogProgress = products?.count ? Math.min((products.count / 1760) * 100, 100) : 0

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1400px] mx-auto ivory-page-glow">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.08))' }}>
              <Pill className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Catalogue produits</h2>
              <div className="flex items-center gap-3 mt-0.5">
                <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                  {products?.count ?? 0} references pharmaceutiques
                </p>
                {products?.count != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, var(--ivory-accent), var(--ivory-teal))' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${catalogProgress}%` }}
                        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                      />
                    </div>
                    <span className="text-[10px] font-medium tabular-nums" style={{ color: 'var(--ivory-accent)' }}>
                      {catalogProgress.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="gap-1.5 text-[13px] h-9 rounded-xl border-dashed hover:border-solid transition-all"
              style={{ borderColor: 'rgba(0,0,0,0.10)' }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Import Excel</span>
            </Button>
            <Button
              size="sm"
              onClick={openCreate}
              className="gap-1.5 text-[13px] h-9 rounded-xl shadow-sm"
              style={{ background: 'linear-gradient(180deg, var(--ivory-accent), var(--ivory-accent-hover))', color: 'white' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex gap-3 flex-wrap relative z-10"
      >
        <div className="ivory-stat-pill">
          <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--ivory-teal)' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--ivory-text-body)' }}>
            <span className="font-bold tabular-nums">{products?.count ?? 0}</span> / 1 760
          </span>
        </div>
        {(products?.count ?? 0) > 0 && (
          <div className="ivory-stat-pill">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[12px] font-medium" style={{ color: 'var(--ivory-text-body)' }}>
              ANSM bloques
            </span>
          </div>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="space-y-3 relative z-10"
      >
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ivory-text-muted)' }} />
            <Input
              placeholder="Rechercher par CIP13, nom, labo..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="pl-10 h-10 text-[13px] rounded-xl bg-white"
              style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'var(--ivory-shadow-sm)' }}
            />
          </div>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'var(--ivory-shadow-sm)' }}>
            <button
              type="button"
              onClick={() => { setStatusFilter('all'); setPage(0) }}
              className="px-3.5 py-2 text-[12px] font-medium transition-all"
              style={{
                background: statusFilter === 'all' ? 'var(--ivory-accent)' : 'white',
                color: statusFilter === 'all' ? 'white' : 'var(--ivory-text-muted)',
              }}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('ansm'); setPage(0) }}
              className="px-3.5 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
              style={{
                background: statusFilter === 'ansm' ? '#DC4A4A' : 'white',
                color: statusFilter === 'ansm' ? 'white' : 'var(--ivory-text-muted)',
              }}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              ANSM
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('discontinued'); setPage(0) }}
              className="px-3.5 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
              style={{
                background: statusFilter === 'discontinued' ? '#7C3AED' : 'white',
                color: statusFilter === 'discontinued' ? 'white' : 'var(--ivory-text-muted)',
              }}
            >
              Arretes
            </button>
          </div>
        </div>

      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="ivory-glass overflow-hidden relative z-10"
        style={{ padding: 0 }}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent" style={{ background: 'rgba(248,247,244,0.8)' }}>
              <TableHead className="ivory-table-head py-3.5 px-4">CIP13</TableHead>
              <TableHead className="ivory-table-head py-3.5">Nom</TableHead>
              <TableHead className="ivory-table-head py-3.5 hidden md:table-cell">Laboratoire</TableHead>
              <TableHead className="ivory-table-head py-3.5">PFHT</TableHead>
              <TableHead className="ivory-table-head py-3.5 hidden lg:table-cell">Dern. Exp.</TableHead>
              <TableHead className="ivory-table-head py-3.5 hidden xl:table-cell">Best Prix</TableHead>
              <TableHead className="ivory-table-head py-3.5 hidden lg:table-cell">EUNB</TableHead>
              <TableHead className="ivory-table-head py-3.5">Statut</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !products?.data.length ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-20">
                  <motion.div
                    className="flex flex-col items-center gap-3"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(13,148,136,0.06)' }}>
                      <Package className="h-7 w-7" style={{ color: 'var(--ivory-text-muted)' }} />
                    </div>
                    <div>
                      <p className="ivory-heading text-[14px]">Aucun produit trouve</p>
                      <p className="text-[12px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
                        Ajoutez des produits ou importez un fichier Excel
                      </p>
                    </div>
                    <div className="flex gap-2.5 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setImportOpen(true)}
                        className="text-[12px] h-8 rounded-xl"
                      >
                        <FileSpreadsheet className="h-3 w-3 mr-1.5" />
                        Import Excel
                      </Button>
                      <Button
                        size="sm"
                        onClick={openCreate}
                        className="text-[12px] h-8 rounded-xl"
                        style={{ background: 'var(--ivory-accent)', color: 'white' }}
                      >
                        <Plus className="h-3 w-3 mr-1.5" />
                        Ajouter
                      </Button>
                    </div>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence mode="popLayout">
                {products.data.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    custom={i}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    className="group ivory-table-row"
                  >
                    <TableCell className="px-4">
                      <span className="ivory-mono text-[12px] font-medium px-2 py-0.5 rounded-md"
                        style={{ color: 'var(--ivory-accent)', background: 'rgba(13,148,136,0.06)' }}>
                        {p.cip13}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[13px] font-medium max-w-[220px] truncate block"
                        style={{ color: 'var(--ivory-text-heading)' }}>
                        {p.name}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>{p.laboratory ?? '-'}</span>
                    </TableCell>
                    <TableCell>
                      {p.pfht != null ? (
                        <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--ivory-text-heading)' }}>
                          {p.pfht.toFixed(2)}
                          <span className="ml-0.5 font-normal" style={{ color: 'var(--ivory-text-muted)' }}>EUR</span>
                        </span>
                      ) : (
                        <span style={{ color: 'rgba(0,0,0,0.15)' }}>-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {expiryMap?.get(p.id) ? (
                        <span
                          className="text-[12px] font-medium tabular-nums"
                          style={{ color: getExpiryColor(expiryMap.get(p.id)!.latest_expiry) }}
                        >
                          {formatExpiry(expiryMap.get(p.id)!.latest_expiry)}
                        </span>
                      ) : (
                        <span style={{ color: 'rgba(0,0,0,0.15)' }}>-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {bestPriceMap?.get(p.id) ? (
                        <span className="text-[12px] tabular-nums" style={{ color: 'var(--ivory-text-heading)' }}>
                          <span className="font-semibold">{bestPriceMap.get(p.id)!.best_price.toFixed(2)}&euro;</span>
                          <span className="ml-1 font-normal text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>
                            ({bestPriceMap.get(p.id)!.best_price_customer})
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: 'rgba(0,0,0,0.15)' }}>-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="ivory-mono text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>{p.eunb ?? '-'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.is_ansm_blocked && (
                          <span className="ivory-badge"
                            style={{ background: 'rgba(220,74,74,0.08)', color: '#DC4A4A', border: '1px solid rgba(220,74,74,0.15)' }}>
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-subtle-pulse inline-block" />
                            Bloque
                          </span>
                        )}
                        {p.is_discontinued && (
                          <span className="ivory-badge"
                            style={{ background: 'rgba(139,92,246,0.08)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.15)' }}>
                            Arrete
                          </span>
                        )}
                        {!p.is_ansm_blocked && !p.is_discontinued && (
                          <span className="ivory-badge"
                            style={{ background: 'rgba(13,148,136,0.08)', color: 'var(--ivory-teal)', border: '1px solid rgba(13,148,136,0.12)' }}>
                            <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: 'var(--ivory-teal)' }} />
                            Actif
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-[rgba(13,148,136,0.06)]" onClick={() => openEdit(p)}>
                              <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Modifier</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50" onClick={() => setDeleteId(p.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Supprimer</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between relative z-10"
        >
          <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--ivory-text-heading)' }}>{page * PAGE_SIZE + 1}</span>
            {' - '}
            <span className="font-semibold" style={{ color: 'var(--ivory-text-heading)' }}>{Math.min((page + 1) * PAGE_SIZE, products?.count ?? 0)}</span>
            {' sur '}
            <span className="font-semibold" style={{ color: 'var(--ivory-text-heading)' }}>{products?.count ?? 0}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[12px] rounded-lg"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
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
                  className="w-8 h-8 p-0 text-[12px] rounded-lg"
                  style={pageNum === page ? { background: 'var(--ivory-accent)', color: 'white' } : {}}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </Button>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[12px] rounded-lg"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              Suivant
            </Button>
          </div>
        </motion.div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 ivory-heading text-base">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(13,148,136,0.08)' }}>
                <Pill className="h-4 w-4" style={{ color: 'var(--ivory-accent)' }} />
              </div>
              {editing ? 'Modifier le produit' : 'Nouveau produit'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {editing ? 'Modifiez les informations du produit' : 'Remplissez les informations du nouveau produit'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">CIP13 *</Label>
                <Input
                  value={form.cip13}
                  onChange={(e) => setForm({ ...form, cip13: e.target.value })}
                  placeholder="3400930000000"
                  required
                  className="ivory-mono text-[13px] h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">CIP7</Label>
                <Input
                  value={form.cip7 ?? ''}
                  onChange={(e) => setForm({ ...form, cip7: e.target.value || null })}
                  placeholder="3000000"
                  className="ivory-mono text-[13px] h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium">Nom *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nom du produit"
                required
                className="text-[13px] h-10 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">Laboratoire</Label>
                <Input
                  value={form.laboratory ?? ''}
                  onChange={(e) => setForm({ ...form, laboratory: e.target.value || null })}
                  className="text-[13px] h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">PFHT (EUR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.pfht ?? ''}
                  onChange={(e) => setForm({ ...form, pfht: e.target.value ? parseFloat(e.target.value) : null })}
                  className="text-[13px] h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium">EUNB</Label>
              <Input
                value={form.eunb ?? ''}
                onChange={(e) => setForm({ ...form, eunb: e.target.value || null })}
                className="ivory-mono text-[13px] h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl p-3.5"
                style={{ border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(248,247,244,0.5)' }}>
                <div className="space-y-0.5">
                  <Label htmlFor="ansm-switch" className="cursor-pointer text-[13px] font-medium">Bloque ANSM</Label>
                  <p className="text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>Interdit a l'export</p>
                </div>
                <Switch
                  id="ansm-switch"
                  checked={form.is_ansm_blocked}
                  onCheckedChange={(checked) => setForm({ ...form, is_ansm_blocked: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl p-3.5"
                style={{ border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(248,247,244,0.5)' }}>
                <div className="space-y-0.5">
                  <Label htmlFor="discontinued-switch" className="cursor-pointer text-[13px] font-medium">Produit arrete</Label>
                  <p className="text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>Ne se fait plus / non existant</p>
                </div>
                <Switch
                  id="discontinued-switch"
                  checked={form.is_discontinued}
                  onCheckedChange={(checked) => setForm({ ...form, is_discontinued: checked })}
                />
              </div>
            </div>
            {/* Audit Log (edit mode only) */}
            {editing && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                <button
                  type="button"
                  onClick={() => setAuditOpen(!auditOpen)}
                  className="w-full flex items-center justify-between px-3.5 py-3 text-[13px] font-medium transition-colors hover:bg-[rgba(248,247,244,0.8)]"
                  style={{ background: 'rgba(248,247,244,0.5)', color: 'var(--ivory-text-heading)' }}
                >
                  <span className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5" style={{ color: 'var(--ivory-accent)' }} />
                    Historique des modifications
                    {auditLog && auditLog.length > 0 && (
                      <span className="text-[11px] font-normal px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(13,148,136,0.08)', color: 'var(--ivory-accent)' }}>
                        {auditLog.length}
                      </span>
                    )}
                  </span>
                  {auditOpen ? <ChevronUp className="h-4 w-4" style={{ color: 'var(--ivory-text-muted)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'var(--ivory-text-muted)' }} />}
                </button>
                {auditOpen && (
                  <div className="px-3.5 py-3 space-y-2.5 max-h-[200px] overflow-y-auto" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                    {auditLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-4 w-full rounded-md" />)}
                      </div>
                    ) : !auditLog || auditLog.length === 0 ? (
                      <p className="text-[12px] py-2 text-center" style={{ color: 'var(--ivory-text-muted)' }}>
                        Aucune modification enregistree
                      </p>
                    ) : (
                      auditLog.map((entry) => (
                        <div key={entry.id} className="flex items-start gap-2.5">
                          <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--ivory-accent)' }} />
                          <div className="min-w-0">
                            <p className="text-[12px]" style={{ color: 'var(--ivory-text-heading)' }}>
                              <span className="font-medium">{AUDIT_FIELD_LABELS[entry.field_changed] ?? entry.field_changed}</span>
                              {' : '}
                              <span style={{ color: '#DC4A4A' }}>{entry.old_value || '(vide)'}</span>
                              {' → '}
                              <span style={{ color: 'var(--ivory-teal)' }}>{entry.new_value || '(vide)'}</span>
                            </p>
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                              {new Date(entry.changed_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px] rounded-xl">
                Annuler
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={upsert.isPending}
                className="text-[13px] rounded-xl"
                style={{ background: 'var(--ivory-accent)', color: 'white' }}
              >
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
        description="Cette action est irreversible. Le produit et ses disponibilites associees seront supprimes."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
      />
    </div>
  )
}
