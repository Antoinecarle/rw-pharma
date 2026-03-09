/**
 * RW Pharma — Debt (Charges) Engine
 *
 * Calculates under-allocations per client/product for a given monthly process
 * and manages debt resolution during future allocations.
 */

import { supabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────

export interface DebtRow {
  id: string
  customer_id: string
  product_id: string
  monthly_process_id: string | null
  month: string
  quantity_requested: number
  quantity_allocated: number
  quantity_owed: number
  resolved_quantity: number
  status: 'pending' | 'partially_resolved' | 'resolved'
}

export interface DebtCalculationResult {
  debtsCreated: number
  debtsUpdated: number
  totalOwed: number
  details: {
    customerId: string
    customerCode: string
    productId: string
    productCip13: string
    requested: number
    allocated: number
    owed: number
  }[]
}

export interface PendingDebt {
  id: string
  customerId: string
  productId: string
  remainingOwed: number // quantity_owed - resolved_quantity
  month: string
}

// ── Calculate debts for a completed process ──────────────────────────

export async function calculateMonthlyDebts(processId: string): Promise<DebtCalculationResult> {
  // 1. Fetch the process to get month/year
  const { data: process, error: pErr } = await supabase
    .from('monthly_processes')
    .select('id, month, year')
    .eq('id', processId)
    .single()
  if (pErr || !process) throw new Error('Process not found')

  const monthDate = `${process.year}-${String(process.month).padStart(2, '0')}-01`

  // 2. Fetch all orders for this process (what was requested)
  const orders = await fetchAllPaginated<{
    customer_id: string
    product_id: string
    quantity: number
    customer: { code: string } | null
    product: { cip13: string } | null
  }>('orders', {
    select: 'customer_id, product_id, quantity, customer:customers(code), product:products(cip13)',
    filters: [{ column: 'monthly_process_id', value: processId }],
  })

  // 3. Fetch all allocations for this process (what was actually allocated)
  const allocations = await fetchAllPaginated<{
    customer_id: string
    product_id: string
    allocated_quantity: number
  }>('allocations', {
    select: 'customer_id, product_id, allocated_quantity',
    filters: [{ column: 'monthly_process_id', value: processId }],
  })

  // 4. Aggregate by customer+product
  const orderMap = new Map<string, { requested: number; customerCode: string; productCip13: string }>()
  for (const o of orders) {
    const key = `${o.customer_id}|${o.product_id}`
    const existing = orderMap.get(key)
    if (existing) {
      existing.requested += o.quantity
    } else {
      orderMap.set(key, {
        requested: o.quantity,
        customerCode: (o.customer as { code: string } | null)?.code ?? '?',
        productCip13: (o.product as { cip13: string } | null)?.cip13 ?? '?',
      })
    }
  }

  const allocMap = new Map<string, number>()
  for (const a of allocations) {
    const key = `${a.customer_id}|${a.product_id}`
    allocMap.set(key, (allocMap.get(key) ?? 0) + a.allocated_quantity)
  }

  // 5. Calculate debts (requested - allocated > 0 = owed)
  const result: DebtCalculationResult = { debtsCreated: 0, debtsUpdated: 0, totalOwed: 0, details: [] }

  for (const [key, orderInfo] of orderMap) {
    const [customerId, productId] = key.split('|')
    const allocated = allocMap.get(key) ?? 0
    const owed = Math.max(0, orderInfo.requested - allocated)

    if (owed === 0) continue

    result.totalOwed += owed
    result.details.push({
      customerId,
      customerCode: orderInfo.customerCode,
      productId,
      productCip13: orderInfo.productCip13,
      requested: orderInfo.requested,
      allocated,
      owed,
    })

    // Upsert into client_debts
    const { data: existing } = await supabase
      .from('client_debts')
      .select('id')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .eq('month', monthDate)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('client_debts')
        .update({
          quantity_requested: orderInfo.requested,
          quantity_allocated: allocated,
          quantity_owed: owed,
          monthly_process_id: processId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      result.debtsUpdated++
    } else {
      await supabase
        .from('client_debts')
        .insert({
          customer_id: customerId,
          product_id: productId,
          monthly_process_id: processId,
          month: monthDate,
          quantity_requested: orderInfo.requested,
          quantity_allocated: allocated,
          quantity_owed: owed,
          resolved_quantity: 0,
          status: 'pending',
        })
      result.debtsCreated++
    }
  }

  return result
}

// ── Fetch pending debts for a customer/product ──────────────────────

export async function fetchPendingDebts(customerId?: string): Promise<PendingDebt[]> {
  let query = supabase
    .from('client_debts')
    .select('id, customer_id, product_id, quantity_owed, resolved_quantity, month')
    .in('status', ['pending', 'partially_resolved'])
    .order('month', { ascending: true }) // oldest first

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map(d => ({
    id: d.id,
    customerId: d.customer_id,
    productId: d.product_id,
    remainingOwed: d.quantity_owed - d.resolved_quantity,
    month: d.month,
  })).filter(d => d.remainingOwed > 0)
}

// ── Resolve debt (called during allocation) ─────────────────────────

export async function resolveDebt(debtId: string, resolvedQty: number): Promise<void> {
  const { data: debt, error } = await supabase
    .from('client_debts')
    .select('quantity_owed, resolved_quantity')
    .eq('id', debtId)
    .single()

  if (error || !debt) throw new Error('Debt not found')

  const newResolved = debt.resolved_quantity + resolvedQty
  const isFullyResolved = newResolved >= debt.quantity_owed

  await supabase
    .from('client_debts')
    .update({
      resolved_quantity: newResolved,
      status: isFullyResolved ? 'resolved' : 'partially_resolved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', debtId)
}

// ── Paginated fetch helper ──────────────────────────────────────────

async function fetchAllPaginated<T>(
  table: string,
  opts: { select: string; filters?: { column: string; value: string }[] }
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  const pageSize = 500
  while (true) {
    let query = supabase.from(table).select(opts.select).range(from, from + pageSize - 1)
    for (const f of opts.filters ?? []) {
      query = query.eq(f.column, f.value)
    }
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as unknown as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
