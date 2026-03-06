/**
 * Load Demo Data Edge Function
 *
 * Imports a predefined demo scenario into the database for testing
 * the full monthly process flow (quotas, orders, stock, lots, allocations).
 *
 * POST /functions/v1/load-demo-data
 * Body: { scenario: { ...scenarioJSON }, action: "load" | "cleanup" }
 *
 * - "load": cleans previous demo data then inserts new scenario
 * - "cleanup": only removes demo data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEMO_PREFIX = '[DEMO]'

interface ScenarioQuota {
  wholesaler: string
  product_cip13: string
  quota_quantity: number
  extra_available: number
}

interface ScenarioOrder {
  customer: string
  product_cip13: string
  quantity: number
  unit_price: number
}

interface ScenarioLot {
  product_cip13: string
  lot_number: string
  expiry_date: string
}

interface ScenarioStock {
  wholesaler: string
  product_cip13: string
  lot_number: string
  quantity: number
  unit_cost: number
}

interface Scenario {
  name: string
  month: number
  year: number
  products_cip13: string[]
  customers_codes: string[]
  wholesalers_codes: string[]
  quotas: ScenarioQuota[]
  orders: ScenarioOrder[]
  lots: ScenarioLot[]
  collected_stock: ScenarioStock[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const action: string = body.action ?? 'load'
    const scenario: Scenario | undefined = body.scenario

    // Step 1: Cleanup previous demo data
    const cleanupResult = await cleanupDemoData(supabase)

    if (action === 'cleanup') {
      return jsonResponse({ success: true, action: 'cleanup', ...cleanupResult })
    }

    if (!scenario) {
      return jsonResponse({ error: 'Missing scenario in request body' }, 400)
    }

    // Step 2: Resolve references (codes → UUIDs)
    const refs = await resolveReferences(supabase, scenario)

    // Step 3: Create demo monthly process
    const { data: processData, error: processError } = await supabase
      .from('monthly_processes')
      .insert({
        month: scenario.month,
        year: scenario.year,
        status: 'draft',
        current_step: 1,
        notes: `${DEMO_PREFIX} ${scenario.name}`,
        metadata: { demo: true, scenario_name: scenario.name },
      })
      .select('id')
      .single()

    if (processError) throw new Error(`Failed to create process: ${processError.message}`)
    const processId = processData.id

    // Step 4: Insert quotas
    const quotaRows = scenario.quotas.map((q) => ({
      wholesaler_id: refs.wholesalers[q.wholesaler],
      product_id: refs.products[q.product_cip13],
      monthly_process_id: processId,
      month: `${scenario.year}-${String(scenario.month).padStart(2, '0')}-01`,
      quota_quantity: q.quota_quantity,
      extra_available: q.extra_available,
      quota_used: 0,
      import_file_name: `${DEMO_PREFIX} auto-import`,
    }))

    const { error: quotaError } = await supabase.from('wholesaler_quotas').insert(quotaRows)
    if (quotaError) throw new Error(`Failed to insert quotas: ${quotaError.message}`)

    // Step 5: Insert orders
    const orderInserts = scenario.orders.map((o) => ({
      monthly_process_id: processId,
      customer_id: refs.customers[o.customer],
      product_id: refs.products[o.product_cip13],
      quantity: o.quantity,
      unit_price: o.unit_price,
      status: 'pending',
      allocated_quantity: 0,
      data_source: 'demo',
      metadata: { demo: true },
    }))

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert(orderInserts)
      .select('id, customer_id, product_id')

    if (orderError) throw new Error(`Failed to insert orders: ${orderError.message}`)

    // Build order lookup: customerCode::cip13 → order_id
    const orderLookup = new Map<string, string>()
    for (const o of orderData) {
      const custCode = Object.entries(refs.customers).find(([, v]) => v === o.customer_id)?.[0]
      const cip = Object.entries(refs.products).find(([, v]) => v === o.product_id)?.[0]
      if (custCode && cip) orderLookup.set(`${custCode}::${cip}`, o.id)
    }

    // Step 6: Insert lots
    const lotInserts = scenario.lots.map((l) => ({
      product_id: refs.products[l.product_cip13] ?? null,
      cip13: l.product_cip13,
      lot_number: l.lot_number,
      expiry_date: l.expiry_date,
      origin: 'France',
      monthly_process_id: processId,
      metadata: { demo: true },
    }))

    const { data: lotData, error: lotError } = await supabase
      .from('lots')
      .insert(lotInserts)
      .select('id, cip13, lot_number')

    if (lotError) throw new Error(`Failed to insert lots: ${lotError.message}`)

    // Build lot lookup: cip13::lot_number → lot_id
    const lotLookup = new Map<string, string>()
    for (const l of lotData) {
      lotLookup.set(`${l.cip13}::${l.lot_number}`, l.id)
    }

    // Step 7: Insert collected stock
    const stockInserts = scenario.collected_stock.map((s) => ({
      wholesaler_id: refs.wholesalers[s.wholesaler],
      product_id: refs.products[s.product_cip13] ?? null,
      cip13: s.product_cip13,
      lot_number: s.lot_number,
      lot_id: lotLookup.get(`${s.product_cip13}::${s.lot_number}`) ?? null,
      expiry_date: scenario.lots.find(
        (l) => l.product_cip13 === s.product_cip13 && l.lot_number === s.lot_number
      )?.expiry_date ?? '2026-12-31',
      quantity: s.quantity,
      unit_cost: s.unit_cost,
      monthly_process_id: processId,
      status: 'received',
      data_source: 'demo',
      metadata: { demo: true },
    }))

    const { data: stockData, error: stockError } = await supabase
      .from('collected_stock')
      .insert(stockInserts)
      .select('id, wholesaler_id, product_id, cip13')

    if (stockError) throw new Error(`Failed to insert stock: ${stockError.message}`)

    // Step 8: Update process counters
    await supabase
      .from('monthly_processes')
      .update({
        quotas_count: quotaRows.length,
        orders_count: orderInserts.length,
        status: 'importing_quotas',
        current_step: 1,
      })
      .eq('id', processId)

    return jsonResponse({
      success: true,
      action: 'load',
      process_id: processId,
      counts: {
        quotas: quotaRows.length,
        orders: orderInserts.length,
        lots: lotInserts.length,
        collected_stock: stockInserts.length,
      },
      cleanup: cleanupResult,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})

async function cleanupDemoData(supabase: ReturnType<typeof createClient>) {
  // Find demo processes
  const { data: demoProcesses } = await supabase
    .from('monthly_processes')
    .select('id')
    .like('notes', `${DEMO_PREFIX}%`)

  if (!demoProcesses || demoProcesses.length === 0) {
    return { cleaned: 0 }
  }

  const processIds = demoProcesses.map((p: { id: string }) => p.id)

  // Delete in dependency order
  const tables = ['allocations', 'collected_stock', 'lots', 'orders', 'wholesaler_quotas']
  const deleted: Record<string, number> = {}

  for (const table of tables) {
    const { data } = await supabase
      .from(table)
      .delete()
      .in('monthly_process_id', processIds)
      .select('id')
    deleted[table] = data?.length ?? 0
  }

  // Delete the processes themselves
  const { data: deletedProcesses } = await supabase
    .from('monthly_processes')
    .delete()
    .in('id', processIds)
    .select('id')
  deleted['monthly_processes'] = deletedProcesses?.length ?? 0

  return { cleaned: processIds.length, deleted }
}

async function resolveReferences(
  supabase: ReturnType<typeof createClient>,
  scenario: Scenario
): Promise<{
  products: Record<string, string>
  customers: Record<string, string>
  wholesalers: Record<string, string>
}> {
  // Resolve products by cip13
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, cip13')
    .in('cip13', scenario.products_cip13)

  if (pErr) throw new Error(`Failed to resolve products: ${pErr.message}`)

  const productMap: Record<string, string> = {}
  for (const p of products ?? []) {
    productMap[p.cip13] = p.id
  }

  // Resolve customers by code
  const { data: customers, error: cErr } = await supabase
    .from('customers')
    .select('id, code')
    .in('code', scenario.customers_codes)

  if (cErr) throw new Error(`Failed to resolve customers: ${cErr.message}`)

  const customerMap: Record<string, string> = {}
  for (const c of customers ?? []) {
    customerMap[c.code] = c.id
  }

  // Resolve wholesalers by code
  const { data: wholesalers, error: wErr } = await supabase
    .from('wholesalers')
    .select('id, code')
    .in('code', scenario.wholesalers_codes)

  if (wErr) throw new Error(`Failed to resolve wholesalers: ${wErr.message}`)

  const wholesalerMap: Record<string, string> = {}
  for (const w of wholesalers ?? []) {
    wholesalerMap[w.code] = w.id
  }

  // Validate all references exist
  const missing: string[] = []
  for (const cip of scenario.products_cip13) {
    if (!productMap[cip]) missing.push(`product:${cip}`)
  }
  for (const code of scenario.customers_codes) {
    if (!customerMap[code]) missing.push(`customer:${code}`)
  }
  for (const code of scenario.wholesalers_codes) {
    if (!wholesalerMap[code]) missing.push(`wholesaler:${code}`)
  }

  if (missing.length > 0) {
    throw new Error(`Missing references in database: ${missing.join(', ')}`)
  }

  return { products: productMap, customers: customerMap, wholesalers: wholesalerMap }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
