/**
 * Shared column auto-detection engine for CSV/Excel imports.
 *
 * Centralises pattern registries, entity detection (wholesaler / customer),
 * mapping confidence tracking and the generic autoDetectMapping algorithm
 * so that QuotaImportStep, OrderImportStep and StockImportStep stay DRY.
 */

// --------------- Confidence tracking ---------------

export interface MappingConfidence<F extends string = string> {
  field: F
  source: 'auto' | 'saved' | 'manual' | 'none'
}

// --------------- Pattern registry ---------------

export interface FieldPattern<F extends string = string> {
  field: F
  patterns: RegExp[]
}

// --- CIP13 (shared across all import types)
const CIP13_PATTERNS: RegExp[] = [
  /^cip\s*13$/i, /cip.*13/i, /^cip$/i, /^cipcode$/i,
  /code.*produit/i, /product.*code/i, /artikelnummer/i,
  /code.*cip/i, /product.*cip/i, /product.*number/i,
  /^local\s*code/i, /^external$/i, /^ean$/i, /^gtin$/i,
]

// --- Product name (shared)
const PRODUCT_NAME_PATTERNS: RegExp[] = [
  /nom.*produit/i, /product.*name/i, /designation/i,
  /bezeichnung/i, /libelle/i, /^nom$/i, /^name$/i,
  /^produit$/i, /^product$/i, /^article$/i,
]

// --- Wholesaler column (shared for multi-wholesaler CSVs)
const WHOLESALER_COLUMN_PATTERNS: RegExp[] = [
  /^grossiste$/i, /^wholesaler$/i, /^fournisseur$/i,
  /code.*grossiste/i, /wholesaler.*code/i, /grossiste.*code/i,
  /^supplier$/i, /^source$/i, /^lieferant$/i,
]

// --- Client / customer column (for multi-client order CSVs)
const CLIENT_COLUMN_PATTERNS: RegExp[] = [
  /^client$/i, /client.*code/i, /^customer$/i, /^kunde$/i,
  /importat/i, /destinataire/i, /acheteur/i,
]

// ========================= QUOTA PATTERNS =========================

export type QuotaField = 'cip13' | 'quantity' | 'extra' | 'productName' | 'wholesalerColumn'

export const QUOTA_PATTERNS: FieldPattern<QuotaField>[] = [
  { field: 'cip13', patterns: CIP13_PATTERNS },
  {
    field: 'quantity',
    patterns: [/quota/i, /contingent/i, /quantit/i, /^qty/i, /alloue/i, /disponible/i, /menge/i, /quantity/i, /^qte/i, /mensuel/i],
  },
  {
    field: 'extra',
    patterns: [/extra/i, /suppl/i, /bonus/i, /additionn/i, /zusatz/i, /hors.*quota/i],
  },
  { field: 'productName', patterns: PRODUCT_NAME_PATTERNS },
  { field: 'wholesalerColumn', patterns: WHOLESALER_COLUMN_PATTERNS },
]

// ========================= ORDER PATTERNS =========================

export type OrderField = 'cip13' | 'quantity' | 'unit_price' | 'productName' | 'clientColumn' | 'comment' | 'minLotQty' | 'minExpiryDate'

export const ORDER_PATTERNS: FieldPattern<OrderField>[] = [
  { field: 'cip13', patterns: CIP13_PATTERNS },
  {
    field: 'quantity',
    patterns: [/qte.*command/i, /quantit/i, /^qty/i, /quantity/i, /^qte/i, /commandee?/i, /menge/i, /bestell/i, /ordered/i, /^poqnt$/i, /^volume$/i, /^nb$/i],
  },
  {
    field: 'unit_price',
    patterns: [/prix.*unit/i, /unit.*pri/i, /price/i, /^prix/i, /^pfht$/i, /einkaufspreis/i, /einzelpreis/i, /preis/i, /^unitprice$/i, /^pu$/i, /p\.u/i, /tarif/i],
  },
  { field: 'productName', patterns: PRODUCT_NAME_PATTERNS },
  { field: 'clientColumn', patterns: CLIENT_COLUMN_PATTERNS },
  {
    field: 'comment',
    patterns: [/comment/i, /notes?$/i, /remarque/i, /bemerkung/i, /observation/i],
  },
  {
    field: 'minLotQty',
    patterns: [/lot.*min/i, /min.*lot/i, /mindestmenge/i, /minimum.*lot/i, /^min$/i, /colisage/i],
  },
  {
    field: 'minExpiryDate',
    patterns: [/date.*expir.*min/i, /min.*expir/i, /mindesthalt/i, /expir.*souhait/i, /best.*before/i],
  },
]

// ========================= STOCK PATTERNS =========================

export type StockField = 'cip13' | 'lot_number' | 'expiry_date' | 'quantity' | 'unit_cost' | 'date_reception' | 'productName' | 'wholesalerColumn'

export const STOCK_PATTERNS: FieldPattern<StockField>[] = [
  { field: 'cip13', patterns: CIP13_PATTERNS },
  {
    field: 'lot_number',
    patterns: [/^lot$/i, /numero.*lot/i, /lot.*num/i, /batch/i, /^n.*lot/i, /charge/i, /chargen/i],
  },
  {
    field: 'expiry_date',
    patterns: [/expir/i, /perem/i, /^exp$/i, /date.*exp/i, /dluo/i, /verfalls?datum/i, /best.*before/i, /^dte$/i, /mindesthalt/i],
  },
  {
    field: 'quantity',
    patterns: [/quantit/i, /^qty/i, /^qte/i, /menge/i, /nombre/i, /quantity/i, /stock/i, /disponible/i],
  },
  {
    field: 'unit_cost',
    patterns: [/co[uû]t/i, /prix/i, /price/i, /cost/i, /tarif/i, /preis/i, /pu\b/i, /p\.u/i],
  },
  {
    field: 'date_reception',
    patterns: [/reception/i, /r[eé]ception/i, /date.*recep/i, /received/i, /eingangsdatum/i, /date.*livr/i],
  },
  { field: 'productName', patterns: PRODUCT_NAME_PATTERNS },
  { field: 'wholesalerColumn', patterns: WHOLESALER_COLUMN_PATTERNS },
]

// ========================= GENERIC AUTO-DETECT =========================

/**
 * Run pattern-based auto-detection on a list of CSV headers.
 *
 * @param headers    - Column headers from the parsed file
 * @param patterns   - Ordered field→regex[] registry
 * @param allFields  - Complete list of field keys (for confidence tracking of unmapped fields)
 * @param savedMapping - Optional previously-saved mapping to try first
 * @param savedValidationFields - Which fields must be present in headers for saved mapping to apply
 */
export function autoDetectMapping<F extends string>(
  headers: string[],
  patterns: FieldPattern<F>[],
  allFields: F[],
  savedMapping?: Record<F, string> | null,
  savedValidationFields?: F[],
): { mapping: Record<F, string>; confidence: MappingConfidence<F>[] } {
  const confidenceMap: MappingConfidence<F>[] = []

  // 1) Try saved mapping first
  if (savedMapping && savedValidationFields) {
    const allPresent = savedValidationFields.every(f => savedMapping[f] && headers.includes(savedMapping[f]))
    if (allPresent) {
      const resultMapping = { ...savedMapping }
      for (const field of allFields) {
        if (savedMapping[field] && headers.includes(savedMapping[field])) {
          confidenceMap.push({ field, source: 'saved' })
        } else {
          resultMapping[field] = ''
          confidenceMap.push({ field, source: 'none' })
        }
      }
      return { mapping: resultMapping, confidence: confidenceMap }
    }
  }

  // 2) Pattern-based auto-detection
  const autoMap = {} as Record<F, string>
  for (const f of allFields) autoMap[f] = ''

  const usedHeaders = new Set<string>()

  for (const { field, patterns: pats } of patterns) {
    for (const pattern of pats) {
      if (autoMap[field]) break
      const match = headers.find(h => !usedHeaders.has(h) && pattern.test(h))
      if (match) {
        autoMap[field] = match
        usedHeaders.add(match)
        confidenceMap.push({ field, source: 'auto' })
      }
    }
  }

  // 3) Fill missing confidence entries
  for (const field of allFields) {
    if (!confidenceMap.find(c => c.field === field)) {
      confidenceMap.push({ field, source: autoMap[field] ? 'auto' : 'none' })
    }
  }

  return { mapping: autoMap, confidence: confidenceMap }
}

// ========================= ENTITY DETECTION =========================

export interface EntityRef {
  id: string
  code?: string | null
  name: string
}

/**
 * Detect an entity (wholesaler or customer) from the filename.
 */
export function detectEntityFromFilename(filename: string, entities: Pick<EntityRef, 'code' | 'name'>[]): string | null {
  const upper = filename.toUpperCase()
  for (const e of entities) {
    if (e.code && upper.includes(e.code.toUpperCase())) return e.code
    if (e.name && upper.includes(e.name.toUpperCase())) return e.code ?? e.name
  }
  return null
}

/**
 * Detect an entity from a column inside the CSV data.
 * Returns the entity code found in the first non-empty row of the matching column.
 */
export function detectEntityFromData(
  headers: string[],
  rows: Record<string, string>[],
  entities: Pick<EntityRef, 'code' | 'name'>[],
  columnPatterns: RegExp[] = WHOLESALER_COLUMN_PATTERNS,
): string | null {
  for (const pattern of columnPatterns) {
    const col = headers.find(h => pattern.test(h))
    if (!col) continue
    const firstValue = rows.find(r => r[col]?.trim())?.[col]?.trim().toUpperCase()
    if (!firstValue) continue
    for (const e of entities) {
      if (e.code && firstValue.includes(e.code.toUpperCase())) return e.code
      if (e.name && firstValue.includes(e.name.toUpperCase())) return e.code ?? e.name
    }
  }
  return null
}

/**
 * Detect a customer from filename using a static code list.
 */
export function detectClientFromFilename(filename: string, clientCodes: string[]): string | null {
  const upper = filename.toUpperCase()
  for (const code of clientCodes) {
    if (upper.includes(code.toUpperCase())) return code
  }
  return null
}

// ========================= HELPERS =========================

/**
 * Get sample values for a mapped column.
 */
export function getSampleValues<F extends string>(
  rows: Record<string, string>[],
  mapping: Record<F, string>,
  field: F,
  count = 3,
): string[] {
  const col = mapping[field]
  if (!col) return []
  return rows.slice(0, count).map(r => String(r[col] || '').trim()).filter(Boolean)
}

/**
 * List CSV headers that are not mapped to any field.
 */
export function getUnmappedHeaders<F extends string>(
  headers: string[],
  mapping: Record<F, string>,
): string[] {
  const mapped = new Set(Object.values(mapping).filter(Boolean))
  return headers.filter(h => !mapped.has(h as string))
}

/**
 * Count mapped required fields.
 */
export function countMappedFields<F extends string>(
  mapping: Record<F, string>,
  requiredFields: F[],
): { mapped: number; total: number; allRequired: boolean } {
  const mapped = Object.values(mapping).filter(Boolean).length
  const total = Object.keys(mapping).length
  const allRequired = requiredFields.every(f => !!mapping[f])
  return { mapped, total, allRequired }
}
