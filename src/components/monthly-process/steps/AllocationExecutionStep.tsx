import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { runAllocation, computeStats, type AllocationStrategy, type AllocationLog, type DryRunStats } from '@/lib/allocation-engine'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Cpu, ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, Truck, Zap, Users, BarChart3, Eye, Settings2, Boxes, ShieldCheck, Play, ChevronRight } from 'lucide-react'
import AllocationVisualizer from '@/components/allocations/AllocationVisualizer'
import { toast } from 'sonner'
import { createNotification } from '@/lib/notifications'
import type { MonthlyProcess } from '@/types/database'

const STRATEGIES: { value: AllocationStrategy; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'balanced', label: 'Equilibree', description: 'Repartir entre grossistes + round-robin clients', icon: BarChart3 },
  { value: 'top_clients', label: 'Priorite top clients', description: 'Servir les clients prioritaires en premier', icon: Users },
  { value: 'max_coverage', label: 'Max couverture', description: 'Petites commandes en premier pour couvrir plus', icon: Zap },
]

const STEP_LABELS = ['Configurer', 'Simuler', 'Lancer'] as const

interface AllocationExecutionStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function AllocationExecutionStep({ process, onNext }: AllocationExecutionStepProps) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<'config' | 'running' | 'done'>('config')
  const [internalStep, setInternalStep] = useState<1 | 2 | 3>(1)
  const [strategy, setStrategy] = useState<AllocationStrategy>('balanced')
  const [excludedWholesalers, setExcludedWholesalers] = useState<Set<string>>(new Set())
  const [dryRunResult, setDryRunResult] = useState<DryRunStats | null>(null)
  const [allocationLogs, setAllocationLogs] = useState<AllocationLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [showVisualizer, setShowVisualizer] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const { data: existingAllocations } = useQuery({
    queryKey: ['allocations', process.id, 'count'],
    queryFn: async () => {
      const { data } = await supabase
        .from('allocations')
        .select('id')
        .eq('monthly_process_id', process.id)
        .limit(1)
      return data?.length ?? 0
    },
  })

  const { data: orderStats } = useQuery({
    queryKey: ['orders', process.id, 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_id, product_id, quantity, status')
        .eq('monthly_process_id', process.id)
        .neq('status', 'rejected')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: wholesalers } = useQuery({
    queryKey: ['wholesalers', 'all'],
    queryFn: async () => {
      const { data } = await supabase.from('wholesalers').select('id, name, code')
      return data ?? []
    },
  })

  const { data: stockCount } = useQuery({
    queryKey: ['collected_stock', process.id, 'count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('collected_stock')
        .select('*', { count: 'exact', head: true })
        .eq('monthly_process_id', process.id)
        .in('status', ['received', 'partially_allocated'])
      return count ?? 0
    },
  })

  const toggleWholesaler = (id: string) => {
    setExcludedWholesalers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setDryRunResult(null)
  }

  const dryRunMut = useMutation({
    mutationFn: async () => {
      const { allocations, logs } = await runAllocation(
        process.id, process.month, process.year, strategy, excludedWholesalers, true,
      )
      setAllocationLogs(logs)
      return computeStats(allocations, logs, wholesalers ?? [])
    },
    onSuccess: (result) => {
      setDryRunResult(result)
      toast.success('Simulation terminee')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Guard: prevent re-allocation on completed/finalizing processes
  const isProcessLocked = process.status === 'completed' || process.status === 'finalizing'

  const allocateMut = useMutation({
    mutationFn: async () => {
      if (isProcessLocked) {
        throw new Error('Ce processus est deja termine. Impossible de relancer l\'allocation.')
      }
      setPhase('running')
      setShowLogs(true)

      const { allocations, logs } = await runAllocation(
        process.id, process.month, process.year, strategy, excludedWholesalers, false,
      )
      setAllocationLogs(logs)

      // Insert in batches
      const batchSize = 100
      let totalInserted = 0
      for (let i = 0; i < allocations.length; i += batchSize) {
        const batch = allocations.slice(i, i + batchSize)
        const { error, data } = await supabase.from('allocations').insert(batch).select('id')
        if (error) throw error
        totalInserted += data?.length ?? batch.length
      }

      // Update process (orders already updated by runAllocation)
      // Use Math.max to never regress current_step (e.g. if process is already at step 10)
      await supabase
        .from('monthly_processes')
        .update({
          allocations_count: totalInserted,
          status: process.current_step > 8 ? process.status : 'allocating_lots',
          current_step: Math.max(8, process.current_step),
          phase: process.current_step > 8 ? process.phase : 'allocation',
        })
        .eq('id', process.id)

      return totalInserted
    },
    onSuccess: (count) => {
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${count} allocations generees`)
      createNotification({
        type: 'info',
        title: 'Allocation terminee',
        message: `${count} allocations generees pour le processus ${process.month}/${process.year}.`,
      })
    },
    onError: (err: Error) => {
      setPhase('config')
      toast.error(err.message)
    },
  })

  const orderCount = orderStats?.length ?? 0
  const pendingOrders = orderStats?.filter(o => o.status === 'validated' || o.status === 'pending') ?? []
  const allocatableCount = pendingOrders.length
  const uniqueProducts = new Set(orderStats?.map(o => o.product_id)).size
  const activeWholesalers = (wholesalers?.length ?? 0) - excludedWholesalers.size
  const fulfillmentNum = dryRunResult ? parseFloat(dryRunResult.fulfillmentRate) : 0
  const fulfillmentColor = fulfillmentNum >= 90 ? 'text-green-600' : fulfillmentNum >= 70 ? 'text-amber-600' : 'text-red-600'
  const selectedStrategyLabel = STRATEGIES.find(s => s.value === strategy)?.label ?? strategy

  // ─── Stepper indicator ───
  const StepperHeader = () => (
    <div className="flex items-center gap-1 sm:gap-2">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3
        const isActive = internalStep === stepNum
        const isDone = internalStep > stepNum
        return (
          <div key={label} className="flex items-center gap-1 sm:gap-2">
            {idx > 0 && (
              <ChevronRight className={`h-4 w-4 shrink-0 ${isDone ? 'text-primary' : 'text-muted-foreground/40'}`} />
            )}
            <button
              type="button"
              onClick={() => { if (isDone) setInternalStep(stepNum) }}
              disabled={!isDone}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isDone
                    ? 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer'
                    : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              <span className={`flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold ${
                isActive ? 'bg-primary-foreground/20' : isDone ? 'bg-primary/20' : 'bg-muted-foreground/20'
              }`}>
                {isDone ? '✓' : stepNum}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )

  // ─── Summary line (used in steps 2 & 3) ───
  const ConfigSummary = () => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>{orderCount} commandes</span>
      <span className="text-muted-foreground/40">&middot;</span>
      <span>{activeWholesalers} grossistes</span>
      <span className="text-muted-foreground/40">&middot;</span>
      <span>{uniqueProducts} produits</span>
      {(stockCount ?? 0) > 0 && (
        <>
          <span className="text-muted-foreground/40">&middot;</span>
          <span>{stockCount} lots</span>
        </>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ─── Banner: existing allocations (above stepper) ─── */}
      {existingAllocations != null && existingAllocations > 0 && (
        <Card className={allocatableCount === 0 ? 'border-green-200/60 bg-green-50/30' : 'border-amber-200/60 bg-amber-50/30'}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {allocatableCount === 0 ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <p className="text-sm">
                    Allocation terminee — <strong>{orderCount}</strong> commandes traitees.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <p className="text-sm">
                    <strong>{existingAllocations}</strong> allocations existantes. Relancer ajoutera de nouvelles entrees.
                  </p>
                </>
              )}
            </div>
            {allocatableCount === 0 && (
              <Button onClick={onNext} size="sm" className="gap-2 shrink-0">
                Voir les resultats <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Config phase: 3-step wizard ─── */}
      {phase === 'config' && (
        <div className="space-y-6">
          {/* Stepper header */}
          <div className="flex items-center justify-between">
            <StepperHeader />
          </div>

          {/* ═══ Step 1: Configurer ═══ */}
          {internalStep === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">Configuration de l'allocation</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Choisissez la methode de repartition et les sources d'approvisionnement.
                </p>
              </div>

              {/* Strategy selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Methode de repartition</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {STRATEGIES.map((s) => {
                    const isSelected = strategy === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => { setStrategy(s.value); setDryRunResult(null) }}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/30 hover:bg-muted/30'
                        }`}
                      >
                        <s.icon className={`h-5 w-5 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <p className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Wholesaler selection */}
              {wholesalers && wholesalers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" /> Sources d'approvisionnement
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {wholesalers.map((w) => {
                      const excluded = excludedWholesalers.has(w.id)
                      return (
                        <label
                          key={w.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                            excluded ? 'border-muted bg-muted/30 opacity-50' : 'border-border hover:border-primary/30'
                          }`}
                        >
                          <Checkbox
                            checked={!excluded}
                            onCheckedChange={() => toggleWholesaler(w.id)}
                          />
                          <span className="text-sm font-medium">{w.code ?? w.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Engine features */}
              <div className="flex flex-wrap gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1 text-xs">
                      <ShieldCheck className="h-3 w-3" /> Quotas stricts
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>L'algorithme respecte les quotas grossistes et ne depasse jamais les limites</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className={`gap-1 text-xs ${(stockCount ?? 0) > 0 ? 'border-green-200 text-green-700' : ''}`}>
                      <Boxes className="h-3 w-3" /> FEFO {(stockCount ?? 0) > 0 ? 'actif' : 'aucun lot'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>First Expiry First Out — les lots proches de l'expiration sont alloues en priorite</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Users className="h-3 w-3" /> Priorite multi-niveaux
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Scoring base sur is_top_client + priority_level (1-5) + max_allocation_pct</TooltipContent>
                </Tooltip>
              </div>

              {/* Footer: summary + next */}
              <div className="flex items-center justify-between pt-2">
                <ConfigSummary />
                <Button onClick={() => setInternalStep(2)} className="gap-2">
                  Suivant : Simuler <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Step 2: Simuler ═══ */}
          {internalStep === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Simulation</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">{selectedStrategyLabel}</Badge>
                    <span className="text-sm text-muted-foreground">{activeWholesalers} grossistes</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInternalStep(1)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Modifier la configuration
                </button>
              </div>

              {/* Simulate button */}
              <Card className="ivory-card-highlight">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Lancez la simulation pour previsualiser les resultats</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Aucune donnee ne sera modifiee</p>
                    </div>
                    <Button
                      onClick={() => dryRunMut.mutate()}
                      disabled={dryRunMut.isPending || allocatableCount === 0 || isProcessLocked}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      {dryRunMut.isPending ? 'Simulation...' : 'Lancer la simulation'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Dry run results */}
              {dryRunResult && (
                <Card className="ivory-card-highlight">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">Resultat de la simulation</h4>
                      {dryRunResult.lotAllocations > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-auto gap-1">
                          <Boxes className="h-3 w-3" /> {dryRunResult.lotAllocations} lots alloues
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="text-center">
                        <p className="text-xl font-bold">{dryRunResult.totalAllocations}</p>
                        <p className="text-xs text-muted-foreground">Allocations</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-xl font-bold ${fulfillmentColor}`}>{dryRunResult.fulfillmentRate}%</p>
                        <p className="text-xs text-muted-foreground">Couverture</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">{dryRunResult.totalAllocated.toLocaleString('fr-FR')}</p>
                        <p className="text-xs text-muted-foreground">Unites allouees</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-xl font-bold ${dryRunResult.zeroProducts > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {dryRunResult.zeroProducts}
                        </p>
                        <p className="text-xs text-muted-foreground">Produits a 0%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-violet-600">{dryRunResult.lotAllocations}</p>
                        <p className="text-xs text-muted-foreground">Via lots</p>
                      </div>
                    </div>

                    {/* Coverage bar */}
                    <div>
                      <Progress value={Math.min(fulfillmentNum, 100)} className="h-2" />
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{dryRunResult.totalAllocated.toLocaleString('fr-FR')} allouees</span>
                        <span>{dryRunResult.totalRequested.toLocaleString('fr-FR')} demandees</span>
                      </div>
                    </div>

                    {/* Quota utilization */}
                    {dryRunResult.quotaUtilization.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Utilisation des quotas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dryRunResult.quotaUtilization.map(q => {
                            const pct = q.total > 0 ? Math.round((q.used / q.total) * 100) : 0
                            return (
                              <Badge key={q.wholesalerCode} variant="outline" className={`text-xs gap-1 ${pct > 90 ? 'border-red-200 text-red-700' : pct > 70 ? 'border-amber-200 text-amber-700' : ''}`}>
                                <span className="font-bold">{q.wholesalerCode}</span>
                                {pct}% ({q.used}/{q.total})
                              </Badge>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Breakdowns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Par grossiste</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dryRunResult.byWholesaler.map(w => (
                            <Badge key={w.code} variant="outline" className="text-xs gap-1">
                              <span className="font-bold">{w.code}</span>
                              {w.qty.toLocaleString('fr-FR')} u.
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Par client (priorite)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dryRunResult.byCustomer.map(c => (
                            <Tooltip key={c.code}>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs gap-1 cursor-help">
                                  <span className="font-bold">{c.code}</span>
                                  {c.qty.toLocaleString('fr-FR')} u.
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Score priorite: {c.priority}</TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Visualizer toggle after dry-run */}
              {dryRunResult && allocationLogs.length > 0 && !showVisualizer && (
                <Button variant="outline" onClick={() => setShowVisualizer(true)} className="gap-2">
                  <Play className="h-4 w-4" />
                  Visualiser l'execution ({allocationLogs.length} etapes)
                </Button>
              )}

              {showVisualizer && allocationLogs.length > 0 && (
                <AllocationVisualizer logs={allocationLogs} onClose={() => setShowVisualizer(false)} />
              )}

              {/* Footer: actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setInternalStep(3)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Passer directement au lancement
                </button>
                <Button
                  onClick={() => setInternalStep(3)}
                  disabled={!dryRunResult}
                  className="gap-2"
                >
                  Valider et continuer <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Step 3: Lancer ═══ */}
          {internalStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Lancement de l'allocation</h3>
                  {dryRunResult && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-sm text-green-600 font-medium">Simulation validee</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setInternalStep(2)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Retour a la simulation
                </button>
              </div>

              {/* Warning if no simulation */}
              {!dryRunResult && (
                <Card className="border-amber-200/60 bg-amber-50/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Vous n'avez pas simule — les resultats ne sont pas previsibles. <button type="button" onClick={() => setInternalStep(2)} className="underline font-medium hover:text-amber-900">Revenir a la simulation</button>
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Recap card */}
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Recapitulatif</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Methode</p>
                      <p className="text-sm font-medium">{selectedStrategyLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Grossistes</p>
                      <p className="text-sm font-medium">{activeWholesalers} actifs</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Commandes</p>
                      <p className="text-sm font-medium">{orderCount} ({allocatableCount} a traiter)</p>
                    </div>
                    {dryRunResult && (
                      <div>
                        <p className="text-xs text-muted-foreground">Couverture estimee</p>
                        <p className={`text-sm font-medium ${fulfillmentColor}`}>{dryRunResult.fulfillmentRate}%</p>
                      </div>
                    )}
                  </div>
                  {dryRunResult && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline" className="text-xs">{dryRunResult.totalAllocations} allocations prevues</Badge>
                      <Badge variant="outline" className="text-xs">{dryRunResult.totalAllocated.toLocaleString('fr-FR')} unites</Badge>
                      {dryRunResult.lotAllocations > 0 && (
                        <Badge variant="outline" className="text-xs">{dryRunResult.lotAllocations} via lots</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Launch CTA */}
              <Card className="ivory-card-highlight">
                <CardContent className="p-6 text-center space-y-4">
                  <Cpu className="h-12 w-12 mx-auto text-primary" />
                  <div>
                    <p className="font-semibold">
                      {dryRunResult ? 'Pret a lancer — simulation validee' : 'Lancer sans simulation'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Cette action generera les allocations et mettra a jour les commandes.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => allocateMut.mutate()}
                    disabled={allocatableCount === 0 || isProcessLocked || allocateMut.isPending}
                    className="gap-2"
                  >
                    <Cpu className="h-4 w-4" />
                    {isProcessLocked ? 'Processus termine' : allocateMut.isPending ? 'Allocation...' : 'Confirmer et lancer'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ─── Running phase ─── */}
      {phase === 'running' && (
        <div className="py-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="relative mx-auto w-16 h-16">
              <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full" />
              <Cpu className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-lg font-medium">Allocation en cours...</p>
            <p className="text-sm text-muted-foreground">Repartition des {orderCount} commandes</p>
          </div>

          {/* Live allocation log */}
          {showLogs && allocationLogs.length > 0 && (
            <Card className="max-h-48 overflow-hidden">
              <CardContent className="p-0">
                <div ref={logRef} className="overflow-y-auto max-h-48 p-3 space-y-0.5 font-mono text-[11px]">
                  {allocationLogs.slice(-30).map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.full ? 'text-green-600' : 'text-amber-600'}`}>
                      <span className="text-muted-foreground w-6 text-right shrink-0">{Math.max(0, allocationLogs.length - 30) + i + 1}</span>
                      <span>[{log.customer}]</span>
                      <span className="truncate flex-1">{log.product}...</span>
                      <span>→ {log.wholesaler}</span>
                      {log.lot && <span className="text-violet-500">L:{log.lot.slice(0, 6)}</span>}
                      <span className="tabular-nums">{log.allocated}/{log.requested}</span>
                      <span>{log.full ? '✓' : '⚠'}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Done phase ─── */}
      {phase === 'done' && (
        <div className="py-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-xl font-semibold">Allocation terminee</p>
            <p className="text-sm text-muted-foreground mt-1">
              {allocateMut.data} allocations generees avec la strategie "{selectedStrategyLabel}".
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            {allocationLogs.length > 0 && (
              <Button variant="outline" onClick={() => setShowVisualizer(v => !v)} className="gap-2">
                <Play className="h-4 w-4" />
                {showVisualizer ? 'Masquer' : 'Visualiser'}
              </Button>
            )}
            <Button onClick={onNext} size="lg" className="gap-2">
              Voir les resultats <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {showVisualizer && allocationLogs.length > 0 && (
            <AllocationVisualizer logs={allocationLogs} onClose={() => setShowVisualizer(false)} />
          )}
        </div>
      )}
    </div>
  )
}
