import { useState, useEffect } from 'react'
import CountUp from 'react-countup'
import { motion } from 'framer-motion'

interface SparklineProps {
  data?: number[]
  color?: string
  className?: string
}

function Sparkline({ data = [], color = 'currentColor', className = '' }: SparklineProps) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 60
  const h = 20
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  })
  return (
    <svg width={w} height={h} className={className} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  )
}

interface AnimatedCounterProps {
  value: number
  duration?: number
  decimals?: number
  suffix?: string
  prefix?: string
  delta?: number | null
  sparklineData?: number[]
  sparklineColor?: string
  className?: string
  valueClassName?: string
}

export default function AnimatedCounter({
  value,
  duration = 1.2,
  decimals = 0,
  suffix = '',
  prefix = '',
  delta = null,
  sparklineData,
  sparklineColor = 'hsl(var(--primary))',
  className = '',
  valueClassName = '',
}: AnimatedCounterProps) {
  const [ready, setReady] = useState(false)

  // Trigger animation shortly after mount — no IntersectionObserver needed
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <motion.div
      className={`flex items-center gap-2 ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <span className={valueClassName}>
        <CountUp
          key={value}
          start={0}
          end={value}
          duration={ready ? duration : 0}
          decimals={decimals}
          separator=" "
          prefix={prefix}
          suffix={suffix}
        />
      </span>

      {delta != null && delta !== 0 && (
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
            delta > 0
              ? 'text-emerald-700 bg-emerald-50'
              : 'text-red-700 bg-red-50'
          }`}
        >
          {delta > 0 ? '+' : ''}{delta}
        </span>
      )}

      {sparklineData && sparklineData.length >= 2 && (
        <Sparkline data={sparklineData} color={sparklineColor} className="opacity-60" />
      )}
    </motion.div>
  )
}
