import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, ArrowRight, Package, BarChart3, Check } from 'lucide-react'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft: { label: 'Brouillon', color: 'var(--ivory-text-muted)', bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.06)' },
  importing_quotas: { label: 'Import dispos', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.15)' },
  importing_orders: { label: 'Import commandes', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.15)' },
  reviewing_orders: { label: 'Revue commandes', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.15)' },
  macro_attributing: { label: 'Commande initiale', color: 'var(--ivory-accent)', bg: 'rgba(13,148,136,0.08)', border: 'rgba(13,148,136,0.15)' },
  exporting_wholesalers: { label: 'Export grossistes', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.15)' },
  negotiating: { label: 'Négociation', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.15)' },
  reexporting: { label: 'Ré-export', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.15)' },
  collecting_stock: { label: 'Réception stocks', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.15)' },
  allocating_lots: { label: 'Allocation lots', color: 'var(--ivory-accent)', bg: 'rgba(13,148,136,0.08)', border: 'rgba(13,148,136,0.15)' },
  reviewing_allocations: { label: 'Revue allocations', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.15)' },
  finalizing: { label: 'Finalisation', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.15)' },
  completed: { label: 'Terminé', color: 'var(--ivory-teal)', bg: 'rgba(13,148,136,0.08)', border: 'rgba(13,148,136,0.15)' },
}

const TOTAL_STEPS = 12
const STEP_LABELS = ['', 'Import dispos', 'Import commandes', 'Revue commandes', 'Commande initiale', 'Export grossistes', 'Négociation', 'Ré-export', 'Réception stocks', 'Agrégation stock', 'Allocation lots', 'Revue allocations', 'Finalisation']

interface MonthlyProcessCardProps {
  process: MonthlyProcess
  index?: number
}

export default function MonthlyProcessCard({ process, index = 0 }: MonthlyProcessCardProps) {
  const statusCfg = STATUS_CONFIG[process.status] ?? STATUS_CONFIG.draft
  const monthName = MONTH_NAMES[process.month - 1] ?? ''
  const isCompleted = process.status === 'completed'
  const progress = (process.current_step / TOTAL_STEPS) * 100

  return (
    <Link to={`/monthly-processes/${process.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 25 }}
        whileHover={{ y: -3 }}
        className="h-full"
      >
        <div className="ivory-glass group cursor-pointer overflow-hidden h-full transition-all duration-300"
          style={{ borderColor: isCompleted ? 'rgba(13,148,136,0.15)' : undefined }}>
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <motion.div
                  className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105"
                  style={{
                    background: isCompleted
                      ? 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))'
                      : 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))',
                  }}
                >
                  <Calendar className="h-5 w-5" style={{ color: isCompleted ? 'var(--ivory-teal)' : 'var(--ivory-accent)' }} />
                </motion.div>
                <div>
                  <h3 className="ivory-heading text-[14px]">{monthName} {process.year}</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                    Étape {process.current_step}/{TOTAL_STEPS} — {STEP_LABELS[process.current_step]}
                  </p>
                </div>
              </div>
              <span className="ivory-badge shrink-0" style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}>
                {isCompleted && <Check className="h-3 w-3" />}
                {statusCfg.label}
              </span>
            </div>

            {/* Stats */}
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
                <span className="text-[12px] font-medium" style={{ color: 'var(--ivory-text-body)' }}>
                  <span className="font-bold tabular-nums">{process.orders_count}</span> commandes
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
                <span className="text-[12px] font-medium" style={{ color: 'var(--ivory-text-body)' }}>
                  <span className="font-bold tabular-nums">{process.allocations_count}</span> allocations
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 ml-auto transition-transform group-hover:translate-x-1" style={{ color: 'rgba(0,0,0,0.15)' }} />
            </div>

            {/* Step progress */}
            <div className="mt-3.5 flex items-center gap-1.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(step => {
                const isDone = step < process.current_step
                const isActive = step === process.current_step
                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="relative">
                      <div
                        className={`h-2 w-2 rounded-full transition-all ${isActive ? 'animate-subtle-pulse' : ''}`}
                        style={{
                          background: isDone || isActive
                            ? (isCompleted ? 'var(--ivory-teal)' : 'var(--ivory-accent)')
                            : 'rgba(0,0,0,0.06)',
                        }}
                      />
                    </div>
                    {step < TOTAL_STEPS && (
                      <div
                        className="flex-1 h-0.5 mx-0.5 rounded-full"
                        style={{
                          background: isDone
                            ? (isCompleted ? 'rgba(13,148,136,0.3)' : 'rgba(13,148,136,0.3)')
                            : 'rgba(0,0,0,0.04)',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Progress bar */}
            <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: isCompleted
                    ? 'linear-gradient(90deg, var(--ivory-teal), #10B981)'
                    : 'linear-gradient(90deg, var(--ivory-accent), var(--ivory-teal))',
                }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: index * 0.06 + 0.3 }}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  )
}
