/**
 * ANSM Sync — Client-side synchronization from uploaded CSV file
 *
 * User downloads the CSV manually from ANSM, then uploads it here.
 * We parse CIP13 codes and update ansm_blocked_products + products.is_ansm_blocked.
 */

import { supabase } from '@/lib/supabase'

export const ANSM_DOWNLOAD_URL = 'https://data.ansm.sante.fr/explore/dataset/ruptures-dapprovisionnement-et-ruptures-de-stock-fichier-global/download/?format=csv&timezone=Europe/Berlin&lang=fr&use_labels=true&csv_separator=%3B'

export const ANSM_PAGE_URL = 'https://data.ansm.sante.fr/explore/dataset/ruptures-dapprovisionnement-et-ruptures-de-stock-fichier-global/information/'

interface AnsmRow {
  cip13: string
  productName: string
}

/**
 * Parse ANSM CSV content.
 * The CSV uses semicolons as separators. We look for a column containing CIP13
 * codes (13-digit numbers) and the product name.
 */
function parseAnsmCsv(csvText: string): AnsmRow[] {
  const lines = csvText.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split(';').map(h => h.replace(/"/g, '').trim().toLowerCase())

  // Find relevant columns by header name patterns
  const cip13Idx = header.findIndex(h =>
    h.includes('cip') || h.includes('code') || h.includes('identifiant')
  )
  const nameIdx = header.findIndex(h =>
    h.includes('specialite') || h.includes('denomination') || h.includes('nom') || h.includes('libelle')
  )

  if (cip13Idx === -1) {
    // Fallback: scan each column for 13-digit values
    for (let col = 0; col < header.length; col++) {
      const sample = lines[1]?.split(';')[col]?.replace(/"/g, '').trim()
      if (sample && /^\d{13}$/.test(sample)) {
        return parseWithIndices(lines, col, nameIdx !== -1 ? nameIdx : -1)
      }
    }
    throw new Error('Impossible de trouver la colonne CIP13 dans le fichier. Vérifiez que c\'est bien un export CSV ANSM (séparateur point-virgule).')
  }

  return parseWithIndices(lines, cip13Idx, nameIdx)
}

function parseWithIndices(lines: string[], cip13Idx: number, nameIdx: number): AnsmRow[] {
  const results: AnsmRow[] = []
  const seen = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const cols = line.split(';').map(c => c.replace(/"/g, '').trim())
    const rawCip = cols[cip13Idx] ?? ''

    // Extract 13-digit CIP code
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

export interface SyncResult {
  success: boolean
  logId: string
  message: string
  stats: {
    totalAnsm: number
    newlyBlocked: number
    unblocked: number
  }
}

/**
 * Run the full ANSM sync process from an uploaded CSV file:
 * 1. Create a sync log entry (status=running)
 * 2. Parse the CSV content
 * 3. Replace ansm_blocked_products table content
 * 4. Update products.is_ansm_blocked flags
 * 5. Update sync log with results
 */
export async function runAnsmSyncFromFile(file: File): Promise<SyncResult> {
  // 1. Create sync log
  const { data: log, error: logErr } = await supabase
    .from('ansm_sync_logs')
    .insert({ status: 'running', message: `Import manuel: ${file.name}` })
    .select('id')
    .single()

  if (logErr || !log) throw new Error(`Erreur creation log: ${logErr?.message}`)
  const logId = log.id

  try {
    // 2. Read and parse file
    const csvText = await file.text()
    const ansmProducts = parseAnsmCsv(csvText)

    if (ansmProducts.length === 0) {
      throw new Error('Aucun produit CIP13 trouvé dans le fichier. Vérifiez le format (CSV avec séparateur point-virgule).')
    }

    // 3. Get current blocked products to compute diff
    const { data: currentBlocked } = await supabase
      .from('ansm_blocked_products')
      .select('cip13')
    const currentSet = new Set((currentBlocked ?? []).map(p => p.cip13))
    const newSet = new Set(ansmProducts.map(p => p.cip13))

    const newlyBlocked = ansmProducts.filter(p => !currentSet.has(p.cip13))
    const unblockedCips = [...currentSet].filter(c => !newSet.has(c))

    // 4. Replace ansm_blocked_products: delete all, insert new
    await supabase.from('ansm_blocked_products').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Insert in batches of 500
    const BATCH = 500
    for (let i = 0; i < ansmProducts.length; i += BATCH) {
      const batch = ansmProducts.slice(i, i + BATCH).map(p => ({
        cip13: p.cip13,
        product_name: p.productName || null,
        source_url: ANSM_DOWNLOAD_URL,
      }))
      const { error: insertErr } = await supabase.from('ansm_blocked_products').insert(batch)
      if (insertErr) throw new Error(`Erreur insertion batch ${i}: ${insertErr.message}`)
    }

    // 5. Update products.is_ansm_blocked
    const ansmCips = ansmProducts.map(p => p.cip13)

    // First, unblock all
    await supabase
      .from('products')
      .update({ is_ansm_blocked: false })
      .eq('is_ansm_blocked', true)

    // Then block matching ones (in batches for the IN clause)
    for (let i = 0; i < ansmCips.length; i += BATCH) {
      const batch = ansmCips.slice(i, i + BATCH)
      await supabase
        .from('products')
        .update({ is_ansm_blocked: true })
        .in('cip13', batch)
    }

    // 6. Update sync log — success
    const message = `Import "${file.name}" terminé. ${ansmProducts.length} produits ANSM. ${newlyBlocked.length} nouveaux blocages, ${unblockedCips.length} déblocages.`
    await supabase
      .from('ansm_sync_logs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        message,
        products_blocked: newlyBlocked.length,
        products_unblocked: unblockedCips.length,
        total_ansm_count: ansmProducts.length,
      })
      .eq('id', logId)

    return {
      success: true,
      logId,
      message,
      stats: {
        totalAnsm: ansmProducts.length,
        newlyBlocked: newlyBlocked.length,
        unblocked: unblockedCips.length,
      },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue'
    await supabase
      .from('ansm_sync_logs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        message: errorMsg,
      })
      .eq('id', logId)

    return {
      success: false,
      logId,
      message: errorMsg,
      stats: { totalAnsm: 0, newlyBlocked: 0, unblocked: 0 },
    }
  }
}
