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
import ProcessStepper from '@/components/monthly-process/ProcessStepper'
import StepQualityScore from '@/components/monthly-process/StepQualityScore'
import QuotaImportStep from '@/components/monthly-process/steps/QuotaImportStep'
import OrderImportStep from '@/components/monthly-process/steps/OrderImportStep'
import OrderReviewStep from '@/components/monthly-process/steps/OrderReviewStep'
import AllocationExecutionStep from '@/components/monthly-process/steps/AllocationExecutionStep'
import AllocationReviewStep from '@/components/monthly-process/steps/AllocationReviewStep'
import FinalizationStep from '@/components/monthly-process/steps/FinalizationStep'
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
  macro_allocating: 'Allocation macro',
  exporting_wholesalers: 'Export grossistes',
  collecting_stock: 'Reception stocks',
  allocating_lots: 'Allocation lots',
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

export default function MonthlyProcessDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
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

  const currentStep = activeStep ?? process?.current_step ?? 1

  const advanceStep = useCallback((targetStep: number) => {
    // Fire confetti when advancing forward (completing a step)
    if (targetStep > prevStepRef.current) {
      fireConfetti()
    }
    prevStepRef.current = targetStep
    setActiveStep(targetStep)
    if (process) {
      supabase
        .from('monthly_processes')
        .update({ current_step: Math.max(targetStep, process.current_step) })
        .eq('id', process.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['monthly-processes', id] })
        })
    }
  }, [process, id, queryClient])

  if (isLoading) {
    return (
      <div className="p-5 md:p-7 lg:p-8 space-y-5 max-w-[1200px] mx-auto ivory-page-glow">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (!process) {
    return (
      <div className="p-5 md:p-7 lg:p-8 text-center max-w-[1200px] mx-auto ivory-page-glow">
        <p style={{ color: 'var(--ivory-text-muted)' }}>Processus introuvable</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate('/monthly-processes')}>
          Retour
        </Button>
      </div>
    )
  }

  const monthName = MONTH_NAMES[process.month - 1] ?? ''

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
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

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 flex-1">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.08))' }}>
              <CalendarRange className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">
                Allocation - {monthName} {process.year}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={process.status === 'completed' ? 'default' : 'secondary'} className="text-[10px] h-5">
                  {STATUS_LABELS[process.status] ?? process.status}
                </Badge>
                <span className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                  {process.orders_count} commandes / {process.allocations_count} allocations
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StepQualityScore process={process} step={currentStep} />

            {process.status !== 'completed' && (
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive rounded-xl" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stepper */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="ivory-glass p-4 md:p-5">
            <ProcessStepper
              currentStep={currentStep}
              onStepClick={(step) => {
                prevStepRef.current = step
                setActiveStep(step)
              }}
              stepStats={(() => {
                const stats: Record<number, { value: string | number; label: string }> = {}
                if ((process.quotas_count ?? 0) > 0) stats[1] = { value: process.quotas_count ?? 0, label: 'quotas' }
                if (process.orders_count > 0) stats[2] = { value: process.orders_count, label: 'commandes' }
                if (process.orders_count > 0 && currentStep > 3) stats[3] = { value: 'validees', label: '' }
                if (process.allocations_count > 0) stats[4] = { value: process.allocations_count, label: 'allocations' }
                if (process.allocations_count > 0 && currentStep > 7) stats[7] = { value: 'confirmees', label: '' }
                return stats
              })()}
            />
        </div>
      </motion.div>

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
            <OrderReviewStep process={process} onNext={() => advanceStep(4)} onBack={() => setActiveStep(2)} />
          )}
          {currentStep === 4 && (
            <AllocationExecutionStep process={process} onNext={() => advanceStep(5)} />
          )}
          {/* Steps 5-6 (Export Grossistes, Reception Stocks) — coming soon */}
          {currentStep === 5 && (
            <div className="ivory-glass p-8 text-center space-y-3">
              <p className="text-lg font-semibold">Export vers Grossistes</p>
              <p className="text-sm text-muted-foreground">Cette etape sera implementee dans la prochaine iteration.</p>
              <Button onClick={() => advanceStep(6)}>Passer a l'etape suivante</Button>
            </div>
          )}
          {currentStep === 6 && (
            <div className="ivory-glass p-8 text-center space-y-3">
              <p className="text-lg font-semibold">Reception des Stocks</p>
              <p className="text-sm text-muted-foreground">Cette etape sera implementee dans la prochaine iteration.</p>
              <Button onClick={() => advanceStep(7)}>Passer a l'etape suivante</Button>
            </div>
          )}
          {currentStep === 7 && (
            <AllocationReviewStep process={process} onNext={() => advanceStep(8)} onBack={() => setActiveStep(6)} />
          )}
          {currentStep === 8 && (
            <FinalizationStep process={process} />
          )}
        </motion.div>
      </AnimatePresence>

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
