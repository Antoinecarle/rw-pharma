import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Check, ShoppingCart, Warehouse, Flag, Clock } from 'lucide-react'
import type { MonthlyProcessPhase } from '@/types/database'

export interface PhaseDefinition {
  id: number
  label: string
  shortLabel: string
  icon: typeof ShoppingCart
  phase: MonthlyProcessPhase
  steps: number[] // 1-indexed step numbers belonging to this phase
}

export const PHASES: PhaseDefinition[] = [
  {
    id: 1,
    label: 'Commandes',
    shortLabel: 'Cmd',
    icon: ShoppingCart,
    phase: 'commandes',
    steps: [1, 2, 3, 4],
  },
  {
    id: 2,
    label: 'Collecte & Allocation',
    shortLabel: 'Alloc',
    icon: Warehouse,
    phase: 'collecte', // covers collecte + allocation DB phases
    steps: [5, 6, 7],
  },
  {
    id: 3,
    label: 'Livraison & Cloture',
    shortLabel: 'Export',
    icon: Flag,
    phase: 'cloture',
    steps: [8, 9],
  },
]

/** Given a 1-indexed step, return which phase (1-3) it belongs to */
export function getPhaseForStep(step: number): number {
  for (const p of PHASES) {
    if (p.steps.includes(step)) return p.id
  }
  return 1
}

/** Compute phase status from current step */
export type PhaseStatus = 'future' | 'active' | 'completed' | 'waiting'

export function getPhaseStatus(phaseId: number, currentStep: number, processStatus: string): PhaseStatus {
  const phase = PHASES[phaseId - 1]
  if (!phase) return 'future'

  // When process is fully completed, all phases are completed
  if (processStatus === 'completed') return 'completed'

  const maxStep = Math.max(...phase.steps)
  const minStep = Math.min(...phase.steps)

  // Special: waiting state between phase 1 and 2
  if (phaseId === 2 && processStatus === 'attente_stock') return 'waiting'

  if (currentStep > maxStep) return 'completed'
  if (currentStep >= minStep && currentStep <= maxStep) return 'active'
  return 'future'
}

interface PhaseTabBarProps {
  currentStep: number
  processStatus: string
  activePhase: number
  onPhaseClick: (phaseId: number) => void
  completedSteps?: Record<number, { value: string | number; label: string }>
}

const STATUS_COLORS: Record<PhaseStatus, string> = {
  future: 'border-border text-muted-foreground bg-transparent',
  active: 'border-primary/40 text-foreground bg-primary/5',
  completed: 'border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 bg-green-50/50 dark:bg-green-950/30',
  waiting: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30',
}

const STATUS_ICONS: Record<PhaseStatus, typeof Check | null> = {
  future: null,
  active: null,
  completed: Check,
  waiting: Clock,
}

export default function PhaseTabBar({ currentStep, processStatus, activePhase, onPhaseClick }: PhaseTabBarProps) {
  return (
    <div className="w-full">
      {/* Desktop / Tablet */}
      <div className="hidden sm:flex items-stretch gap-2">
        {PHASES.map((phase) => {
          const status = getPhaseStatus(phase.id, currentStep, processStatus)
          const isSelected = activePhase === phase.id
          const isClickable = status !== 'future'
          const StatusIcon = STATUS_ICONS[status]
          const Icon = phase.icon

          // Count completed steps in this phase
          const completedInPhase = phase.steps.filter(s => s < currentStep).length
          const totalInPhase = phase.steps.length

          return (
            <motion.button
              key={phase.id}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onPhaseClick(phase.id)}
              whileHover={isClickable ? { y: -1 } : undefined}
              whileTap={isClickable ? { scale: 0.98 } : undefined}
              className={cn(
                'flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all relative',
                STATUS_COLORS[status],
                isSelected && status === 'active' && 'ring-2 ring-primary/20 border-primary',
                isSelected && status === 'completed' && 'ring-2 ring-green-200 dark:ring-green-800',
                isSelected && status === 'waiting' && 'ring-2 ring-amber-200 dark:ring-amber-800',
                !isClickable && 'opacity-50 cursor-not-allowed',
                isClickable && 'cursor-pointer',
              )}
            >
              <div className={cn(
                'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                status === 'completed' && 'bg-green-100 dark:bg-green-900',
                status === 'active' && 'bg-primary/10',
                status === 'waiting' && 'bg-amber-100 dark:bg-amber-900',
                status === 'future' && 'bg-muted',
              )}>
                {StatusIcon ? (
                  <StatusIcon className="h-4 w-4" />
                ) : (
                  <Icon className={cn('h-4 w-4', status === 'active' ? 'text-primary' : 'text-muted-foreground')} />
                )}
              </div>
              <div className="text-left min-w-0 flex-1">
                <p className={cn(
                  'text-sm font-semibold leading-tight truncate',
                  status === 'future' && 'text-muted-foreground',
                )}>
                  Phase {phase.id} — {phase.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {status === 'completed' && `${totalInPhase}/${totalInPhase} etapes`}
                  {status === 'active' && `${completedInPhase}/${totalInPhase} etapes`}
                  {status === 'waiting' && 'En attente des grossistes'}
                  {status === 'future' && `${totalInPhase} etapes`}
                </p>
              </div>
              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  layoutId="phase-indicator"
                  className="absolute -bottom-[2px] left-4 right-4 h-[3px] rounded-full bg-current"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Mobile */}
      <div className="sm:hidden flex items-center gap-1.5">
        {PHASES.map((phase) => {
          const status = getPhaseStatus(phase.id, currentStep, processStatus)
          const isSelected = activePhase === phase.id
          const isClickable = status !== 'future'
          const Icon = phase.icon

          return (
            <button
              key={phase.id}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onPhaseClick(phase.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all text-xs font-medium',
                STATUS_COLORS[status],
                isSelected && 'ring-2 ring-primary/20 border-primary',
                !isClickable && 'opacity-50 cursor-not-allowed',
              )}
            >
              {status === 'completed' ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span className="truncate">{phase.shortLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
