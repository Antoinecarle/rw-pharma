import { cn } from '@/lib/utils'
import { Check, FileUp, ClipboardCheck, Cpu, SearchCheck, Flag } from 'lucide-react'

const STEPS = [
  { label: 'Importation des Commandes', icon: FileUp },
  { label: 'Revue des Commandes', icon: ClipboardCheck },
  { label: 'Lancement de l\'Allocation', icon: Cpu },
  { label: 'Revue des Allocations', icon: SearchCheck },
  { label: 'Finalisation', icon: Flag },
]

interface ProcessStepperProps {
  currentStep: number
  onStepClick?: (step: number) => void
}

export default function ProcessStepper({ currentStep, onStepClick }: ProcessStepperProps) {
  return (
    <div className="w-full">
      {/* Desktop stepper */}
      <div className="hidden md:flex items-center gap-0">
        {STEPS.map((step, i) => {
          const stepNum = i + 1
          const isCompleted = stepNum < currentStep
          const isCurrent = stepNum === currentStep
          const isClickable = onStepClick && stepNum <= currentStep

          return (
            <div key={stepNum} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(stepNum)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap',
                  isClickable && 'cursor-pointer hover:bg-muted',
                  !isClickable && 'cursor-default'
                )}
              >
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all',
                    isCompleted && 'bg-primary text-primary-foreground',
                    isCurrent && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                    !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <div className="text-left">
                  <p className={cn(
                    'text-xs font-medium leading-tight',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {step.label}
                  </p>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 min-w-4 mx-1',
                  stepNum < currentStep ? 'bg-primary' : 'bg-muted'
                )} />
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

          return (
            <button
              key={stepNum}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(stepNum)}
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
                  'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary text-primary-foreground',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : stepNum}
              </div>
              <step.icon className={cn('h-4 w-4 shrink-0', isCurrent ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('text-sm font-medium', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
