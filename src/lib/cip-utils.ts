/**
 * Generic CIP7 <-> CIP13 resolution utilities for the pharmaceutical import system.
 *
 * CIP13 is the 13-digit French pharmaceutical product code.
 * CIP7 is the 7-digit short code, typically found at positions [5..12) of the CIP13.
 *
 * Any client or wholesaler may send files with CIP7 instead of CIP13.
 * These utilities provide a generic, reusable resolution mechanism.
 */

export interface CipProduct {
  cip7?: string | null
  cip13: string
}

/**
 * Converts a CIP7 code to its full CIP13 by looking up the product catalogue.
 *
 * Resolution strategy:
 *  1. Exact match on the product's `cip7` field
 *  2. Fallback: find a CIP13 that ends with the normalized CIP7
 *
 * @param cip7     - The 7-digit (or shorter, will be zero-padded) short code
 * @param products - The product catalogue (only cip7 + cip13 fields needed)
 * @returns The matching CIP13, or null if no match is found
 */
export function cip7ToCip13(cip7: string, products: CipProduct[]): string | null {
  const normalized = cip7.trim().padStart(7, '0')
  const match = products.find(
    p => p.cip7 === normalized || p.cip13.endsWith(normalized),
  )
  return match?.cip13 ?? null
}

/**
 * Build a CIP7 -> product reverse-lookup map from a list of products.
 *
 * The CIP7 is extracted as CIP13[5:12] (French pharma standard).
 * First occurrence wins when there are collisions.
 *
 * @param products - Array of products with at least { id, cip13 } fields
 * @returns A Map keyed by 7-digit CIP7, valued by the product entry
 */
export function buildCip7Map<T extends { cip13: string }>(products: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const p of products) {
    if (p.cip13 && p.cip13.length === 13) {
      const c7 = p.cip13.substring(5, 12)
      if (!map.has(c7)) {
        map.set(c7, p)
      }
    }
  }
  return map
}

/**
 * Resolve a product code that may be either CIP13 or CIP7.
 *
 * @param code       - The raw code from the imported file (CIP13 or CIP7)
 * @param productMap - Map of CIP13 -> product
 * @param cip7Map    - Map of CIP7 -> product (built via buildCip7Map)
 * @returns The matched product entry, or null
 */
export function resolveProductCode<T>(
  code: string,
  productMap: Map<string, T>,
  cip7Map: Map<string, T>,
): T | null {
  // Direct CIP13 match
  const direct = productMap.get(code)
  if (direct) return direct

  // CIP7 match: input is 7 digits -> lookup in reverse map
  if (code.length === 7 && /^\d+$/.test(code)) {
    return cip7Map.get(code) ?? null
  }

  return null
}
