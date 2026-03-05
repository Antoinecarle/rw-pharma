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
import { Flag, CheckCircle, Download, Package, BarChart3, Users, Truck, ArrowLeft, FileSpreadsheet, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

type ExportMode = 'global_csv' | 'by_wholesaler' | 'by_customer' | 'global_excel'

interface FinalizationStepProps {
  process: MonthlyProcess
}

interface AllocationRow {
  id: string
  requested_quantity: number
  allocated_quantity: number
  status: string
  customer: { code: string; name: string } | null
  product: { cip13: string; name: string } | null
  wholesaler: { code: string; name: string } | null
}

async function fetchAllocations(processId: string): Promise<AllocationRow[]> {
  const { data, error } = await supabase
    .from('allocations')
    .select('id, requested_quantity, allocated_quantity, status, customer:customers(code, name), product:products(cip13, name), wholesaler:wholesalers(code, name)')
    .eq('monthly_process_id', processId)
  if (error) throw error
  return (data ?? []) as unknown as AllocationRow[]
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

const cardVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.1, type: 'spring', stiffness: 300, damping: 25 },
  }),
}

export default function FinalizationStep({ process }: FinalizationStepProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exportMode, setExportMode] = useState<ExportMode>('global_csv')
  const [exporting, setExporting] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  const { data: stats } = useQuery({
    queryKey: ['monthly-process', process.id, 'final-stats'],
    queryFn: async () => {
      const [ordersRes, allocRes, customersRes, wholesalersRes] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('monthly_process_id', process.id),
        supabase.from('allocations').select('id, allocated_quantity, requested_quantity', { count: 'exact' }).eq('monthly_process_id', process.id),
        supabase.from('orders').select('customer_id').eq('monthly_process_id', process.id),
        supabase.from('allocations').select('wholesaler_id').eq('monthly_process_id', process.id),
      ])

      const allocData = allocRes.data ?? []
      const totalRequested = allocData.reduce((s, a) => s + (a.requested_quantity ?? 0), 0)
      const totalAllocated = allocData.reduce((s, a) => s + (a.allocated_quantity ?? 0), 0)
      const uniqueCustomers = new Set((customersRes.data ?? []).map((o) => o.customer_id)).size
      const uniqueWholesalers = new Set((wholesalersRes.data ?? []).map((a) => a.wholesaler_id)).size

      return {
        orders: ordersRes.count ?? 0,
        allocations: allocRes.count ?? 0,
        totalRequested,
        totalAllocated,
        fulfillmentRate: totalRequested > 0 ? ((totalAllocated / totalRequested) * 100) : 0,
        uniqueCustomers,
        uniqueWholesalers,
      }
    },
  })

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
        .update({ status: 'completed', current_step: 5 })
        .eq('id', process.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success('Processus termine avec succes !')
      setShowConfetti(true)
      fireConfetti()
    },
    onError: (err: Error) => toast.error(err.message),
  })

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
      if (allocs.length === 0) { toast.error('Aucune donnee a exporter'); return }

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
          { icon: Users, color: 'text-violet-600', value: stats?.uniqueCustomers ?? 0, label: 'Clients' },
          { icon: Truck, color: 'text-amber-600', value: stats?.uniqueWholesalers ?? 0, label: 'Grossistes' },
        ].map((stat, i) => (
          <motion.div key={stat.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="hover:shadow-md transition-shadow">
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

      {/* Export section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="border-primary/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Exporter les allocations</h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
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
