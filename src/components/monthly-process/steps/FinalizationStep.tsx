import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import AnimatedCounter from '@/components/ui/animated-counter'
import GaugeChart from '@/components/ui/gauge-chart'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import HorizontalBarChart from '@/components/ui/horizontal-bar'
import { Flag, CheckCircle, Download, Package, BarChart3, Users, Truck, ArrowLeft, FileSpreadsheet, PartyPopper, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { createNotification } from '@/lib/notifications'
import { useState, useEffect, useCallback, useMemo } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

type ExportMode = 'global_csv' | 'by_wholesaler' | 'by_customer' | 'global_excel' | 'delivery_notes'

interface FinalizationStepProps {
  process: MonthlyProcess
}

interface AllocationRow {
  id: string
  order_id: string
  requested_quantity: number
  allocated_quantity: number
  prix_applique: number | null
  status: string
  metadata: Record<string, unknown> | null
  customer: { code: string; name: string; country: string | null } | null
  product: { cip13: string; name: string } | null
  wholesaler: { code: string; name: string } | null
}

async function fetchAllocations(processId: string): Promise<AllocationRow[]> {
  const all: AllocationRow[] = []
  let from = 0
  const pageSize = 500
  while (true) {
    const { data, error } = await supabase
      .from('allocations')
      .select('id, order_id, requested_quantity, allocated_quantity, prix_applique, status, metadata, customer:customers(code, name, country), product:products(cip13, name), wholesaler:wholesalers(code, name)')
      .eq('monthly_process_id', processId)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as unknown as AllocationRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function generateCSV(rows: AllocationRow[], includeHeaders = true): string {
  const headers = ['Client', 'CIP13', 'Produit', 'Grossiste', 'Demande', 'Alloue', 'Statut']
  const csvRows = rows.map(a => [
    a.customer?.code ?? '',
    a.product?.cip13 ?? '',
    `"${(a.product?.name ?? '').replace(/"/g, '""')}"`,
    a.wholesaler?.code ?? '',
    a.requested_quantity,
    a.allocated_quantity,
    a.status,
  ].join(';'))
  if (includeHeaders) return [headers.join(';'), ...csvRows].join('\n')
  return csvRows.join('\n')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function generateDeliveryNotes(allocs: AllocationRow[], filePrefix: string) {
  // Group by customer
  const byCustomer = new Map<string, { code: string; name: string; country: string | null; rows: AllocationRow[] }>()
  for (const a of allocs) {
    const code = a.customer?.code ?? 'INCONNU'
    const group = byCustomer.get(code) ?? { code, name: a.customer?.name ?? code, country: a.customer?.country ?? null, rows: [] }
    group.rows.push(a)
    byCustomer.set(code, group)
  }

  const wb = XLSX.utils.book_new()

  for (const [code, group] of byCustomer) {
    // Build delivery note with lot traceability
    const headerRow = ['Produit', 'CIP13', 'Lot', 'Expiration', 'Grossiste', 'Qte', 'Prix unitaire', 'Total']
    const dataRows: (string | number)[][] = []
    let grandTotal = 0
    let grandQty = 0

    // Group by product within customer
    const byProduct = new Map<string, AllocationRow[]>()
    for (const a of group.rows) {
      const cip = a.product?.cip13 ?? '?'
      const list = byProduct.get(cip) ?? []
      list.push(a)
      byProduct.set(cip, list)
    }

    for (const [, productAllocs] of byProduct) {
      for (const a of productAllocs) {
        const meta = (a.metadata ?? {}) as Record<string, unknown>
        const lotNumber = (meta.lot_number as string) ?? '-'
        const expiryDate = (meta.expiry_date as string) ?? '-'
        const expFormatted = expiryDate !== '-' ? new Date(expiryDate).toLocaleDateString('fr-FR', { month: '2-digit', year: 'numeric' }) : '-'
        const price = a.prix_applique ?? 0
        const lineTotal = a.allocated_quantity * price
        grandTotal += lineTotal
        grandQty += a.allocated_quantity
        dataRows.push([
          a.product?.name ?? '',
          a.product?.cip13 ?? '',
          lotNumber,
          expFormatted,
          a.wholesaler?.code ?? '',
          a.allocated_quantity,
          price,
          lineTotal,
        ])
      }
    }

    // Add total row
    dataRows.push(['TOTAL', '', '', '', '', grandQty, '', grandTotal])

    const wsData = [headerRow, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [
      { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
    ]

    const sheetLabel = `${code}${group.country ? ` (${group.country})` : ''}`
    XLSX.utils.book_append_sheet(wb, ws, sheetLabel.slice(0, 31))
  }

  XLSX.writeFile(wb, `${filePrefix}-bons-de-livraison.xlsx`)
  return byCustomer.size
}

function generateExcelWorkbook(rows: AllocationRow[], sheetName: string): XLSX.WorkBook {
  const wsData = [
    ['Client', 'CIP13', 'Produit', 'Grossiste', 'Demande', 'Alloue', 'Couverture %', 'Statut'],
    ...rows.map(a => [
      a.customer?.code ?? '',
      a.product?.cip13 ?? '',
      a.product?.name ?? '',
      a.wholesaler?.code ?? '',
      a.requested_quantity,
      a.allocated_quantity,
      a.requested_quantity > 0 ? Math.round((a.allocated_quantity / a.requested_quantity) * 100) : 0,
      a.status,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [
    { wch: 10 }, { wch: 15 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return wb
}

const cardVariants: import('framer-motion').Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.1, type: 'spring' as const, stiffness: 300, damping: 25 },
  }),
}

export default function FinalizationStep({ process }: FinalizationStepProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exportMode, setExportMode] = useState<ExportMode>('delivery_notes')
  const [exporting, setExporting] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  const { data: allocations } = useQuery({
    queryKey: ['monthly-process', process.id, 'final-allocations'],
    queryFn: () => fetchAllocations(process.id),
  })

  // Derive stats from the allocations data (avoids separate query with auth race conditions)
  const stats = useMemo(() => {
    if (!allocations || allocations.length === 0) return undefined
    // Deduplicate requested_quantity per order (one order can have multiple allocation rows)
    const reqByOrder = new Map<string, number>()
    for (const a of allocations) {
      const oid = a.order_id ?? ''
      if (oid && !reqByOrder.has(oid)) {
        reqByOrder.set(oid, a.requested_quantity ?? 0)
      }
    }
    const totalRequested = reqByOrder.size > 0
      ? [...reqByOrder.values()].reduce((s, v) => s + v, 0)
      : allocations.reduce((s, a) => s + (a.requested_quantity ?? 0), 0)
    const totalAllocated = allocations.reduce((s, a) => s + (a.allocated_quantity ?? 0), 0)
    const uniqueCustomers = new Set(allocations.map(a => a.customer?.code).filter(Boolean)).size
    const uniqueWholesalers = new Set(allocations.map(a => a.wholesaler?.code).filter(Boolean)).size

    return {
      orders: reqByOrder.size,
      allocations: allocations.length,
      totalRequested,
      totalAllocated,
      fulfillmentRate: totalRequested > 0 ? ((totalAllocated / totalRequested) * 100) : 0,
      uniqueCustomers,
      uniqueWholesalers,
    }
  }, [allocations])

  const fireConfetti = useCallback(async () => {
    try {
      const confetti = (await import('canvas-confetti')).default
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'],
      })
    } catch {
      // canvas-confetti not available, skip
    }
  }, [])

  const finalizeMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('monthly_processes')
        .update({ status: 'completed', current_step: 12, phase: 'cloture', date_cloture: new Date().toISOString() })
        .eq('id', process.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes', process.id] })
      toast.success('Processus termine avec succes !')
      setShowConfetti(true)
      fireConfetti()
      createNotification({
        type: 'info',
        title: 'Processus finalise',
        message: `Le processus ${MONTH_NAMES[process.month - 1]} ${process.year} a ete cloture avec succes.`,
      })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Summaries by wholesaler (deduplicate requested per order_id)
  const wholesalerSummary = useMemo(() => {
    const map = new Map<string, { code: string; name: string; totalQty: number; totalReq: number; count: number; seenOrders: Set<string> }>()
    for (const a of allocations ?? []) {
      const code = a.wholesaler?.code ?? 'INCONNU'
      const existing = map.get(code)
      if (existing) {
        existing.totalQty += a.allocated_quantity
        if (a.order_id && !existing.seenOrders.has(a.order_id)) {
          existing.totalReq += a.requested_quantity
          existing.seenOrders.add(a.order_id)
        }
        existing.count++
      } else {
        map.set(code, { code, name: a.wholesaler?.name ?? code, totalQty: a.allocated_quantity, totalReq: a.requested_quantity, count: 1, seenOrders: new Set(a.order_id ? [a.order_id] : []) })
      }
    }
    return [...map.values()].map(({ seenOrders: _, ...rest }) => rest).sort((a, b) => b.totalQty - a.totalQty)
  }, [allocations])

  // Summaries by customer (deduplicate requested per order_id)
  const customerSummary = useMemo(() => {
    const map = new Map<string, { code: string; name: string; totalQty: number; totalReq: number; count: number; seenOrders: Set<string> }>()
    for (const a of allocations ?? []) {
      const code = a.customer?.code ?? 'INCONNU'
      const existing = map.get(code)
      if (existing) {
        existing.totalQty += a.allocated_quantity
        if (a.order_id && !existing.seenOrders.has(a.order_id)) {
          existing.totalReq += a.requested_quantity
          existing.seenOrders.add(a.order_id)
        }
        existing.count++
      } else {
        map.set(code, { code, name: a.customer?.name ?? code, totalQty: a.allocated_quantity, totalReq: a.requested_quantity, count: 1, seenOrders: new Set(a.order_id ? [a.order_id] : []) })
      }
    }
    return [...map.values()].map(({ seenOrders: _, ...rest }) => rest).sort((a, b) => b.totalQty - a.totalQty)
  }, [allocations])

  const isCompleted = process.status === 'completed'
  const monthName = MONTH_NAMES[process.month - 1] ?? ''
  const filePrefix = `allocation-${monthName.toLowerCase()}-${process.year}`
  const fulfillmentRate = stats?.fulfillmentRate ?? 0

  // Fire confetti on mount if already completed
  useEffect(() => {
    if (isCompleted && !showConfetti) {
      setShowConfetti(true)
      fireConfetti()
    }
  }, [isCompleted, showConfetti, fireConfetti])

  const handleExport = async () => {
    setExporting(true)
    try {
      const allocs = await fetchAllocations(process.id)
      if (allocs.length === 0) { toast.error('Aucune donnee a exporter'); setExporting(false); return }

      switch (exportMode) {
        case 'global_csv': {
          const csv = generateCSV(allocs)
          downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `${filePrefix}.csv`)
          toast.success('CSV global telecharge')
          break
        }

        case 'global_excel': {
          const wb = generateExcelWorkbook(allocs, 'Allocations')
          XLSX.writeFile(wb, `${filePrefix}.xlsx`)
          toast.success('Excel global telecharge')
          break
        }

        case 'by_wholesaler': {
          const groups = new Map<string, { code: string; rows: AllocationRow[] }>()
          for (const a of allocs) {
            const code = a.wholesaler?.code ?? 'INCONNU'
            const group = groups.get(code) ?? { code, rows: [] }
            group.rows.push(a)
            groups.set(code, group)
          }

          if (groups.size === 1) {
            const [code, group] = [...groups.entries()][0]
            const wb = generateExcelWorkbook(group.rows, code)
            XLSX.writeFile(wb, `${filePrefix}-${code}.xlsx`)
          } else {
            const wb = XLSX.utils.book_new()
            for (const [code, group] of groups) {
              const wsData = [
                ['Client', 'CIP13', 'Produit', 'Demande', 'Alloue', 'Couverture %', 'Statut'],
                ...group.rows.map(a => [
                  a.customer?.code ?? '',
                  a.product?.cip13 ?? '',
                  a.product?.name ?? '',
                  a.requested_quantity,
                  a.allocated_quantity,
                  a.requested_quantity > 0 ? Math.round((a.allocated_quantity / a.requested_quantity) * 100) : 0,
                  a.status,
                ]),
              ]
              const ws = XLSX.utils.aoa_to_sheet(wsData)
              ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }]
              XLSX.utils.book_append_sheet(wb, ws, code.slice(0, 31))
            }
            XLSX.writeFile(wb, `${filePrefix}-par-grossiste.xlsx`)
          }
          toast.success(`Export par grossiste telecharge (${groups.size} grossistes)`)
          break
        }

        case 'by_customer': {
          const groups = new Map<string, { code: string; rows: AllocationRow[] }>()
          for (const a of allocs) {
            const code = a.customer?.code ?? 'INCONNU'
            const group = groups.get(code) ?? { code, rows: [] }
            group.rows.push(a)
            groups.set(code, group)
          }

          if (groups.size === 1) {
            const [code, group] = [...groups.entries()][0]
            const wb = generateExcelWorkbook(group.rows, code)
            XLSX.writeFile(wb, `${filePrefix}-${code}.xlsx`)
          } else {
            const wb = XLSX.utils.book_new()
            for (const [code, group] of groups) {
              const wsData = [
                ['CIP13', 'Produit', 'Grossiste', 'Demande', 'Alloue', 'Couverture %', 'Statut'],
                ...group.rows.map(a => [
                  a.product?.cip13 ?? '',
                  a.product?.name ?? '',
                  a.wholesaler?.code ?? '',
                  a.requested_quantity,
                  a.allocated_quantity,
                  a.requested_quantity > 0 ? Math.round((a.allocated_quantity / a.requested_quantity) * 100) : 0,
                  a.status,
                ]),
              ]
              const ws = XLSX.utils.aoa_to_sheet(wsData)
              ws['!cols'] = [{ wch: 15 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }]
              XLSX.utils.book_append_sheet(wb, ws, code.slice(0, 31))
            }
            XLSX.writeFile(wb, `${filePrefix}-par-client.xlsx`)
          }
          toast.success(`Export par client telecharge (${groups.size} clients)`)
          break
        }

        case 'delivery_notes': {
          const count = generateDeliveryNotes(allocs, filePrefix)
          toast.success(`Bons de livraison telecharges (${count} clients)`)
          break
        }
      }
    } catch (err) {
      toast.error(`Erreur export: ${(err as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero header with animation */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200 }}
      >
        <motion.div
          className={`h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-4 ${isCompleted ? 'bg-green-100 dark:bg-green-950' : 'bg-primary/10'}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1, rotate: isCompleted ? [0, 10, -10, 0] : 0 }}
          transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
        >
          {isCompleted ? (
            <PartyPopper className="h-8 w-8 text-green-600" />
          ) : (
            <Flag className="h-8 w-8 text-primary" />
          )}
        </motion.div>
        <h3 className="text-xl font-bold">
          {isCompleted ? 'Processus Termine !' : 'Finalisation'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isCompleted
            ? `Allocation de ${monthName} ${process.year} terminee avec succes.`
            : `Resume du processus d'allocation - ${monthName} ${process.year}`
          }
        </p>
        {isCompleted && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 }}>
            <Badge variant="default" className="mt-2">Termine</Badge>
          </motion.div>
        )}
      </motion.div>

      <Separator />

      {/* Final stats with animated counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Package, color: 'text-blue-600', value: stats?.orders ?? 0, label: 'Commandes' },
          { icon: BarChart3, color: 'text-emerald-600', value: stats?.allocations ?? 0, label: 'Allocations' },
          { icon: Users, color: 'text-teal-600', value: stats?.uniqueCustomers ?? 0, label: 'Clients' },
          { icon: Truck, color: 'text-amber-600', value: stats?.uniqueWholesalers ?? 0, label: 'Grossistes' },
        ].map((stat, i) => (
          <motion.div key={stat.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <stat.icon className={`h-5 w-5 ${stat.color} shrink-0`} />
                <div>
                  <AnimatedCounter
                    value={stat.value}
                    valueClassName="text-xl font-bold"
                  />
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Coverage gauge */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <GaugeChart
                value={fulfillmentRate}
                size={140}
                strokeWidth={12}
                label="Taux de couverture"
              />
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Unites allouees</span>
                  <span className="font-bold tabular-nums">{stats?.totalAllocated?.toLocaleString('fr-FR') ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Unites demandees</span>
                  <span className="font-bold tabular-nums">{stats?.totalRequested?.toLocaleString('fr-FR') ?? 0}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(fulfillmentRate, 100)}%` }}
                    transition={{ duration: 1, delay: 0.6 }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Visual breakdown */}
      {allocations && allocations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Detail des allocations</h4>
                <Badge variant="secondary" className="ml-auto text-[10px]">{allocations.length} lignes</Badge>
              </div>

              <Tabs defaultValue="charts" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="charts">Graphiques</TabsTrigger>
                  <TabsTrigger value="by_customer">Par Client</TabsTrigger>
                  <TabsTrigger value="table">Tableau</TabsTrigger>
                </TabsList>

                {/* Charts tab */}
                <TabsContent value="charts" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {wholesalerSummary.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-muted-foreground">
                          <Truck className="h-3.5 w-3.5" /> Repartition par grossiste
                        </h5>
                        <HorizontalBarChart
                          items={wholesalerSummary.map(w => ({ label: w.name, code: w.code, value: w.totalQty }))}
                          formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
                        />
                      </div>
                    )}
                    {customerSummary.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" /> Repartition par client
                        </h5>
                        <HorizontalBarChart
                          items={customerSummary.map(c => ({ label: c.name, code: c.code, value: c.totalQty }))}
                          formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* By customer summary tab */}
                <TabsContent value="by_customer" className="mt-4">
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Lignes</TableHead>
                          <TableHead className="text-right">Demande</TableHead>
                          <TableHead className="text-right">Alloue</TableHead>
                          <TableHead className="text-right">Couverture</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerSummary.map(c => {
                          const rate = c.totalReq > 0 ? Math.round((c.totalQty / c.totalReq) * 100) : 0
                          return (
                            <TableRow key={c.code}>
                              <TableCell>
                                <span className="font-mono font-medium text-sm">{c.code}</span>
                                <span className="text-xs text-muted-foreground ml-2">{c.name}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.totalReq.toLocaleString('fr-FR')}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{c.totalQty.toLocaleString('fr-FR')}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant={rate >= 80 ? 'default' : rate >= 50 ? 'secondary' : 'destructive'} className="text-[10px]">
                                  {rate}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Full table tab */}
                <TabsContent value="table" className="mt-4">
                  <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>CIP13</TableHead>
                          <TableHead className="hidden md:table-cell">Produit</TableHead>
                          <TableHead>Grossiste</TableHead>
                          <TableHead className="text-right">Demande</TableHead>
                          <TableHead className="text-right">Alloue</TableHead>
                          <TableHead className="text-right">Couverture</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocations.map(a => {
                          const rate = a.requested_quantity > 0 ? Math.round((a.allocated_quantity / a.requested_quantity) * 100) : 0
                          const isFull = a.allocated_quantity >= a.requested_quantity
                          return (
                            <TableRow key={a.id} className={!isFull ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}>
                              <TableCell className="font-mono text-sm font-medium">{a.customer?.code ?? '-'}</TableCell>
                              <TableCell className="font-mono text-sm">{a.product?.cip13 ?? '-'}</TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground max-w-[180px] truncate text-sm">{a.product?.name ?? '-'}</TableCell>
                              <TableCell className="font-medium text-sm">{a.wholesaler?.code ?? '-'}</TableCell>
                              <TableCell className="text-right tabular-nums">{a.requested_quantity.toLocaleString('fr-FR')}</TableCell>
                              <TableCell className={`text-right tabular-nums font-medium ${!isFull ? 'text-amber-600' : ''}`}>{a.allocated_quantity.toLocaleString('fr-FR')}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant={rate >= 100 ? 'default' : rate >= 50 ? 'secondary' : 'destructive'} className="text-[10px]">
                                  {rate}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Export section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="ivory-card-highlight">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Exporter les allocations</h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {([
                { value: 'delivery_notes' as const, label: 'Bons de livraison', icon: Package, desc: 'Par client + lots' },
                { value: 'global_csv' as const, label: 'CSV Global', icon: FileSpreadsheet, desc: 'Fichier unique CSV' },
                { value: 'global_excel' as const, label: 'Excel Global', icon: FileSpreadsheet, desc: 'Fichier unique .xlsx' },
                { value: 'by_wholesaler' as const, label: 'Par Grossiste', icon: Truck, desc: '1 onglet par grossiste' },
                { value: 'by_customer' as const, label: 'Par Client', icon: Users, desc: '1 onglet par client' },
              ]).map(opt => {
                const selected = exportMode === opt.value
                return (
                  <motion.button
                    key={opt.value}
                    type="button"
                    onClick={() => setExportMode(opt.value)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <opt.icon className={`h-4 w-4 mb-1.5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                  </motion.button>
                )
              })}
            </div>

            <Button
              onClick={handleExport}
              disabled={exporting}
              className="gap-2 w-full sm:w-auto"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Export en cours...' : 'Telecharger'}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row justify-center gap-3">
        {!isCompleted && (
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={finalizeMut.isPending}
              className="gap-2"
              size="lg"
            >
              <CheckCircle className="h-4 w-4" />
              Terminer le processus
            </Button>
          </motion.div>
        )}

        <Button variant="outline" onClick={() => navigate('/monthly-processes')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour a la liste
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Terminer le processus ?"
        description={`Le processus d'allocation de ${monthName} ${process.year} sera marque comme termine. Cette action est irreversible.`}
        onConfirm={() => finalizeMut.mutate()}
        loading={finalizeMut.isPending}
        variant="default"
        confirmLabel="Terminer"
        loadingLabel="Finalisation..."
      />
    </div>
  )
}
