import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Check, BarChart3, FileUp, ClipboardCheck, GitMerge, Send, PackageCheck, Layers, Cpu, SearchCheck, Flag, MessageSquare, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface StepDefinition {
  stepNum: number
  label: string
  shortLabel: string
  icon: typeof BarChart3
}

/** All 12 steps with their metadata */
export const ALL_STEPS: StepDefinition[] = [
  { stepNum: 1, label: 'Import Disponibilites', shortLabel: 'Dispos', icon: BarChart3 },
  { stepNum: 2, label: 'Import Commandes', shortLabel: 'Commandes', icon: FileUp },
  { stepNum: 3, label: 'Revue Commandes', shortLabel: 'Revue', icon: ClipboardCheck },
  { stepNum: 4, label: 'Attribution Macro', shortLabel: 'Attribution', icon: GitMerge },
  { stepNum: 5, label: 'Export Grossistes', shortLabel: 'Export', icon: Send },
  { stepNum: 6, label: 'Negociation', shortLabel: 'Nego', icon: MessageSquare },
  { stepNum: 7, label: 'Re-export Grossistes', shortLabel: 'Re-export', icon: RefreshCw },
  { stepNum: 8, label: 'Reception Stocks', shortLabel: 'Stocks', icon: PackageCheck },
  { stepNum: 9, label: 'Aggregation Stock', shortLabel: 'Agregation', icon: Layers },
  { stepNum: 10, label: 'Allocation', shortLabel: 'Allocation', icon: Cpu },
  { stepNum: 11, label: 'Revue Allocations', shortLabel: 'Revue Alloc', icon: SearchCheck },
  { stepNum: 12, label: 'Finalisation', shortLabel: 'Final', icon: Flag },
]

interface PhaseSubStepsProps {
  /** Steps to show (e.g. [1,2,3,4] for phase 1) */
  steps: number[]
  /** The overall current step of the process */
  currentStep: number
  /** Which step is actively displayed */
  activeStep: number
  /** Click handler */
  onStepClick: (step: number) => void
  /** Optional stats per step */
  stepStats?: Record<number, { value: string | number; label: string }>
}

export default function PhaseSubSteps({ steps, currentStep, activeStep, onStepClick, stepStats }: PhaseSubStepsProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-0 bg-muted/40 rounded-xl p-1.5 border border-border/50">
        {steps.map((stepNum, i) => {
          const stepDef = ALL_STEPS[stepNum - 1]
          if (!stepDef) return null

          const isCompleted = stepNum < currentStep
          const isCurrent = stepNum === currentStep
          const isActive = stepNum === activeStep
          const isClickable = stepNum <= currentStep
          const stat = stepStats?.[stepNum]
          const Icon = stepDef.icon

          return (
            <div key={stepNum} className="flex items-center flex-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && onStepClick(stepNum)}
                    whileHover={isClickable ? { y: -1 } : undefined}
                    whileTap={isClickable ? { scale: 0.97 } : undefined}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all relative w-full',
                      isActive && 'bg-background shadow-sm ring-1 ring-border',
                      isActive && isCompleted && 'ring-green-200 dark:ring-green-800',
                      isActive && isCurrent && 'ring-primary/30',
                      !isActive && isClickable && 'hover:bg-background/60 cursor-pointer',
                      !isClickable && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {/* Step indicator */}
                    <div className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-colors',
                      isCompleted && 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400',
                      isCurrent && isActive && 'bg-primary text-primary-foreground',
                      isCurrent && !isActive && 'bg-primary/15 text-primary',
                      !isCompleted && !isCurrent && 'bg-muted text-muted-foreground',
                    )}>
                      {isCompleted ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>

                    {/* Label + stat */}
                    <div className="text-left min-w-0 flex-1">
                      <p className={cn(
                        'text-sm font-semibold leading-tight truncate',
                        isActive ? 'text-foreground' : 'text-muted-foreground',
                        isCompleted && !isActive && 'text-green-700 dark:text-green-400',
                      )}>
                        {stepDef.label}
                      </p>
                      {stat && (
                        <p className={cn(
                          'text-[11px] mt-0.5 font-medium',
                          isCompleted ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground',
                        )}>
                          {stat.value} {stat.label}
                        </p>
                      )}
                      {!stat && isCurrent && (
                        <p className="text-[11px] mt-0.5 text-primary font-medium">
                          En cours
                        </p>
                      )}
                      {!stat && isCompleted && (
                        <p className="text-[11px] mt-0.5 text-green-600 dark:text-green-500 font-medium">
                          Termine
                        </p>
                      )}
                    </div>

                    {/* Completed badge */}
                    {isCompleted && (
                      <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    )}
                    {isCurrent && (
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                    )}
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">Etape {stepNum} — {stepDef.label}</p>
                  {stat && <p className="text-primary">{stat.value} {stat.label}</p>}
                  {!isClickable && <p className="text-muted-foreground">Etape non atteinte</p>}
                </TooltipContent>
              </Tooltip>

              {/* Connector */}
              {i < steps.length - 1 && (
                <div className="flex flex-col items-center mx-1 shrink-0">
                  <div className="w-8 h-[2px] rounded-full overflow-hidden bg-border">
                    <motion.div
                      className="h-full bg-green-500 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: stepNum < currentStep ? '100%' : '0%' }}
                      transition={{ duration: 0.4, delay: i * 0.08 }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
