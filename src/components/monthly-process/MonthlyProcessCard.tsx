import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, ArrowRight, Package, BarChart3 } from 'lucide-react'
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
}

export default function MonthlyProcessCard({ process }: MonthlyProcessCardProps) {
  const statusCfg = STATUS_CONFIG[process.status] ?? STATUS_CONFIG.draft
  const monthName = MONTH_NAMES[process.month - 1] ?? ''
  const isCompleted = process.status === 'completed'

  return (
    <Link to={`/monthly-processes/${process.id}`}>
      <Card className={`group hover:shadow-lg hover:shadow-black/5 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 overflow-hidden ${isCompleted ? 'border-primary/30' : ''}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110 ${isCompleted ? 'bg-gradient-to-br from-primary to-emerald-600' : 'bg-gradient-to-br from-orange-500 to-amber-600'}`}>
                <Calendar className="h-5 w-5 text-white" />
              </div>
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
            <ArrowRight className="h-3.5 w-3.5 ml-auto transition-transform group-hover:translate-x-1" />
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(process.current_step / 5) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
