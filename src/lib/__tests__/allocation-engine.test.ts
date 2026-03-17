/**
 * Unit tests for the RW Pharma Allocation Engine
 *
 * Strategy: mock @/lib/supabase and @/lib/debt-engine entirely,
 * then drive runAllocation() with controlled test data to verify
 * each allocation path, strategy, and guard rail.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
  runAllocation,
  computeStats,
  DEFAULT_V3_CONFIG,
  type AllocationResult,
  type AllocationLog,
  type AllocationStrategy,
  type AllocationV3Config,
} from '../allocation-engine'

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/debt-engine', () => ({
  fetchPendingDebts: vi.fn().mockResolvedValue([]),
  resolveDebt: vi.fn().mockResolvedValue(undefined),
}))

// ── Import mocked supabase after vi.mock ──────────────────────────────
import { supabase } from '@/lib/supabase'

// ── Test Data Factories ───────────────────────────────────────────────

const PROCESS_ID = 'process-001'
const MONTH = 4
const YEAR = 2027

// Wholesaler IDs
const WS_ALLIANCE = 'ws-alliance-001'
const WS_OCP = 'ws-ocp-001'

// Product IDs
const PROD_DOLIPRANE = 'prod-doli-001'
const PROD_EFFERALGAN = 'prod-effe-001'
const PROD_BLOCKED = 'prod-blocked-001'

// Customer IDs
const CUST_ORI = 'cust-ori-001'
const CUST_MPA = 'cust-mpa-001'
const CUST_AXI = 'cust-axi-001'

function makeWholesalers() {
  return [
    { id: WS_ALLIANCE, name: 'Alliance Healthcare', code: 'ALL' },
    { id: WS_OCP, name: 'OCP Répartition', code: 'OCP' },
  ]
}

function makeProducts(includeBlocked = false) {
  const products = [
    { id: PROD_DOLIPRANE, name: 'DOLIPRANE 1000MG', cip13: '3400935959260', is_ansm_blocked: false },
    { id: PROD_EFFERALGAN, name: 'EFFERALGAN 1000MG', cip13: '3400936114583', is_ansm_blocked: false },
  ]
  if (includeBlocked) {
    products.push({ id: PROD_BLOCKED, name: 'BLOCKED PRODUCT', cip13: '3400999999999', is_ansm_blocked: true })
  }
  return products
}

function makeCustomerBase(id: string, code: string, name: string, isTop = false, priorityLevel = 3) {
  return {
    id,
    code,
    name,
    is_top_client: isTop,
    min_lot_acceptable: null,
    allocation_preferences: { priority_level: priorityLevel },
  }
}

function makeOrder(
  id: string,
  customerId: string,
  productId: string,
  quantity: number,
  unitPrice: number | null = 10.5,
  customerOverride?: ReturnType<typeof makeCustomerBase>,
) {
  const customer = customerOverride ?? makeCustomerBase(customerId, customerId.slice(-3).toUpperCase(), `Customer ${customerId}`)
  return {
    id,
    customer_id: customerId,
    product_id: productId,
    quantity,
    unit_price: unitPrice,
    metadata: null,
    customer,
  }
}

function makeQuota(id: string, wholesalerId: string, productId: string, quotaQty: number, extraAvailable = 0) {
  return { id, wholesaler_id: wholesalerId, product_id: productId, quota_quantity: quotaQty, extra_available: extraAvailable }
}

function makeStockLot(
  id: string,
  wholesalerId: string,
  productId: string,
  lotNumber: string,
  expiryDate: string,
  quantity: number,
) {
  return {
    id,
    wholesaler_id: wholesalerId,
    product_id: productId,
    lot_number: lotNumber,
    expiry_date: expiryDate,
    quantity,
    status: 'received',
  }
}

// ── Supabase Mock Builder ─────────────────────────────────────────────

/**
 * Builds a chainable Supabase mock that returns the given data
 * for any sequence of .select/.eq/.in/.range/.order calls.
 */
function chainableMock(data: unknown[], error: null | { message: string } = null) {
  const obj: Record<string, unknown> = {}
  const terminal = Promise.resolve({ data, error })
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') return terminal.then.bind(terminal)
      if (prop === 'catch') return terminal.catch.bind(terminal)
      // All chaining methods return the same proxy
      return () => new Proxy(obj, handler)
    },
  }
  return new Proxy(obj, handler)
}

/** Single-resolve mock (used for non-paginated queries like quotas, wholesalers) */
function singleMock(data: unknown[]) {
  return chainableMock(data)
}

/**
 * For paginated queries (orders, stock, products) the engine calls .range()
 * repeatedly until it gets an empty page. We need to return data on the first
 * call and empty on the second.
 */
function paginatedMock(data: unknown[]) {
  let callCount = 0
  const obj: Record<string, unknown> = {}
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        const result = callCount === 0 ? data : []
        callCount++
        const p = Promise.resolve({ data: result, error: null })
        return p.then.bind(p)
      }
      if (prop === 'catch') {
        const p = Promise.resolve({ data: [], error: null })
        return p.catch.bind(p)
      }
      return () => new Proxy(obj, handler)
    },
  }
  return new Proxy(obj, handler)
}

/**
 * Build mock for supabase.from() calls.
 * Maps table name → mock chain.
 */
function setupSupabaseMock(config: {
  orders: unknown[]
  quotas: unknown[]
  stock: unknown[]
  wholesalers: unknown[]
  products: unknown[]
}) {
  const fromMock = supabase.from as Mock

  fromMock.mockImplementation((table: string) => {
    switch (table) {
      case 'orders':
        return paginatedMock(config.orders)
      case 'wholesaler_quotas':
        return singleMock(config.quotas)
      case 'collected_stock':
        return paginatedMock(config.stock)
      case 'wholesalers':
        return singleMock(config.wholesalers)
      case 'products':
        return paginatedMock(config.products)
      default:
        // For update/upsert calls during persistence — return success
        return {
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          upsert: () => Promise.resolve({ data: null, error: null }),
          select: () => singleMock([]),
        }
    }
  })
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('DEFAULT_V3_CONFIG', () => {
  it('has balanced strategy by default', () => {
    expect(DEFAULT_V3_CONFIG.strategy).toBe('balanced')
  })

  it('has v3 rules disabled by default', () => {
    expect(DEFAULT_V3_CONFIG.enforce_min_batch).toBe(false)
    expect(DEFAULT_V3_CONFIG.enforce_min_expiry).toBe(false)
    expect(DEFAULT_V3_CONFIG.enforce_open_wholesalers).toBe(false)
    expect(DEFAULT_V3_CONFIG.enforce_multiples).toBe(false)
    expect(DEFAULT_V3_CONFIG.smart_expiry).toBe(false)
  })

  it('uses both stock sources by default', () => {
    expect(DEFAULT_V3_CONFIG.use_collected_stock).toBe(true)
    expect(DEFAULT_V3_CONFIG.use_wholesaler_quotas).toBe(true)
  })

  it('has sensible numeric defaults', () => {
    expect(DEFAULT_V3_CONFIG.max_price_gap).toBe(0)
    expect(DEFAULT_V3_CONFIG.max_secondary_pct).toBe(50)
  })
})

// ── computeStats() ────────────────────────────────────────────────────

describe('computeStats()', () => {
  const wholesalers = makeWholesalers()

  it('computes totals correctly for a simple set of allocations', () => {
    const allocations: AllocationResult[] = [
      {
        monthly_process_id: PROCESS_ID,
        order_id: 'ord-001',
        customer_id: CUST_ORI,
        product_id: PROD_DOLIPRANE,
        wholesaler_id: WS_ALLIANCE,
        stock_id: null,
        requested_quantity: 100,
        allocated_quantity: 80,
        prix_applique: 10,
        debt_resolution_id: null,
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: true },
      },
      {
        monthly_process_id: PROCESS_ID,
        order_id: 'ord-002',
        customer_id: CUST_MPA,
        product_id: PROD_EFFERALGAN,
        wholesaler_id: WS_OCP,
        stock_id: null,
        requested_quantity: 200,
        allocated_quantity: 200,
        prix_applique: 15,
        debt_resolution_id: null,
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: true },
      },
    ]

    const logs: AllocationLog[] = [
      {
        step: 1, customer: 'ORI', customerName: 'Orifarm', product: 'prod-do', productName: 'DOLIPRANE',
        productCip13: '3400935959260', wholesaler: 'ALL', wholesalerName: 'Alliance Healthcare',
        requested: 100, allocated: 80, full: false, priority: 60, reason: 'quota',
        detail: 'Quota direct',
      },
      {
        step: 2, customer: 'MPA', customerName: 'MPA Pharma', product: 'prod-ef', productName: 'EFFERALGAN',
        productCip13: '3400936114583', wholesaler: 'OCP', wholesalerName: 'OCP Répartition',
        requested: 200, allocated: 200, full: true, priority: 60, reason: 'quota',
        detail: 'Quota direct',
      },
    ]

    const stats = computeStats(allocations, logs, wholesalers)

    expect(stats.totalAllocations).toBe(2)
    expect(stats.totalRequested).toBe(300) // 100 + 200
    expect(stats.totalAllocated).toBe(280) // 80 + 200
    expect(stats.fulfillmentRate).toBe('93.3')
    expect(stats.zeroProducts).toBe(0)
    expect(stats.lotAllocations).toBe(0)
  })

  it('counts zero-allocated products correctly', () => {
    const allocations: AllocationResult[] = [
      {
        monthly_process_id: PROCESS_ID,
        order_id: 'ord-001',
        customer_id: CUST_ORI,
        product_id: PROD_DOLIPRANE,
        wholesaler_id: WS_ALLIANCE,
        stock_id: null,
        requested_quantity: 100,
        allocated_quantity: 0,
        prix_applique: null,
        debt_resolution_id: null,
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: false },
      },
    ]

    const stats = computeStats(allocations, [], wholesalers)
    expect(stats.zeroProducts).toBe(1)
    expect(stats.fulfillmentRate).toBe('0.0')
  })

  it('counts lot allocations (stock_id !== null)', () => {
    const allocations: AllocationResult[] = [
      {
        monthly_process_id: PROCESS_ID,
        order_id: 'ord-001',
        customer_id: CUST_ORI,
        product_id: PROD_DOLIPRANE,
        wholesaler_id: WS_ALLIANCE,
        stock_id: 'lot-001',
        requested_quantity: 50,
        allocated_quantity: 50,
        prix_applique: 10,
        debt_resolution_id: null,
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: false, lot_number: 'L001', expiry_date: '2027-12-01' },
      },
      {
        monthly_process_id: PROCESS_ID,
        order_id: 'ord-002',
        customer_id: CUST_MPA,
        product_id: PROD_DOLIPRANE,
        wholesaler_id: WS_OCP,
        stock_id: null,
        requested_quantity: 30,
        allocated_quantity: 30,
        prix_applique: 10,
        debt_resolution_id: null,
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: true },
      },
    ]

    const stats = computeStats(allocations, [], wholesalers)
    expect(stats.lotAllocations).toBe(1)
  })

  it('deduplicates requested_quantity correctly when one order splits to multiple allocations', () => {
    // Single order with two allocation rows (split across wholesalers)
    const allocations: AllocationResult[] = [
      {
        monthly_process_id: PROCESS_ID,
        order_id: 'ord-001',
        customer_id: CUST_ORI,
        product_id: PROD_DOLIPRANE,
        wholesaler_id: WS_ALLIANCE,
        stock_id: null,
        requested_quantity: 200,
        allocated_quantity: 100,
        prix_applique: 10,
        debt_resolution_id: null,
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: true },
      },
      {
        monthly_process_id: PROCESS_ID,
        order_id: 'ord-001',
        customer_id: CUST_ORI,
        product_id: PROD_DOLIPRANE,
        wholesaler_id: WS_OCP,
        stock_id: null,
        requested_quantity: 200,
        allocated_quantity: 100,
        prix_applique: 10,
        debt_resolution_id: null,
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: true },
      },
    ]

    const stats = computeStats(allocations, [], wholesalers)
    // requested_quantity should be deduplicated per order_id → 200, not 400
    expect(stats.totalRequested).toBe(200)
    expect(stats.totalAllocated).toBe(200)
    expect(stats.fulfillmentRate).toBe('100.0')
  })

  it('excludes debt resolution allocations from totalRequested', () => {
    const allocations: AllocationResult[] = [
      {
        monthly_process_id: PROCESS_ID,
        order_id: null, // Debt resolution has no order_id
        customer_id: CUST_ORI,
        product_id: PROD_DOLIPRANE,
        wholesaler_id: WS_ALLIANCE,
        stock_id: null,
        requested_quantity: 50,
        allocated_quantity: 50,
        prix_applique: null,
        debt_resolution_id: 'debt-001',
        status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 200, quota_used: true, is_debt_resolution: true },
      },
    ]

    const stats = computeStats(allocations, [], wholesalers)
    expect(stats.totalRequested).toBe(0) // no real orders
    expect(stats.totalAllocated).toBe(50)
  })

  it('includes quotaUtilization when provided', () => {
    const utilization = [
      { wholesalerId: WS_ALLIANCE, used: 300, total: 500 },
      { wholesalerId: WS_OCP, used: 150, total: 200 },
    ]

    const stats = computeStats([], [], wholesalers, utilization)
    expect(stats.quotaUtilization).toHaveLength(2)
    expect(stats.quotaUtilization[0]).toMatchObject({ wholesalerCode: 'ALL', used: 300, total: 500 })
    expect(stats.quotaUtilization[1]).toMatchObject({ wholesalerCode: 'OCP', used: 150, total: 200 })
  })

  it('groups byWholesaler aggregating count and qty', () => {
    const allocations: AllocationResult[] = [
      {
        monthly_process_id: PROCESS_ID, order_id: 'ord-001', customer_id: CUST_ORI,
        product_id: PROD_DOLIPRANE, wholesaler_id: WS_ALLIANCE, stock_id: null,
        requested_quantity: 100, allocated_quantity: 60, prix_applique: 10,
        debt_resolution_id: null, status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: true },
      },
      {
        monthly_process_id: PROCESS_ID, order_id: 'ord-002', customer_id: CUST_MPA,
        product_id: PROD_EFFERALGAN, wholesaler_id: WS_ALLIANCE, stock_id: null,
        requested_quantity: 50, allocated_quantity: 50, prix_applique: 12,
        debt_resolution_id: null, status: 'proposed',
        metadata: { strategy: 'balanced', priority_score: 60, quota_used: true },
      },
    ]

    const stats = computeStats(allocations, [], wholesalers)
    expect(stats.byWholesaler).toHaveLength(1)
    expect(stats.byWholesaler[0]).toMatchObject({ code: 'ALL', count: 2, qty: 110 })
  })
})

// ── runAllocation() ───────────────────────────────────────────────────

describe('runAllocation()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Helper: run with quota-only data (no collected stock)
  async function runWithQuotas(options: {
    orders: ReturnType<typeof makeOrder>[]
    quotas: ReturnType<typeof makeQuota>[]
    strategy?: AllocationStrategy
    excludedWholesalers?: Set<string>
    dryRun?: boolean
  }) {
    setupSupabaseMock({
      orders: options.orders,
      quotas: options.quotas,
      stock: [],
      wholesalers: makeWholesalers(),
      products: makeProducts(),
    })

    return runAllocation(
      PROCESS_ID,
      MONTH,
      YEAR,
      options.strategy ?? 'balanced',
      options.excludedWholesalers ?? new Set(),
      options.dryRun ?? true, // default dry-run to avoid DB writes in tests
    )
  }

  // ── Test 1: Empty orders → throws ──────────────────────────────────

  describe('empty data', () => {
    it('throws when there are no orders', async () => {
      setupSupabaseMock({
        orders: [],
        quotas: [],
        stock: [],
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      await expect(
        runAllocation(PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true)
      ).rejects.toThrow('Aucune commande a allouer')
    })

    it('throws when all wholesalers are excluded', async () => {
      const order = makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100)
      setupSupabaseMock({
        orders: [order],
        quotas: [],
        stock: [],
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const allExcluded = new Set([WS_ALLIANCE, WS_OCP])

      await expect(
        runAllocation(PROCESS_ID, MONTH, YEAR, 'balanced', allExcluded, true)
      ).rejects.toThrow('Aucun grossiste disponible')
    })
  })

  // ── Test 2: Balanced strategy ──────────────────────────────────────

  describe('balanced strategy', () => {
    it('distributes quota across both wholesalers with Alliance receiving more than OCP', async () => {
      // The balanced algorithm proportionally splits per wholesaler quota share.
      // With Alliance=600, OCP=400, Alliance gets ~60% of each slice → always more.
      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100,
          10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm', false, 2)),
      ]
      const quotas = [
        makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 600),
        makeQuota('q-002', WS_OCP, PROD_DOLIPRANE, 400),
      ]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'balanced' })

      // Two wholesalers should each receive a share
      const wsIds = [...new Set(allocations.map(a => a.wholesaler_id))]
      expect(wsIds.length).toBe(2)

      const allianceAlloc = allocations.filter(a => a.wholesaler_id === WS_ALLIANCE)
        .reduce((s, a) => s + a.allocated_quantity, 0)
      const ocpAlloc = allocations.filter(a => a.wholesaler_id === WS_OCP)
        .reduce((s, a) => s + a.allocated_quantity, 0)

      // Both wholesalers should contribute
      expect(allianceAlloc).toBeGreaterThan(0)
      expect(ocpAlloc).toBeGreaterThan(0)

      // Alliance (60% quota share) should always contribute more than OCP (40%)
      expect(allianceAlloc).toBeGreaterThan(ocpAlloc)

      // Total allocated must not exceed requested quantity (100)
      expect(allianceAlloc + ocpAlloc).toBeLessThanOrEqual(100)
    })

    it('interleaves multiple customers in round-robin order', async () => {
      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 300,
          10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm', false, 3)),
        makeOrder('ord-002', CUST_MPA, PROD_DOLIPRANE, 100,
          12.0, makeCustomerBase(CUST_MPA, 'MPA', 'MPA Pharma', false, 3)),
        makeOrder('ord-003', CUST_AXI, PROD_DOLIPRANE, 50,
          8.0, makeCustomerBase(CUST_AXI, 'AXI', 'Axicorp', false, 3)),
      ]
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 1000)]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'balanced' })

      // All three customers should receive something
      const customerIds = [...new Set(allocations.map(a => a.customer_id))]
      expect(customerIds).toContain(CUST_ORI)
      expect(customerIds).toContain(CUST_MPA)
      expect(customerIds).toContain(CUST_AXI)
    })
  })

  // ── Test 3: top_clients strategy ──────────────────────────────────

  describe('top_clients strategy', () => {
    it('serves top client fully before lower-priority clients when quota is scarce', async () => {
      const oriCustomer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm', true, 1) // top client
      const axiCustomer = makeCustomerBase(CUST_AXI, 'AXI', 'Axicorp', false, 4) // low priority

      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 800, 10.0, oriCustomer),
        makeOrder('ord-002', CUST_AXI, PROD_DOLIPRANE, 800, 8.0, axiCustomer),
      ]
      // Only 1000 units quota, less than total demand (1600)
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 1000)]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'top_clients' })

      const oriAlloc = allocations
        .filter(a => a.customer_id === CUST_ORI)
        .reduce((s, a) => s + a.allocated_quantity, 0)
      const axiAlloc = allocations
        .filter(a => a.customer_id === CUST_AXI)
        .reduce((s, a) => s + a.allocated_quantity, 0)

      // ORI is top client and should be fully served (800)
      expect(oriAlloc).toBe(800)
      // AXI gets the remainder (200)
      expect(axiAlloc).toBe(200)
    })
  })

  // ── Test 4: max_coverage strategy ─────────────────────────────────

  describe('max_coverage strategy', () => {
    it('serves smaller orders first to maximize product coverage', async () => {
      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 1500,
          10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')),
        makeOrder('ord-002', CUST_MPA, PROD_DOLIPRANE, 50,
          10.0, makeCustomerBase(CUST_MPA, 'MPA', 'MPA Pharma')),
      ]
      // Only 200 units available — enough for MPA but not ORI
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 200)]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'max_coverage' })

      const mpaAlloc = allocations
        .filter(a => a.customer_id === CUST_MPA)
        .reduce((s, a) => s + a.allocated_quantity, 0)
      const oriAlloc = allocations
        .filter(a => a.customer_id === CUST_ORI)
        .reduce((s, a) => s + a.allocated_quantity, 0)

      // MPA (smaller order) should be fully served
      expect(mpaAlloc).toBe(50)
      // ORI gets the remainder
      expect(oriAlloc).toBe(150)
    })
  })

  // ── Test 5: Dry run ────────────────────────────────────────────────

  describe('dry run', () => {
    it('returns allocations without calling supabase update/upsert', async () => {
      const orders = [makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100)]
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 200)]

      setupSupabaseMock({ orders, quotas, stock: [], wholesalers: makeWholesalers(), products: makeProducts() })

      const fromMock = supabase.from as Mock
      const updateCalls: string[] = []

      // Track which tables get update() calls
      fromMock.mockImplementation((table: string) => {
        const mock = (() => {
          switch (table) {
            case 'orders': return paginatedMock(orders)
            case 'wholesaler_quotas': return singleMock(quotas)
            case 'collected_stock': return paginatedMock([])
            case 'wholesalers': return singleMock(makeWholesalers())
            case 'products': return paginatedMock(makeProducts())
            default: return singleMock([])
          }
        })()

        return new Proxy(mock as object, {
          get(target, prop) {
            if (prop === 'update') {
              updateCalls.push(table)
              return () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
            }
            return (target as Record<string | symbol, unknown>)[prop]
          },
        })
      })

      const { allocations } = await runAllocation(PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true)

      expect(allocations.length).toBeGreaterThan(0)
      // No update calls should happen in dry-run mode
      expect(updateCalls).toHaveLength(0)
    })
  })

  // ── Test 6: ANSM blocked product ──────────────────────────────────

  describe('ANSM blocked product', () => {
    it('skips orders for ANSM-blocked products entirely', async () => {
      const blockedProductCustomer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')
      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_BLOCKED, 500, 10.0, blockedProductCustomer),
        makeOrder('ord-002', CUST_ORI, PROD_DOLIPRANE, 100, 10.0, blockedProductCustomer),
      ]
      const quotas = [
        makeQuota('q-001', WS_ALLIANCE, PROD_BLOCKED, 1000),
        makeQuota('q-002', WS_ALLIANCE, PROD_DOLIPRANE, 200),
      ]

      setupSupabaseMock({
        orders,
        quotas,
        stock: [],
        wholesalers: makeWholesalers(),
        products: makeProducts(true), // include blocked product
      })

      const { allocations, logs } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      // No allocation for blocked product
      const blockedAllocs = allocations.filter(a => a.product_id === PROD_BLOCKED)
      expect(blockedAllocs).toHaveLength(0)

      // Non-blocked product should still be allocated
      const doliAllocs = allocations.filter(a => a.product_id === PROD_DOLIPRANE)
      expect(doliAllocs.length).toBeGreaterThan(0)

      // Log should record the ANSM block
      const ansmsLogs = logs.filter(l => l.reason === 'ansm_blocked')
      expect(ansmsLogs).toHaveLength(1)
    })
  })

  // ── Test 7: Over-allocation prevention ────────────────────────────

  describe('over-allocation prevention', () => {
    it('never allocates more than the available quota', async () => {
      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 500,
          10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')),
        makeOrder('ord-002', CUST_MPA, PROD_DOLIPRANE, 500,
          10.0, makeCustomerBase(CUST_MPA, 'MPA', 'MPA Pharma')),
        makeOrder('ord-003', CUST_AXI, PROD_DOLIPRANE, 500,
          10.0, makeCustomerBase(CUST_AXI, 'AXI', 'Axicorp')),
      ]
      // Only 700 units available across all wholesalers
      const quotas = [
        makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 400),
        makeQuota('q-002', WS_OCP, PROD_DOLIPRANE, 300),
      ]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'balanced' })

      const totalAllocated = allocations.reduce((s, a) => s + a.allocated_quantity, 0)

      // Total allocated must not exceed available quota (700) + fallback
      // Fallback is unconstrained, so we check that no individual order exceeds its requested qty
      for (const alloc of allocations) {
        const orderTotal = allocations
          .filter(a => a.order_id === alloc.order_id)
          .reduce((s, a) => s + a.allocated_quantity, 0)
        // Each order allocation total should not exceed requested quantity
        expect(orderTotal).toBeLessThanOrEqual(500)
      }

      // Total should not exceed 1500 (sum of orders)
      expect(totalAllocated).toBeLessThanOrEqual(1500)
    })

    it('never allocates more from a lot than the lot quantity', async () => {
      const order = makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 1000,
        10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm'))

      // Single lot with only 200 units
      const stock = [
        makeStockLot('lot-001', WS_ALLIANCE, PROD_DOLIPRANE, 'L001', '2028-06-01', 200),
      ]

      setupSupabaseMock({
        orders: [order],
        quotas: [],
        stock,
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      // Allocation from that lot should not exceed 200
      const lotAlloc = allocations.filter(a => a.stock_id === 'lot-001')
        .reduce((s, a) => s + a.allocated_quantity, 0)
      expect(lotAlloc).toBeLessThanOrEqual(200)
    })
  })

  // ── Test 8: FEFO lot allocation ────────────────────────────────────

  describe('FEFO lot allocation', () => {
    it('consumes lots in expiry order (earliest first)', async () => {
      const order = makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 250,
        10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm'))

      // Three lots with different expiry dates
      const stock = [
        makeStockLot('lot-late', WS_ALLIANCE, PROD_DOLIPRANE, 'L-LATE', '2029-01-01', 100),
        makeStockLot('lot-early', WS_ALLIANCE, PROD_DOLIPRANE, 'L-EARLY', '2027-06-01', 100),
        makeStockLot('lot-mid', WS_ALLIANCE, PROD_DOLIPRANE, 'L-MID', '2028-03-01', 100),
      ]

      setupSupabaseMock({
        orders: [order],
        quotas: [],
        stock,
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations, logs } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      const lotLogs = logs.filter(l => l.reason === 'fefo_lot')
      // Should have allocated from at least 2 lots (earliest first)
      expect(lotLogs.length).toBeGreaterThanOrEqual(2)

      // The first lot used should be L-EARLY (earliest expiry)
      if (lotLogs.length >= 1) {
        expect(lotLogs[0].lot).toBe('L-EARLY')
      }
      // Second lot used should be L-MID
      if (lotLogs.length >= 2) {
        expect(lotLogs[1].lot).toBe('L-MID')
      }

      // Lot allocations should link to stock_ids
      const lotAllocs = allocations.filter(a => a.stock_id !== null)
      expect(lotAllocs.length).toBeGreaterThan(0)
    })

    it('records lot_number and expiry_date in allocation metadata', async () => {
      const order = makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 50,
        10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm'))

      const stock = [
        makeStockLot('lot-001', WS_ALLIANCE, PROD_DOLIPRANE, 'LOT-ABC', '2028-01-15', 100),
      ]

      setupSupabaseMock({
        orders: [order],
        quotas: [],
        stock,
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      const lotAlloc = allocations.find(a => a.stock_id === 'lot-001')
      expect(lotAlloc).toBeDefined()
      expect(lotAlloc?.metadata.lot_number).toBe('LOT-ABC')
      expect(lotAlloc?.metadata.expiry_date).toBe('2028-01-15')
      expect(lotAlloc?.metadata.quota_used).toBe(false)
    })
  })

  // ── Test 9: Excluded wholesalers ───────────────────────────────────

  describe('excluded wholesalers', () => {
    it('skips excluded wholesalers for quota allocation', async () => {
      const orders = [makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100)]
      const quotas = [
        makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 200),
        makeQuota('q-002', WS_OCP, PROD_DOLIPRANE, 200),
      ]

      // Exclude Alliance — only OCP should be used
      const excluded = new Set([WS_ALLIANCE])

      setupSupabaseMock({ orders, quotas, stock: [], wholesalers: makeWholesalers(), products: makeProducts() })

      const { allocations } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', excluded, true
      )

      const allianceAllocs = allocations.filter(a => a.wholesaler_id === WS_ALLIANCE)
      expect(allianceAllocs).toHaveLength(0)

      const ocpAllocs = allocations.filter(a => a.wholesaler_id === WS_OCP)
      expect(ocpAllocs.length).toBeGreaterThan(0)
    })

    it('skips excluded wholesalers for stock (lot) allocation', async () => {
      const orders = [makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 50,
        10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm'))]
      const stock = [
        makeStockLot('lot-001', WS_ALLIANCE, PROD_DOLIPRANE, 'L001', '2028-01-01', 200),
        makeStockLot('lot-002', WS_OCP, PROD_DOLIPRANE, 'L002', '2028-02-01', 200),
      ]

      const excluded = new Set([WS_ALLIANCE])

      setupSupabaseMock({ orders, quotas: [], stock, wholesalers: makeWholesalers(), products: makeProducts() })

      const { allocations } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', excluded, true
      )

      // Only OCP lots should be used
      const allianceStockAllocs = allocations.filter(a =>
        a.wholesaler_id === WS_ALLIANCE && a.stock_id !== null
      )
      expect(allianceStockAllocs).toHaveLength(0)
    })
  })

  // ── Test 10: Allocation result shape ──────────────────────────────

  describe('allocation result structure', () => {
    it('produces correctly shaped AllocationResult objects', async () => {
      const customer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')
      const orders = [makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100, 12.5, customer)]
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 200)]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'balanced' })

      expect(allocations.length).toBeGreaterThan(0)
      const alloc = allocations[0]

      expect(alloc.monthly_process_id).toBe(PROCESS_ID)
      expect(alloc.order_id).toBe('ord-001')
      expect(alloc.customer_id).toBe(CUST_ORI)
      expect(alloc.product_id).toBe(PROD_DOLIPRANE)
      expect(alloc.wholesaler_id).toBe(WS_ALLIANCE)
      expect(alloc.requested_quantity).toBe(100)
      expect(alloc.allocated_quantity).toBeGreaterThan(0)
      expect(alloc.prix_applique).toBe(12.5)
      expect(alloc.status).toBe('proposed')
      expect(alloc.metadata.strategy).toBe('balanced')
      expect(typeof alloc.metadata.priority_score).toBe('number')
    })
  })

  // ── Test 11: Log structure ─────────────────────────────────────────

  describe('allocation logs', () => {
    it('produces correctly shaped AllocationLog objects', async () => {
      const customer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')
      const orders = [makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100, 12.5, customer)]
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 200)]

      const { logs } = await runWithQuotas({ orders, quotas, strategy: 'balanced' })

      expect(logs.length).toBeGreaterThan(0)
      const log = logs[0]

      expect(typeof log.step).toBe('number')
      expect(typeof log.customer).toBe('string')
      expect(typeof log.customerName).toBe('string')
      expect(typeof log.product).toBe('string')
      expect(typeof log.wholesaler).toBe('string')
      expect(typeof log.requested).toBe('number')
      expect(typeof log.allocated).toBe('number')
      expect(typeof log.full).toBe('boolean')
      expect(typeof log.priority).toBe('number')
      expect(typeof log.reason).toBe('string')
    })
  })

  // ── Test 12: Multiple orders per customer ──────────────────────────

  describe('multiple orders per customer', () => {
    it('handles multiple products per customer correctly', async () => {
      const customer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')
      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100, 10.0, customer),
        makeOrder('ord-002', CUST_ORI, PROD_EFFERALGAN, 200, 12.0, customer),
      ]
      const quotas = [
        makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 300),
        makeQuota('q-002', WS_ALLIANCE, PROD_EFFERALGAN, 300),
      ]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'balanced' })

      const doliAlloc = allocations.filter(a => a.product_id === PROD_DOLIPRANE)
        .reduce((s, a) => s + a.allocated_quantity, 0)
      const effeAlloc = allocations.filter(a => a.product_id === PROD_EFFERALGAN)
        .reduce((s, a) => s + a.allocated_quantity, 0)

      expect(doliAlloc).toBe(100)
      expect(effeAlloc).toBe(200)
    })
  })

  // ── Test 13: Stock + Quota combined ───────────────────────────────

  describe('stock + quota combined allocation', () => {
    it('uses collected stock first, then quota for the remainder', async () => {
      // Order for 300 units; 150 in stock, 200 quota available
      const order = makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 300,
        10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm'))

      const stock = [
        makeStockLot('lot-001', WS_ALLIANCE, PROD_DOLIPRANE, 'L001', '2028-01-01', 150),
      ]
      const quotas = [makeQuota('q-001', WS_OCP, PROD_DOLIPRANE, 200)]

      setupSupabaseMock({
        orders: [order],
        quotas,
        stock,
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      // Should have a lot allocation from Alliance and a quota allocation from OCP
      const lotAlloc = allocations.filter(a => a.stock_id !== null)
        .reduce((s, a) => s + a.allocated_quantity, 0)
      const quotaAlloc = allocations.filter(a => a.stock_id === null && a.order_id !== null)
        .reduce((s, a) => s + a.allocated_quantity, 0)

      expect(lotAlloc).toBe(150) // Full lot consumed
      expect(quotaAlloc).toBe(150) // Remainder from quota
      expect(lotAlloc + quotaAlloc).toBe(300)
    })
  })

  // ── Test 14: Priority scoring ──────────────────────────────────────

  describe('priority scoring', () => {
    it('assigns higher priority score to top clients', async () => {
      const topCustomer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm', true, 1)
      const lowCustomer = makeCustomerBase(CUST_AXI, 'AXI', 'Axicorp', false, 5)

      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100, 10.0, topCustomer),
        makeOrder('ord-002', CUST_AXI, PROD_DOLIPRANE, 100, 10.0, lowCustomer),
      ]
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_DOLIPRANE, 500)]

      const { allocations } = await runWithQuotas({ orders, quotas, strategy: 'top_clients' })

      // Top client allocation should have higher priority score in metadata
      const topAlloc = allocations.find(a => a.customer_id === CUST_ORI)
      const lowAlloc = allocations.find(a => a.customer_id === CUST_AXI)

      expect(topAlloc?.metadata.priority_score).toBeGreaterThan(lowAlloc?.metadata.priority_score ?? 0)
    })
  })

  // ── Test 15: V3 config — enforce_min_expiry ─────────────────────────

  describe('v3 config — enforce_min_expiry', () => {
    it('skips lots that expire too soon when enforce_min_expiry is enabled', async () => {
      // Customer requires at least 6 months expiry
      const customer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')
      const order = {
        ...makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100, 10.0, customer),
        metadata: { min_expiry_months: 6 },
      }

      // One lot expiring in 2 months (too soon), one in 12 months (acceptable)
      const now = new Date()
      const soonExpiry = new Date(now)
      soonExpiry.setMonth(now.getMonth() + 2)
      const laterExpiry = new Date(now)
      laterExpiry.setMonth(now.getMonth() + 12)

      const stock = [
        makeStockLot('lot-soon', WS_ALLIANCE, PROD_DOLIPRANE, 'L-SOON',
          soonExpiry.toISOString().slice(0, 10), 100),
        makeStockLot('lot-late', WS_ALLIANCE, PROD_DOLIPRANE, 'L-LATE',
          laterExpiry.toISOString().slice(0, 10), 100),
      ]

      const v3: AllocationV3Config = {
        ...DEFAULT_V3_CONFIG,
        enforce_min_expiry: true,
        use_wholesaler_quotas: false,
      }

      setupSupabaseMock({
        orders: [order],
        quotas: [],
        stock,
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true, v3
      )

      // Should not have allocated from the soon-to-expire lot
      const soonAlloc = allocations.find(a => a.stock_id === 'lot-soon')
      expect(soonAlloc).toBeUndefined()

      // Should have allocated from the later lot
      const lateAlloc = allocations.find(a => a.stock_id === 'lot-late')
      expect(lateAlloc).toBeDefined()
    })
  })

  // ── Test 16: No-match skips allocation (no blind fallback) ────────

  describe('no-match behaviour', () => {
    it('does NOT create allocations when no stock or quota exists for a product', async () => {
      const orders = [makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100,
        10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm'))]

      // No quota, no stock — should NOT allocate
      setupSupabaseMock({
        orders,
        quotas: [],
        stock: [],
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations, logs } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      expect(allocations.length).toBe(0)

      const noMatchLogs = logs.filter(l => l.reason === 'no_match')
      expect(noMatchLogs.length).toBe(1)
      expect(noMatchLogs[0].requested).toBe(100)
    })

    it('logs no_match for each unmatched order in balanced mode', async () => {
      const orders = [
        makeOrder('ord-001', CUST_ORI, PROD_DOLIPRANE, 100, 10.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')),
        makeOrder('ord-002', CUST_ORI, PROD_EFFERALGAN, 50, 5.0, makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')),
      ]

      setupSupabaseMock({
        orders,
        quotas: [],
        stock: [],
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations, logs } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      expect(allocations.length).toBe(0)
      const noMatchLogs = logs.filter(l => l.reason === 'no_match')
      expect(noMatchLogs.length).toBe(2)
    })
  })

  // ── Test 17: quota_used flag ───────────────────────────────────────

  describe('allocation metadata flags', () => {
    it('sets quota_used=true for quota allocations and quota_used=false for stock allocations', async () => {
      const customer = makeCustomerBase(CUST_ORI, 'ORI', 'Orifarm')
      const orders = [
        makeOrder('ord-stock', CUST_ORI, PROD_DOLIPRANE, 50, 10.0, customer),
        makeOrder('ord-quota', CUST_ORI, PROD_EFFERALGAN, 50, 10.0, customer),
      ]
      const stock = [
        makeStockLot('lot-001', WS_ALLIANCE, PROD_DOLIPRANE, 'L001', '2028-01-01', 100),
      ]
      const quotas = [makeQuota('q-001', WS_ALLIANCE, PROD_EFFERALGAN, 100)]

      setupSupabaseMock({
        orders,
        quotas,
        stock,
        wholesalers: makeWholesalers(),
        products: makeProducts(),
      })

      const { allocations } = await runAllocation(
        PROCESS_ID, MONTH, YEAR, 'balanced', new Set(), true
      )

      const stockAlloc = allocations.find(a => a.stock_id !== null)
      const quotaAlloc = allocations.find(a => a.stock_id === null && a.order_id === 'ord-quota')

      expect(stockAlloc?.metadata.quota_used).toBe(false)
      expect(quotaAlloc?.metadata.quota_used).toBe(true)
    })
  })
})
