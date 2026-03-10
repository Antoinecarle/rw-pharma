import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Warehouse } from 'lucide-react'
import StockLotView from '@/components/stock/StockLotView'

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

interface ProcessOption {
  id: string
  month: number
  year: number
  status: string
}

export default function StockPage() {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null)

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

  const subtitle = selectedProcessId
    ? (() => {
        const p = processes?.find(pr => pr.id === selectedProcessId)
        return p ? `${MONTH_NAMES[p.month - 1]} ${p.year}` : 'Filtre par mois'
      })()
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

          {/* Month selector */}
          {processes && processes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <button
                onClick={() => setSelectedProcessId(null)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  !selectedProcessId
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:border-primary/30'
                }`}
              >
                Tous
              </button>
              {processes.slice(0, 8).map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProcessId(p.id)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    selectedProcessId === p.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:border-primary/30'
                  }`}
                >
                  {MONTH_NAMES[p.month - 1].slice(0, 3)} {p.year.toString().slice(2)}
                </button>
              ))}
            </div>
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
