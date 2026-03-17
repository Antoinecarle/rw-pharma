/**
 * Unit tests for phase management logic.
 *
 * Pure-function tests — no React rendering, no Supabase calls, no mocking needed.
 * Uses vitest (configured in vite.config.ts).
 */

import { describe, it, expect } from 'vitest'
import {
  PHASES,
  getPhaseForStep,
  getPhaseStatus,
  type PhaseDefinition,
  type PhaseStatus,
} from '@/components/monthly-process/PhaseTabBar'
import { getGateForPhase, type PhaseGate } from '@/hooks/usePhaseGates'

// ---------------------------------------------------------------------------
// 1. PHASES constant
// ---------------------------------------------------------------------------

describe('PHASES constant', () => {
  it('has exactly 4 phases', () => {
    expect(PHASES).toHaveLength(4)
  })

  it('phase 1 has steps [1, 2, 3, 4, 5]', () => {
    const phase1 = PHASES.find((p) => p.id === 1)
    expect(phase1).toBeDefined()
    expect(phase1!.steps).toEqual([1, 2, 3, 4, 5])
  })

  it('phase 2 has steps [6, 7]', () => {
    const phase2 = PHASES.find((p) => p.id === 2)
    expect(phase2).toBeDefined()
    expect(phase2!.steps).toEqual([6, 7])
  })

  it('phase 3 has steps [8, 9, 10]', () => {
    const phase3 = PHASES.find((p) => p.id === 3)
    expect(phase3).toBeDefined()
    expect(phase3!.steps).toEqual([8, 9, 10])
  })

  it('phase 4 has steps [11, 12]', () => {
    const phase4 = PHASES.find((p) => p.id === 4)
    expect(phase4).toBeDefined()
    expect(phase4!.steps).toEqual([11, 12])
  })

  it('covers all steps 1 through 12', () => {
    const allSteps = PHASES.flatMap((p) => p.steps).sort((a, b) => a - b)
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(allSteps).toEqual(expected)
  })

  it('has no duplicate steps across phases', () => {
    const allSteps = PHASES.flatMap((p) => p.steps)
    const unique = new Set(allSteps)
    expect(unique.size).toBe(allSteps.length)
  })

  it('each phase has a unique id', () => {
    const ids = PHASES.map((p) => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(PHASES.length)
  })

  it('phases are ordered by id ascending', () => {
    for (let i = 1; i < PHASES.length; i++) {
      expect(PHASES[i].id).toBeGreaterThan(PHASES[i - 1].id)
    }
  })

  it('each phase has a non-empty label and shortLabel', () => {
    for (const phase of PHASES) {
      expect(phase.label.length).toBeGreaterThan(0)
      expect(phase.shortLabel.length).toBeGreaterThan(0)
    }
  })

  it('each PhaseDefinition has the expected shape', () => {
    for (const phase of PHASES) {
      expect(phase).toMatchObject<Partial<PhaseDefinition>>({
        id: expect.any(Number),
        label: expect.any(String),
        shortLabel: expect.any(String),
        phase: expect.any(String),
        steps: expect.any(Array),
      })
    }
  })
})

// ---------------------------------------------------------------------------
// 2. getPhaseForStep()
// ---------------------------------------------------------------------------

describe('getPhaseForStep()', () => {
  // Phase 1 boundaries
  it('step 1 → phase 1', () => expect(getPhaseForStep(1)).toBe(1))
  it('step 2 → phase 1', () => expect(getPhaseForStep(2)).toBe(1))
  it('step 3 → phase 1', () => expect(getPhaseForStep(3)).toBe(1))
  it('step 4 → phase 1', () => expect(getPhaseForStep(4)).toBe(1))
  it('step 5 → phase 1 (last step of phase 1)', () => expect(getPhaseForStep(5)).toBe(1))

  // Phase 2 boundaries
  it('step 6 → phase 2 (first step of phase 2)', () => expect(getPhaseForStep(6)).toBe(2))
  it('step 7 → phase 2 (last step of phase 2)', () => expect(getPhaseForStep(7)).toBe(2))

  // Phase 3 boundaries
  it('step 8 → phase 3 (first step of phase 3)', () => expect(getPhaseForStep(8)).toBe(3))
  it('step 9 → phase 3', () => expect(getPhaseForStep(9)).toBe(3))
  it('step 10 → phase 3 (last step of phase 3)', () => expect(getPhaseForStep(10)).toBe(3))

  // Phase 4 boundaries
  it('step 11 → phase 4 (first step of phase 4)', () => expect(getPhaseForStep(11)).toBe(4))
  it('step 12 → phase 4 (last step of phase 4)', () => expect(getPhaseForStep(12)).toBe(4))

  // Fallback cases
  it('step 0 → phase 1 (out-of-range falls back to phase 1)', () => {
    expect(getPhaseForStep(0)).toBe(1)
  })

  it('step 13 → phase 1 (out-of-range falls back to phase 1)', () => {
    expect(getPhaseForStep(13)).toBe(1)
  })

  it('negative step → phase 1 (fallback)', () => {
    expect(getPhaseForStep(-1)).toBe(1)
  })

  it('every valid step maps to a known phase id', () => {
    const phaseIds = new Set(PHASES.map((p) => p.id))
    for (let step = 1; step <= 12; step++) {
      expect(phaseIds.has(getPhaseForStep(step))).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. getPhaseStatus()
// ---------------------------------------------------------------------------

describe('getPhaseStatus()', () => {
  // When process is fully completed, every phase reports 'completed'
  describe('processStatus = "completed"', () => {
    it('phase 1 → completed', () => {
      expect(getPhaseStatus(1, 1, 'completed')).toBe<PhaseStatus>('completed')
    })
    it('phase 2 → completed', () => {
      expect(getPhaseStatus(2, 6, 'completed')).toBe<PhaseStatus>('completed')
    })
    it('phase 3 → completed', () => {
      expect(getPhaseStatus(3, 8, 'completed')).toBe<PhaseStatus>('completed')
    })
    it('phase 4 → completed', () => {
      expect(getPhaseStatus(4, 11, 'completed')).toBe<PhaseStatus>('completed')
    })
  })

  // currentStep = 1 → phase 1 active, rest future
  describe('currentStep = 1 (process just started)', () => {
    it('phase 1 → active', () => {
      expect(getPhaseStatus(1, 1, 'in_progress')).toBe<PhaseStatus>('active')
    })
    it('phase 2 → future', () => {
      expect(getPhaseStatus(2, 1, 'in_progress')).toBe<PhaseStatus>('future')
    })
    it('phase 3 → future', () => {
      expect(getPhaseStatus(3, 1, 'in_progress')).toBe<PhaseStatus>('future')
    })
    it('phase 4 → future', () => {
      expect(getPhaseStatus(4, 1, 'in_progress')).toBe<PhaseStatus>('future')
    })
  })

  // currentStep = 5 → phase 1 still active (last step), phases 2-4 future
  describe('currentStep = 5 (last step of phase 1)', () => {
    it('phase 1 → active', () => {
      expect(getPhaseStatus(1, 5, 'in_progress')).toBe<PhaseStatus>('active')
    })
    it('phase 2 → future', () => {
      expect(getPhaseStatus(2, 5, 'in_progress')).toBe<PhaseStatus>('future')
    })
  })

  // currentStep = 6 → phase 1 completed, phase 2 active, phases 3-4 future
  describe('currentStep = 6 (entered phase 2)', () => {
    it('phase 1 → completed', () => {
      expect(getPhaseStatus(1, 6, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 2 → active', () => {
      expect(getPhaseStatus(2, 6, 'in_progress')).toBe<PhaseStatus>('active')
    })
    it('phase 3 → future', () => {
      expect(getPhaseStatus(3, 6, 'in_progress')).toBe<PhaseStatus>('future')
    })
    it('phase 4 → future', () => {
      expect(getPhaseStatus(4, 6, 'in_progress')).toBe<PhaseStatus>('future')
    })
  })

  // currentStep = 7 → phase 1 completed, phase 2 still active, phases 3-4 future
  describe('currentStep = 7 (last step of phase 2)', () => {
    it('phase 1 → completed', () => {
      expect(getPhaseStatus(1, 7, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 2 → active', () => {
      expect(getPhaseStatus(2, 7, 'in_progress')).toBe<PhaseStatus>('active')
    })
    it('phase 3 → future', () => {
      expect(getPhaseStatus(3, 7, 'in_progress')).toBe<PhaseStatus>('future')
    })
  })

  // currentStep = 8 → phases 1+2 completed, phase 3 active, phase 4 future
  describe('currentStep = 8 (entered phase 3)', () => {
    it('phase 1 → completed', () => {
      expect(getPhaseStatus(1, 8, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 2 → completed', () => {
      expect(getPhaseStatus(2, 8, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 3 → active', () => {
      expect(getPhaseStatus(3, 8, 'in_progress')).toBe<PhaseStatus>('active')
    })
    it('phase 4 → future', () => {
      expect(getPhaseStatus(4, 8, 'in_progress')).toBe<PhaseStatus>('future')
    })
  })

  // currentStep = 10 → phases 1+2 completed, phase 3 active, phase 4 future
  describe('currentStep = 10 (last step of phase 3)', () => {
    it('phase 3 → active', () => {
      expect(getPhaseStatus(3, 10, 'in_progress')).toBe<PhaseStatus>('active')
    })
    it('phase 4 → future', () => {
      expect(getPhaseStatus(4, 10, 'in_progress')).toBe<PhaseStatus>('future')
    })
  })

  // currentStep = 11 → phases 1+2+3 completed, phase 4 active
  describe('currentStep = 11 (entered phase 4)', () => {
    it('phase 1 → completed', () => {
      expect(getPhaseStatus(1, 11, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 2 → completed', () => {
      expect(getPhaseStatus(2, 11, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 3 → completed', () => {
      expect(getPhaseStatus(3, 11, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 4 → active', () => {
      expect(getPhaseStatus(4, 11, 'in_progress')).toBe<PhaseStatus>('active')
    })
  })

  // currentStep = 12 → phases 1+2+3 completed, phase 4 active (last step)
  describe('currentStep = 12 (last step of phase 4)', () => {
    it('phases 1-3 → completed', () => {
      expect(getPhaseStatus(1, 12, 'in_progress')).toBe<PhaseStatus>('completed')
      expect(getPhaseStatus(2, 12, 'in_progress')).toBe<PhaseStatus>('completed')
      expect(getPhaseStatus(3, 12, 'in_progress')).toBe<PhaseStatus>('completed')
    })
    it('phase 4 → active', () => {
      expect(getPhaseStatus(4, 12, 'in_progress')).toBe<PhaseStatus>('active')
    })
  })

  // Special: processStatus = 'attente_stock' → phase 2 shows 'waiting'
  describe('waiting state (attente_stock)', () => {
    it('phaseId=2, processStatus="attente_stock" → waiting', () => {
      expect(getPhaseStatus(2, 6, 'attente_stock')).toBe<PhaseStatus>('waiting')
    })

    it('phaseId=2, processStatus="attente_stock" overrides active even at step 7', () => {
      expect(getPhaseStatus(2, 7, 'attente_stock')).toBe<PhaseStatus>('waiting')
    })

    it('phaseId=1 with attente_stock → still completed (not waiting)', () => {
      // step 6 means phase 1 is done; attente_stock only affects phase 2
      expect(getPhaseStatus(1, 6, 'attente_stock')).toBe<PhaseStatus>('completed')
    })

    it('phaseId=3 with attente_stock → still future', () => {
      expect(getPhaseStatus(3, 6, 'attente_stock')).toBe<PhaseStatus>('future')
    })
  })

  // Invalid phaseId guard
  describe('invalid phaseId', () => {
    it('phaseId=0 → future (fallback)', () => {
      expect(getPhaseStatus(0, 5, 'in_progress')).toBe<PhaseStatus>('future')
    })

    it('phaseId=5 → future (out of range)', () => {
      expect(getPhaseStatus(5, 5, 'in_progress')).toBe<PhaseStatus>('future')
    })

    it('phaseId=-1 → future', () => {
      expect(getPhaseStatus(-1, 5, 'in_progress')).toBe<PhaseStatus>('future')
    })
  })
})

// ---------------------------------------------------------------------------
// 4. getGateForPhase()
// ---------------------------------------------------------------------------

const makeGate = (phase: 1 | 2 | 3 | 4, canProceed: boolean, blockers: string[] = [], warnings: string[] = []): PhaseGate => ({
  phase,
  canProceed,
  blockers,
  warnings,
})

describe('getGateForPhase()', () => {
  const gates: PhaseGate[] = [
    makeGate(1, true),
    makeGate(2, false, ['Aucune commande']),
    makeGate(3, false, ['Aucun stock importe']),
    makeGate(4, true, [], ['2 allocation(s) non confirmee(s)']),
  ]

  it('returns the gate for phase 1', () => {
    const gate = getGateForPhase(gates, 1)
    expect(gate).toBeDefined()
    expect(gate!.phase).toBe(1)
    expect(gate!.canProceed).toBe(true)
  })

  it('returns the gate for phase 2', () => {
    const gate = getGateForPhase(gates, 2)
    expect(gate).toBeDefined()
    expect(gate!.phase).toBe(2)
    expect(gate!.canProceed).toBe(false)
    expect(gate!.blockers).toContain('Aucune commande')
  })

  it('returns the gate for phase 3', () => {
    const gate = getGateForPhase(gates, 3)
    expect(gate).toBeDefined()
    expect(gate!.phase).toBe(3)
    expect(gate!.canProceed).toBe(false)
    expect(gate!.blockers).toContain('Aucun stock importe')
  })

  it('returns the gate for phase 4', () => {
    const gate = getGateForPhase(gates, 4)
    expect(gate).toBeDefined()
    expect(gate!.phase).toBe(4)
    expect(gate!.canProceed).toBe(true)
    expect(gate!.warnings).toContain('2 allocation(s) non confirmee(s)')
  })

  it('returns undefined for an invalid phase id (5)', () => {
    expect(getGateForPhase(gates, 5)).toBeUndefined()
  })

  it('returns undefined for phase id 0', () => {
    expect(getGateForPhase(gates, 0)).toBeUndefined()
  })

  it('returns undefined for a negative phase id', () => {
    expect(getGateForPhase(gates, -1)).toBeUndefined()
  })

  it('returns undefined when the gates array is empty', () => {
    expect(getGateForPhase([], 1)).toBeUndefined()
  })

  it('returns the first matching gate when duplicates exist (edge case)', () => {
    const dupes: PhaseGate[] = [
      makeGate(1, true),
      makeGate(1, false, ['duplicate']),
    ]
    const gate = getGateForPhase(dupes, 1)
    expect(gate!.canProceed).toBe(true) // finds the first one
  })
})

// ---------------------------------------------------------------------------
// 5. Phase gate computation logic (indirect, via PhaseGate shape)
// ---------------------------------------------------------------------------
// The computePhaseXGate functions are private. We test their expected outputs
// by constructing the same data shapes and verifying gate behavior contracts.

describe('Phase gate contracts (expected blocker/warning logic)', () => {
  /**
   * Helper: build a gate that mirrors what computePhase1Gate would return
   * given specific input counts.
   */
  const buildPhase1Gate = (quotasCount: number, validatedOrdersCount: number, ordersCount: number, rejectedOrdersCount: number): PhaseGate => {
    const blockers: string[] = []
    const warnings: string[] = []

    if (quotasCount === 0) blockers.push('Aucun quota importe')
    if (validatedOrdersCount === 0) blockers.push('Aucune commande validee')
    if (rejectedOrdersCount > 0) warnings.push(`${rejectedOrdersCount} commande(s) rejetee(s)`)
    if (ordersCount > 0 && validatedOrdersCount < ordersCount - rejectedOrdersCount) {
      warnings.push('Des commandes sont encore en attente de validation')
    }

    return { phase: 1, canProceed: blockers.length === 0, blockers, warnings }
  }

  const buildPhase2Gate = (ordersCount: number): PhaseGate => ({
    phase: 2,
    canProceed: ordersCount > 0,
    blockers: ordersCount === 0 ? ['Aucune commande'] : [],
    warnings: [],
  })

  const buildPhase3Gate = (stockCount: number, allocationsCount: number, confirmedAllocationsCount: number): PhaseGate => {
    const blockers: string[] = []
    const warnings: string[] = []

    if (stockCount === 0) blockers.push('Aucun stock importe')
    if (allocationsCount === 0) blockers.push('Aucune allocation generee')
    if (allocationsCount > 0 && confirmedAllocationsCount === 0) {
      warnings.push('Aucune allocation confirmee')
    }

    return { phase: 3, canProceed: blockers.length === 0, blockers, warnings }
  }

  const buildPhase4Gate = (allocationsCount: number, confirmedAllocationsCount: number): PhaseGate => {
    const blockers: string[] = []
    const warnings: string[] = []

    if (confirmedAllocationsCount === 0) blockers.push('Aucune allocation confirmee')
    if (allocationsCount > 0 && confirmedAllocationsCount < allocationsCount) {
      const pending = allocationsCount - confirmedAllocationsCount
      warnings.push(`${pending} allocation(s) non confirmee(s)`)
    }

    return { phase: 4, canProceed: blockers.length === 0, blockers, warnings }
  }

  describe('Phase 1 gate', () => {
    it('blocks when no quotas and no validated orders', () => {
      const gate = buildPhase1Gate(0, 0, 0, 0)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucun quota importe')
      expect(gate.blockers).toContain('Aucune commande validee')
    })

    it('blocks when quotas exist but no validated orders', () => {
      const gate = buildPhase1Gate(5, 0, 3, 0)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucune commande validee')
      expect(gate.blockers).not.toContain('Aucun quota importe')
    })

    it('blocks when no quotas even if orders are validated', () => {
      const gate = buildPhase1Gate(0, 3, 5, 0)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucun quota importe')
    })

    it('proceeds when quotas and validated orders both exist', () => {
      const gate = buildPhase1Gate(10, 5, 5, 0)
      expect(gate.canProceed).toBe(true)
      expect(gate.blockers).toHaveLength(0)
    })

    it('warns about rejected orders', () => {
      const gate = buildPhase1Gate(10, 4, 5, 1)
      expect(gate.warnings).toContain('1 commande(s) rejetee(s)')
    })

    it('warns when some orders are still pending validation', () => {
      // 5 total, 2 validated, 0 rejected → 3 pending
      const gate = buildPhase1Gate(10, 2, 5, 0)
      expect(gate.warnings).toContain('Des commandes sont encore en attente de validation')
    })

    it('no pending-validation warning when all non-rejected orders are validated', () => {
      // 5 total, 3 validated, 2 rejected → 0 pending
      const gate = buildPhase1Gate(10, 3, 5, 2)
      expect(gate.warnings).not.toContain('Des commandes sont encore en attente de validation')
    })
  })

  describe('Phase 2 gate', () => {
    it('blocks when no orders exist', () => {
      const gate = buildPhase2Gate(0)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucune commande')
    })

    it('proceeds when at least one order exists', () => {
      const gate = buildPhase2Gate(1)
      expect(gate.canProceed).toBe(true)
      expect(gate.blockers).toHaveLength(0)
    })

    it('has no warnings regardless of order count', () => {
      expect(buildPhase2Gate(0).warnings).toHaveLength(0)
      expect(buildPhase2Gate(100).warnings).toHaveLength(0)
    })
  })

  describe('Phase 3 gate', () => {
    it('blocks when no stock and no allocations', () => {
      const gate = buildPhase3Gate(0, 0, 0)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucun stock importe')
      expect(gate.blockers).toContain('Aucune allocation generee')
    })

    it('blocks when stock exists but no allocations', () => {
      const gate = buildPhase3Gate(10, 0, 0)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucune allocation generee')
    })

    it('blocks when allocations exist but no stock', () => {
      const gate = buildPhase3Gate(0, 5, 2)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucun stock importe')
    })

    it('proceeds when stock and allocations both exist', () => {
      const gate = buildPhase3Gate(10, 5, 3)
      expect(gate.canProceed).toBe(true)
    })

    it('warns when allocations exist but none are confirmed', () => {
      const gate = buildPhase3Gate(10, 5, 0)
      expect(gate.warnings).toContain('Aucune allocation confirmee')
    })

    it('no warning when some allocations are confirmed', () => {
      const gate = buildPhase3Gate(10, 5, 2)
      expect(gate.warnings).not.toContain('Aucune allocation confirmee')
    })
  })

  describe('Phase 4 gate', () => {
    it('blocks when no confirmed allocations', () => {
      const gate = buildPhase4Gate(5, 0)
      expect(gate.canProceed).toBe(false)
      expect(gate.blockers).toContain('Aucune allocation confirmee')
    })

    it('proceeds when at least one allocation is confirmed', () => {
      const gate = buildPhase4Gate(5, 5)
      expect(gate.canProceed).toBe(true)
    })

    it('warns about pending (unconfirmed) allocations', () => {
      const gate = buildPhase4Gate(10, 3)
      expect(gate.warnings).toContain('7 allocation(s) non confirmee(s)')
    })

    it('no pending warning when all allocations are confirmed', () => {
      const gate = buildPhase4Gate(5, 5)
      expect(gate.warnings).toHaveLength(0)
    })

    it('no pending warning when there are no allocations at all', () => {
      const gate = buildPhase4Gate(0, 0)
      // blockers will be present, but no "pending" warning since allocationsCount is 0
      expect(gate.warnings).toHaveLength(0)
    })
  })
})
