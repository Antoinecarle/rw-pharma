import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import ProcessStepper from '@/components/monthly-process/ProcessStepper'
import StepQualityScore from '@/components/monthly-process/StepQualityScore'
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
  importing: 'Importation',
  reviewing_orders: 'Revue commandes',
  allocating: 'Allocation',
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
      <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!process) {
    return (
      <div className="p-4 md:p-6 lg:p-8 text-center">
        <p className="text-muted-foreground">Processus introuvable</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/monthly-processes')}>
          Retour
        </Button>
      </div>
    )
  }

  const monthName = MONTH_NAMES[process.month - 1] ?? ''

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Link to="/monthly-processes" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Processus Mensuels
          </Link>
          <span>/</span>
          <span>{monthName} {process.year}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Allocation - {monthName} {process.year}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant={process.status === 'completed' ? 'default' : 'secondary'}>
                {STATUS_LABELS[process.status] ?? process.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {process.orders_count} commandes / {process.allocations_count} allocations
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quality Score */}
            <StepQualityScore process={process} step={currentStep} />

            {process.status !== 'completed' && (
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
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
        <Card>
          <CardContent className="p-4 md:p-5">
            <ProcessStepper
              currentStep={currentStep}
              onStepClick={(step) => {
                prevStepRef.current = step
                setActiveStep(step)
              }}
              stepStats={(() => {
                const stats: Record<number, { value: string | number; label: string }> = {}
                if (process.orders_count > 0) stats[1] = { value: process.orders_count, label: 'commandes' }
                if (process.orders_count > 0 && currentStep > 2) stats[2] = { value: 'validees', label: '' }
                if (process.allocations_count > 0) stats[3] = { value: process.allocations_count, label: 'allocations' }
                if (process.allocations_count > 0 && currentStep > 4) stats[4] = { value: 'confirmees', label: '' }
                return stats
              })()}
            />
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

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
            <OrderImportStep process={process} onNext={() => advanceStep(2)} />
          )}
          {currentStep === 2 && (
            <OrderReviewStep process={process} onNext={() => advanceStep(3)} onBack={() => setActiveStep(1)} />
          )}
          {currentStep === 3 && (
            <AllocationExecutionStep process={process} onNext={() => advanceStep(4)} />
          )}
          {currentStep === 4 && (
            <AllocationReviewStep process={process} onNext={() => advanceStep(5)} onBack={() => setActiveStep(3)} />
          )}
          {currentStep === 5 && (
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
