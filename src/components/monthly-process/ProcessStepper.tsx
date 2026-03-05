import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Check, FileUp, ClipboardCheck, Cpu, SearchCheck, Flag } from 'lucide-react'

const STEPS = [
  { label: 'Import Commandes', icon: FileUp },
  { label: 'Revue Commandes', icon: ClipboardCheck },
  { label: 'Allocation', icon: Cpu },
  { label: 'Revue Allocations', icon: SearchCheck },
  { label: 'Finalisation', icon: Flag },
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

export default function ProcessStepper({ currentStep, onStepClick, stepStats }: ProcessStepperProps) {
  return (
    <div className="w-full">
      {/* Desktop stepper */}
      <div className="hidden md:flex items-center gap-0">
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
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap',
                  isClickable && 'cursor-pointer hover:bg-muted',
                  !isClickable && 'cursor-default'
                )}
              >
                <motion.div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors relative',
                    isCompleted && 'bg-primary text-primary-foreground',
                    isCurrent && 'bg-primary text-primary-foreground',
                    !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                  )}
                  animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
                  transition={isCurrent ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                >
                  {/* Glow ring for active step */}
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
                <div className="text-left">
                  <p className={cn(
                    'text-xs font-medium leading-tight',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {step.label}
                  </p>
                  {isCompleted && stat && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-primary font-medium leading-tight mt-0.5"
                    >
                      {stat.value} {stat.label}
                    </motion.p>
                  )}
                </div>
              </motion.button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 min-w-4 mx-1 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: stepNum < currentStep ? '100%' : '0%' }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile stepper */}
      <div className="md:hidden space-y-2">
        {STEPS.map((step, i) => {
          const stepNum = i + 1
          const isCompleted = stepNum < currentStep
          const isCurrent = stepNum === currentStep
          const isClickable = onStepClick && stepNum <= currentStep
          const stat = stepStats?.[stepNum]

          return (
            <motion.button
              key={stepNum}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(stepNum)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left',
                isCurrent && 'bg-primary/10 border border-primary/20',
                isCompleted && 'opacity-60',
                !isCurrent && !isCompleted && 'opacity-40',
                isClickable && 'cursor-pointer'
              )}
            >
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold relative',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary text-primary-foreground',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                )}
              >
                {isCurrent && (
                  <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                )}
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : <span className="relative z-10">{stepNum}</span>}
              </div>
              <step.icon className={cn('h-4 w-4 shrink-0', isCurrent ? 'text-primary' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0">
                <span className={cn('text-sm font-medium', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                  {step.label}
                </span>
                {isCompleted && stat && (
                  <p className="text-[10px] text-primary font-medium">{stat.value} {stat.label}</p>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
