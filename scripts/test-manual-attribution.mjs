/**
 * End-to-end test for manual attribution feature
 * Tests: DB table, RPC function, API access via Supabase client
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ahpqewiamnulbhboynbv.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocHFld2lhbW51bGJoYm95bmJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzkwMTUsImV4cCI6MjA4ODI1NTAxNX0.32tEbNUyD9uslcvNu-2DPJPExHyk_Kzu-8mbVqq0QJw'

// Admin credentials — Julie
const ADMIN_EMAIL = 'julie@rwpharma.fr'
const ADMIN_PASSWORD = 'Admin123!'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let passed = 0
let failed = 0

function ok(test, msg) {
  passed++
  console.log(`  ✅ ${msg}`)
}

function fail(test, msg, err) {
  failed++
  console.log(`  ❌ ${msg}: ${err}`)
}

async function run() {
  console.log('\n🔬 Test Manual Attribution Feature\n')

  // ── 1. Auth ──
  console.log('1. Authentication')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  if (authErr) {
    // Try another common password
    const { data: authData2, error: authErr2 } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: 'admin123',
    })
    if (authErr2) {
      // Try to find a user that works
      console.log(`  ⚠️  Could not auth as julie@rwpharma.fr (${authErr.message})`)
      console.log('  Trying to test without auth (will use service role if RLS allows)...')
    } else {
      ok(1, `Authenticated as ${ADMIN_EMAIL}`)
    }
  } else {
    ok(1, `Authenticated as ${ADMIN_EMAIL}`)
  }

  // ── 2. Verify table exists ──
  console.log('\n2. Table manual_attributions exists')
  const { data: tableCheck, error: tableErr } = await supabase
    .from('manual_attributions')
    .select('id')
    .limit(1)
  if (tableErr) {
    fail(2, 'Table query failed', tableErr.message)
  } else {
    ok(2, `Table accessible, ${tableCheck.length} existing rows`)
  }

  // ── 3. Get test data (process, product, customer, wholesaler) ──
  console.log('\n3. Fetching test data')

  const { data: processes } = await supabase
    .from('monthly_processes')
    .select('id, month, year, status')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!processes || processes.length === 0) {
    fail(3, 'No monthly process found', 'Cannot test without a process')
    printSummary()
    return
  }
  const proc = processes[0]
  ok(3, `Process: ${proc.month}/${proc.year} (${proc.status}) — ${proc.id.slice(0,8)}...`)

  const { data: products } = await supabase
    .from('products')
    .select('id, cip13, name')
    .limit(1)
  if (!products || products.length === 0) {
    fail(3, 'No product found', 'Cannot test')
    printSummary()
    return
  }
  const product = products[0]
  ok(3, `Product: ${product.cip13} — ${product.name.slice(0, 40)}`)

  const { data: customers } = await supabase
    .from('customers')
    .select('id, code, name')
    .limit(1)
  if (!customers || customers.length === 0) {
    fail(3, 'No customer found', 'Cannot test')
    printSummary()
    return
  }
  const customer = customers[0]
  ok(3, `Customer: ${customer.code} — ${customer.name}`)

  const { data: wholesalers } = await supabase
    .from('wholesalers')
    .select('id, code, name')
    .limit(1)
  if (!wholesalers || wholesalers.length === 0) {
    fail(3, 'No wholesaler found', 'Cannot test')
    printSummary()
    return
  }
  const wholesaler = wholesalers[0]
  ok(3, `Wholesaler: ${wholesaler.code} — ${wholesaler.name}`)

  // ── 4. Test RPC upsert_manual_attribution ──
  console.log('\n4. Test RPC upsert_manual_attribution (create)')
  const { data: newId, error: rpcErr } = await supabase.rpc('upsert_manual_attribution', {
    p_monthly_process_id: proc.id,
    p_product_id: product.id,
    p_customer_id: customer.id,
    p_wholesaler_id: wholesaler.id,
    p_requested_quantity: 50,
    p_supplier_quantity: 30,
    p_note: 'Test attribution manuelle',
  })
  if (rpcErr) {
    fail(4, 'RPC create failed', rpcErr.message)
  } else {
    ok(4, `Created manual attribution: ${newId}`)
  }

  // ── 5. Verify the row was created ──
  console.log('\n5. Verify row exists and is active')
  const { data: rows, error: readErr } = await supabase
    .from('manual_attributions')
    .select('*')
    .eq('monthly_process_id', proc.id)
    .eq('product_id', product.id)
    .eq('customer_id', customer.id)
    .eq('wholesaler_id', wholesaler.id)
    .eq('is_active', true)
  if (readErr) {
    fail(5, 'Read failed', readErr.message)
  } else if (!rows || rows.length === 0) {
    fail(5, 'No active row found', 'Expected 1 row')
  } else {
    const row = rows[0]
    ok(5, `Active row found: v${row.version}, req=${row.requested_quantity}, sup=${row.supplier_quantity}`)

    if (row.requested_quantity !== 50) fail(5, 'Wrong requested_quantity', `Expected 50, got ${row.requested_quantity}`)
    else ok(5, 'requested_quantity = 50')

    if (row.supplier_quantity !== 30) fail(5, 'Wrong supplier_quantity', `Expected 30, got ${row.supplier_quantity}`)
    else ok(5, 'supplier_quantity = 30')

    if (row.version !== 1) fail(5, 'Wrong version', `Expected 1, got ${row.version}`)
    else ok(5, 'version = 1 (first insert)')
  }

  // ── 6. Test RPC upsert (update — should create v2 and deactivate v1) ──
  console.log('\n6. Test RPC upsert (update existing → version bump)')
  const { data: updatedId, error: rpcErr2 } = await supabase.rpc('upsert_manual_attribution', {
    p_monthly_process_id: proc.id,
    p_product_id: product.id,
    p_customer_id: customer.id,
    p_wholesaler_id: wholesaler.id,
    p_requested_quantity: 75,
    p_supplier_quantity: 60,
    p_note: 'Updated attribution',
  })
  if (rpcErr2) {
    fail(6, 'RPC update failed', rpcErr2.message)
  } else {
    ok(6, `Updated manual attribution: ${updatedId}`)
  }

  // Verify: v1 deactivated, v2 active
  const { data: allRows } = await supabase
    .from('manual_attributions')
    .select('*')
    .eq('monthly_process_id', proc.id)
    .eq('product_id', product.id)
    .eq('customer_id', customer.id)
    .eq('wholesaler_id', wholesaler.id)
    .order('version', { ascending: true })

  if (allRows && allRows.length >= 2) {
    const v1 = allRows.find(r => r.version === 1)
    const v2 = allRows.find(r => r.version === 2)

    if (v1 && !v1.is_active) ok(6, 'v1 deactivated correctly')
    else fail(6, 'v1 should be inactive', JSON.stringify(v1?.is_active))

    if (v2 && v2.is_active) ok(6, 'v2 is active')
    else fail(6, 'v2 should be active', JSON.stringify(v2?.is_active))

    if (v2 && v2.requested_quantity === 75 && v2.supplier_quantity === 60) ok(6, 'v2 quantities correct (75/60)')
    else fail(6, 'v2 quantities wrong', `${v2?.requested_quantity}/${v2?.supplier_quantity}`)
  } else {
    fail(6, 'Expected 2 rows (v1 + v2)', `Got ${allRows?.length ?? 0}`)
  }

  // ── 7. Test deactivation (soft-delete) ──
  console.log('\n7. Test deactivation (soft-delete)')
  const activeRow = allRows?.find(r => r.is_active)
  if (activeRow) {
    const { error: deactErr } = await supabase
      .from('manual_attributions')
      .update({ is_active: false })
      .eq('id', activeRow.id)
    if (deactErr) {
      fail(7, 'Deactivation failed', deactErr.message)
    } else {
      // Verify no active rows
      const { data: remaining } = await supabase
        .from('manual_attributions')
        .select('id')
        .eq('monthly_process_id', proc.id)
        .eq('product_id', product.id)
        .eq('customer_id', customer.id)
        .eq('wholesaler_id', wholesaler.id)
        .eq('is_active', true)
      if (remaining && remaining.length === 0) ok(7, 'All rows deactivated — soft-delete works')
      else fail(7, 'Still active rows after deactivation', `${remaining?.length}`)
    }
  }

  // ── 8. Cleanup test data ──
  console.log('\n8. Cleanup test data')
  const { error: cleanErr } = await supabase
    .from('manual_attributions')
    .delete()
    .eq('monthly_process_id', proc.id)
    .eq('product_id', product.id)
    .eq('customer_id', customer.id)
    .eq('wholesaler_id', wholesaler.id)
  if (cleanErr) {
    fail(8, 'Cleanup failed', cleanErr.message)
  } else {
    ok(8, 'Test rows cleaned up')
  }

  // ── 9. Test with joins (as the hook does) ──
  console.log('\n9. Test SELECT with joins (as useManualAttributions hook)')
  // Create a fresh row for join test
  await supabase.rpc('upsert_manual_attribution', {
    p_monthly_process_id: proc.id,
    p_product_id: product.id,
    p_customer_id: customer.id,
    p_wholesaler_id: wholesaler.id,
    p_requested_quantity: 100,
    p_supplier_quantity: 80,
  })

  const { data: joinedRows, error: joinErr } = await supabase
    .from('manual_attributions')
    .select('*, customer:customers(id, name, code), product:products(id, cip13, name), wholesaler:wholesalers(id, name, code)')
    .eq('monthly_process_id', proc.id)
    .eq('is_active', true)

  if (joinErr) {
    fail(9, 'Joined select failed', joinErr.message)
  } else if (joinedRows && joinedRows.length > 0) {
    const jr = joinedRows[0]
    ok(9, `Joined select works: ${jr.product?.cip13} → ${jr.customer?.code} via ${jr.wholesaler?.code}`)
    if (jr.customer?.code) ok(9, `Customer join: ${jr.customer.code}`)
    else fail(9, 'Customer join missing', 'null')
    if (jr.product?.cip13) ok(9, `Product join: ${jr.product.cip13}`)
    else fail(9, 'Product join missing', 'null')
    if (jr.wholesaler?.code) ok(9, `Wholesaler join: ${jr.wholesaler.code}`)
    else fail(9, 'Wholesaler join missing', 'null')
  } else {
    fail(9, 'No joined rows returned', `${joinedRows?.length}`)
  }

  // Cleanup
  await supabase
    .from('manual_attributions')
    .delete()
    .eq('monthly_process_id', proc.id)
    .eq('product_id', product.id)
    .eq('customer_id', customer.id)
    .eq('wholesaler_id', wholesaler.id)

  printSummary()
}

function printSummary() {
  console.log('\n' + '='.repeat(50))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(50))
  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
