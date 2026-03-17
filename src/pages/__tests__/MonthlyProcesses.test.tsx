import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { MonthlyProcess } from '@/types/database'

// ---------------------------------------------------------------------------
// Hoisted test data — must be defined before vi.mock factories run
// ---------------------------------------------------------------------------

const { mockProcesses, mockNavigate } = vi.hoisted(() => {
  const processes = [
    {
      id: 'proc-001',
      month: 10,
      year: 2026,
      status: 'completed' as const,
      phase: 'cloture' as const,
      current_step: 12,
      quotas_count: 175,
      orders_count: 118,
      allocations_count: 96,
      date_ouverture: '2026-10-01T00:00:00Z',
      date_cloture: '2026-10-31T00:00:00Z',
      notes: null,
      metadata: {},
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-31T00:00:00Z',
    },
    {
      id: 'proc-002',
      month: 2,
      year: 2026,
      status: 'importing_orders' as const,
      phase: 'commandes' as const,
      current_step: 2,
      quotas_count: 21,
      orders_count: 5,
      allocations_count: 0,
      date_ouverture: '2026-02-01T00:00:00Z',
      date_cloture: null,
      notes: null,
      metadata: {},
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-10T00:00:00Z',
    },
  ] satisfies MonthlyProcess[]

  return {
    mockProcesses: processes,
    mockNavigate: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            data: mockProcesses,
            error: null,
          }),
        }),
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({
            data: mockProcesses[0],
            error: null,
          }),
          data: [],
          error: null,
        }),
        single: vi.fn().mockReturnValue({
          data: mockProcesses[0],
          error: null,
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({
            data: { id: 'new-proc-id' },
            error: null,
          }),
        }),
      }),
    }),
  },
}))

// ---------------------------------------------------------------------------
// react-router-dom mock
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'proc-001' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

// ---------------------------------------------------------------------------
// Heavy step component mocks (avoids pulling in unrelated dependencies)
// ---------------------------------------------------------------------------

vi.mock('@/components/monthly-process/steps/QuotaImportStep', () => ({
  default: () => <div data-testid="step-quota-import">QuotaImportStep</div>,
}))
vi.mock('@/components/monthly-process/steps/OrderImportStep', () => ({
  default: () => <div data-testid="step-order-import">OrderImportStep</div>,
}))
vi.mock('@/components/monthly-process/steps/OrderReviewStep', () => ({
  default: () => <div data-testid="step-order-review">OrderReviewStep</div>,
}))
vi.mock('@/components/monthly-process/steps/MacroAttributionStep', () => ({
  default: () => <div data-testid="step-macro">MacroAttributionStep</div>,
}))
vi.mock('@/components/monthly-process/steps/WholesalerExportStep', () => ({
  default: () => <div data-testid="step-wholesaler-export">WholesalerExportStep</div>,
}))
vi.mock('@/components/monthly-process/steps/NegotiationStep', () => ({
  default: () => <div data-testid="step-negotiation">NegotiationStep</div>,
}))
vi.mock('@/components/monthly-process/steps/ReExportStep', () => ({
  default: () => <div data-testid="step-reexport">ReExportStep</div>,
}))
vi.mock('@/components/monthly-process/steps/StockImportStep', () => ({
  default: () => <div data-testid="step-stock-import">StockImportStep</div>,
}))
vi.mock('@/components/monthly-process/steps/StockAggregationStep', () => ({
  default: () => <div data-testid="step-stock-agg">StockAggregationStep</div>,
}))
vi.mock('@/components/monthly-process/steps/AllocationExecutionStep', () => ({
  default: () => <div data-testid="step-allocation">AllocationExecutionStep</div>,
}))
vi.mock('@/components/monthly-process/steps/AllocationReviewStep', () => ({
  default: () => <div data-testid="step-alloc-review">AllocationReviewStep</div>,
}))
vi.mock('@/components/monthly-process/steps/FinalizationStep', () => ({
  default: () => <div data-testid="step-finalization">FinalizationStep</div>,
}))
vi.mock('@/components/monthly-process/DemoDataLoader', () => ({
  default: () => <div data-testid="demo-loader">DemoDataLoader</div>,
}))
vi.mock('@/components/monthly-process/ReopenPhaseDialog', () => ({
  default: () => <div data-testid="reopen-dialog">ReopenPhaseDialog</div>,
}))
vi.mock('@/components/monthly-process/WaitingStockBanner', () => ({
  default: () => <div data-testid="waiting-stock-banner">WaitingStockBanner</div>,
}))
vi.mock('@/components/monthly-process/StepQualityScore', () => ({
  default: () => <div data-testid="step-quality-score">StepQualityScore</div>,
}))
vi.mock('@/components/ConfirmDialog', () => ({
  default: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div data-testid="confirm-dialog">{children}</div> : null,
}))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn() }))

// ---------------------------------------------------------------------------
// Imports under test (placed after all mocks)
// ---------------------------------------------------------------------------

import MonthlyProcessesPage from '@/pages/MonthlyProcessesPage'
import MonthlyProcessDetailPage from '@/pages/MonthlyProcessDetailPage'
import MonthlyProcessCard from '@/components/monthly-process/MonthlyProcessCard'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

interface WrapperProps {
  children: React.ReactNode
  initialEntries?: string[]
}

function Wrapper({ children, initialEntries = ['/'] }: WrapperProps) {
  const client = makeQueryClient()
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests — MonthlyProcessesPage
// ---------------------------------------------------------------------------

describe('MonthlyProcessesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title "Processus Mensuels"', () => {
    render(
      <Wrapper>
        <MonthlyProcessesPage />
      </Wrapper>
    )
    expect(screen.getByText('Processus Mensuels')).toBeInTheDocument()
  })

  it('shows loading state initially — no card content visible before data resolves', async () => {
    // Block the supabase response so isLoading stays true
    const { supabase } = await import('@/lib/supabase')
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
        }),
      }),
    })

    render(
      <Wrapper>
        <MonthlyProcessesPage />
      </Wrapper>
    )

    // Heading must be visible immediately
    expect(screen.getByText('Processus Mensuels')).toBeInTheDocument()
    // No card data yet
    expect(screen.queryByText('Octobre 2026')).not.toBeInTheDocument()
  })

  it('renders process cards when data loads', async () => {
    render(
      <Wrapper>
        <MonthlyProcessesPage />
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('Octobre 2026')).toBeInTheDocument()
    })
    expect(screen.getByText('Fevrier 2026')).toBeInTheDocument()
  })

  it('"Nouveau" button is visible', () => {
    render(
      <Wrapper>
        <MonthlyProcessesPage />
      </Wrapper>
    )
    expect(screen.getByText('Nouveau')).toBeInTheDocument()
  })

  it('opens create dialog when "Nouveau" button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <MonthlyProcessesPage />
      </Wrapper>
    )

    await user.click(screen.getByText('Nouveau'))

    await waitFor(() => {
      expect(screen.getByText('Nouveau processus')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Tests — MonthlyProcessCard
// ---------------------------------------------------------------------------

describe('MonthlyProcessCard', () => {
  const completedProcess = mockProcesses[0]
  const activeProcess = mockProcesses[1]

  function renderCard(process: MonthlyProcess, index = 0) {
    return render(
      <Wrapper>
        <MonthlyProcessCard process={process} index={index} />
      </Wrapper>
    )
  }

  it('displays month name and year for a completed process', () => {
    renderCard(completedProcess)
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument()
  })

  it('displays month name and year for an active process', () => {
    renderCard(activeProcess)
    expect(screen.getByText('Fevrier 2026')).toBeInTheDocument()
  })

  it('shows "Termine" status badge for a completed process', () => {
    renderCard(completedProcess)
    expect(screen.getByText('Termine')).toBeInTheDocument()
  })

  it('shows "Import commandes" status badge for an active process', () => {
    renderCard(activeProcess)
    expect(screen.getByText('Import commandes')).toBeInTheDocument()
  })

  it('shows orders_count for a completed process', () => {
    renderCard(completedProcess)
    expect(screen.getByText('118')).toBeInTheDocument()
    expect(screen.getByText('commandes')).toBeInTheDocument()
  })

  it('shows allocations_count for a completed process', () => {
    renderCard(completedProcess)
    expect(screen.getByText('96')).toBeInTheDocument()
    expect(screen.getByText('allocations')).toBeInTheDocument()
  })

  it('renders a link pointing to the correct process detail route', () => {
    renderCard(completedProcess)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/monthly-processes/proc-001')
  })

  it('shows step indicator text including current step for completed process', () => {
    renderCard(completedProcess)
    // The card renders "Etape 12/12 — Finalisation"
    expect(screen.getByText(/Etape 12\/12/)).toBeInTheDocument()
  })

  it('shows step indicator text including current step for active process', () => {
    renderCard(activeProcess)
    expect(screen.getByText(/Etape 2\/12/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests — MonthlyProcessDetailPage (structural tests)
// ---------------------------------------------------------------------------

describe('MonthlyProcessDetailPage', () => {
  async function renderDetail() {
    const { supabase } = await import('@/lib/supabase')
    // Detail page uses: supabase.from('monthly_processes').select('*').eq('id', id).maybeSingle()
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: mockProcesses[0],
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: mockProcesses[0],
            error: null,
          }),
        }),
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockProcesses,
            error: null,
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    return render(
      <Wrapper initialEntries={['/monthly-processes/proc-001']}>
        <MonthlyProcessDetailPage />
      </Wrapper>
    )
  }

  it('renders the month name in the header after data loads', async () => {
    await renderDetail()

    await waitFor(() => {
      // Multiple elements may display the month name (breadcrumb + heading)
      const matches = screen.getAllByText('Octobre 2026')
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('renders the PhaseTabBar with phase labels', async () => {
    await renderDetail()

    await waitFor(() => {
      // PhaseTabBar renders "Phase 1 — Commandes", "Phase 2 — Negociation", etc.
      const phase1 = screen.queryByText(/Phase 1/)
      const phase2 = screen.queryByText(/Phase 2/)
      expect(phase1 ?? phase2).toBeTruthy()
    }, { timeout: 3000 })
  })
})
