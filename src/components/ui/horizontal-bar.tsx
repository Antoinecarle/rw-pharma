import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

interface BarItem {
  label: string
  code: string
  value: number
  color?: string
}

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

interface HorizontalBarChartProps {
  items: BarItem[]
  maxValue?: number
  className?: string
  formatValue?: (v: number, item?: BarItem) => string
}

export default function HorizontalBarChart({
  items,
  maxValue,
  className = '',
  formatValue = (v) => v.toLocaleString('fr-FR'),
}: HorizontalBarChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-20px' })
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1)

  return (
    <div ref={ref} className={`space-y-2 ${className}`}>
      {items.map((item, i) => {
        const color = item.color ?? hashColor(item.code)
        const pct = (item.value / max) * 100
        return (
          <div key={item.code} className="flex items-center gap-2 sm:gap-3 group min-w-0">
            <div className="w-10 sm:w-12 text-right shrink-0">
              <span className="text-xs font-bold text-foreground">{item.code}</span>
            </div>
            <div className="flex-1 h-6 bg-muted/50 rounded-md overflow-hidden relative min-w-0">
              <motion.div
                className="h-full rounded-md"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={isInView ? { width: `${pct}%` } : { width: 0 }}
                transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-foreground/70 truncate max-w-[60%]">
                {item.label}
              </span>
            </div>
            <div className="w-auto sm:w-16 text-right shrink-0">
              <span className="text-[10px] sm:text-xs font-bold tabular-nums">{formatValue(item.value, item)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
