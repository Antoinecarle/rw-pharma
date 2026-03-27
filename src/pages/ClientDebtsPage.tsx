import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import AnimatedCounter from '@/components/ui/animated-counter'
import { Scale, Search, Users, Package, AlertTriangle, CheckCircle2, Clock, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { calculateMonthlyDebts } from '@/lib/debt-engine'

// ── Types ──────────────────────────────────────────────────────────

interface DebtRow {
  id: string
  customer_id: string
  product_id: string
  monthly_process_id: string | null
  month: string
  quantity_requested: number
  quantity_allocated: number
  quantity_owed: number
  resolved_quantity: number
  status: string
  created_at: string
  customer: { code: string; name: string } | null
  product: { cip13: string; name: string } | null
}

interface ProcessRow {
  id: string
  month: number
  year: number
  status: string
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'En attente', variant: 'destructive' },
  partially_resolved: { label: 'Partiel', variant: 'secondary' },
  resolved: { label: 'Resolue', variant: 'default' },
}

export default function ClientDebtsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedProcess, setSelectedProcess] = useState<string>('')

  // Fetch processes for the "calculate" action
  const { data: processes } = useQuery({
    queryKey: ['monthly-processes', 'debts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('id, month, year, status')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return data as ProcessRow[]
    },
  })

  // Fetch all debts
  const { data: debts, isLoading } = useQuery({
    queryKey: ['client-debts'],
    queryFn: async () => {
      const all: DebtRow[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('client_debts')
          .select('*, customer:customers(code, name), product:products(cip13, name)')
          .order('month', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...(data as unknown as DebtRow[]))
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
  })

  // Calculate debts mutation
  const calculateMutation = useMutation({
    mutationFn: async (processId: string) => {
      return calculateMonthlyDebts(processId)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['client-debts'] })
      toast.success(`${result.debtsCreated} dettes créées, ${result.debtsUpdated} mises à jour. Total dû: ${result.totalOwed.toLocaleString('fr-FR')}`)
    },
    onError: (err: Error) => toast.error(`Erreur: ${err.message}`),
  })

  // Filter
  const filtered = useMemo(() => {
    if (!debts) return []
    return debts.filter(d => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !d.customer?.code?.toLowerCase().includes(q) &&
          !d.customer?.name?.toLowerCase().includes(q) &&
          !d.product?.cip13?.includes(q) &&
          !d.product?.name?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [debts, statusFilter, search])

  // KPIs
  const kpis = useMemo(() => {
    const all = debts ?? []
    const pending = all.filter(d => d.status === 'pending')
    const partial = all.filter(d => d.status === 'partially_resolved')
    const resolved = all.filter(d => d.status === 'resolved')
    const totalOwed = pending.reduce((s, d) => s + d.quantity_owed - d.resolved_quantity, 0) +
      partial.reduce((s, d) => s + d.quantity_owed - d.resolved_quantity, 0)
    const uniqueCustomers = new Set(all.map(d => d.customer_id)).size
    const uniqueProducts = new Set(all.map(d => d.product_id)).size

    return {
      total: all.length,
      pending: pending.length,
      partial: partial.length,
      resolved: resolved.length,
      totalOwed,
      uniqueCustomers,
      uniqueProducts,
    }
  }, [debts])

  return (
    <div className="p-4 md:p-7 lg:p-8 space-y-6 max-w-[1400px] mx-auto ivory-page-glow overflow-x-hidden">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.06))' }}>
              <Scale className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Dettes Clients</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                Sous-allocations a compenser sur les mois suivants
              </p>
            </div>
          </div>

          {/* Calculate action */}
          <div className="flex items-center gap-2">
            <Select value={selectedProcess} onValueChange={setSelectedProcess}>
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <SelectValue placeholder="Choisir un processus" />
              </SelectTrigger>
              <SelectContent>
                {(processes ?? []).map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {MONTH_NAMES[p.month - 1]} {p.year} ({p.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!selectedProcess || calculateMutation.isPending}
              onClick={() => calculateMutation.mutate(selectedProcess)}
            >
              <TrendingDown className="h-3.5 w-3.5" />
              {calculateMutation.isPending ? 'Calcul...' : 'Calculer dettes'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total dettes', value: kpis.total, icon: Scale, color: 'text-slate-600', bg: 'bg-slate-50' },
          { label: 'En attente', value: kpis.pending, icon: Clock, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Partielles', value: kpis.partial, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Resolues', value: kpis.resolved, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Qte due', value: kpis.totalOwed, icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Clients', value: kpis.uniqueCustomers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Produits', value: kpis.uniqueProducts, icon: Package, color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-xl ${kpi.bg} flex items-center justify-center shrink-0`}>
                  <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                </div>
                <div>
                  <AnimatedCounter value={kpi.value} valueClassName={`text-lg font-bold ${kpi.color}`} />
                  <p className="text-[9px] text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par client, produit, CIP13..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { value: 'all', label: 'Toutes' },
            { value: 'pending', label: 'En attente' },
            { value: 'partially_resolved', label: 'Partielles' },
            { value: 'resolved', label: 'Resolues' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                statusFilter === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="ivory-card-empty">
          <CardContent className="p-8 text-center">
            <Scale className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Aucune dette client</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== 'all'
                ? 'Aucun résultat pour ces filtres.'
                : 'Lancez le calcul des dettes après une allocation pour détecter les sous-allocations.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Produit</TableHead>
                  <TableHead className="text-xs">CIP13</TableHead>
                  <TableHead className="text-xs">Mois</TableHead>
                  <TableHead className="text-xs text-right">Demande</TableHead>
                  <TableHead className="text-xs text-right">Alloue</TableHead>
                  <TableHead className="text-xs text-right">Du</TableHead>
                  <TableHead className="text-xs text-right">Compense</TableHead>
                  <TableHead className="text-xs text-right">Reste du</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(debt => {
                  const st = STATUS_MAP[debt.status] ?? STATUS_MAP.pending
                  const remainingOwed = debt.quantity_owed - debt.resolved_quantity
                  // Parse month string directly to avoid timezone issues (format: YYYY-MM-DD)
                  const monthParts = String(debt.month).split('-')
                  const monthIdx = parseInt(monthParts[1] ?? '1', 10) - 1
                  const monthYear = parseInt(monthParts[0] ?? '2026', 10)
                  const monthLabel = `${MONTH_NAMES[monthIdx] ?? '?'} ${monthYear}`

                  return (
                    <TableRow key={debt.id}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="font-mono font-medium text-sm">{debt.customer?.code ?? '?'}</span>
                          </TooltipTrigger>
                          <TooltipContent>{debt.customer?.name}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{debt.product?.name ?? '?'}</TableCell>
                      <TableCell className="font-mono text-xs">{debt.product?.cip13 ?? '?'}</TableCell>
                      <TableCell className="text-xs">{monthLabel}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{debt.quantity_requested.toLocaleString('fr-FR')}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{debt.quantity_allocated.toLocaleString('fr-FR')}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-bold text-red-600">{debt.quantity_owed.toLocaleString('fr-FR')}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-emerald-600">{debt.resolved_quantity.toLocaleString('fr-FR')}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-bold">
                        <span className={remainingOwed > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                          {remainingOwed.toLocaleString('fr-FR')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      )}
    </div>
  )
}
