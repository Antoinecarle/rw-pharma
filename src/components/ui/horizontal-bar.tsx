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

/** Returns a color based on completion percentage */
function completionColor(pct: number): string {
  if (pct >= 90) return '#22c55e' // green
  if (pct >= 70) return '#84cc16' // lime
  if (pct >= 50) return '#f59e0b' // amber
  if (pct >= 30) return '#f97316' // orange
  return '#ef4444' // red
}

interface HorizontalBarChartProps {
  items: BarItem[]
  maxValue?: number
  className?: string
  formatValue?: (v: number, item?: BarItem) => string
  /** When true, value is treated as a percentage (0-100), bars fill to that %, colors reflect completion level */
  completionMode?: boolean
}

export default function HorizontalBarChart({
  items,
  maxValue,
  className = '',
  formatValue = (v) => v.toLocaleString('fr-FR'),
  completionMode = false,
}: HorizontalBarChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-20px' })
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1)

  return (
    <div ref={ref} className={`space-y-2 ${className}`}>
      {items.map((item, i) => {
        const pct = completionMode
          ? Math.min(item.value, 100)
          : (item.value / max) * 100
        const color = completionMode
          ? completionColor(item.value)
          : (item.color ?? hashColor(item.code))
        return (
          <div key={item.code} className="flex items-center gap-2 sm:gap-3 group min-w-0">
            <div className="w-10 sm:w-12 text-right shrink-0">
              <span className="text-xs font-bold text-foreground">{item.code}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] text-muted-foreground truncate">{item.label}</span>
              </div>
              <div className="h-5 bg-muted/50 rounded-md overflow-hidden relative">
                <motion.div
                  className="h-full rounded-md"
                  style={{ backgroundColor: color }}
                  initial={{ width: 0 }}
                  animate={isInView ? { width: `${pct}%` } : { width: 0 }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
                />
              </div>
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
