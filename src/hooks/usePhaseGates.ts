import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MonthlyProcess } from '@/types/database'

export interface PhaseGate {
  phase: 1 | 2 | 3
  canProceed: boolean
  warnings: string[]
  blockers: string[]
}

/**
 * Computes validation gates for each phase transition.
 * Gates = soft validation: blockers prevent advancing, warnings are informational.
 */
export function usePhaseGates(process: MonthlyProcess | null) {
  // Fetch counts for gate computation
  const { data: gateData } = useQuery({
    queryKey: ['phase-gates', process?.id],
    queryFn: async () => {
      if (!process) return null

      // Parallel queries for all gate data
      const [quotasRes, ordersRes, validatedOrdersRes, rejectedOrdersRes, stockRes, allocationsRes, confirmedAllocRes] = await Promise.all([
        supabase
          .from('wholesaler_quotas')
          .select('id', { count: 'exact', head: true })
          .eq('monthly_process_id', process.id),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('monthly_process_id', process.id),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('monthly_process_id', process.id)
          .eq('status', 'validated'),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('monthly_process_id', process.id)
          .eq('status', 'rejected'),
        supabase
          .from('collected_stock')
          .select('id', { count: 'exact', head: true })
          .eq('monthly_process_id', process.id),
        supabase
          .from('allocations')
          .select('id', { count: 'exact', head: true })
          .eq('monthly_process_id', process.id),
        supabase
          .from('allocations')
          .select('id', { count: 'exact', head: true })
          .eq('monthly_process_id', process.id)
          .eq('status', 'confirmed'),
      ])

      return {
        quotasCount: quotasRes.count ?? 0,
        ordersCount: ordersRes.count ?? 0,
        validatedOrdersCount: validatedOrdersRes.count ?? 0,
        rejectedOrdersCount: rejectedOrdersRes.count ?? 0,
        stockCount: stockRes.count ?? 0,
        allocationsCount: allocationsRes.count ?? 0,
        confirmedAllocationsCount: confirmedAllocRes.count ?? 0,
      }
    },
    enabled: !!process,
    staleTime: 30_000, // 30s cache
  })

  const gates: PhaseGate[] = [
    computePhase1Gate(gateData),
    computePhase2Gate(gateData),
    computePhase3Gate(gateData),
  ]

  return { gates, gateData }
}

function computePhase1Gate(data: ReturnType<typeof usePhaseGates>['gateData'] extends infer T ? T : never): PhaseGate {
  if (!data) return { phase: 1, canProceed: false, warnings: [], blockers: ['Chargement...'] }

  const blockers: string[] = []
  const warnings: string[] = []

  if (data.quotasCount === 0) blockers.push('Aucun quota importe')
  if (data.validatedOrdersCount === 0) blockers.push('Aucune commande validee')
  if (data.rejectedOrdersCount > 0) warnings.push(`${data.rejectedOrdersCount} commande(s) rejetee(s)`)
  if (data.ordersCount > 0 && data.validatedOrdersCount < data.ordersCount - data.rejectedOrdersCount) {
    warnings.push('Des commandes sont encore en attente de validation')
  }

  return {
    phase: 1,
    canProceed: blockers.length === 0,
    warnings,
    blockers,
  }
}

function computePhase2Gate(data: ReturnType<typeof usePhaseGates>['gateData'] extends infer T ? T : never): PhaseGate {
  if (!data) return { phase: 2, canProceed: false, warnings: [], blockers: ['Chargement...'] }

  const blockers: string[] = []
  const warnings: string[] = []

  if (data.stockCount === 0) blockers.push('Aucun stock importe')
  if (data.allocationsCount === 0) blockers.push('Aucune allocation generee')
  if (data.allocationsCount > 0 && data.confirmedAllocationsCount === 0) {
    warnings.push('Aucune allocation confirmee')
  }

  return {
    phase: 2,
    canProceed: blockers.length === 0,
    warnings,
    blockers,
  }
}

function computePhase3Gate(data: ReturnType<typeof usePhaseGates>['gateData'] extends infer T ? T : never): PhaseGate {
  if (!data) return { phase: 3, canProceed: false, warnings: [], blockers: ['Chargement...'] }

  const blockers: string[] = []
  const warnings: string[] = []

  if (data.confirmedAllocationsCount === 0) blockers.push('Aucune allocation confirmee')
  if (data.allocationsCount > 0 && data.confirmedAllocationsCount < data.allocationsCount) {
    const pending = data.allocationsCount - data.confirmedAllocationsCount
    warnings.push(`${pending} allocation(s) non confirmee(s)`)
  }

  return {
    phase: 3,
    canProceed: blockers.length === 0,
    warnings,
    blockers,
  }
}

export function getGateForPhase(gates: PhaseGate[], phaseId: number): PhaseGate | undefined {
  return gates.find(g => g.phase === phaseId)
}
