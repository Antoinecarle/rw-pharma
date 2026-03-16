# Phase 10 — Algorithme d'allocation v3

**Priorité** : P4
**Dates** : 15 avril → 30 avril 2026
**Source** : Kick-Off 12 mars 2026 (section 6.8)

---

## Objectif

Enrichir le moteur d'allocation (actuellement v2 dans `src/lib/allocation-engine.ts`) avec les règles métier complètes identifiées au kick-off. L'algo v2 gère déjà 3 stratégies (balanced, top_clients, max_coverage) avec FEFO et quotas. La v3 ajoute les contraintes fines.

---

## Règles d'allocation v3

### R1 — Priorité client (existant, à affiner)

**Actuel** : Score = (6 - priority_level) × 20 + (is_top_client ? 50 : 0)
**Cible** :
- 3 clients prio (Orifarm, MPA, Abacus) traités EN PREMIER
- Pas de classement entre eux (même priorité)
- Entre clients prio, le **prix** est le différenciateur
- Clients secondaires traités ENSUITE avec ce qui reste

### R2 — Prix comme premier différenciateur (NOUVEAU)

Entre deux clients de même priorité, celui qui paie le plus cher est servi en premier.

```typescript
// Tri des clients pour un produit donné
customers.sort((a, b) => {
  // 1. Priorité client (prio > non-prio)
  if (a.is_top_client !== b.is_top_client) return b.is_top_client ? 1 : -1;
  // 2. Prix unitaire (desc)
  return (b.unit_price || 0) - (a.unit_price || 0);
});
```

### R3 — Grossistes ouverts (NOUVEAU)

Un client ne peut recevoir du stock que des grossistes avec lesquels il travaille.

```typescript
// Vérifier avant allocation
const isOpen = await customerWholesalers.find(
  cw => cw.customer_id === customerId && cw.wholesaler_id === wholesalerId && cw.is_open
);
if (!isOpen) continue; // Skip cette source
```

### R4 — Minimum par lot / Batch quantity (NOUVEAU)

Certains clients ont un minimum par lot. Si on ne peut pas atteindre le minimum, ne pas allouer du tout pour ce lot.

```typescript
const minBatch = order.min_batch_quantity || 1;
if (availableQty < minBatch) {
  // Ne pas allouer — lot trop petit pour ce client
  continue;
}
// Allouer au minimum minBatch
const allocQty = Math.max(minBatch, calculatedQty);
```

### R5 — Expiration minimum acceptée (NOUVEAU)

Chaque client peut avoir un seuil d'expiration minimum. Si le lot expire avant ce seuil, ne pas allouer.

```typescript
const minExpiry = customer.allocation_preferences?.min_expiry_months || 0;
const minExpiryDate = addMonths(new Date(), minExpiry);
if (lot.expiry_date < minExpiryDate) {
  // Client refusera cette péremption
  continue;
}
```

### R6 — Péremption intelligente (AMÉLIORER)

**Actuel** : FEFO simple (First Expiry First Out)
**Cible** :
- Si un client accepte une courte péremption → lui donner les lots courts EN PRIORITÉ
- Garder les lots longs pour les clients qui n'acceptent pas les courtes
- Optimiser pour minimiser les pertes

```typescript
// Trier les lots par expiry ASC (courts d'abord)
// Pour chaque lot court :
//   Trouver le client qui accepte cette péremption ET paie le plus cher
//   Lui allouer
// Pour les lots longs :
//   Distribuer aux clients restants
```

### R7 — Multiples de commande (NOUVEAU)

Certains clients repaquètent (ex: Abacus x4). L'allocation doit être un multiple de N.

```typescript
const multiple = order.metadata?.order_multiple || 1;
// Arrondir au multiple inférieur
const allocQty = Math.floor(calculatedQty / multiple) * multiple;
if (allocQty < minBatch) continue; // Arrondi trop bas
```

**Indicateur UI** : Warning si l'allocation n'est pas un multiple exact.

### R8 — Curseur écart de prix max (NOUVEAU)

Julie peut définir un écart de prix max toléré. Si la différence entre le best price et le prix d'un client est inférieure à cet écart, les deux clients sont traités comme équivalents (round-robin).

```typescript
const priceGapTolerance = config.max_price_gap || 0; // en €
const bestPrice = Math.max(...clientPrices);
const eligibleClients = clients.filter(c =>
  bestPrice - c.unit_price <= priceGapTolerance
);
// Distribuer en round-robin parmi les eligible
```

### R9 — Curseur % max non-quotés pour grossistes secondaires (NOUVEAU)

Pour les produits sans quota, Julie priorise ses grossistes (Ginkgo). Un curseur définit le % max que les grossistes secondaires peuvent recevoir.

```typescript
const maxSecondaryPct = config.max_secondary_pct || 15; // %
const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
const maxSecondary = Math.floor(totalQty * maxSecondaryPct / 100);
// Ginkgo reçoit totalQty - maxSecondary
// Les autres se partagent maxSecondary
```

---

## Configuration de l'algo

Nouveau panel de configuration avant lancement :

```typescript
interface AllocationV3Config {
  // Stratégie de base
  strategy: 'balanced' | 'top_clients' | 'max_coverage';

  // Nouvelles règles
  enforce_min_batch: boolean;       // R4
  enforce_min_expiry: boolean;      // R5
  enforce_open_wholesalers: boolean;// R3
  enforce_multiples: boolean;       // R7
  smart_expiry: boolean;            // R6

  // Curseurs
  max_price_gap: number;            // R8 — en €
  max_secondary_pct: number;        // R9 — en %

  // Sources
  use_collected_stock: boolean;
  use_wholesaler_quotas: boolean;
}
```

---

## Tâches détaillées

### T10.1 — Refactorer allocation-engine.ts

Séparer le moteur en modules :
- `allocation-engine.ts` : orchestrateur
- `allocation-rules.ts` : toutes les règles (R1-R9)
- `allocation-scoring.ts` : calcul des scores client
- `allocation-config.ts` : types de configuration

### T10.2 — Implémenter les règles R1-R9

Chaque règle = une fonction pure testable indépendamment.

### T10.3 — Panel de configuration UI

Remplacer le wizard actuel (3 étapes) par un panel latéral avec :
- Toggles pour chaque règle
- Sliders pour les curseurs (écart prix, % non-quotés)
- Preview de l'impact estimé

### T10.4 — Tests unitaires

Écrire des tests pour chaque règle avec des cas limites :
- Client prio vs non-prio même prix
- Lot trop petit pour le minimum batch
- Péremption exactement au seuil
- Multiple qui arrondit à 0
- Tous les grossistes fermés pour un client

---

## Critères de validation

- [ ] 9 règles implémentées et fonctionnelles
- [ ] Configuration via UI (toggles + sliders)
- [ ] Rétrocompatibilité avec l'algo v2
- [ ] Tests unitaires pour chaque règle
- [ ] Performance : < 2s pour 500 lignes × 10 clients × 5 grossistes
- [ ] 0 erreurs TS, 0 console errors

---

## Dépendances

- Phase 7 : `customer_wholesalers` pour R3
- Phase 9 : La vue allocation fine enrichie pour afficher les résultats
- Données `min_batch_quantity` et `order_multiple` dans les commandes (Phase 8)
