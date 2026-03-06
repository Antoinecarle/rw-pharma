/**
 * ANSM Sync Edge Function
 *
 * Downloads the ANSM ruptures de stock CSV, parses CIP13 codes,
 * and updates ansm_blocked_products + products.is_ansm_blocked.
 *
 * Can be called:
 * - Manually via POST /functions/v1/ansm-sync
 * - Automatically via Supabase cron (pg_cron weekly schedule)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANSM_CSV_URL = 'https://data.ansm.sante.fr/explore/dataset/ruptures-dapprovisionnement-et-ruptures-de-stock-fichier-global/download/?format=csv&timezone=Europe/Berlin&lang=fr&use_labels=true&csv_separator=%3B'
const BATCH_SIZE = 500

interface AnsmRow {
  cip13: string
  productName: string
}

function parseAnsmCsv(csvText: string): AnsmRow[] {
  const lines = csvText.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split(';').map((h: string) => h.replace(/"/g, '').trim().toLowerCase())
  const cip13Idx = header.findIndex((h: string) =>
    h.includes('cip') || h.includes('code') || h.includes('identifiant')
  )
  const nameIdx = header.findIndex((h: string) =>
    h.includes('specialite') || h.includes('denomination') || h.includes('nom') || h.includes('libelle')
  )

  if (cip13Idx === -1) {
    // Fallback: scan columns for 13-digit values
    for (let col = 0; col < header.length; col++) {
      const sample = lines[1]?.split(';')[col]?.replace(/"/g, '').trim()
      if (sample && /^\d{13}$/.test(sample)) {
        return extractRows(lines, col, nameIdx !== -1 ? nameIdx : -1)
      }
    }
    throw new Error('Cannot find CIP13 column in ANSM file')
  }

  return extractRows(lines, cip13Idx, nameIdx)
}

function extractRows(lines: string[], cip13Idx: number, nameIdx: number): AnsmRow[] {
  const results: AnsmRow[] = []
  const seen = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const cols = line.split(';').map((c: string) => c.replace(/"/g, '').trim())
    const rawCip = cols[cip13Idx] ?? ''
    const match = rawCip.match(/(\d{13})/)
    if (!match) continue

    const cip13 = match[1]
    if (seen.has(cip13)) continue
    seen.add(cip13)

    results.push({
      cip13,
      productName: nameIdx >= 0 ? (cols[nameIdx] ?? '') : '',
    })
  }

  return results
}

Deno.serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Create sync log
  const { data: log, error: logErr } = await supabase
    .from('ansm_sync_logs')
    .insert({ status: 'running', message: 'Edge Function: synchronisation en cours...' })
    .select('id')
    .single()

  if (logErr || !log) {
    return new Response(JSON.stringify({ error: `Log creation failed: ${logErr?.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const logId = log.id

  try {
    // Download ANSM file
    const response = await fetch(ANSM_CSV_URL)
    if (!response.ok) {
      throw new Error(`ANSM download failed: HTTP ${response.status}`)
    }
    const csvText = await response.text()
    const ansmProducts = parseAnsmCsv(csvText)

    if (ansmProducts.length === 0) {
      throw new Error('No products found in ANSM file')
    }

    // Get current blocked for diff
    const { data: currentBlocked } = await supabase
      .from('ansm_blocked_products')
      .select('cip13')
    const currentSet = new Set((currentBlocked ?? []).map((p: { cip13: string }) => p.cip13))
    const newSet = new Set(ansmProducts.map(p => p.cip13))

    const newlyBlocked = ansmProducts.filter(p => !currentSet.has(p.cip13))
    const unblockedCips = [...currentSet].filter(c => !newSet.has(c))

    // Replace ansm_blocked_products
    await supabase.from('ansm_blocked_products').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    for (let i = 0; i < ansmProducts.length; i += BATCH_SIZE) {
      const batch = ansmProducts.slice(i, i + BATCH_SIZE).map(p => ({
        cip13: p.cip13,
        product_name: p.productName || null,
        source_url: ANSM_CSV_URL,
      }))
      const { error: insertErr } = await supabase.from('ansm_blocked_products').insert(batch)
      if (insertErr) throw new Error(`Batch insert error at ${i}: ${insertErr.message}`)
    }

    // Update products flags
    await supabase.from('products').update({ is_ansm_blocked: false }).eq('is_ansm_blocked', true)

    const ansmCips = ansmProducts.map(p => p.cip13)
    for (let i = 0; i < ansmCips.length; i += BATCH_SIZE) {
      const batch = ansmCips.slice(i, i + BATCH_SIZE)
      await supabase.from('products').update({ is_ansm_blocked: true }).in('cip13', batch)
    }

    // Update log — success
    const message = `${ansmProducts.length} produits ANSM. +${newlyBlocked.length} bloques, -${unblockedCips.length} debloques.`
    await supabase.from('ansm_sync_logs').update({
      status: 'success',
      finished_at: new Date().toISOString(),
      message,
      products_blocked: newlyBlocked.length,
      products_unblocked: unblockedCips.length,
      total_ansm_count: ansmProducts.length,
    }).eq('id', logId)

    return new Response(JSON.stringify({ success: true, message, logId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    await supabase.from('ansm_sync_logs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      message: errorMsg,
    }).eq('id', logId)

    return new Response(JSON.stringify({ success: false, error: errorMsg, logId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
