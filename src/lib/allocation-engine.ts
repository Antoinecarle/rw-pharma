/**
 * RW Pharma — Allocation Engine v2
 *
 * Intelligent allocation algorithm with:
 * - True balanced distribution across wholesalers
 * - Strict quota enforcement with remaining tracking
 * - Customer priority scoring (multi-level)
 * - Lot/batch management with FEFO (First Expiry First Out)
 * - Max allocation % per client enforcement
 * - Preferred expiry month filtering
 * - Dry-run simulation support
 */

import { supabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────

export type AllocationStrategy = 'balanced' | 'top_clients' | 'max_coverage'

export interface AllocationPrefs {
  priority_level?: number      // 1 (highest) to 5 (lowest)
  max_allocation_pct?: number  // Max % of total stock for this client
  preferred_expiry_months?: number // Min months until expiry
  notes?: string
}

interface OrderRow {
  id: string
  customer_id: string
  product_id: string
  quantity: number
  unit_price: number | null
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
  order_id: string
  customer_id: string
  product_id: string
  wholesaler_id: string
  stock_id: string | null
  requested_quantity: number
  allocated_quantity: number
  prix_applique: number | null
  status: 'proposed'
  metadata: {
    strategy: AllocationStrategy
    lot_number?: string
    expiry_date?: string
    priority_score: number
    quota_used: boolean
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
      .select('id, customer_id, product_id, quantity, unit_price, customer:customers(id, code, name, is_top_client, min_lot_acceptable, allocation_preferences)')
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

async function fetchStock(_processId: string): Promise<StockRow[]> {
  // Load all stock with status 'received' or 'partially_allocated'
  const { data, error } = await supabase
    .from('collected_stock')
    .select('id, wholesaler_id, product_id, lot_number, expiry_date, quantity, status')
    .in('status', ['received', 'partially_allocated'])
    .order('expiry_date', { ascending: true }) // FEFO
  if (error) throw error
  return data ?? []
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

// ── Main Algorithm ───────────────────────────────────────────────────

export async function runAllocation(
  processId: string,
  month: number,
  year: number,
  strategy: AllocationStrategy,
  excludedWholesalers: Set<string>,
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
  const maxAllocTracker = new MaxAllocationTracker(Math.max(totalStock, totalQuota, 1))

  const wsMap = new Map(availableWholesalers.map(w => [w.id, w]))
  const productMap = new Map(products.map(p => [p.id, p]))
  const customerCodeMap = new Map<string, { code: string; name: string }>()
  for (const o of orders) {
    if (o.customer) {
      customerCodeMap.set(o.customer_id, { code: o.customer.code, name: o.customer.name })
    }
  }

  // 3. Sort orders based on strategy + customer priority
  const sortedOrders = sortOrders(orders, strategy)

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
    if (remainingToAllocate > 0 && stockTracker.hasStockFor(order.product_id)) {
      const minExpiry = prefs.preferred_expiry_months
      const availableLots = stockTracker.getAvailable(order.product_id, minExpiry)

      for (const lot of availableLots) {
        if (remainingToAllocate <= 0) break

        const consumed = stockTracker.consume(lot.id, remainingToAllocate)
        if (consumed > 0) {
          allocations.push({
            monthly_process_id: processId,
            order_id: order.id,
            customer_id: order.customer_id,
            product_id: order.product_id,
            wholesaler_id: lot.wholesalerId,
            stock_id: lot.id,
            requested_quantity: order.quantity,
            allocated_quantity: consumed,
            prix_applique: order.unit_price ?? null,
            status: 'proposed',
            metadata: {
              strategy,
              lot_number: lot.lotNumber,
              expiry_date: lot.expiryDate,
              priority_score: priorityScore,
              quota_used: false,
            },
          })

          maxAllocTracker.record(order.customer_id, consumed)
          remainingToAllocate -= consumed

          pushLog(order, lot.wholesalerId, consumed, remainingToAllocate, 'fefo_lot',
            `Lot ${lot.lotNumber} (exp. ${lot.expiryDate})`,
            lot.lotNumber, lot.expiryDate)
        }
      }
    }

    // Source 2: Quota-based allocation
    if (remainingToAllocate > 0 && quotaTracker.hasQuotaFor(order.product_id)) {
      const available = quotaTracker.getAvailable(order.product_id)

      if (strategy === 'balanced' && available.length > 1) {
        const totalRemaining = available.reduce((s, a) => s + a.remaining, 0)

        for (const ws of available) {
          if (remainingToAllocate <= 0) break

          const share = Math.ceil(remainingToAllocate * (ws.remaining / totalRemaining))
          const toAllocate = Math.min(share, remainingToAllocate)
          const consumed = quotaTracker.consume(order.product_id, ws.wholesalerId, toAllocate)

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
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: true },
            })

            maxAllocTracker.record(order.customer_id, consumed)
            remainingToAllocate -= consumed

            pushLog(order, ws.wholesalerId, consumed, remainingToAllocate, 'quota_balanced',
              `Quota reparti ${consumed}/${toAllocate} u. (${Math.round((ws.remaining / totalRemaining) * 100)}% share)`)
          }
        }
      } else {
        for (const ws of available) {
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
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: true },
            })

            maxAllocTracker.record(order.customer_id, consumed)
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
      const remainingQuotas = quotaTracker.getAvailable(order.product_id)
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
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: true },
            })
            maxAllocTracker.record(order.customer_id, consumed)
            remainingToAllocate -= consumed
            pushLog(order, ws.wholesalerId, consumed, remainingToAllocate, 'quota',
              `Quota fallback ${consumed} u. (reste ${ws.remaining - consumed})`)
          }
        }
      }

      // 3b: If still remaining and no quota covered it, distribute across wholesalers
      if (remainingToAllocate > 0 && allocations.filter(a => a.order_id === order.id).length === 0) {
        if (strategy === 'balanced' && availableWholesalers.length > 1) {
          const perWs = Math.ceil(remainingToAllocate / availableWholesalers.length)
          for (const ws of availableWholesalers) {
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
              status: 'proposed',
              metadata: { strategy, priority_score: priorityScore, quota_used: false },
            })

            maxAllocTracker.record(order.customer_id, qty)
            remainingToAllocate -= qty

            pushLog(order, ws.id, qty, remainingToAllocate, 'fallback',
              `Aucun quota/stock — repartition egale ${qty} u.`)
          }
        } else {
          const ws = availableWholesalers[0]
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
            status: 'proposed',
            metadata: { strategy, priority_score: priorityScore, quota_used: false },
          })

          maxAllocTracker.record(order.customer_id, remainingToAllocate)

          pushLog(order, ws.id, remainingToAllocate, 0, 'fallback_single',
            `Aucun quota/stock — grossiste unique ${remainingToAllocate} u.`)

          remainingToAllocate = 0
        }
      }
    }
  }

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
