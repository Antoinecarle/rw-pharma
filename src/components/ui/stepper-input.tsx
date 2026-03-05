import { motion } from 'framer-motion'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StepperInputProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  presets?: { label: string; value: number }[]
  suffix?: string
  placeholder?: string
  className?: string
}

export default function StepperInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  presets = [],
  suffix = '',
  placeholder = '',
  className = '',
}: StepperInputProps) {
  const displayValue = value ?? 0

  const increment = () => {
    const next = Math.min(displayValue + step, max)
    onChange(next)
  }

  const decrement = () => {
    const next = Math.max(displayValue - step, min)
    onChange(next)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={decrement}
          disabled={displayValue <= min}
          className={cn(
            'h-9 w-9 rounded-lg border flex items-center justify-center transition-all',
            'hover:bg-muted active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed'
          )}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1 text-center">
          <motion.span
            key={displayValue}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg font-bold tabular-nums"
          >
            {value != null ? `${displayValue}${suffix}` : placeholder || '-'}
          </motion.span>
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={displayValue >= max}
          className={cn(
            'h-9 w-9 rounded-lg border flex items-center justify-center transition-all',
            'hover:bg-muted active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed'
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {presets.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                value === preset.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
