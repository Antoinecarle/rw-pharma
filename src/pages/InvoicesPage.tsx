import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AnimatedCounter from '@/components/ui/animated-counter'
import {
  Receipt, Clock, CheckCircle2, AlertTriangle, Send,
  Ban, FileText, Plus, Loader2, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Invoice, InvoiceStatus } from '@/types/database'

// ── Constants ──────────────────────────────────────────────────────

const MONTH_NAMES = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string; icon: typeof Receipt }> = {
  draft: { label: 'Brouillon', color: 'var(--ivory-text-muted)', bg: 'rgba(0,0,0,0.05)', icon: FileText },
  sent: { label: 'Envoyee', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', icon: Send },
  paid: { label: 'Payee', color: '#16a34a', bg: 'rgba(22,163,74,0.08)', icon: CheckCircle2 },
  overdue: { label: 'En retard', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: AlertTriangle },
  cancelled: { label: 'Annulee', color: 'var(--ivory-text-muted)', bg: 'rgba(0,0,0,0.03)', icon: Ban },
}

const TYPE_LABELS: Record<string, string> = {
  wholesaler_commission: 'Commission grossiste',
  client_commission: 'Commission client',
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatEur(v: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface ProcessRow {
  id: string
  month: number
  year: number
  status: string
}

interface EntityRow {
  id: string
  name: string
  code: string | null
}

// ── Component ───────────────────────────────────────────────────────

export default function InvoicesPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [generateDialog, setGenerateDialog] = useState<'wholesaler' | 'client' | null>(null)
  const [generateMonth, setGenerateMonth] = useState<string>('')
  const [generateNotes, setGenerateNotes] = useState('')
  const [commissionRate, setCommissionRate] = useState('3')

  // ── Queries ──────────────────────────────────────────────────────

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  const { data: processes } = useQuery({
    queryKey: ['monthly-processes', 'invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('id, month, year, status')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProcessRow[]
    },
  })

  const { data: wholesalers } = useQuery({
    queryKey: ['wholesalers', 'invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wholesalers')
        .select('id, name, code')
        .order('name')
      if (error) throw error
      return (data ?? []) as EntityRow[]
    },
  })

  const { data: customers } = useQuery({
    queryKey: ['customers', 'invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, code')
        .order('name')
      if (error) throw error
      return (data ?? []) as EntityRow[]
    },
  })

  // ── Entity name lookup ───────────────────────────────────────────

  const entityMap = useMemo(() => {
    const map = new Map<string, string>()
    wholesalers?.forEach(w => map.set(w.id, w.code ? `${w.code} — ${w.name}` : w.name))
    customers?.forEach(c => map.set(c.id, c.code ? `${c.code} — ${c.name}` : c.name))
    return map
  }, [wholesalers, customers])

  // ── Filtering ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!invoices) return []
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (typeFilter !== 'all' && inv.type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const entityName = entityMap.get(inv.entity_id) ?? ''
        if (
          !inv.invoice_number.toLowerCase().includes(q) &&
          !entityName.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [invoices, statusFilter, typeFilter, search, entityMap])

  // ── KPIs ─────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    if (!invoices) return { total: 0, paid: 0, pending: 0, overdue: 0 }
    const total = invoices.reduce((s, i) => s + (i.amount_ttc ?? i.amount), 0)
    const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount_ttc ?? i.amount), 0)
    const pending = invoices.filter(i => i.status === 'draft' || i.status === 'sent').reduce((s, i) => s + (i.amount_ttc ?? i.amount), 0)
    const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.amount_ttc ?? i.amount), 0)
    return { total, paid, pending, overdue }
  }, [invoices])

  // ── Mutations ────────────────────────────────────────────────────

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceStatus }) => {
      const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
      if (status === 'sent') updates.sent_at = new Date().toISOString()
      if (status === 'paid') updates.paid_at = new Date().toISOString()
      const { error } = await supabase.from('invoices').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Statut mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })

  const generateWholesalerInvoices = useMutation({
    mutationFn: async ({ processId, month, year, notes }: { processId: string; month: number; year: number; notes: string }) => {
      if (!wholesalers) throw new Error('Wholesalers not loaded')
      const monthDate = `${year}-${String(month).padStart(2, '0')}-01`
      const rows = wholesalers.map((w, idx) => ({
        invoice_number: `FAC-G-${year}${String(month).padStart(2, '0')}-${String(idx + 1).padStart(3, '0')}`,
        type: 'wholesaler_commission' as const,
        entity_type: 'wholesaler' as const,
        entity_id: w.id,
        process_id: processId,
        month: monthDate,
        amount: 6000,
        tax_rate: 20,
        amount_ttc: 7200,
        status: 'draft' as const,
        due_date: new Date(year, month, 15).toISOString().split('T')[0],
        notes: notes || null,
        metadata: {},
      }))
      const { error } = await supabase.from('invoices').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(`${count} factures grossistes générées`)
      setGenerateDialog(null)
      setGenerateNotes('')
    },
    onError: (e) => toast.error(`Erreur: ${e instanceof Error ? e.message : 'Erreur inconnue'}`),
  })

  const generateClientInvoices = useMutation({
    mutationFn: async ({ processId, month, year, notes, rate }: { processId: string; month: number; year: number; notes: string; rate: number }) => {
      if (!customers) throw new Error('Customers not loaded')
      // Fetch allocations for this process to compute CA per client
      const { data: allocs, error: allocErr } = await supabase
        .from('allocations')
        .select('customer_id, allocated_quantity, prix_applique')
        .eq('monthly_process_id', processId)
      if (allocErr) throw allocErr

      const caByCustomer = new Map<string, number>()
      for (const a of (allocs ?? [])) {
        const ca = (a.allocated_quantity ?? 0) * (a.prix_applique ?? 0)
        caByCustomer.set(a.customer_id, (caByCustomer.get(a.customer_id) ?? 0) + ca)
      }

      const monthDate = `${year}-${String(month).padStart(2, '0')}-01`
      const rows: Array<Record<string, unknown>> = []
      let idx = 0
      for (const c of customers) {
        const ca = caByCustomer.get(c.id) ?? 0
        if (ca <= 0) continue
        idx++
        const amount = Math.round(ca * (rate / 100) * 100) / 100
        const amountTtc = Math.round(amount * 1.2 * 100) / 100
        rows.push({
          invoice_number: `FAC-C-${year}${String(month).padStart(2, '0')}-${String(idx).padStart(3, '0')}`,
          type: 'client_commission',
          entity_type: 'customer',
          entity_id: c.id,
          process_id: processId,
          month: monthDate,
          amount,
          tax_rate: 20,
          amount_ttc: amountTtc,
          status: 'draft',
          due_date: new Date(year, month, 15).toISOString().split('T')[0],
          notes: notes || null,
          metadata: { commission_rate: rate, ca_base: ca },
        })
      }

      if (rows.length === 0) throw new Error('Aucune allocation trouvée pour ce processus')
      const { error } = await supabase.from('invoices').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(`${count} factures clients générées`)
      setGenerateDialog(null)
      setGenerateNotes('')
    },
    onError: (e) => toast.error(`Erreur: ${e instanceof Error ? e.message : 'Erreur inconnue'}`),
  })

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="ivory-display text-2xl md:text-3xl">Facturation</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
              Gestion des factures commissions grossistes & clients
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              onClick={() => { setGenerateDialog('wholesaler'); setGenerateMonth('') }}
            >
              <Plus className="h-3.5 w-3.5" />
              Factures grossistes
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              style={{ background: 'var(--ivory-accent)', color: 'white' }}
              onClick={() => { setGenerateDialog('client'); setGenerateMonth(''); setCommissionRate('3') }}
            >
              <Plus className="h-3.5 w-3.5" />
              Factures clients
            </Button>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total facture', value: kpis.total, icon: Receipt, color: 'var(--ivory-accent)' },
          { label: 'Total paye', value: kpis.paid, icon: CheckCircle2, color: '#16a34a' },
          { label: 'En attente', value: kpis.pending, icon: Clock, color: '#3b82f6' },
          { label: 'En retard', value: kpis.overdue, icon: AlertTriangle, color: '#ef4444' },
        ].map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                  <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
                </div>
                {isLoading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-xl font-bold tabular-nums">
                    <AnimatedCounter value={Math.round(kpi.value)} /> €
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher par numéro ou entité..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-xl text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9 rounded-xl text-xs">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillon</SelectItem>
              <SelectItem value="sent">Envoyee</SelectItem>
              <SelectItem value="paid">Payee</SelectItem>
              <SelectItem value="overdue">En retard</SelectItem>
              <SelectItem value="cancelled">Annulee</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-9 rounded-xl text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="wholesaler_commission">Commission grossiste</SelectItem>
              <SelectItem value="client_commission">Commission client</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Receipt className="h-10 w-10 mb-3" style={{ color: 'var(--ivory-text-muted)', opacity: 0.4 }} />
                <p className="text-sm font-medium" style={{ color: 'var(--ivory-text-heading)' }}>Aucune facture</p>
                <p className="text-xs mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
                  Generez des factures via les boutons ci-dessus
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Numéro</TableHead>
                      <TableHead className="text-[11px]">Type</TableHead>
                      <TableHead className="text-[11px]">Entité</TableHead>
                      <TableHead className="text-[11px]">Mois</TableHead>
                      <TableHead className="text-[11px] text-right">HT</TableHead>
                      <TableHead className="text-[11px] text-right">TTC</TableHead>
                      <TableHead className="text-[11px]">Échéance</TableHead>
                      <TableHead className="text-[11px]">Statut</TableHead>
                      <TableHead className="text-[11px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => {
                      const cfg = STATUS_CONFIG[inv.status]
                      const StatusIcon = cfg.icon
                      return (
                        <TableRow key={inv.id} className="group">
                          <TableCell className="text-xs font-mono font-medium">{inv.invoice_number}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] rounded-lg">
                              {TYPE_LABELS[inv.type] ?? inv.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{entityMap.get(inv.entity_id) ?? inv.entity_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-xs">
                            {(() => {
                              const d = new Date(inv.month)
                              return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
                            })()}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-medium">{formatEur(inv.amount)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-medium">{inv.amount_ttc ? formatEur(inv.amount_ttc) : '—'}</TableCell>
                          <TableCell className="text-xs">{formatDate(inv.due_date)}</TableCell>
                          <TableCell>
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ background: cfg.bg, color: cfg.color, textDecoration: inv.status === 'cancelled' ? 'line-through' : undefined }}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {inv.status === 'draft' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 rounded-lg"
                                      onClick={() => updateStatus.mutate({ id: inv.id, status: 'sent' })}
                                    >
                                      <Send className="h-3.5 w-3.5 text-blue-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Marquer envoyee</TooltipContent>
                                </Tooltip>
                              )}
                              {(inv.status === 'sent' || inv.status === 'overdue') && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 rounded-lg"
                                      onClick={() => updateStatus.mutate({ id: inv.id, status: 'paid' })}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Marquer payee</TooltipContent>
                                </Tooltip>
                              )}
                              {inv.status !== 'cancelled' && inv.status !== 'paid' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 rounded-lg"
                                      onClick={() => updateStatus.mutate({ id: inv.id, status: 'cancelled' })}
                                    >
                                      <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Annuler</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        {filtered.length > 0 && (
          <p className="text-[11px] mt-2 text-right" style={{ color: 'var(--ivory-text-muted)' }}>
            {filtered.length} facture{filtered.length > 1 ? 's' : ''} affichee{filtered.length > 1 ? 's' : ''}
          </p>
        )}
      </motion.div>

      {/* Generate Dialog */}
      <Dialog open={generateDialog !== null} onOpenChange={(open) => { if (!open) setGenerateDialog(null) }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {generateDialog === 'wholesaler' ? 'Générer les factures grossistes' : 'Générer les factures clients'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Processus mensuel</Label>
              <Select value={generateMonth} onValueChange={setGenerateMonth}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Sélectionnez un mois" />
                </SelectTrigger>
                <SelectContent>
                  {processes?.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {MONTH_NAMES[p.month - 1]} {p.year} {p.status === 'completed' ? '(clôturé)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {generateDialog === 'wholesaler' && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(13,148,136,0.04)', border: '1px solid rgba(13,148,136,0.1)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--ivory-accent)' }}>Commission fixe : 6 000 € HT / grossiste</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                  {wholesalers?.length ?? 0} grossistes = {formatEur((wholesalers?.length ?? 0) * 6000)} HT total
                </p>
              </div>
            )}
            {generateDialog === 'client' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Taux de commission (%)</Label>
                <Input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="h-9 rounded-xl text-xs"
                />
                <p className="text-[10px]" style={{ color: 'var(--ivory-text-muted)' }}>
                  Pourcentage du CA alloué par client
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optionnel)</Label>
              <Textarea
                value={generateNotes}
                onChange={(e) => setGenerateNotes(e.target.value)}
                placeholder="Notes sur cette série de factures..."
                className="rounded-xl text-xs min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setGenerateDialog(null)}>
              Annuler
            </Button>
            <Button
              size="sm"
              className="rounded-xl text-xs gap-1.5"
              style={{ background: 'var(--ivory-accent)', color: 'white' }}
              disabled={!generateMonth || generateWholesalerInvoices.isPending || generateClientInvoices.isPending}
              onClick={() => {
                const proc = processes?.find(p => p.id === generateMonth)
                if (!proc) return
                if (generateDialog === 'wholesaler') {
                  generateWholesalerInvoices.mutate({ processId: proc.id, month: proc.month, year: proc.year, notes: generateNotes })
                } else {
                  generateClientInvoices.mutate({ processId: proc.id, month: proc.month, year: proc.year, notes: generateNotes, rate: parseFloat(commissionRate) || 3 })
                }
              }}
            >
              {(generateWholesalerInvoices.isPending || generateClientInvoices.isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
