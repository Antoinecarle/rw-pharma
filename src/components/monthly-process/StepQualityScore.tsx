import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, useInView } from 'framer-motion'
import { useRef, useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'
import type { MonthlyProcess } from '@/types/database'

interface StepQualityScoreProps {
  process: MonthlyProcess
  step: number
}

interface QualityResult {
  score: number
  label: string
  details: string[]
}

function useStepQuality(process: MonthlyProcess, step: number): QualityResult {
  // Steps 2-3: Order quality
  const { data: orders } = useQuery({
    queryKey: ['orders', process.id, 'quality'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, customer_id, product_id')
        .eq('monthly_process_id', process.id)
      if (error) throw error
      return data ?? []
    },
    enabled: step >= 2 && step <= 5,
  })

  // Steps 4-7: Allocation quality
  const { data: allocations } = useQuery({
    queryKey: ['allocations', process.id, 'quality'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('id, requested_quantity, allocated_quantity, status')
        .eq('monthly_process_id', process.id)
      if (error) throw error
      return data ?? []
    },
    enabled: step >= 8,
  })

  return useMemo(() => {
    const details: string[] = []
    let score = 0

    // When process is completed, all steps that were passed are implicitly done
    if (process.status === 'completed' && step <= (process.current_step ?? 12)) {
      return { score: 100, label: 'Excellent', details: ['Etape completee'] }
    }

    switch (step) {
      case 1: {
        // Quota import: score based on having quotas
        const count = process.quotas_count ?? 0
        if (count === 0) {
          score = 0
          details.push('Aucune disponibilite importee')
        } else if (count < 100) {
          score = 40
          details.push(`${count} quotas (faible volume)`)
        } else if (count < 500) {
          score = 70
          details.push(`${count} quotas importes`)
        } else {
          score = 100
          details.push(`${count} quotas importes`)
        }
        break
      }
      case 2: {
        // Order import: score based on having orders
        const count = process.orders_count ?? 0
        if (count === 0) {
          score = 0
          details.push('Aucune commande importee')
        } else if (count < 50) {
          score = 40
          details.push(`${count} commandes (faible volume)`)
        } else if (count < 200) {
          score = 70
          details.push(`${count} commandes importees`)
        } else {
          score = 100
          details.push(`${count} commandes importees`)
        }
        break
      }
      case 3: {
        // Review step: validated vs total
        if (!orders || orders.length === 0) {
          score = 0
          details.push('Aucune commande a valider')
          break
        }
        const validated = orders.filter(o => o.status === 'validated').length
        const rejected = orders.filter(o => o.status === 'rejected').length
        const pending = orders.filter(o => o.status === 'pending').length
        const reviewed = validated + rejected
        const ratio = reviewed / orders.length

        score = Math.round(ratio * 100)
        if (pending > 0) details.push(`${pending} en attente de revue`)
        if (validated > 0) details.push(`${validated} validees`)
        if (rejected > 0) details.push(`${rejected} rejetees`)
        break
      }
      case 4: {
        // Macro attribution: score based on having attribution data
        const validatedForAttrib = orders?.filter(o => o.status === 'validated').length ?? 0
        const hasMacro = process.metadata && (process.metadata as Record<string, unknown>).macro_attributions
        if (validatedForAttrib === 0) {
          score = 0
          details.push('Aucune commande validee')
        } else if (hasMacro) {
          score = 80
          details.push('Attribution macro effectuee')
        } else {
          score = 30
          details.push(`${validatedForAttrib} commandes a attribuer`)
        }
        break
      }
      case 5: {
        // Export wholesalers: score based on having validated orders
        const validatedOrders = orders?.filter(o => o.status === 'validated').length ?? 0
        if (validatedOrders === 0) {
          score = 0
          details.push('Aucune commande validee a exporter')
        } else {
          score = 70
          details.push(`${validatedOrders} commandes validees a exporter`)
        }
        break
      }
      case 6: {
        // Stock collection
        score = 50
        details.push('Import stocks en cours')
        break
      }
      case 7: {
        // Stock aggregation
        score = 50
        details.push('Verification du stock collecte')
        break
      }
      case 8: {
        // Allocation: fulfillment rate
        if (!allocations || allocations.length === 0) {
          score = 0
          details.push("Lancer l'allocation")
          break
        }
        const totalReq = allocations.reduce((s, a) => s + a.requested_quantity, 0)
        const totalAlloc = allocations.reduce((s, a) => s + a.allocated_quantity, 0)
        const rate = totalReq > 0 ? (totalAlloc / totalReq) * 100 : 0
        score = Math.round(rate)
        details.push(`Couverture: ${rate.toFixed(1)}%`)
        const zeros = allocations.filter(a => a.allocated_quantity === 0).length
        if (zeros > 0) details.push(`${zeros} produits a 0`)
        break
      }
      case 9: {
        // Allocation review: confirmed vs total
        if (!allocations || allocations.length === 0) {
          score = 0
          details.push('Aucune allocation')
          break
        }
        const confirmed = allocations.filter(a => a.status === 'confirmed').length
        const ratio = confirmed / allocations.length
        score = Math.round(ratio * 100)
        if (confirmed === allocations.length) {
          details.push('Toutes confirmees')
        } else {
          details.push(`${confirmed}/${allocations.length} confirmees`)
        }
        const partial = allocations.filter(a => a.allocated_quantity < a.requested_quantity).length
        if (partial > 0) details.push(`${partial} allocations partielles`)
        break
      }
      case 10: {
        // Finalization: process completed
        if (process.status === 'completed') {
          score = 100
          details.push('Processus termine')
        } else {
          score = 50
          details.push('En attente de finalisation')
          if (process.allocations_count > 0) details.push(`${process.allocations_count} allocations a exporter`)
        }
        break
      }
      default:
        score = 0
    }

    const label = score >= 90 ? 'Excellent' : score >= 70 ? 'Bon' : score >= 40 ? 'En cours' : 'A faire'
    return { score, label, details }
  }, [step, process, orders, allocations])
}

function getScoreColor(score: number) {
  if (score >= 90) return '#22c55e'
  if (score >= 70) return '#f59e0b'
  if (score >= 40) return '#f97316'
  return '#94a3b8'
}

function getScoreIcon(score: number) {
  if (score >= 90) return CheckCircle
  if (score >= 40) return Info
  return AlertTriangle
}

export default function StepQualityScore({ process, step }: StepQualityScoreProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-20px' })
  const { score, label, details } = useStepQuality(process, step)
  const color = getScoreColor(score)
  const Icon = getScoreIcon(score)

  const size = 44
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 cursor-default"
        >
          <div className="relative">
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
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
                animate={isInView ? { strokeDashoffset: circumference * (1 - score / 100) } : { strokeDashoffset: circumference }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
                {score}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-[10px] font-semibold text-muted-foreground leading-tight">Qualite</span>
            <span className="text-xs font-medium leading-tight flex items-center gap-1" style={{ color }}>
              <Icon className="h-3 w-3" />
              {label}
            </span>
          </div>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="font-semibold text-sm mb-1">Score qualite: {score}%</p>
        <ul className="text-xs space-y-0.5">
          {details.map((d, i) => (
            <li key={i} className="text-muted-foreground">- {d}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
