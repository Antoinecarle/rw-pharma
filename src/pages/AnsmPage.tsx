import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { runAnsmSyncFromFile, ANSM_DOWNLOAD_URL, ANSM_PAGE_URL, type SyncResult } from '@/lib/ansm-sync'
import type { AnsmSyncLog, AnsmBlockedProduct } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { motion } from 'framer-motion'
import {
  Shield,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Search,
  AlertTriangle,
  ArrowUpDown,
  Ban,
  ExternalLink,
  Download,
  FileUp,
} from 'lucide-react'
import { toast } from 'sonner'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
          <CheckCircle2 className="h-3 w-3" /> Succes
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#DC2626' }}>
          <XCircle className="h-3 w-3" /> Echec
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ background: 'rgba(245,158,11,0.1)', color: '#D97706' }}>
          <Loader2 className="h-3 w-3 animate-spin" /> En cours
        </span>
      )
    default:
      return null
  }
}

export default function AnsmPage() {
  const queryClient = useQueryClient()
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const PAGE_SIZE = 50

  // Fetch sync logs
  const { data: syncLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ['ansm-sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ansm_sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as AnsmSyncLog[]
    },
  })

  // Fetch blocked products count
  const { data: blockedStats } = useQuery({
    queryKey: ['ansm-blocked-stats'],
    queryFn: async () => {
      const { count: ansmCount } = await supabase
        .from('ansm_blocked_products')
        .select('*', { count: 'exact', head: true })
      const { count: productBlockedCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_ansm_blocked', true)
      return {
        ansmListCount: ansmCount ?? 0,
        productsBlockedCount: productBlockedCount ?? 0,
      }
    },
  })

  // Fetch blocked products list (paginated, searchable)
  // Falls back to products table if ansm_blocked_products is empty
  const { data: blockedProducts, isLoading: loadingProducts } = useQuery({
    queryKey: ['ansm-blocked-products', search, page],
    queryFn: async () => {
      // First try ansm_blocked_products table
      const { count: ansmCount } = await supabase
        .from('ansm_blocked_products')
        .select('*', { count: 'exact', head: true })

      if (ansmCount && ansmCount > 0) {
        let query = supabase
          .from('ansm_blocked_products')
          .select('*', { count: 'exact' })
          .order('product_name', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (search) {
          query = query.or(`cip13.ilike.%${search}%,product_name.ilike.%${search}%`)
        }

        const { data, count, error } = await query
        if (error) throw error
        return { data: data as AnsmBlockedProduct[], count: count ?? 0 }
      }

      // Fallback: show blocked products from the products table
      let query = supabase
        .from('products')
        .select('id, cip13, name, updated_at', { count: 'exact' })
        .eq('is_ansm_blocked', true)
        .order('name', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (search) {
        query = query.or(`cip13.ilike.%${search}%,name.ilike.%${search}%`)
      }

      const { data, count, error } = await query
      if (error) throw error
      return {
        data: (data ?? []).map(p => ({
          id: p.id,
          cip13: p.cip13,
          product_name: p.name,
          blocked_date: p.updated_at,
        })) as AnsmBlockedProduct[],
        count: count ?? 0,
      }
    },
  })

  // Sync mutation — from file
  const syncMutation = useMutation({
    mutationFn: (file: File) => runAnsmSyncFromFile(file),
    onSuccess: (result) => {
      setSyncResult(result)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['ansm-sync-logs'] })
      queryClient.invalidateQueries({ queryKey: ['ansm-blocked-products'] })
      queryClient.invalidateQueries({ queryKey: ['ansm-blocked-stats'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      if (result.success) {
        toast.success('Synchronisation ANSM terminée')
      } else {
        toast.error(`Échec: ${result.message}`)
      }
    },
    onError: (err) => {
      setSyncResult({
        success: false,
        logId: '',
        message: err instanceof Error ? err.message : 'Erreur inconnue',
        stats: { totalAnsm: 0, newlyBlocked: 0, unblocked: 0 },
      })
      toast.error('Erreur lors de la synchronisation ANSM')
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setSyncResult(null)
    setSyncModalOpen(true)
  }

  const handleStartSync = () => {
    if (!selectedFile) return
    syncMutation.mutate(selectedFile)
  }

  const lastSync = syncLogs?.[0]
  const totalPages = blockedProducts ? Math.ceil(blockedProducts.count / PAGE_SIZE) : 0

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-7 max-w-[1400px] mx-auto ivory-page-glow">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.CSV"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="ivory-display text-2xl md:text-3xl">Liste ANSM</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
              Produits interdits à l'export — Ruptures de stock ANSM
            </p>
          </div>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={syncMutation.isPending}
            className="gap-2 text-[13px] h-9 rounded-xl"
            style={{ background: 'var(--ivory-accent)' }}
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Importer fichier ANSM
          </Button>
        </div>
      </motion.div>

      {/* ANSM download banner */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="ivory-glass overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(59,130,246,0.01))', borderColor: 'rgba(59,130,246,0.12)' }}>
          <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))' }}>
              <Download className="h-4.5 w-4.5" style={{ color: '#3B82F6' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px]" style={{ color: 'var(--ivory-text-heading)' }}>
                Télécharger la liste ANSM
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                Téléchargez le fichier CSV depuis le site officiel ANSM, puis importez-le avec le bouton ci-dessus.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <a href={ANSM_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-[12px] h-8 rounded-lg"
                  style={{ borderColor: 'rgba(59,130,246,0.2)', color: '#3B82F6' }}>
                  <Download className="h-3 w-3" />
                  Télécharger CSV
                </Button>
              </a>
              <a href={ANSM_PAGE_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-[12px] h-8 rounded-lg"
                  style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
                  <ExternalLink className="h-3 w-3" />
                  Page ANSM
                </Button>
              </a>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <div className="ivory-glass p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
                Liste ANSM
              </span>
              <div className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(220,74,74,0.10), rgba(220,74,74,0.03))' }}>
                <Shield className="h-4 w-4" style={{ color: '#DC4A4A' }} />
              </div>
            </div>
            <p className="text-2xl ivory-heading tabular-nums">{blockedStats?.ansmListCount ?? '—'}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>produits dans la liste ANSM</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
          <div className="ivory-glass p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
                Produits bloques
              </span>
              <div className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.03))' }}>
                <Ban className="h-4 w-4" style={{ color: '#F59E0B' }} />
              </div>
            </div>
            <p className="text-2xl ivory-heading tabular-nums">{blockedStats?.productsBlockedCount ?? '—'}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>dans votre catalogue</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <div className="ivory-glass p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
                Dernière sync
              </span>
              <div className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.10), rgba(13,148,136,0.03))' }}>
                <Clock className="h-4 w-4" style={{ color: '#0D9488' }} />
              </div>
            </div>
            {lastSync ? (
              <>
                <div className="flex items-center gap-2">
                  <StatusBadge status={lastSync.status} />
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ivory-text-muted)' }}>
                  {formatDate(lastSync.started_at)}
                </p>
              </>
            ) : (
              <p className="text-[13px]" style={{ color: 'var(--ivory-text-muted)' }}>Aucune synchronisation</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Blocked products table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
        <div className="ivory-glass overflow-hidden">
          <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#DC4A4A' }} />
            <h3 className="ivory-heading text-[14px] flex-1">Produits bloques ANSM</h3>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
              <Input
                placeholder="Rechercher CIP13 ou nom..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                className="pl-9 h-8 text-[12px] rounded-lg"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
              />
            </div>
          </div>

          {loadingProducts ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : blockedProducts && blockedProducts.data.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider w-[140px]">CIP13</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Nom du produit</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider w-[160px]">
                      <div className="flex items-center gap-1">
                        Bloque depuis
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockedProducts.data.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-[12px] font-medium">{p.cip13}</TableCell>
                      <TableCell className="text-[12px]">{p.product_name || '—'}</TableCell>
                      <TableCell className="text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>
                        {formatDate(p.blocked_date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>
                    {blockedProducts.count} produits — Page {page + 1}/{totalPages}
                  </p>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                      className="h-7 text-[11px] rounded-lg">Précédent</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                      className="h-7 text-[11px] rounded-lg">Suivant</Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.03)' }}>
                <Shield className="h-5 w-5" style={{ color: 'var(--ivory-text-muted)' }} />
              </div>
              <p className="text-[13px]" style={{ color: 'var(--ivory-text-muted)' }}>
                {search ? 'Aucun résultat pour cette recherche' : 'Aucun produit bloqué. Importez un fichier ANSM.'}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Sync history */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}>
        <div className="ivory-glass overflow-hidden">
          <div className="p-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <h3 className="ivory-heading text-[14px]">Historique des synchronisations</h3>
          </div>

          {loadingLogs ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : syncLogs && syncLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider w-[160px]">Date</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider w-[100px]">Statut</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider w-[80px]">Total</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider w-[90px]">Bloques</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider w-[90px]">Debloques</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>
                      {formatDate(log.started_at)}
                    </TableCell>
                    <TableCell><StatusBadge status={log.status} /></TableCell>
                    <TableCell className="text-[12px] font-mono tabular-nums">{log.total_ansm_count}</TableCell>
                    <TableCell className="text-[12px] font-mono tabular-nums" style={{ color: '#DC2626' }}>
                      {log.products_blocked > 0 ? `+${log.products_blocked}` : '0'}
                    </TableCell>
                    <TableCell className="text-[12px] font-mono tabular-nums" style={{ color: '#059669' }}>
                      {log.products_unblocked > 0 ? `-${log.products_unblocked}` : '0'}
                    </TableCell>
                    <TableCell className="text-[11px] max-w-[300px] truncate" style={{ color: 'var(--ivory-text-muted)' }}>
                      {log.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Clock className="h-5 w-5" style={{ color: 'var(--ivory-text-muted)' }} />
              <p className="text-[13px]" style={{ color: 'var(--ivory-text-muted)' }}>Aucune synchronisation effectuee</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Sync Modal */}
      <Dialog open={syncModalOpen} onOpenChange={(open) => {
        if (!syncMutation.isPending) {
          setSyncModalOpen(open)
          if (!open) { setSelectedFile(null); setSyncResult(null) }
        }
      }}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="ivory-heading text-[16px]">Import ANSM</DialogTitle>
            <DialogDescription className="text-[12px]">
              Mise à jour de la liste des produits interdits à l'export.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {/* File selected, not started yet */}
            {selectedFile && !syncMutation.isPending && !syncResult && (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(59,130,246,0.03))' }}>
                  <FileUp className="h-7 w-7" style={{ color: '#3B82F6' }} />
                </div>
                <div className="text-center">
                  <p className="ivory-heading text-[14px]">Fichier sélectionné</p>
                  <p className="text-[12px] mt-1 font-mono px-3 py-1 rounded-lg inline-block"
                    style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--ivory-text-muted)' }}>
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] mt-2" style={{ color: 'var(--ivory-text-muted)' }}>
                    {(selectedFile.size / 1024).toFixed(0)} Ko
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setSyncModalOpen(false); setSelectedFile(null) }}
                    className="rounded-xl text-[13px]"
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleStartSync}
                    className="gap-2 rounded-xl text-[13px]"
                    style={{ background: 'var(--ivory-accent)' }}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Lancer l'import
                  </Button>
                </div>
              </div>
            )}

            {/* Running */}
            {syncMutation.isPending && !syncResult && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.10), rgba(13,148,136,0.03))' }}>
                  <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--ivory-accent)' }} />
                </div>
                <div className="text-center">
                  <p className="ivory-heading text-[14px]">Import en cours...</p>
                  <p className="text-[12px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
                    Analyse du fichier et mise à jour des produits
                  </p>
                </div>
              </div>
            )}

            {/* Result */}
            {syncResult && (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                  style={{
                    background: syncResult.success
                      ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))'
                      : 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))',
                  }}>
                  {syncResult.success ? (
                    <CheckCircle2 className="h-7 w-7" style={{ color: '#059669' }} />
                  ) : (
                    <XCircle className="h-7 w-7" style={{ color: '#DC2626' }} />
                  )}
                </div>

                <div className="text-center">
                  <p className="ivory-heading text-[14px]">
                    {syncResult.success ? 'Import réussi' : 'Échec de l\'import'}
                  </p>
                  <p className="text-[12px] mt-1 max-w-sm" style={{ color: 'var(--ivory-text-muted)' }}>
                    {syncResult.message}
                  </p>
                </div>

                {syncResult.success && (
                  <div className="grid grid-cols-3 gap-3 w-full mt-2">
                    <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                      <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--ivory-text-heading)' }}>
                        {syncResult.stats.totalAnsm}
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--ivory-text-muted)' }}>
                        Total ANSM
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(220,74,74,0.04)' }}>
                      <p className="text-lg font-bold tabular-nums" style={{ color: '#DC4A4A' }}>
                        +{syncResult.stats.newlyBlocked}
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--ivory-text-muted)' }}>
                        Bloques
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.04)' }}>
                      <p className="text-lg font-bold tabular-nums" style={{ color: '#059669' }}>
                        -{syncResult.stats.unblocked}
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--ivory-text-muted)' }}>
                        Debloques
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => { setSyncModalOpen(false); setSelectedFile(null); setSyncResult(null) }}
                  className="mt-2 rounded-xl text-[13px]"
                  variant={syncResult.success ? 'default' : 'outline'}
                  style={syncResult.success ? { background: 'var(--ivory-accent)' } : {}}
                >
                  Fermer
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
