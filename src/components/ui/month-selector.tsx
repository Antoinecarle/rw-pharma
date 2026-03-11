import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec',
]

const MONTH_NAMES_FULL = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

// ── Types ────────────────────────────────────────────────────────────────

export interface MonthValue {
  month: number // 1-12
  year: number
}

export interface MonthOption {
  month: number
  year: number
  id?: string        // optional process ID for process-based filtering
  label?: string     // optional custom label
  status?: 'completed' | 'active' | 'draft'
  disabled?: boolean
}

export interface MonthSelectorProps {
  /** Currently selected month (null = "Tous") */
  value: MonthValue | null
  /** Called when user selects a month */
  onChange: (value: MonthValue | null, option?: MonthOption) => void
  /** Available months to select from. If empty, shows a free year/month grid */
  options?: MonthOption[]
  /** Show a "Tous" option to clear the filter */
  allowAll?: boolean
  /** Label shown when "Tous" is selected */
  allLabel?: string
  /** Show prev/next arrows for quick navigation */
  showNavigation?: boolean
  /** Compact mode — smaller trigger */
  compact?: boolean
  /** Additional className on the root */
  className?: string
  /** Align popover */
  align?: 'start' | 'center' | 'end'
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatMonth(v: MonthValue | null, allLabel: string): string {
  if (!v) return allLabel
  return `${MONTH_NAMES_FULL[v.month - 1]} ${v.year}`
}

function formatMonthShort(v: MonthValue): string {
  return `${MONTH_NAMES_SHORT[v.month - 1]} ${v.year.toString().slice(2)}`
}

// ── Component ────────────────────────────────────────────────────────────

export default function MonthSelector({
  value,
  onChange,
  options,
  allowAll = false,
  allLabel = 'Tous les mois',
  showNavigation = true,
  compact = false,
  className,
  align = 'end',
}: MonthSelectorProps) {
  const [open, setOpen] = useState(false)

  // Determine the year shown in the popover grid
  const defaultYear = value?.year ?? new Date().getFullYear()
  const [viewYear, setViewYear] = useState(defaultYear)

  // Available years from options (or default range)
  const availableYears = useMemo(() => {
    if (options && options.length > 0) {
      const years = [...new Set(options.map(o => o.year))].sort((a, b) => a - b)
      return years
    }
    const current = new Date().getFullYear()
    return [current - 1, current, current + 1]
  }, [options])

  // Months available for the current viewYear
  const monthsForYear = useMemo(() => {
    if (!options || options.length === 0) return null // free mode
    return options.filter(o => o.year === viewYear)
  }, [options, viewYear])

  // Sorted options for prev/next navigation
  const sortedOptions = useMemo(() => {
    if (!options) return []
    return [...options]
      .filter(o => !o.disabled)
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  }, [options])

  const currentIndex = sortedOptions.findIndex(
    o => value && o.month === value.month && o.year === value.year
  )

  function navigatePrev() {
    if (sortedOptions.length === 0) {
      if (!value) return
      const prev = value.month === 1
        ? { month: 12, year: value.year - 1 }
        : { month: value.month - 1, year: value.year }
      onChange(prev)
      return
    }
    if (currentIndex > 0) {
      const opt = sortedOptions[currentIndex - 1]
      onChange({ month: opt.month, year: opt.year }, opt)
    } else if (allowAll && currentIndex === 0) {
      onChange(null)
    }
  }

  function navigateNext() {
    if (sortedOptions.length === 0) {
      if (!value) return
      const next = value.month === 12
        ? { month: 1, year: value.year + 1 }
        : { month: value.month + 1, year: value.year }
      onChange(next)
      return
    }
    if (allowAll && value === null && sortedOptions.length > 0) {
      const opt = sortedOptions[0]
      onChange({ month: opt.month, year: opt.year }, opt)
      return
    }
    if (currentIndex >= 0 && currentIndex < sortedOptions.length - 1) {
      const opt = sortedOptions[currentIndex + 1]
      onChange({ month: opt.month, year: opt.year }, opt)
    }
  }

  const canPrev = sortedOptions.length === 0
    ? !!value
    : (currentIndex > 0 || (allowAll && currentIndex === 0))
  const canNext = sortedOptions.length === 0
    ? !!value
    : (allowAll && value === null && sortedOptions.length > 0) || (currentIndex >= 0 && currentIndex < sortedOptions.length - 1)

  function selectMonth(m: number) {
    const opt = options?.find(o => o.month === m && o.year === viewYear)
    onChange({ month: m, year: viewYear }, opt)
    setOpen(false)
  }

  function selectAll() {
    onChange(null)
    setOpen(false)
  }

  // Status dot color for option
  function getStatusColor(opt?: MonthOption): string | null {
    if (!opt?.status) return null
    switch (opt.status) {
      case 'completed': return 'bg-green-500'
      case 'active': return 'bg-amber-500'
      case 'draft': return 'bg-muted-foreground/40'
      default: return null
    }
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Prev button */}
      {showNavigation && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={navigatePrev}
          disabled={!canPrev}
          className="shrink-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={compact ? 'sm' : 'default'}
            className={cn(
              'gap-2 font-medium tabular-nums',
              compact ? 'text-xs h-7 px-2.5' : 'text-sm',
            )}
          >
            <CalendarRange className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            {value ? formatMonthShort(value) : allLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-[260px] p-3">
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setViewYear(y => y - 1)}
              disabled={availableYears.length > 0 && viewYear <= availableYears[0]}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold tabular-nums">{viewYear}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setViewYear(y => y + 1)}
              disabled={availableYears.length > 0 && viewYear >= availableYears[availableYears.length - 1]}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* "Tous" option */}
          {allowAll && (
            <button
              type="button"
              onClick={selectAll}
              className={cn(
                'w-full mb-2 px-3 py-1.5 rounded-md text-xs font-medium text-center transition-colors',
                value === null
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              )}
            >
              {allLabel}
            </button>
          )}

          {/* Month grid (4 cols x 3 rows) */}
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_NAMES_SHORT.map((name, idx) => {
              const m = idx + 1
              const isSelected = value !== null && value.month === m && value.year === viewYear
              const opt = monthsForYear?.find(o => o.month === m)
              const isAvailable = monthsForYear === null || !!opt
              const isDisabled = opt?.disabled || (monthsForYear !== null && !opt)
              const statusColor = getStatusColor(opt)

              return (
                <button
                  key={m}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectMonth(m)}
                  className={cn(
                    'relative px-1 py-2 rounded-md text-xs font-medium transition-all',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : isAvailable
                        ? 'hover:bg-muted text-foreground'
                        : 'text-muted-foreground/30 cursor-not-allowed',
                  )}
                >
                  {name}
                  {statusColor && !isSelected && (
                    <span className={cn('absolute top-1 right-1 h-1.5 w-1.5 rounded-full', statusColor)} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Current selection label */}
          <p className="text-[10px] text-muted-foreground text-center mt-2.5">
            {formatMonth(value, allLabel)}
          </p>
        </PopoverContent>
      </Popover>

      {/* Next button */}
      {showNavigation && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={navigateNext}
          disabled={!canNext}
          className="shrink-0"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

export { MONTH_NAMES_SHORT, MONTH_NAMES_FULL, formatMonthShort }
