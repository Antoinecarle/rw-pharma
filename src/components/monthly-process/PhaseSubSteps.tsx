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
      <div className="flex items-center gap-1">
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
            <div key={stepNum} className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && onStepClick(stepNum)}
                    whileHover={isClickable ? { scale: 1.02 } : undefined}
                    whileTap={isClickable ? { scale: 0.97 } : undefined}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg transition-all relative',
                      isActive && 'bg-primary/10 ring-1 ring-primary/20',
                      !isActive && isClickable && 'hover:bg-muted cursor-pointer',
                      !isClickable && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {/* Step circle */}
                    <div className={cn(
                      'h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold transition-colors',
                      isCompleted && 'bg-green-500 text-white',
                      isCurrent && !isActive && 'bg-primary/20 text-primary',
                      isCurrent && isActive && 'bg-primary text-primary-foreground',
                      !isCompleted && !isCurrent && 'bg-muted text-muted-foreground',
                    )}>
                      {isCompleted ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <span>{stepNum}</span>
                      )}
                    </div>

                    {/* Icon + label (hidden on small) */}
                    <Icon className={cn(
                      'h-3.5 w-3.5 shrink-0 hidden sm:block',
                      isActive ? 'text-primary' : 'text-muted-foreground',
                    )} />
                    <span className={cn(
                      'text-xs font-medium hidden md:block',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}>
                      {stepDef.shortLabel}
                    </span>

                    {/* Stat badge */}
                    {isCompleted && stat && (
                      <span className="text-[9px] text-green-600 font-semibold hidden lg:block">
                        {stat.value}
                      </span>
                    )}

                    {/* Active indicator line */}
                    {isActive && (
                      <motion.div
                        layoutId="substep-indicator"
                        className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">{stepDef.label}</p>
                  {stat && <p className="text-primary">{stat.value} {stat.label}</p>}
                  {!isClickable && <p className="text-muted-foreground">Etape non atteinte</p>}
                </TooltipContent>
              </Tooltip>

              {/* Connector */}
              {i < steps.length - 1 && (
                <div className="w-4 h-0.5 bg-muted rounded-full overflow-hidden mx-0.5">
                  <motion.div
                    className="h-full bg-green-500 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: stepNum < currentStep ? '100%' : '0%' }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
