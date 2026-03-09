import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Trash2, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import PhaseTabBar, { PHASES, getPhaseForStep, getPhaseStatus } from '@/components/monthly-process/PhaseTabBar'
import PhaseSubSteps from '@/components/monthly-process/PhaseSubSteps'
import WaitingStockBanner from '@/components/monthly-process/WaitingStockBanner'
import StepQualityScore from '@/components/monthly-process/StepQualityScore'
import QuotaImportStep from '@/components/monthly-process/steps/QuotaImportStep'
import OrderImportStep from '@/components/monthly-process/steps/OrderImportStep'
import OrderReviewStep from '@/components/monthly-process/steps/OrderReviewStep'
import WholesalerExportStep from '@/components/monthly-process/steps/WholesalerExportStep'
import StockImportStep from '@/components/monthly-process/steps/StockImportStep'
import StockAggregationStep from '@/components/monthly-process/steps/StockAggregationStep'
import AllocationExecutionStep from '@/components/monthly-process/steps/AllocationExecutionStep'
import AllocationReviewStep from '@/components/monthly-process/steps/AllocationReviewStep'
import FinalizationStep from '@/components/monthly-process/steps/FinalizationStep'
import DemoDataLoader from '@/components/monthly-process/DemoDataLoader'
import ReopenPhaseDialog from '@/components/monthly-process/ReopenPhaseDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useState, useCallback, useRef } from 'react'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  importing_quotas: 'Import quotas',
  importing_orders: 'Import commandes',
  reviewing_orders: 'Revue commandes',
  exporting_wholesalers: 'Export grossistes',
  attente_stock: 'Attente stock grossistes',
  collecting_stock: 'Reception stocks',
  aggregating_stock: 'Aggregation stock',
  allocating_lots: 'Allocation',
  reviewing_allocations: 'Revue allocations',
  finalizing: 'Finalisation',
  completed: 'Termine',
}

const stepTransition = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -15, scale: 0.98 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
}

function fireConfetti() {
  const colors = ['#f59e0b', '#eab308', '#fbbf24', '#d97706']
  confetti({
    particleCount: 60,
    spread: 70,
    origin: { y: 0.6, x: 0.5 },
    colors,
    gravity: 1.2,
    scalar: 0.9,
    ticks: 120,
  })
}

// Step → status + phase mapping for DB updates
const STEP_STATE_MAP: Record<number, { status: string; phase: string }> = {
  1: { status: 'importing_quotas', phase: 'commandes' },
  2: { status: 'importing_orders', phase: 'commandes' },
  3: { status: 'reviewing_orders', phase: 'commandes' },
  4: { status: 'exporting_wholesalers', phase: 'commandes' },
  5: { status: 'collecting_stock', phase: 'collecte' },
  6: { status: 'aggregating_stock', phase: 'collecte' },
  7: { status: 'allocating_lots', phase: 'allocation' },
  8: { status: 'reviewing_allocations', phase: 'allocation' },
  9: { status: 'finalizing', phase: 'cloture' },
}

export default function MonthlyProcessDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [activePhaseOverride, setActivePhaseOverride] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reopenPhaseId, setReopenPhaseId] = useState<number | null>(null)
  const prevStepRef = useRef<number>(1)

  const { data: process, isLoading } = useQuery({
    queryKey: ['monthly-processes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as MonthlyProcess
    },
    enabled: !!id,
  })

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('monthly_processes')
        .delete()
        .eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success('Processus supprime')
      navigate('/monthly-processes')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const processStep = process?.current_step ?? 1
  const currentStep = activeStep ?? processStep
  const currentPhaseId = activePhaseOverride ?? getPhaseForStep(currentStep)
  const currentPhase = PHASES[currentPhaseId - 1]

  // Build step stats from process data
  const stepStats = (() => {
    if (!process) return {}
    const stats: Record<number, { value: string | number; label: string }> = {}
    if ((process.quotas_count ?? 0) > 0) stats[1] = { value: process.quotas_count ?? 0, label: 'quotas' }
    if (process.orders_count > 0) stats[2] = { value: process.orders_count, label: 'commandes' }
    if (process.orders_count > 0 && processStep > 3) stats[3] = { value: 'validees', label: '' }
    if (process.orders_count > 0 && processStep > 4) stats[4] = { value: 'envoye', label: '' }
    if (process.allocations_count > 0) stats[7] = { value: process.allocations_count, label: 'allocations' }
    if (process.allocations_count > 0 && processStep > 8) stats[8] = { value: 'confirmees', label: '' }
    return stats
  })()

  const advanceStep = useCallback((targetStep: number) => {
    if (targetStep > prevStepRef.current) {
      fireConfetti()
    }
    prevStepRef.current = targetStep
    setActiveStep(targetStep)
    setActivePhaseOverride(null) // Reset phase override, auto-follow
    if (process) {
      const stepState = STEP_STATE_MAP[targetStep] ?? {}
      supabase
        .from('monthly_processes')
        .update({
          current_step: Math.max(targetStep, process.current_step),
          ...stepState,
        })
        .eq('id', process.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['monthly-processes', id] })
        })
    }
  }, [process, id, queryClient])

  const handlePhaseClick = useCallback((phaseId: number) => {
    setActivePhaseOverride(phaseId)
    const phase = PHASES[phaseId - 1]
    if (!phase) return
    // Navigate to the first step of that phase that's reachable
    const firstReachable = phase.steps.find(s => s <= processStep) ?? phase.steps[0]
    // If viewing a completed phase, show the last step
    const status = getPhaseStatus(phaseId, processStep, process?.status ?? 'draft')
    if (status === 'completed') {
      setActiveStep(Math.max(...phase.steps.filter(s => s <= processStep)))
    } else {
      setActiveStep(Math.min(processStep, Math.max(...phase.steps)))
    }
  }, [processStep, process?.status])

  const handleSubStepClick = useCallback((step: number) => {
    prevStepRef.current = step
    setActiveStep(step)
  }, [])

  // Check if we should show the waiting banner
  const showWaitingBanner = process && (
    process.status === 'attente_stock' ||
    (processStep === 4 && currentPhaseId === 1 && process.status === 'exporting_wholesalers')
  )

  if (isLoading) {
    return (
      <div className="p-4 md:p-7 lg:p-8 space-y-5 max-w-[1200px] mx-auto ivory-page-glow">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (!process) {
    return (
      <div className="p-4 md:p-7 lg:p-8 text-center max-w-[1200px] mx-auto ivory-page-glow">
        <p style={{ color: 'var(--ivory-text-muted)' }}>Processus introuvable</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate('/monthly-processes')}>
          Retour
        </Button>
      </div>
    )
  }

  const monthName = MONTH_NAMES[process.month - 1] ?? ''

  return (
    <div className="p-4 md:p-7 lg:p-8 space-y-5 max-w-[1200px] mx-auto ivory-page-glow overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10"
      >
        <div className="flex items-center gap-1.5 text-[12px] mb-4" style={{ color: 'var(--ivory-text-muted)' }}>
          <Link to="/monthly-processes" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Processus Mensuels
          </Link>
          <span>/</span>
          <span>{monthName} {process.year}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.08))' }}>
              <CalendarRange className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div className="min-w-0">
              <h2 className="ivory-heading text-xl md:text-2xl truncate">
                {monthName} {process.year}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                <Badge variant={process.status === 'completed' ? 'default' : 'secondary'} className="text-[10px] h-5">
                  {STATUS_LABELS[process.status] ?? process.status}
                </Badge>
                <span className="text-[11px] sm:text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                  Etape {processStep}/9
                  {' '}&middot;{' '}
                  {process.orders_count} cmd / {process.allocations_count} alloc
                  {process.date_ouverture && (
                    <> &middot; {new Date(process.date_ouverture).toLocaleDateString('fr-FR')}</>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StepQualityScore process={process} step={currentStep} />
            {process.status !== 'completed' && (
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive rounded-xl" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Demo data loader — dev only */}
      <DemoDataLoader />

      {/* Phase Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <PhaseTabBar
          currentStep={processStep}
          processStatus={process.status}
          activePhase={currentPhaseId}
          onPhaseClick={handlePhaseClick}
          completedSteps={stepStats}
        />
      </motion.div>

      {/* Waiting stock banner (between phase 1 and 2) */}
      {showWaitingBanner && currentPhaseId <= 2 && (
        <WaitingStockBanner
          processMonth={process.month}
          processYear={process.year}
          ordersCount={process.orders_count}
          onSkipToStock={() => {
            advanceStep(5)
            setActivePhaseOverride(2)
          }}
        />
      )}

      {/* Sub-steps for active phase */}
      {currentPhase && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="ivory-glass p-3 md:p-4 overflow-x-auto">
            <div className="flex items-center justify-between gap-3">
              <PhaseSubSteps
                steps={currentPhase.steps}
                currentStep={processStep}
                activeStep={currentStep}
                onStepClick={handleSubStepClick}
                stepStats={stepStats}
              />
              {/* Reopen button for completed phases */}
              {getPhaseStatus(currentPhaseId, processStep, process.status) === 'completed' && process.status !== 'completed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReopenPhaseId(currentPhaseId)}
                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950 gap-1.5 shrink-0 text-xs"
                >
                  <span className="hidden sm:inline">Reouvrir cette phase</span>
                  <span className="sm:hidden">Reouvrir</span>
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div className="h-px" style={{ background: 'rgba(0,0,0,0.06)' }} />

      {/* Step content with animated transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={stepTransition.initial}
          animate={stepTransition.animate}
          exit={stepTransition.exit}
          transition={stepTransition.transition}
        >
          {currentStep === 1 && (
            <QuotaImportStep process={process} onNext={() => advanceStep(2)} />
          )}
          {currentStep === 2 && (
            <OrderImportStep process={process} onNext={() => advanceStep(3)} />
          )}
          {currentStep === 3 && (
            <OrderReviewStep process={process} onNext={() => advanceStep(4)} onBack={() => handleSubStepClick(2)} />
          )}
          {currentStep === 4 && (
            <WholesalerExportStep process={process} onNext={() => advanceStep(5)} />
          )}
          {currentStep === 5 && (
            <StockImportStep process={process} onNext={() => advanceStep(6)} />
          )}
          {currentStep === 6 && (
            <StockAggregationStep process={process} onNext={() => advanceStep(7)} onBack={() => handleSubStepClick(5)} />
          )}
          {currentStep === 7 && (
            <AllocationExecutionStep process={process} onNext={() => advanceStep(8)} />
          )}
          {currentStep === 8 && (
            <AllocationReviewStep process={process} onNext={() => advanceStep(9)} onBack={() => handleSubStepClick(7)} />
          )}
          {currentStep === 9 && (
            <FinalizationStep process={process} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Reopen phase dialog */}
      {reopenPhaseId && (
        <ReopenPhaseDialog
          open={reopenPhaseId !== null}
          onOpenChange={(open) => !open && setReopenPhaseId(null)}
          process={process}
          targetPhaseId={reopenPhaseId}
          onReopened={(newStep) => {
            setActiveStep(newStep)
            setActivePhaseOverride(null)
            setReopenPhaseId(null)
          }}
        />
      )}

      {/* Delete dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer ce processus ?"
        description="Cette action est irreversible. Toutes les commandes et allocations associees seront supprimees."
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
        variant="destructive"
      />
    </div>
  )
}
