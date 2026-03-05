import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

interface ProgressRingProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  className?: string
  color?: string
  trackColor?: string
  showValue?: boolean
  label?: string
}

export default function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  className = '',
  color = 'hsl(var(--primary))',
  trackColor = 'hsl(var(--muted))',
  showValue = true,
  label,
}: ProgressRingProps) {
  const ref = useRef<SVGSVGElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-20px' })

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedValue = Math.min(Math.max(value, 0), 100)

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg ref={ref} width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={isInView ? { strokeDashoffset: circumference * (1 - clampedValue / 100) } : { strokeDashoffset: circumference }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold leading-none">{Math.round(clampedValue)}%</span>
          {label && <span className="text-[8px] text-muted-foreground mt-0.5">{label}</span>}
        </div>
      )}
    </div>
  )
}
