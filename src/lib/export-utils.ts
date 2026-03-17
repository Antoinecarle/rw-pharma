import type { ManualAttribution } from '@/types/database'

export interface ExportRow {
  cip13: string
  productName: string
  client: string
  requestedQty: number
  supplierQty: number
  source: 'MACRO' | 'MANUEL'
  editedAt: string
}

interface MacroItem {
  productId: string
  productName: string
  cip13: string
  toCollect: number
  totalDemand: number
}

/**
 * Merge macro attribution lines with manual attribution lines for a given wholesaler.
 *
 * - Manual attributions produce one export row each (with client, date, qty)
 * - Macro residual = macro toCollect - sum(manual supplier_qty) for same product
 * - If residual > 0, a MACRO row is emitted (client = "TOUS")
 * - Rows are sorted: by CIP13, then MACRO first, then MANUEL by edited_at
 */
export function mergeAttributionsForExport(
  macroItems: MacroItem[],
  manualAttrs: ManualAttribution[],
  today: string,
): ExportRow[] {
  const rows: ExportRow[] = []

  // Index manual attrs by productId
  const manualByProduct = new Map<string, ManualAttribution[]>()
  for (const attr of manualAttrs) {
    const list = manualByProduct.get(attr.product_id) ?? []
    list.push(attr)
    manualByProduct.set(attr.product_id, list)
  }

  // Track products with manual attributions that are NOT in macroItems
  const processedProducts = new Set<string>()

  for (const item of macroItems) {
    processedProducts.add(item.productId)
    const manuals = manualByProduct.get(item.productId) ?? []

    if (manuals.length === 0) {
      // No manual attributions: emit a single MACRO row
      rows.push({
        cip13: item.cip13,
        productName: item.productName,
        client: 'TOUS',
        requestedQty: item.totalDemand,
        supplierQty: item.toCollect,
        source: 'MACRO',
        editedAt: today,
      })
    } else {
      // Emit one row per manual attribution
      const manualSupplierTotal = manuals.reduce((s, m) => s + m.supplier_quantity, 0)

      for (const m of manuals) {
        rows.push({
          cip13: item.cip13,
          productName: item.productName,
          client: m.customer?.code ?? '?',
          requestedQty: m.requested_quantity,
          supplierQty: m.supplier_quantity,
          source: 'MANUEL',
          editedAt: new Date(m.edited_at).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }),
        })
      }

      // Emit residual MACRO row if macro > manual total
      const residual = item.toCollect - manualSupplierTotal
      if (residual > 0) {
        rows.push({
          cip13: item.cip13,
          productName: item.productName,
          client: 'TOUS',
          requestedQty: item.totalDemand - manuals.reduce((s, m) => s + m.requested_quantity, 0),
          supplierQty: residual,
          source: 'MACRO',
          editedAt: today,
        })
      }
    }
  }

  // Emit manual attributions that have NO corresponding macroItem (hors-matrice)
  for (const [productId, manuals] of manualByProduct.entries()) {
    if (processedProducts.has(productId)) continue
    for (const m of manuals) {
      rows.push({
        cip13: m.product?.cip13 ?? '?',
        productName: m.product?.name ?? '?',
        client: m.customer?.code ?? '?',
        requestedQty: m.requested_quantity,
        supplierQty: m.supplier_quantity,
        source: 'MANUEL',
        editedAt: new Date(m.edited_at).toLocaleString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      })
    }
  }

  // Sort: by CIP13, then MACRO before MANUEL, then by editedAt
  rows.sort((a, b) => {
    const cmp = a.cip13.localeCompare(b.cip13)
    if (cmp !== 0) return cmp
    if (a.source !== b.source) return a.source === 'MACRO' ? -1 : 1
    return a.editedAt.localeCompare(b.editedAt)
  })

  return rows
}
