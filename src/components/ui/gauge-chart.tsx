import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

interface GaugeChartProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  label?: string
  className?: string
}

export default function GaugeChart({
  value,
  size = 140,
  strokeWidth = 12,
  label = '',
  className = '',
}: GaugeChartProps) {
  const ref = useRef<SVGSVGElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-30px' })

  const clampedValue = Math.min(Math.max(value, 0), 100)
  const radius = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2 + 10

  // Semi-circle: from 180deg to 0deg (left to right)
  const startAngle = Math.PI
  const endAngle = 0
  const sweepAngle = startAngle - endAngle
  const circumference = radius * sweepAngle

  const startX = cx + radius * Math.cos(startAngle)
  const startY = cy - radius * Math.sin(startAngle)
  const endX = cx + radius * Math.cos(endAngle)
  const endY = cy - radius * Math.sin(endAngle)

  const bgPath = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`

  // Color based on value
  const getColor = (v: number) => {
    if (v >= 90) return '#22c55e' // green-500
    if (v >= 70) return '#f59e0b' // amber-500
    if (v >= 50) return '#f97316' // orange-500
    return '#ef4444' // red-500
  }

  const color = getColor(clampedValue)

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg ref={ref} width={size} height={size * 0.6 + 10} viewBox={`0 0 ${size} ${cy + 5}`}>
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Colored zones (subtle) */}
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path
          d={bgPath}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <motion.path
          d={bgPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={isInView ? { strokeDashoffset: circumference * (1 - clampedValue / 100) } : { strokeDashoffset: circumference }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
        />
        {/* Center value */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: size * 0.18, fontWeight: 700 }}
        >
          {clampedValue.toFixed(1)}%
        </text>
        {label && (
          <text
            x={cx}
            y={cy + 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: size * 0.08 }}
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  )
}
