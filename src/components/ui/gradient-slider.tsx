import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

interface GradientSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  zones?: { label: string; max: number }[]
  className?: string
}

export default function GradientSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = '%',
  zones = [
    { label: 'Conservateur', max: 20 },
    { label: 'Modere', max: 50 },
    { label: 'Agressif', max: 100 },
  ],
  className = '',
}: GradientSliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  const activeZone = zones.find(z => value <= z.max) ?? zones[zones.length - 1]

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{activeZone.label}</span>
        <span className="text-sm font-bold tabular-nums">
          {value}{suffix}
        </span>
      </div>

      <SliderPrimitive.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full">
          {/* Gradient background */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, #22c55e 0%, #f59e0b 50%, #ef4444 100%)',
              opacity: 0.2,
            }}
          />
          {/* Active track */}
          <SliderPrimitive.Range
            className="absolute h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, #22c55e 0%, ${
                pct < 50 ? '#f59e0b' : '#ef4444'
              } 100%)`,
            }}
          />
        </SliderPrimitive.Track>

        <SliderPrimitive.Thumb
          className={cn(
            'block h-5 w-5 rounded-full border-2 bg-background shadow-md ring-offset-background',
            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'hover:scale-110 active:scale-95 cursor-grab active:cursor-grabbing',
            pct < 33 ? 'border-emerald-500' : pct < 66 ? 'border-amber-500' : 'border-red-500'
          )}
        />
      </SliderPrimitive.Root>

      {/* Zone labels */}
      <div className="flex justify-between">
        {zones.map((zone, i) => (
          <span
            key={i}
            className={cn(
              'text-[10px]',
              activeZone === zone ? 'text-foreground font-medium' : 'text-muted-foreground/50'
            )}
          >
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  )
}
