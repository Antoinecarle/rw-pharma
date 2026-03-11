import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Warehouse } from 'lucide-react'
import StockLotView from '@/components/stock/StockLotView'
import MonthSelector, { type MonthValue, type MonthOption, MONTH_NAMES_FULL } from '@/components/ui/month-selector'

interface ProcessOption {
  id: string
  month: number
  year: number
  status: string
}

export default function StockPage() {
  const [selectedMonth, setSelectedMonth] = useState<MonthValue | null>(null)

  const { data: processes } = useQuery({
    queryKey: ['monthly-processes', 'stock-page'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('id, month, year, status')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return data as ProcessOption[]
    },
  })

  const monthOptions: MonthOption[] = useMemo(() => {
    if (!processes) return []
    return processes.map(p => ({
      month: p.month,
      year: p.year,
      id: p.id,
      status: p.status === 'completed' ? 'completed' as const : p.status === 'draft' ? 'draft' as const : 'active' as const,
    }))
  }, [processes])

  // Resolve selected process ID from month
  const selectedProcessId = useMemo(() => {
    if (!selectedMonth || !processes) return null
    const p = processes.find(pr => pr.month === selectedMonth.month && pr.year === selectedMonth.year)
    return p?.id ?? null
  }, [selectedMonth, processes])

  const subtitle = selectedMonth
    ? `${MONTH_NAMES_FULL[selectedMonth.month - 1]} ${selectedMonth.year}`
    : 'Tous les mois'

  return (
    <div className="p-4 md:p-7 lg:p-8 space-y-6 max-w-[1400px] mx-auto ivory-page-glow overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.08))' }}
            >
              <Warehouse className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Stock Collecte</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                Vue par produit et par lot — {subtitle}
              </p>
            </div>
          </div>

          {monthOptions.length > 0 && (
            <MonthSelector
              value={selectedMonth}
              onChange={(v) => setSelectedMonth(v)}
              options={monthOptions}
              allowAll
              allLabel="Tous les mois"
              compact
            />
          )}
        </div>
      </motion.div>

      {/* Stock lot view */}
      <StockLotView
        processId={selectedProcessId ?? undefined}
        showKpis
        maxHeight="calc(100vh - 220px)"
      />
    </div>
  )
}
