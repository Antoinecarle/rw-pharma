import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Check, FileUp, ClipboardCheck, Cpu, SearchCheck, Flag, BarChart3, Send, PackageCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const STEPS = [
  { label: 'Import Quotas', shortLabel: 'Quotas', icon: BarChart3 },
  { label: 'Import Commandes', shortLabel: 'Commandes', icon: FileUp },
  { label: 'Revue Commandes', shortLabel: 'Revue', icon: ClipboardCheck },
  { label: 'Allocation Macro', shortLabel: 'Macro', icon: Cpu },
  { label: 'Export Grossistes', shortLabel: 'Export', icon: Send },
  { label: 'Reception Stocks', shortLabel: 'Stocks', icon: PackageCheck },
  { label: 'Allocation Lots', shortLabel: 'Lots', icon: SearchCheck },
  { label: 'Finalisation', shortLabel: 'Final', icon: Flag },
]

interface StepStat {
  label: string
  value: string | number
}

interface ProcessStepperProps {
  currentStep: number
  onStepClick?: (step: number) => void
  stepStats?: Record<number, StepStat>
}

function StepCircle({ stepNum, isCompleted, isCurrent }: { stepNum: number; isCompleted: boolean; isCurrent: boolean }) {
  return (
    <motion.div
      className={cn(
        'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold transition-colors relative',
        isCompleted && 'bg-primary text-primary-foreground',
        isCurrent && 'bg-primary text-primary-foreground',
        !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
      )}
      animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
      transition={isCurrent ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      {isCurrent && (
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/20"
          animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {isCompleted ? (
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Check className="h-4 w-4" />
        </motion.div>
      ) : (
        <span className="relative z-10">{stepNum}</span>
      )}
    </motion.div>
  )
}

function Connector({ filled, delay }: { filled: boolean; delay: number }) {
  return (
    <div className="flex-1 h-0.5 min-w-3 mx-0.5 bg-muted rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-primary rounded-full"
        initial={{ width: '0%' }}
        animate={{ width: filled ? '100%' : '0%' }}
        transition={{ duration: 0.5, delay }}
      />
    </div>
  )
}

export default function ProcessStepper({ currentStep, onStepClick, stepStats }: ProcessStepperProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-full">
        {/* Large desktop — full horizontal stepper with labels */}
        <div className="hidden xl:flex items-center gap-0">
          {STEPS.map((step, i) => {
            const stepNum = i + 1
            const isCompleted = stepNum < currentStep
            const isCurrent = stepNum === currentStep
            const isClickable = onStepClick && stepNum <= currentStep
            const stat = stepStats?.[stepNum]

            return (
              <div key={stepNum} className="flex items-center flex-1 last:flex-none">
                <motion.button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick(stepNum)}
                  whileHover={isClickable ? { scale: 1.03 } : undefined}
                  whileTap={isClickable ? { scale: 0.97 } : undefined}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all whitespace-nowrap',
                    isClickable && 'cursor-pointer hover:bg-muted',
                    !isClickable && 'cursor-default'
                  )}
                >
                  <StepCircle stepNum={stepNum} isCompleted={isCompleted} isCurrent={isCurrent} />
                  <div className="text-left">
                    <p className={cn(
                      'text-[11px] font-medium leading-tight',
                      isCurrent ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {step.label}
                    </p>
                    {isCompleted && stat && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[9px] text-primary font-medium leading-tight mt-0.5"
                      >
                        {stat.value} {stat.label}
                      </motion.p>
                    )}
                  </div>
                </motion.button>
                {i < STEPS.length - 1 && (
                  <Connector filled={stepNum < currentStep} delay={i * 0.1} />
                )}
              </div>
            )
          })}
        </div>

        {/* Medium desktop — 2 rows of 4 with icons + short labels */}
        <div className="hidden md:grid xl:hidden grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-y-3 gap-x-0">
          {[0, 4].map((rowStart) => (
            STEPS.slice(rowStart, rowStart + 4).map((step, i) => {
              const stepNum = rowStart + i + 1
              const isCompleted = stepNum < currentStep
              const isCurrent = stepNum === currentStep
              const isClickable = onStepClick && stepNum <= currentStep
              const stat = stepStats?.[stepNum]
              const isLastInRow = i === 3

              return [
                <motion.button
                  key={`step-${stepNum}`}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick(stepNum)}
                  whileHover={isClickable ? { scale: 1.03 } : undefined}
                  whileTap={isClickable ? { scale: 0.97 } : undefined}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all',
                    isCurrent && 'bg-primary/8',
                    isClickable && 'cursor-pointer hover:bg-muted',
                    !isClickable && 'cursor-default'
                  )}
                >
                  <StepCircle stepNum={stepNum} isCompleted={isCompleted} isCurrent={isCurrent} />
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <step.icon className={cn('h-3.5 w-3.5 shrink-0', isCurrent ? 'text-primary' : 'text-muted-foreground')} />
                      <p className={cn(
                        'text-[11px] font-medium leading-tight truncate',
                        isCurrent ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {step.shortLabel}
                      </p>
                    </div>
                    {isCompleted && stat && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[9px] text-primary font-medium leading-tight mt-0.5 ml-5"
                      >
                        {stat.value} {stat.label}
                      </motion.p>
                    )}
                  </div>
                </motion.button>,
                !isLastInRow && (
                  <div key={`conn-${stepNum}`} className="flex items-center px-0.5">
                    <Connector filled={stepNum < currentStep} delay={i * 0.1} />
                  </div>
                ),
              ]
            })
          ))}
          {/* Row connector: arrow between row 1 and row 2 */}
          <div className="col-span-full flex justify-center -my-1">
            <div className="flex items-center gap-1 text-muted-foreground/50">
              <div className="w-8 h-0.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: currentStep > 4 ? '100%' : '0%' }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>

        {/* Mobile — compact: current step prominent + mini progress dots */}
        <div className="md:hidden space-y-3">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => {
              const stepNum = i + 1
              const isCompleted = stepNum < currentStep
              const isCurrent = stepNum === currentStep
              return (
                <Tooltip key={stepNum}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onStepClick && stepNum <= currentStep && onStepClick(stepNum)}
                      className={cn(
                        'transition-all rounded-full',
                        isCurrent ? 'h-2.5 w-6 bg-primary' : 'h-2 w-2',
                        isCompleted && !isCurrent && 'bg-primary/60',
                        !isCompleted && !isCurrent && 'bg-muted',
                        stepNum <= currentStep && 'cursor-pointer'
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {stepNum}. {STEPS[i].label}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          {/* Current step card */}
          {(() => {
            const step = STEPS[currentStep - 1]
            if (!step) return null
            const Icon = step.icon
            return (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/8 border border-primary/15">
                <StepCircle stepNum={currentStep} isCompleted={false} isCurrent={true} />
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Etape {currentStep} sur {STEPS.length}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {currentStep > 1 && (
                    <button
                      type="button"
                      onClick={() => onStepClick?.(currentStep - 1)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                  {currentStep < STEPS.length && currentStep > 1 && (
                    <button
                      type="button"
                      disabled={currentStep >= (stepStats ? Math.max(...Object.keys(stepStats).map(Number), currentStep) : currentStep)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </TooltipProvider>
  )
}
