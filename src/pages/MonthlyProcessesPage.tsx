import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { motion } from 'framer-motion'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Calendar, CalendarRange, Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { createNotification } from '@/lib/notifications'
import MonthlyProcessCard from '@/components/monthly-process/MonthlyProcessCard'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']

function generateMonthOptions(existingProcesses: MonthlyProcess[] | undefined) {
  const now = new Date()
  const options: { value: string; label: string; month: number; year: number; exists: boolean }[] = []
  const existingSet = new Set(
    (existingProcesses ?? []).map(p => `${p.year}-${p.month}`)
  )

  // 3 months back + current + 12 months ahead = 16 options
  for (let offset = -3; offset <= 12; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const m = d.getMonth() + 1
    const y = d.getFullYear()
    const exists = existingSet.has(`${y}-${m}`)
    options.push({
      value: `${y}-${m}`,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      month: m,
      year: y,
      exists,
    })
  }
  return options
}

export default function MonthlyProcessesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMonthKey, setSelectedMonthKey] = useState('')
  const [cloneQuotas, setCloneQuotas] = useState(true)

  const { data: processes, isLoading } = useQuery({
    queryKey: ['monthly-processes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('monthly_processes').select('*').order('year', { ascending: false }).order('month', { ascending: false })
      if (error) throw error
      return data as MonthlyProcess[]
    },
  })

  const monthOptions = useMemo(() => generateMonthOptions(processes), [processes])

  // Auto-select next available month when dialog opens
  const defaultMonthKey = useMemo(() => {
    const firstAvailable = monthOptions.find(o => !o.exists && o.value >= `${new Date().getFullYear()}-${new Date().getMonth() + 1}`)
    return firstAvailable?.value ?? monthOptions.find(o => !o.exists)?.value ?? monthOptions[3]?.value ?? ''
  }, [monthOptions])

  const selectedOption = monthOptions.find(o => o.value === (selectedMonthKey || defaultMonthKey))

  // Find the most recent completed process for clone feature
  const lastCompletedProcess = useMemo(() => {
    if (!processes) return null
    const completed = processes
      .filter(p => p.status === 'completed' || p.status === 'finalizing')
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year
        return b.month - a.month
      })
    return completed[0] ?? null
  }, [processes])

  const { data: lastProcessQuotaCount } = useQuery({
    queryKey: ['wholesaler_quotas', lastCompletedProcess?.id, 'clone-count'],
    enabled: !!lastCompletedProcess,
    queryFn: async () => {
      if (!lastCompletedProcess) return 0
      const monthStr = `${lastCompletedProcess.year}-${String(lastCompletedProcess.month).padStart(2, '0')}-01`
      const { data } = await supabase
        .from('wholesaler_quotas')
        .select('id')
        .eq('month', monthStr)
      return data?.length ?? 0
    },
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const opt = selectedOption
      if (!opt) throw new Error('Aucun mois sélectionné')
      // date_ouverture = 1er jour du mois, date_cloture = null (set on finalization)
      const dateOuverture = new Date(opt.year, opt.month - 1, 1)
      const { data, error } = await supabase.from('monthly_processes').insert({
        month: opt.month,
        year: opt.year,
        status: 'draft',
        current_step: 1,
        date_ouverture: dateOuverture.toISOString(),
        date_cloture: null,
        metadata: {},
      }).select().single()
      if (error) throw error

      // Clone quotas from last process if requested
      let clonedCount = 0
      if (cloneQuotas && lastCompletedProcess) {
        const srcMonthStr = `${lastCompletedProcess.year}-${String(lastCompletedProcess.month).padStart(2, '0')}-01`
        const newMonthStr = `${opt.year}-${String(opt.month).padStart(2, '0')}-01`

        // Fetch all quotas from the previous process (paginated to avoid 1000-row limit)
        let allQuotas: Array<{
          wholesaler_id: string
          product_id: string
          quota_quantity: number
          extra_available: number
        }> = []
        let from = 0
        const pageSize = 1000
        while (true) {
          const { data: batch } = await supabase
            .from('wholesaler_quotas')
            .select('wholesaler_id, product_id, quota_quantity, extra_available')
            .eq('month', srcMonthStr)
            .range(from, from + pageSize - 1)
          if (!batch || batch.length === 0) break
          allQuotas = allQuotas.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }

        if (allQuotas.length > 0) {
          // Insert in batches of 500
          const batchSize = 500
          for (let i = 0; i < allQuotas.length; i += batchSize) {
            const chunk = allQuotas.slice(i, i + batchSize).map(q => ({
              wholesaler_id: q.wholesaler_id,
              product_id: q.product_id,
              monthly_process_id: data.id,
              month: newMonthStr,
              quota_quantity: q.quota_quantity,
              extra_available: q.extra_available,
              quota_used: 0,
              import_file_name: null,
              metadata: { cloned_from: lastCompletedProcess.id },
            }))
            const { error: insertErr, data: inserted } = await supabase
              .from('wholesaler_quotas')
              .upsert(chunk, { onConflict: 'wholesaler_id,product_id,month', ignoreDuplicates: false })
              .select('id')
            if (!insertErr) {
              clonedCount += inserted?.length ?? chunk.length
            }
          }
        }
      }

      return { process: data, clonedCount }
    },
    onSuccess: ({ clonedCount }) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      queryClient.invalidateQueries({ queryKey: ['wholesaler_quotas'] })
      const monthLabel = selectedOption ? `${MONTH_NAMES[selectedOption.month - 1]} ${selectedOption.year}` : ''
      setDialogOpen(false)
      setSelectedMonthKey('')
      if (clonedCount > 0) {
        toast.success(`Processus créé avec ${clonedCount} disponibilités dupliquées`)
      } else {
        toast.success('Processus mensuel créé')
      }
      createNotification({
        type: 'info',
        title: 'Nouveau processus créé',
        message: `Le processus d'allocation pour ${monthLabel} a été créé.`,
      })
    },
    onError: (err: Error) => {
      if (err.message.includes('unique') || err.message.includes('duplicate'))
        toast.error('Un processus existe déjà pour ce mois')
      else toast.error(err.message)
    },
  })

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.06))' }}>
              <CalendarRange className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Processus Mensuels</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>Gestion des allocations mensuelles</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5 text-[13px] h-9 rounded-xl shadow-sm"
            style={{ background: 'linear-gradient(180deg, var(--ivory-accent), var(--ivory-accent-hover))', color: 'white' }}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nouveau</span>
          </Button>
        </div>
      </motion.div>

      {/* Process list */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ivory-glass p-5"><Skeleton className="h-28 w-full rounded-xl" /></div>
          ))}
        </div>
      ) : processes && processes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
          {processes.map((p, i) => (
            <MonthlyProcessCard key={p.id} process={p} index={i} />
          ))}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10">
          <div className="ivory-glass p-0 overflow-hidden" style={{ borderStyle: 'dashed' }}>
            <div className="flex flex-col items-center py-20 gap-3">
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.06)' }}>
                <CalendarRange className="h-7 w-7" style={{ color: 'var(--ivory-text-muted)' }} />
              </div>
              <p className="ivory-heading text-[16px]">Aucun processus</p>
              <p className="text-[13px]" style={{ color: 'var(--ivory-text-muted)' }}>Créez votre premier processus d'allocation mensuelle</p>
              <Button onClick={() => setDialogOpen(true)} className="mt-2 gap-2 text-[13px] h-9 rounded-xl"
                style={{ background: 'var(--ivory-accent)', color: 'white' }}>
                <Plus className="h-4 w-4" /> Créer un processus
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setSelectedMonthKey(''); setCloneQuotas(true) } }}>
        <DialogContent className="max-w-sm rounded-2xl" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 ivory-heading text-base">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.08)' }}>
                <Calendar className="h-4 w-4" style={{ color: 'var(--ivory-accent)' }} />
              </div>
              Nouveau processus
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Sélectionnez le mois pour la nouvelle allocation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={selectedMonthKey || defaultMonthKey}
              onValueChange={setSelectedMonthKey}
            >
              <SelectTrigger className="h-11 rounded-xl text-[14px]">
                <SelectValue placeholder="Choisir un mois..." />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.exists}
                    className="text-[13px]"
                  >
                    <span className="flex items-center gap-2">
                      {opt.label}
                      {opt.exists && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Check className="h-3 w-3" /> existe
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedOption && (
              <div className="rounded-xl p-3 text-[12px] space-y-1" style={{ background: 'rgba(13,148,136,0.04)', border: '1px solid rgba(13,148,136,0.1)' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--ivory-text-muted)' }}>Ouverture</span>
                  <span className="font-medium">1 {MONTH_NAMES[selectedOption.month - 1]} {selectedOption.year}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--ivory-text-muted)' }}>Cloture</span>
                  <span className="font-medium">{new Date(selectedOption.year, selectedOption.month, 0).getDate()} {MONTH_NAMES[selectedOption.month - 1]} {selectedOption.year}</span>
                </div>
              </div>
            )}

            {/* Clone quotas option */}
            {lastCompletedProcess && (lastProcessQuotaCount ?? 0) > 0 && (
              <div
                className="rounded-xl p-3 text-[12px] cursor-pointer transition-all"
                style={{
                  background: cloneQuotas ? 'rgba(13,148,136,0.06)' : 'rgba(0,0,0,0.02)',
                  border: cloneQuotas ? '1px solid rgba(13,148,136,0.2)' : '1px solid rgba(0,0,0,0.06)',
                }}
                onClick={() => setCloneQuotas(!cloneQuotas)}
              >
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={cloneQuotas}
                    onCheckedChange={(v) => setCloneQuotas(!!v)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 font-medium" style={{ color: cloneQuotas ? 'var(--ivory-accent)' : 'var(--ivory-text)' }}>
                      <Copy className="h-3 w-3" />
                      Copier les disponibilités du mois précédent
                    </div>
                    <p style={{ color: 'var(--ivory-text-muted)' }}>
                      {lastProcessQuotaCount} disponibilités de {MONTH_NAMES[lastCompletedProcess.month - 1]} {lastCompletedProcess.year} seront copiées.
                      Les quantités restent identiques, vous pourrez les ajuster ensuite.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px] rounded-xl">Annuler</Button>
            <Button
              size="sm"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !selectedOption || selectedOption.exists}
              className="text-[13px] rounded-xl"
              style={{ background: 'var(--ivory-accent)', color: 'white' }}
            >
              {createMut.isPending ? (cloneQuotas && lastCompletedProcess ? 'Création & duplication...' : 'Création...') : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
