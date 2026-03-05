import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, ArrowRight, Package, BarChart3, Check } from 'lucide-react'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  importing: { label: 'Importation', variant: 'outline' },
  reviewing_orders: { label: 'Revue commandes', variant: 'outline' },
  allocating: { label: 'Allocation en cours', variant: 'default' },
  reviewing_allocations: { label: 'Revue allocations', variant: 'outline' },
  finalizing: { label: 'Finalisation', variant: 'outline' },
  completed: { label: 'Termine', variant: 'default' },
}

const STEP_LABELS = ['', 'Importation', 'Revue commandes', 'Allocation', 'Revue allocations', 'Finalisation']

interface MonthlyProcessCardProps {
  process: MonthlyProcess
  index?: number
}

export default function MonthlyProcessCard({ process, index = 0 }: MonthlyProcessCardProps) {
  const statusCfg = STATUS_CONFIG[process.status] ?? STATUS_CONFIG.draft
  const monthName = MONTH_NAMES[process.month - 1] ?? ''
  const isCompleted = process.status === 'completed'

  return (
    <Link to={`/monthly-processes/${process.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 25 }}
        whileHover={{ y: -4 }}
      >
        <Card className={`group hover:shadow-lg hover:shadow-black/5 transition-shadow duration-300 cursor-pointer overflow-hidden ${isCompleted ? 'border-primary/30' : ''}`}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <motion.div
                  className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isCompleted ? 'bg-gradient-to-br from-primary to-emerald-600' : 'bg-gradient-to-br from-orange-500 to-amber-600'}`}
                  whileHover={{ rotate: 10 }}
                >
                  <Calendar className="h-5 w-5 text-white" />
                </motion.div>
                <div>
                  <h3 className="font-semibold text-sm">{monthName} {process.year}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Etape {process.current_step}/5 : {STEP_LABELS[process.current_step]}
                  </p>
                </div>
              </div>
              <Badge variant={statusCfg.variant} className="shrink-0">
                {statusCfg.label}
              </Badge>
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                <span>{process.orders_count} commandes</span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                <span>{process.allocations_count} allocations</span>
              </div>
              <motion.div
                className="ml-auto"
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </motion.div>
            </div>

            {/* Stepper dots replacing progress bar */}
            <div className="mt-3 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(step => {
                const isDone = step < process.current_step
                const isActive = step === process.current_step
                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="relative">
                      <div
                        className={`h-2.5 w-2.5 rounded-full transition-all ${
                          isDone
                            ? 'bg-primary'
                            : isActive
                              ? 'bg-primary'
                              : 'bg-muted'
                        }`}
                      >
                        {isDone && (
                          <Check className="h-2 w-2 text-primary-foreground absolute inset-0 m-auto" />
                        )}
                      </div>
                      {isActive && (
                        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                      )}
                    </div>
                    {step < 5 && (
                      <div className={`flex-1 h-0.5 mx-0.5 rounded-full ${isDone ? 'bg-primary' : 'bg-muted'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </Link>
  )
}
