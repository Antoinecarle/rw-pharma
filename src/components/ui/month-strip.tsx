import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MonthStripProps {
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
  months: string[] // Array of YYYY-MM-DD
  className?: string
}

export default function MonthStrip({ value, onChange, months, className = '' }: MonthStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Scroll active month into view
    const el = scrollRef.current?.querySelector('[data-active="true"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [value])

  const scroll = (dir: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })
    }
  }

  const formatMonth = (m: string) => {
    return new Date(m).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
  }

  const formatMonthFull = (m: string) => {
    return new Date(m).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => scroll('left')}
        className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto scrollbar-none scroll-smooth flex-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {months.map((m) => {
          const isActive = m === value
          return (
            <button
              key={m}
              type="button"
              data-active={isActive}
              onClick={() => onChange(m)}
              className={cn(
                'relative shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="month-strip-active"
                  className="absolute inset-0 bg-primary rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 capitalize">{formatMonth(m)}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => scroll('right')}
        className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
