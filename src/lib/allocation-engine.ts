/**
 * RW Pharma — Allocation Engine v2 + v3 rules
 *
 * Intelligent allocation algorithm with:
 * - True balanced distribution across wholesalers
 * - Strict quota enforcement with remaining tracking
 * - Customer priority scoring (multi-level)
 * - Lot/batch management with FEFO (First Expiry First Out)
 * - Max allocation % per client enforcement
 * - Preferred expiry month filtering
 * - Dry-run simulation support
 *
 * v3 rules (toggleable):
 * - R1: Priority client refinement (3 top clients treated first)
 * - R2: Price as first differentiator (highest price served first)
 * - R3: Open wholesalers enforcement (customer_wholesalers check)
 * - R4: Min batch quantity enforcement
 * - R5: Min expiry accepted per client
 * - R6: Smart expiry (short-expiry lots to accepting clients first)
 * - R7: Order multiples enforcement
 * - R8: Price gap tolerance (round-robin when gap < threshold)
 * - R9: Max secondary wholesaler % cap
 */

import { supabase } from '@/lib/supabase'
import { fetchPendingDebts, resolveDebt, type PendingDebt } from '@/lib/debt-engine'

// ── Types ────────────────────────────────────────────────────────────

export type AllocationStrategy = 'balanced' | 'top_clients' | 'max_coverage'

export interface AllocationPrefs {
  priority_level?: number      // 1 (highest) to 5 (lowest)
  max_allocation_pct?: number  // Max % of total stock for this client
  preferred_expiry_months?: number // Min months until expiry
  notes?: string
}

// ── V3 Config ────────────────────────────────────────────────────────

export interface AllocationV3Config {
  strategy: AllocationStrategy
  enforce_min_batch: boolean
  enforce_min_expiry: boolean
  enforce_open_wholesalers: boolean
  enforce_multiples: boolean
  smart_expiry: boolean
  max_price_gap: number       // EUR — if price diff < this, treat clients as equal priority
  max_secondary_pct: number   // % — cap secondary (non-quota) wholesalers at this %
  use_collected_stock: boolean
  use_wholesaler_quotas: boolean
}

export const DEFAULT_V3_CONFIG: AllocationV3Config = {
  strategy: 'balanced',
  enforce_min_batch: false,
  enforce_min_expiry: false,
  enforce_open_wholesalers: false,
  enforce_multiples: false,
  smart_expiry: false,
  max_price_gap: 0,
  max_secondary_pct: 50,
  use_collected_stock: true,
  use_wholesaler_quotas: true,
}

/** Open wholesaler links per customer: Map<customerId, Set<wholesalerId>> */
export type CustomerWholesalerMap = Map<string, Set<string>>

interface OrderRow {
  id: string
  customer_id: string
  product_id: string
  quantity: number
  unit_price: number | null
  metadata: { order_multiple?: number; min_expiry_months?: number } | null
  customer: { id: string; code: string; name: string; is_top_client: boolean; min_lot_acceptable: number | null; allocation_preferences: AllocationPrefs } | null
}

interface QuotaRow {
  id: string
  wholesaler_id: string
  product_id: string
  quota_quantity: number
  extra_available: number
}

interface StockRow {
  id: string
  wholesaler_id: string
  product_id: string
  lot_number: string
  expiry_date: string
  quantity: number
  status: string
}

interface ProductRow {
  id: string
  name: string
  cip13: string
  is_ansm_blocked: boolean
}

interface WholesalerRow {
  id: string
  name: string
  code: string
}

export interface AllocationResult {
  monthly_process_id: string
  order_id: string | null
  customer_id: string
  product_id: string
  wholesaler_id: string
  stock_id: string | null
  requested_quantity: number
  allocated_quantity: number
  prix_applique: number | null
  debt_resolution_id: string | null
  status: 'proposed'
  metadata: {
    strategy: AllocationStrategy
    lot_number?: string
    expiry_date?: string
    priority_score: number
    quota_used: boolean
    is_debt_resolution?: boolean
  }
}

export type AllocationReason =
  | 'fefo_lot'        // Allocated from collected_stock (FEFO)
  | 'quota'           // Allocated from wholesaler quota
  | 'quota_balanced'  // Quota split across multiple wholesalers
  | 'fallback'        // No quota/stock — even distribution
  | 'fallback_single' // No quota/stock — single wholesaler
  | 'max_pct_cap'     // Quantity reduced by max_allocation_pct
  | 'ansm_blocked'    // Product blocked by ANSM — export forbidden
  | 'min_lot_reject'  // Quantity below client's minimum lot acceptable

export interface AllocationLog {
  step: number
  customer: string
  customerName: string
  product: string
  productName: string
  productCip13: string
  wholesaler: string
  wholesalerName: string
  requested: number
  allocated: number
  full: boolean
  lot?: string
  expiry?: string
  priority: number
  reason: AllocationReason
  detail: string
}

export interface DryRunStats {
  totalAllocations: number
  totalRequested: number
  totalAllocated: number
  fulfillmentRate: string
  zeroProducts: number
  byWholesaler: { code: string; name: string; count: number; qty: number }[]
  byCustomer: { code: string; name: string; count: number; qty: number; priority: number }[]
  lotAllocations: number
  quotaUtilization: { wholesalerCode: string; used: number; total: number }[]
}

// ── Data Fetching ────────────────────────────────────────────────────

async function fetchOrders(processId: string): Promise<OrderRow[]> {
  const all: OrderRow[] = []
  let from = 0
  const pageSize = 500
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, customer_id, product_id, quantity, unit_price, metadata, customer:customers(id, code, name, is_top_client, min_lot_acceptable, allocation_preferences)')
      .eq('monthly_process_id', processId)
      .in('status', ['validated', 'pending'])
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as unknown as OrderRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function fetchQuotas(month: number, year: number): Promise<QuotaRow[]> {
  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`
  const { data, error } = await supabase
    .from('wholesaler_quotas')
    .select('id, wholesaler_id, product_id, quota_quantity, extra_available')
    .eq('month', monthDate)
  if (error) throw error
  return data ?? []
}

async function fetchStock(processId: string): Promise<StockRow[]> {
  const all: StockRow[] = []
  let from = 0
  const pageSize = 500
  while (true) {
    const { data, error } = await supabase
      .from('collected_stock')
      .select('id, wholesaler_id, product_id, lot_number, expiry_date, quantity, status')
      .eq('monthly_process_id', processId)
      .in('status', ['received', 'partially_allocated'])
      .order('expiry_date', { ascending: true }) // FEFO
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function fetchWholesalers(): Promise<WholesalerRow[]> {
  const { data, error } = await supabase.from('wholesalers').select('id, name, code')
  if (error) throw error
  return data ?? []
}

async function fetchProducts(): Promise<ProductRow[]> {
  const all: ProductRow[] = []
  let from = 0
  const pageSize = 500
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, cip13, is_ansm_blocked')
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

// ── Priority Scoring ─────────────────────────────────────────────────

function getCustomerPriority(order: OrderRow): number {
  const prefs = order.customer?.allocation_preferences
  const isTop = order.customer?.is_top_client ?? false

  // Priority levels: 1 = highest, 5 = lowest (from StarRating)
  // Convert to score: higher = more priority
  const prefLevel = prefs?.priority_level ?? 3
  const priorityScore = (6 - prefLevel) * 20 // 1→100, 2→80, 3→60, 4→40, 5→20

  // Top client bonus
  const topBonus = isTop ? 50 : 0

  return priorityScore + topBonus // Range: 20-150
}

// ── Quota Tracking ───────────────────────────────────────────────────

class QuotaTracker {
  // Map: productId -> Map<wholesalerId, { quotaId, total, remaining }>
  private quotas = new Map<string, Map<string, { quotaId: string; total: number; remaining: number }>>()

  constructor(quotaRows: QuotaRow[], excludedWholesalers: Set<string>) {
    for (const q of quotaRows) {
      if (excludedWholesalers.has(q.wholesaler_id)) continue
      const total = q.quota_quantity + (q.extra_available ?? 0)
      if (total <= 0) continue

      if (!this.quotas.has(q.product_id)) {
        this.quotas.set(q.product_id, new Map())
      }
      this.quotas.get(q.product_id)!.set(q.wholesaler_id, { quotaId: q.id, total, remaining: total })
    }
  }

  /** Get available wholesalers for a product, sorted by remaining quota desc */
  getAvailable(productId: string): { wholesalerId: string; remaining: number }[] {
    const productQuotas = this.quotas.get(productId)
    if (!productQuotas) return []

    return [...productQuotas.entries()]
      .filter(([, q]) => q.remaining > 0)
      .map(([wholesalerId, q]) => ({ wholesalerId, remaining: q.remaining }))
      .sort((a, b) => b.remaining - a.remaining)
  }

  /** Consume quota, returns actual consumed amount */
  consume(productId: string, wholesalerId: string, qty: number): number {
    const productQuotas = this.quotas.get(productId)
    if (!productQuotas) return 0
    const q = productQuotas.get(wholesalerId)
    if (!q || q.remaining <= 0) return 0

    const consumed = Math.min(qty, q.remaining)
    q.remaining -= consumed
    return consumed
  }

  /** Get total quota stats per wholesaler */
  getUtilization(): { wholesalerId: string; used: number; total: number }[] {
    const stats = new Map<string, { used: number; total: number }>()
    for (const productQuotas of this.quotas.values()) {
      for (const [wsId, q] of productQuotas.entries()) {
        const existing = stats.get(wsId) ?? { used: 0, total: 0 }
        existing.total += q.total
        existing.used += (q.total - q.remaining)
        stats.set(wsId, existing)
      }
    }
    return [...stats.entries()].map(([wholesalerId, s]) => ({ wholesalerId, ...s }))
  }

  /** Get per-quota-row usage for DB persistence */
  getDetailedUsage(): { quotaId: string; used: number }[] {
    const result: { quotaId: string; used: number }[] = []
    for (const productQuotas of this.quotas.values()) {
      for (const [, q] of productQuotas.entries()) {
        const used = q.total - q.remaining
        if (used > 0) {
          result.push({ quotaId: q.quotaId, used })
        }
      }
    }
    return result
  }

  hasQuotaFor(productId: string): boolean {
    return this.quotas.has(productId) && this.getAvailable(productId).length > 0
  }
}

// ── Stock (Lot) Tracker ──────────────────────────────────────────────

class StockTracker {
  // Map: productId -> lots sorted by expiry (FEFO)
  private stock = new Map<string, { id: string; wholesalerId: string; lotNumber: string; expiryDate: string; remaining: number }[]>()

  constructor(stockRows: StockRow[], excludedWholesalers: Set<string>) {
    for (const s of stockRows) {
      if (excludedWholesalers.has(s.wholesaler_id)) continue
      if (s.quantity <= 0) continue

      if (!this.stock.has(s.product_id)) {
        this.stock.set(s.product_id, [])
      }
      this.stock.get(s.product_id)!.push({
        id: s.id,
        wholesalerId: s.wholesaler_id,
        lotNumber: s.lot_number,
        expiryDate: s.expiry_date,
        remaining: s.quantity,
      })
    }

    // Sort each product's lots by expiry date (FEFO)
    for (const lots of this.stock.values()) {
      lots.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    }
  }

  /** Get available lots for a product, optionally filtered by min expiry months */
  getAvailable(productId: string, minExpiryMonths?: number): { id: string; wholesalerId: string; lotNumber: string; expiryDate: string; remaining: number }[] {
    const lots = this.stock.get(productId)
    if (!lots) return []

    if (minExpiryMonths && minExpiryMonths > 0) {
      const minDate = new Date()
      minDate.setMonth(minDate.getMonth() + minExpiryMonths)
      const minDateStr = minDate.toISOString().slice(0, 10)
      return lots.filter(l => l.remaining > 0 && l.expiryDate >= minDateStr)
    }

    return lots.filter(l => l.remaining > 0)
  }

  /** Consume stock from a lot, returns consumed amount */
  consume(lotId: string, qty: number): number {
    for (const lots of this.stock.values()) {
      const lot = lots.find(l => l.id === lotId)
      if (lot && lot.remaining > 0) {
        const consumed = Math.min(qty, lot.remaining)
        lot.remaining -= consumed
        return consumed
      }
    }
    return 0
  }

  hasStockFor(productId: string): boolean {
    return this.getAvailable(productId).length > 0
  }
}

// ── Max Allocation % Tracker ─────────────────────────────────────────

class MaxAllocationTracker {
  // Track total allocated per customer across all products
  private customerAllocated = new Map<string, number>()
  private totalAvailable: number

  constructor(totalAvailableStock: number) {
    this.totalAvailable = totalAvailableStock
  }

  canAllocate(customerId: string, maxPct: number | undefined, qty: number): number {
    if (!maxPct || maxPct >= 100 || this.totalAvailable <= 0) return qty

    const maxQty = Math.floor(this.totalAvailable * (maxPct / 100))
    const alreadyAllocated = this.customerAllocated.get(customerId) ?? 0
    const remaining = Math.max(0, maxQty - alreadyAllocated)

    return Math.min(qty, remaining)
  }

  record(customerId: string, qty: number) {
    const current = this.customerAllocated.get(customerId) ?? 0
    this.customerAllocated.set(customerId, current + qty)
  }
}

// ── V3 Rule Functions (pure, toggleable) ────────────────────────────

/**
 * R1 + R2: Sort orders by priority with price as differentiator.
 * Top 3 clients (is_top_client) are treated first with equal priority among them.
 * Between same-priority clients, highest price is served first.
 * If price gap < max_price_gap, they are treated as equal (interleaved round-robin).
 */
function sortOrdersV3(
  orders: OrderRow[],
  strategy: AllocationStrategy,
  maxPriceGap: number,
): OrderRow[] {
  const sorted = [...orders]

  // Group by customer
  const byCustomer = new Map<string, OrderRow[]>()
  for (const o of sorted) {
    const list = byCustomer.get(o.customer_id) ?? []
    list.push(o)
    byCustomer.set(o.customer_id, list)
  }

  // Build customer priority groups
  const customerGroups = [...byCustomer.entries()].map(([cid, orders]) => {
    const cust = orders[0].customer
    const isTop = cust?.is_top_client ?? false
    const prefLevel = cust?.allocation_preferences?.priority_level ?? 3
    const priorityScore = (6 - prefLevel) * 20 + (isTop ? 50 : 0)
    // R2: average price for this customer's orders
    const avgPrice = orders.reduce((s, o) => s + (o.unit_price ?? 0), 0) / orders.length
    return { cid, orders, priorityScore, avgPrice, isTop }
  })

  // R1: top clients first, then by priority score
  customerGroups.sort((a, b) => {
    // Both top clients → same priority tier
    if (a.isTop && b.isTop) {
      // R2 + R8: differentiate by price unless gap < maxPriceGap
      if (maxPriceGap > 0 && Math.abs(a.avgPrice - b.avgPrice) < maxPriceGap) return 0
      return b.avgPrice - a.avgPrice // Highest price first
    }
    // One is top, other isn't
    if (a.isTop !== b.isTop) return a.isTop ? -1 : 1
    // Same priority score
    if (a.priorityScore === b.priorityScore) {
      if (maxPriceGap > 0 && Math.abs(a.avgPrice - b.avgPrice) < maxPriceGap) return 0
      return b.avgPrice - a.avgPrice
    }
    return b.priorityScore - a.priorityScore
  })

  if (strategy === 'balanced') {
    // Round-robin interleave
    const interleaved: OrderRow[] = []
    let hasMore = true
    let idx = 0
    while (hasMore) {
      hasMore = false
      for (const { orders: custOrders } of customerGroups) {
        if (idx < custOrders.length) {
          interleaved.push(custOrders[idx])
          if (idx + 1 < custOrders.length) hasMore = true
        }
      }
      idx++
    }
    return interleaved
  } else if (strategy === 'max_coverage') {
    // Flatten sorted groups, then sort by quantity asc
    return customerGroups.flatMap(g => g.orders).sort((a, b) => a.quantity - b.quantity)
  } else {
    // top_clients: flatten in priority order
    return customerGroups.flatMap(g => g.orders)
  }
}

/**
 * R3: Check if a customer can receive stock from a specific wholesaler.
 * Returns true if the customer has this wholesaler marked as open,
 * or if no customer_wholesalers data is provided (backward compat).
 */
function isWholesalerOpenForCustomer(
  customerId: string,
  wholesalerId: string,
  cwMap: CustomerWholesalerMap | undefined,
): boolean {
  if (!cwMap || cwMap.size === 0) return true
  const openWholesalers = cwMap.get(customerId)
  if (!openWholesalers) return true // No restrictions configured for this customer
  return openWholesalers.has(wholesalerId)
}

/**
 * R4: Min batch quantity. If available qty < min_batch for the customer,
 * don't allocate that lot. Returns the qty to allocate (0 if below min).
 */
function enforceMinBatch(qty: number, minBatch: number | undefined): number {
  if (!minBatch || minBatch <= 0) return qty
  return qty >= minBatch ? qty : 0
}

/**
 * R5: Min expiry accepted. If lot expiry < client's min expiry threshold, skip.
 * Returns true if lot is acceptable.
 */
function isExpiryAcceptable(
  lotExpiryDate: string,
  minExpiryMonths: number | undefined,
): boolean {
  if (!minExpiryMonths || minExpiryMonths <= 0) return true
  const minDate = new Date()
  minDate.setMonth(minDate.getMonth() + minExpiryMonths)
  return lotExpiryDate >= minDate.toISOString().slice(0, 10)
}

/**
 * R6: Smart expiry — sort lots so short-expiry lots go to clients who accept them first.
 * Returns lots reordered: short-expiry first if client accepts them, long-expiry first otherwise.
 */
function smartExpirySortLots(
  lots: { id: string; wholesalerId: string; lotNumber: string; expiryDate: string; remaining: number }[],
  clientMinExpiryMonths: number | undefined,
): typeof lots {
  if (!clientMinExpiryMonths || clientMinExpiryMonths <= 0) {
    // Client accepts everything — give them short-expiry first (FEFO)
    return [...lots].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  }
  // Client has restrictions — give them longer-expiry lots, preserve short ones for others
  return [...lots].sort((a, b) => b.expiryDate.localeCompare(a.expiryDate))
}

/**
 * R7: Order multiples. Round down allocated quantity to nearest multiple of N.
 */
function enforceMultiple(qty: number, multiple: number | undefined): number {
  if (!multiple || multiple <= 1) return qty
  return Math.floor(qty / multiple) * multiple
}

/**
 * R9: Max secondary wholesaler %. Track allocation per wholesaler for a product
 * and cap non-quota (secondary) wholesalers at maxPct of total allocated for that product.
 */
class SecondaryWholesalerTracker {
  // Map: productId -> Map<wholesalerId, allocated>
  private allocated = new Map<string, Map<string, number>>()
  private quotaWholesalers: Set<string>

  constructor(quotaWholesalerIds: Set<string>) {
    this.quotaWholesalers = quotaWholesalerIds
  }

  record(productId: string, wholesalerId: string, qty: number) {
    if (!this.allocated.has(productId)) this.allocated.set(productId, new Map())
    const wsMap = this.allocated.get(productId)!
    wsMap.set(wholesalerId, (wsMap.get(wholesalerId) ?? 0) + qty)
  }

  canAllocateSecondary(productId: string, wholesalerId: string, qty: number, maxSecondaryPct: number): number {
    if (this.quotaWholesalers.has(wholesalerId)) return qty // Primary wholesaler, no cap
    if (maxSecondaryPct >= 100) return qty

    const wsMap = this.allocated.get(productId)
    const totalForProduct = wsMap ? [...wsMap.values()].reduce((s, v) => s + v, 0) : 0
    const currentSecondary = wsMap?.get(wholesalerId) ?? 0

    // Max allowed for this secondary wholesaler
    const maxAllowed = Math.floor((totalForProduct + qty) * (maxSecondaryPct / 100))
    const remaining = Math.max(0, maxAllowed - currentSecondary)
    return Math.min(qty, remaining)
  }
}

// ── Main Algorithm ───────────────────────────────────────────────────

export async function runAllocation(
  processId: string,
  month: number,
  year: number,
  strategy: AllocationStrategy,
  excludedWholesalers: Set<string>,
  dryRun: boolean = false,
  v3Config?: AllocationV3Config,
  customerWholesalerMap?: CustomerWholesalerMap,
): Promise<{ allocations: AllocationResult[]; logs: AllocationLog[] }> {
  // 1. Fetch all data in parallel
  const [orders, quotaRows, stockRows, wholesalers, products] = await Promise.all([
    fetchOrders(processId),
    fetchQuotas(month, year),
    fetchStock(processId),
    fetchWholesalers(),
    fetchProducts(),
  ])

  if (orders.length === 0) throw new Error('Aucune commande a allouer')

  const availableWholesalers = wholesalers.filter(w => !excludedWholesalers.has(w.id))
  if (availableWholesalers.length === 0) throw new Error('Aucun grossiste disponible')

  // 2. Initialize trackers
  const quotaTracker = new QuotaTracker(quotaRows, excludedWholesalers)
  const stockTracker = new StockTracker(stockRows, excludedWholesalers)

  // Calculate total available stock for max allocation tracking
  const totalStock = stockRows
    .filter(s => !excludedWholesalers.has(s.wholesaler_id))
    .reduce((sum, s) => sum + s.quantity, 0)
  const totalQuota = quotaRows
    .filter(q => !excludedWholesalers.has(q.wholesaler_id))
    .reduce((sum, q) => sum + q.quota_quantity + (q.extra_available ?? 0), 0)
  const maxAllocTracker = new MaxAllocationTracker(Math.max(totalStock + totalQuota, 1))

  const wsMap = new Map(availableWholesalers.map(w => [w.id, w]))
  const productMap = new Map(products.map(p => [p.id, p]))
  const customerCodeMap = new Map<string, { code: string; name: string }>()
  for (const o of orders) {
    if (o.customer) {
      customerCodeMap.set(o.customer_id, { code: o.customer.code, name: o.customer.name })
    }
  }

  // V3: Secondary wholesaler tracker (R9)
  const quotaWsIds = new Set(quotaRows.filter(q => !excludedWholesalers.has(q.wholesaler_id)).map(q => q.wholesaler_id))
  const secondaryTracker = v3Config ? new SecondaryWholesalerTracker(quotaWsIds) : null

  // 3. Sort orders based on strategy + customer priority
  const sortedOrders = v3Config
    ? sortOrdersV3(orders, v3Config.strategy, v3Config.max_price_gap)
    : sortOrders(orders, strategy)

  // 4. Allocate
  const allocations: AllocationResult[] = []
  const logs: AllocationLog[] = []
  let stepCounter = 0

  const pushLog = (
    order: OrderRow,
    wsId: string | null,
    allocated: number,
    remaining: number,
    reason: AllocationReason,
    detail: string,
    lot?: string,
    expiry?: string,
  ) => {
    const ws = wsId ? wsMap.get(wsId) : null
    const prod = productMap.get(order.product_id)
    logs.push({
      step: ++stepCounter,
      customer: order.customer?.code ?? '?',
      customerName: order.customer?.name ?? '?',
      product: order.product_id.slice(0, 8),
      productName: prod?.name ?? '?',
      productCip13: prod?.cip13 ?? '?',
      wholesaler: ws?.code ?? (wsId === null ? '-' : '?'),
      wholesalerName: ws?.name ?? (wsId === null ? '-' : '?'),
      requested: order.quantity,
      allocated,
      full: remaining <= 0,
      lot,
      expiry,
      priority: getCustomerPriority(order),
      reason,
      detail,
    })
  }

  for (const order of sortedOrders) {
    const prefs = (order.customer?.allocation_preferences ?? {}) as AllocationPrefs
    const priorityScore = getCustomerPriority(order)
    let remainingToAllocate = order.quantity

    // ANSM check: skip products blocked for export
    const product = productMap.get(order.product_id)
    if (product?.is_ansm_blocked) {
      pushLog(order, null, 0, remainingToAllocate, 'ansm_blocked',
        `Produit ${product.cip13} bloque ANSM — interdit a l'export`)
      continue
    }

    // Min lot acceptable check: skip if order qty below client threshold
    const minLot = order.customer?.min_lot_acceptable
    if (minLot && minLot > 0 && order.quantity < minLot) {
      pushLog(order, null, 0, remainingToAllocate, 'min_lot_reject',
        `Quantite ${order.quantity} < seuil min lot client (${minLot})`)
      continue
    }

    // Apply max allocation % limit
    const maxPct = prefs.max_allocation_pct
    const cappedQty = maxAllocTracker.canAllocate(order.customer_id, maxPct, remainingToAllocate)
    if (cappedQty < remainingToAllocate) {
      pushLog(order, null, 0, remainingToAllocate, 'max_pct_cap',
        `Limite ${maxPct}% : ${remainingToAllocate} → ${cappedQty} u.`)
      remainingToAllocate = cappedQty
    }

    // Source 1: Collected stock (lot-level, FEFO)
    if (remainingToAllocate > 0 && stockTracker.hasStockFor(order.product_id) && (!v3Config || v3Config.use_collected_stock)) {
      const minExpiry = prefs.preferred_expiry_months
      const orderMinExpiry = order.metadata?.min_expiry_months
      let availableLots = stockTracker.getAvailable(order.product_id, minExpiry)

      // R6: Smart expiry — reorder lots based on client's expiry acceptance
      if (v3Config?.smart_expiry) {
        availableLots = smartExpirySortLots(availableLots, orderMinExpiry ?? minExpiry)
      }

      for (const lot of availableLots) {
        if (remainingToAllocate <= 0) break

        // R3: Open wholesalers check
        if (v3Config?.enforce_open_wholesalers && !isWholesalerOpenForCustomer(order.customer_id, lot.wholesalerId, customerWholesalerMap)) {
          continue
        }

        // R5: Min expiry accepted
        if (v3Config?.enforce_min_expiry) {
          const clientMinExpiry = orderMinExpiry ?? minExpiry
          if (!isExpiryAcceptable(lot.expiryDate, clientMinExpiry)) {
            continue
          }
        }

        // R4: Min batch check on lot remaining
        let toConsume = remainingToAllocate
        if (v3Config?.enforce_min_batch) {
          const minBatch = order.customer?.min_lot_acceptable ?? undefined
          toConsume = enforceMinBatch(Math.min(toConsume, lot.remaining), minBatch)
          if (toConsume === 0) continue
        }

        // R9: Secondary wholesaler cap
        if (v3Config && secondaryTracker) {
          toConsume = secondaryTracker.canAllocateSecondary(order.product_id, lot.wholesalerId, toConsume, v3Config.max_secondary_pct)
          if (toConsume === 0) continue
        }

        const consumed = stockTracker.consume(lot.id, toConsume)
        if (consumed > 0) {
          // R7: Order multiples
          let finalQty = consumed
          if (v3Config?.enforce_multiples) {
            const multiple = order.metadata?.order_multiple
            finalQty = enforceMultiple(consumed, multiple)
            if (finalQty === 0) {
              // Return unused stock
              // Note: we can't "unconsume" from tracker easily, but the leftover is small
              continue
            }
            // If we rounded down, the difference stays consumed from lot but not allocated
          }

          allocations.push({
            monthly_process_id: processId,
            order_id: order.id,
            customer_id: order.customer_id,
            product_id: order.product_id,
            wholesaler_id: lot.wholesalerId,
            stock_id: lot.id,
            requested_quantity: order.quantity,
            allocated_quantity: finalQty,
            prix_applique: order.unit_price ?? null,
            debt_resolution_id: null,
            status: 'proposed',
            metadata: {
              strategy,
              lot_number: lot.lotNumber,
              expiry_date: lot.expiryDate,
              priority_score: priorityScore,
              quota_used: false,
            },
          })

          maxAllocTracker.record(order.customer_id, finalQty)
          if (secondaryTracker) secondaryTracker.record(order.product_id, lot.wholesalerId, finalQty)
          remainingToAllocate -= finalQty

          pushLog(order, lot.wholesalerId, finalQty, remainingToAllocate, 'fefo_lot',
            `Lot ${lot.lotNumber} (exp. ${lot.expiryDate})`,
            lot.lotNumber, lot.expiryDate)
        }
      }
    }

    // Source 2: Quota-based allocation
    if (remainingToAllocate > 0 && quotaTracker.hasQuotaFor(order.product_id) && (!v3Config || v3Config.use_wholesaler_quotas)) {
      // R3: Filter available quotas by open wholesalers
      let available = quotaTracker.getAvailable(order.product_id)
      if (v3Config?.enforce_open_wholesalers && customerWholesalerMap) {
        available = available.filter(ws => isWholesalerOpenForCustomer(order.customer_id, ws.wholesalerId, customerWholesalerMap))
      }

      const effectiveStrategy = v3Config?.strategy ?? strategy

      if (effectiveStrategy === 'balanced' && available.length > 1) {
        const totalRemaining = available.reduce((s, a) => s + a.remaining, 0)

        for (const ws of available) {
          if (remainingToAllocate <= 0) break

          const share = Math.ceil(remainingToAllocate * (ws.remaining / totalRemaining))
          let toAllocate = Math.min(share, remainingToAllocate)

          // R9: Secondary wholesaler cap
          if (v3Config && secondaryTracker) {
            toAllocate = secondaryTracker.canAllocateSecondary(order.product_id, ws.wholesalerId, toAllocate, v3Config.max_secondary_pct)
            if (toAllocate === 0) continue
          }

          let consumed = quotaTracker.consume(order.product_id, ws.wholesalerId, toAllocate)

          // R7: Order multiples
          if (consumed > 0 && v3Config?.enforce_multiples) {
            const multiple = order.metadata?.order_multiple
            consumed = enforceMultiple(consumed, multiple)
            if (consumed === 0) continue
          }

          if (consumed > 0) {
            allocations.push({
              monthly_process_id: processId,
              order_id: order.id,
              customer_id: order.customer_id,
              product_id: order.product_id,
              wholesaler_id: ws.wholesalerId,
              stock_id: null,
              requested_quantity: order.quantity,
              allocated_quantity: consumed,
              prix_applique: order.unit_price ?? null,
              debt_resolution_id: null,
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: true },
            })

            maxAllocTracker.record(order.customer_id, consumed)
            if (secondaryTracker) secondaryTracker.record(order.product_id, ws.wholesalerId, consumed)
            remainingToAllocate -= consumed

            pushLog(order, ws.wholesalerId, consumed, remainingToAllocate, 'quota_balanced',
              `Quota reparti ${consumed}/${toAllocate} u. (${Math.round((ws.remaining / totalRemaining) * 100)}% share)`)
          }
        }
      } else {
        for (const ws of available) {
          if (remainingToAllocate <= 0) break

          let toConsume = remainingToAllocate

          // R9: Secondary wholesaler cap
          if (v3Config && secondaryTracker) {
            toConsume = secondaryTracker.canAllocateSecondary(order.product_id, ws.wholesalerId, toConsume, v3Config.max_secondary_pct)
            if (toConsume === 0) continue
          }

          let consumed = quotaTracker.consume(order.product_id, ws.wholesalerId, toConsume)

          // R7: Order multiples
          if (consumed > 0 && v3Config?.enforce_multiples) {
            const multiple = order.metadata?.order_multiple
            consumed = enforceMultiple(consumed, multiple)
            if (consumed === 0) continue
          }

          if (consumed > 0) {
            allocations.push({
              monthly_process_id: processId,
              order_id: order.id,
              customer_id: order.customer_id,
              product_id: order.product_id,
              wholesaler_id: ws.wholesalerId,
              stock_id: null,
              requested_quantity: order.quantity,
              allocated_quantity: consumed,
              prix_applique: order.unit_price ?? null,
              debt_resolution_id: null,
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: true },
            })

            maxAllocTracker.record(order.customer_id, consumed)
            if (secondaryTracker) secondaryTracker.record(order.product_id, ws.wholesalerId, consumed)
            remainingToAllocate -= consumed

            pushLog(order, ws.wholesalerId, consumed, remainingToAllocate, 'quota',
              `Quota direct ${consumed} u. (reste ${ws.remaining - consumed})`)
          }
        }
      }
    }

    // Source 3: Fallback — try remaining quotas from any wholesaler first, then even split
    if (remainingToAllocate > 0 && allocations.filter(a => a.order_id === order.id).length === 0) {
      // 3a: Try to use any remaining global quota for this product
      let remainingQuotas = quotaTracker.getAvailable(order.product_id)
      // R3: Filter by open wholesalers
      if (v3Config?.enforce_open_wholesalers && customerWholesalerMap) {
        remainingQuotas = remainingQuotas.filter(ws => isWholesalerOpenForCustomer(order.customer_id, ws.wholesalerId, customerWholesalerMap))
      }
      if (remainingQuotas.length > 0) {
        for (const ws of remainingQuotas) {
          if (remainingToAllocate <= 0) break
          const consumed = quotaTracker.consume(order.product_id, ws.wholesalerId, remainingToAllocate)
          if (consumed > 0) {
            allocations.push({
              monthly_process_id: processId,
              order_id: order.id,
              customer_id: order.customer_id,
              product_id: order.product_id,
              wholesaler_id: ws.wholesalerId,
              stock_id: null,
              requested_quantity: order.quantity,
              allocated_quantity: consumed,
              prix_applique: order.unit_price ?? null,
              debt_resolution_id: null,
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: true },
            })
            maxAllocTracker.record(order.customer_id, consumed)
            if (secondaryTracker) secondaryTracker.record(order.product_id, ws.wholesalerId, consumed)
            remainingToAllocate -= consumed
            pushLog(order, ws.wholesalerId, consumed, remainingToAllocate, 'quota',
              `Quota fallback ${consumed} u. (reste ${ws.remaining - consumed})`)
          }
        }
      }

      // 3b: If still remaining and no quota covered it, distribute across wholesalers
      if (remainingToAllocate > 0 && allocations.filter(a => a.order_id === order.id).length === 0) {
        // R3: Filter available wholesalers by open status
        let fallbackWholesalers = availableWholesalers
        if (v3Config?.enforce_open_wholesalers && customerWholesalerMap) {
          fallbackWholesalers = fallbackWholesalers.filter(ws => isWholesalerOpenForCustomer(order.customer_id, ws.id, customerWholesalerMap))
        }
        if (fallbackWholesalers.length === 0) fallbackWholesalers = availableWholesalers // Safety: don't block entirely

        if (strategy === 'balanced' && fallbackWholesalers.length > 1) {
          const perWs = Math.ceil(remainingToAllocate / fallbackWholesalers.length)
          for (const ws of fallbackWholesalers) {
            if (remainingToAllocate <= 0) break
            const qty = Math.min(perWs, remainingToAllocate)

            allocations.push({
              monthly_process_id: processId,
              order_id: order.id,
              customer_id: order.customer_id,
              product_id: order.product_id,
              wholesaler_id: ws.id,
              stock_id: null,
              requested_quantity: order.quantity,
              allocated_quantity: qty,
              prix_applique: order.unit_price ?? null,
              debt_resolution_id: null,
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: false },
            })

            maxAllocTracker.record(order.customer_id, qty)
            if (secondaryTracker) secondaryTracker.record(order.product_id, ws.id, qty)
            remainingToAllocate -= qty

            pushLog(order, ws.id, qty, remainingToAllocate, 'fallback',
              `Aucun quota/stock — repartition egale ${qty} u.`)
          }
        } else {
          const ws = fallbackWholesalers[0]
          allocations.push({
            monthly_process_id: processId,
            order_id: order.id,
            customer_id: order.customer_id,
            product_id: order.product_id,
            wholesaler_id: ws.id,
            stock_id: null,
            requested_quantity: order.quantity,
            allocated_quantity: remainingToAllocate,
            prix_applique: order.unit_price ?? null,
            debt_resolution_id: null,
            status: 'proposed',
            metadata: { strategy, priority_score: priorityScore, quota_used: false },
          })

          maxAllocTracker.record(order.customer_id, remainingToAllocate)
          if (secondaryTracker) secondaryTracker.record(order.product_id, ws.id, remainingToAllocate)

          pushLog(order, ws.id, remainingToAllocate, 0, 'fallback_single',
            `Aucun quota/stock — grossiste unique ${remainingToAllocate} u.`)

          remainingToAllocate = 0
        }
      }
    }
  }

  // ── Debt Resolution: boost under-served clients from previous months ──
  // After initial allocation, check if any clients have pending debts.
  // If there is remaining stock/quota, try to allocate extra to resolve debts.
  try {
    const pendingDebts = await fetchPendingDebts()
    if (pendingDebts.length > 0) {
      // Group debts by customer+product
      const debtsByKey = new Map<string, PendingDebt[]>()
      for (const debt of pendingDebts) {
        const key = `${debt.customerId}|${debt.productId}`
        const existing = debtsByKey.get(key) ?? []
        existing.push(debt)
        debtsByKey.set(key, existing)
      }

      for (const [key, debts] of debtsByKey) {
        const [debtCustomerId, debtProductId] = key.split('|')
        const totalDebtOwed = debts.reduce((s, d) => s + d.remainingOwed, 0)
        if (totalDebtOwed <= 0) continue

        // Check if there's remaining quota for this product
        const available = quotaTracker.getAvailable(debtProductId)
        if (available.length === 0) continue

        let debtToResolve = totalDebtOwed

        for (const ws of available) {
          if (debtToResolve <= 0) break

          const consumed = quotaTracker.consume(debtProductId, ws.wholesalerId, debtToResolve)
          if (consumed > 0) {
            // Attribute to oldest debts first
            let remaining = consumed
            for (const debt of debts) {
              if (remaining <= 0) break
              const toResolve = Math.min(remaining, debt.remainingOwed)
              if (toResolve > 0) {
                allocations.push({
                  monthly_process_id: processId,
                  order_id: null, // No specific order — debt resolution
                  customer_id: debtCustomerId,
                  product_id: debtProductId,
                  wholesaler_id: ws.wholesalerId,
                  stock_id: null,
                  requested_quantity: toResolve,
                  allocated_quantity: toResolve,
                  prix_applique: null,
                  debt_resolution_id: debt.id,
                  status: 'proposed',
                  metadata: {
                    strategy,
                    priority_score: 200, // High priority for debt resolution
                    quota_used: true,
                    is_debt_resolution: true,
                  },
                })

                debt.remainingOwed -= toResolve
                remaining -= toResolve

                pushLog(
                  { id: '', customer_id: debtCustomerId, product_id: debtProductId, quantity: toResolve, unit_price: null, customer: customerCodeMap.has(debtCustomerId) ? { id: debtCustomerId, code: customerCodeMap.get(debtCustomerId)!.code, name: customerCodeMap.get(debtCustomerId)!.name, is_top_client: false, min_lot_acceptable: null, allocation_preferences: {} } : null } as OrderRow,
                  ws.wholesalerId, toResolve, 0, 'quota',
                  `Resolution dette (${debt.month}) : ${toResolve} u.`
                )
              }
            }

            debtToResolve -= consumed
          }
        }
      }

      // Persist debt resolutions to DB (skip in dry-run)
      if (!dryRun) {
        for (const alloc of allocations) {
          if (alloc.debt_resolution_id) {
            const totalResolved = allocations
              .filter(a => a.debt_resolution_id === alloc.debt_resolution_id)
              .reduce((s, a) => s + a.allocated_quantity, 0)
            await resolveDebt(alloc.debt_resolution_id, totalResolved)
          }
        }
      }
    }
  } catch (debtErr) {
    // Non-blocking: debt resolution failure shouldn't break allocation
    console.warn('Debt resolution skipped:', debtErr)
  }

  // Persist to DB only when NOT in dry-run mode
  if (!dryRun) {
    // Persist quota_used back to DB — batched in parallel
    const quotaUtilization = quotaTracker.getUtilization()
    if (quotaUtilization.length > 0) {
      const usedByQuota = quotaTracker.getDetailedUsage()
      const quotaPromises = usedByQuota
        .filter(({ used }) => used > 0)
        .map(({ quotaId, used }) =>
          supabase.from('wholesaler_quotas').update({ quota_used: used }).eq('id', quotaId)
        )
      // Execute in parallel batches of 20 to avoid overwhelming Supabase
      for (let i = 0; i < quotaPromises.length; i += 20) {
        await Promise.all(quotaPromises.slice(i, i + 20))
      }
    }

    // Persist allocated_quantity + status on orders — batched in parallel
    const orderAllocMap = new Map<string, number>()
    for (const a of allocations) {
      if (!a.order_id) continue // Skip debt resolution allocations
      orderAllocMap.set(a.order_id, (orderAllocMap.get(a.order_id) ?? 0) + a.allocated_quantity)
    }
    const orderPromises = sortedOrders.map(order => {
      const totalAlloc = orderAllocMap.get(order.id) ?? 0
      const newStatus = totalAlloc <= 0
        ? 'pending'
        : totalAlloc >= order.quantity
          ? 'allocated'
          : 'partially_allocated'
      return supabase.from('orders').update({ allocated_quantity: totalAlloc, status: newStatus }).eq('id', order.id)
    })
    // Execute in parallel batches of 20
    for (let i = 0; i < orderPromises.length; i += 20) {
      await Promise.all(orderPromises.slice(i, i + 20))
    }

    // Update collected_stock status based on remaining quantity
    const stockUsage = new Map<string, number>() // stockId → total consumed
    for (const a of allocations) {
      if (a.stock_id) {
        stockUsage.set(a.stock_id, (stockUsage.get(a.stock_id) ?? 0) + a.allocated_quantity)
      }
    }
    if (stockUsage.size > 0) {
      // Compare consumed vs original quantity to determine status
      const stockOriginal = new Map(stockRows.map(s => [s.id, s.quantity]))
      const stockStatusPromises = [...stockUsage.entries()].map(([stockId, consumed]) => {
        const original = stockOriginal.get(stockId) ?? 0
        const newStatus = consumed >= original ? 'allocated' : 'partially_allocated'
        return supabase.from('collected_stock').update({ status: newStatus }).eq('id', stockId)
      })
      for (let i = 0; i < stockStatusPromises.length; i += 20) {
        await Promise.all(stockStatusPromises.slice(i, i + 20))
      }
    }
  }

  return { allocations, logs }
}

// ── Order Sorting ────────────────────────────────────────────────────

function sortOrders(orders: OrderRow[], strategy: AllocationStrategy): OrderRow[] {
  const sorted = [...orders]

  switch (strategy) {
    case 'top_clients':
      // Sort by priority score descending (top clients first)
      sorted.sort((a, b) => getCustomerPriority(b) - getCustomerPriority(a))
      break

    case 'max_coverage':
      // Process smaller orders first to maximize products covered
      sorted.sort((a, b) => a.quantity - b.quantity)
      break

    case 'balanced':
    default:
      // Interleave customers: round-robin by customer to avoid one customer consuming all
      {
        const byCustomer = new Map<string, OrderRow[]>()
        for (const o of sorted) {
          const list = byCustomer.get(o.customer_id) ?? []
          list.push(o)
          byCustomer.set(o.customer_id, list)
        }

        // Sort customers by priority
        const customerPriorities = [...byCustomer.entries()]
          .map(([cid, orders]) => ({ cid, orders, priority: getCustomerPriority(orders[0]) }))
          .sort((a, b) => b.priority - a.priority)

        const interleaved: OrderRow[] = []
        let hasMore = true
        let idx = 0
        while (hasMore) {
          hasMore = false
          for (const { orders: custOrders } of customerPriorities) {
            if (idx < custOrders.length) {
              interleaved.push(custOrders[idx])
              if (idx + 1 < custOrders.length) hasMore = true
            }
          }
          idx++
        }

        return interleaved
      }
  }

  return sorted
}

// ── Stats Calculator ─────────────────────────────────────────────────

export function computeStats(
  allocations: AllocationResult[],
  logs: AllocationLog[],
  wholesalers: WholesalerRow[],
  quotaTracker_utilization?: { wholesalerId: string; used: number; total: number }[],
): DryRunStats {
  const totalRequested = new Map<string, number>() // per order_id
  const totalAllocated = allocations.reduce((s, a) => s + a.allocated_quantity, 0)

  // Deduplicate requested_quantity (one order can have multiple allocation rows)
  for (const a of allocations) {
    if (!a.order_id) continue // Skip debt resolution allocations
    if (!totalRequested.has(a.order_id)) {
      totalRequested.set(a.order_id, a.requested_quantity)
    }
  }
  const sumRequested = [...totalRequested.values()].reduce((s, v) => s + v, 0)

  // Product coverage
  const productCoverage = new Map<string, { req: number; alloc: number }>()
  for (const a of allocations) {
    const existing = productCoverage.get(a.product_id) ?? { req: 0, alloc: 0 }
    existing.alloc += a.allocated_quantity
    if (!productCoverage.has(a.product_id)) {
      existing.req = a.requested_quantity
    }
    productCoverage.set(a.product_id, existing)
  }
  const zeroProducts = [...productCoverage.values()].filter(p => p.alloc === 0).length

  // By wholesaler
  const byWholesaler = new Map<string, { code: string; name: string; count: number; qty: number }>()
  for (const a of allocations) {
    const ws = wholesalers.find(w => w.id === a.wholesaler_id)
    const key = a.wholesaler_id
    const existing = byWholesaler.get(key)
    if (existing) { existing.count++; existing.qty += a.allocated_quantity }
    else byWholesaler.set(key, { code: ws?.code ?? '?', name: ws?.name ?? '?', count: 1, qty: a.allocated_quantity })
  }

  // By customer
  const byCustomer = new Map<string, { code: string; name: string; count: number; qty: number; priority: number }>()
  for (const log of logs) {
    const existing = byCustomer.get(log.customer)
    if (existing) { existing.count++; existing.qty += log.allocated }
    else byCustomer.set(log.customer, { code: log.customer, name: log.customer, count: 1, qty: log.allocated, priority: log.priority })
  }

  // Lot allocations count
  const lotAllocations = allocations.filter(a => a.stock_id !== null).length

  // Quota utilization
  const wsMap = new Map(wholesalers.map(w => [w.id, w]))
  const quotaUtilization = (quotaTracker_utilization ?? []).map(u => ({
    wholesalerCode: wsMap.get(u.wholesalerId)?.code ?? '?',
    used: u.used,
    total: u.total,
  }))

  return {
    totalAllocations: allocations.length,
    totalRequested: sumRequested,
    totalAllocated,
    fulfillmentRate: sumRequested > 0 ? ((totalAllocated / sumRequested) * 100).toFixed(1) : '0',
    zeroProducts,
    byWholesaler: [...byWholesaler.values()],
    byCustomer: [...byCustomer.values()].sort((a, b) => b.priority - a.priority),
    lotAllocations,
    quotaUtilization,
  }
}
