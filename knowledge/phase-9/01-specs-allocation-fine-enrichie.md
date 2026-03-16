# Phase 9 — Allocation fine enrichie

**Priorité** : P3
**Dates** : 5 avril → 15 avril 2026
**Source** : Kick-Off 12 mars 2026 (section 6.7)

---

## Objectif

Refondre la vue d'allocation fine (par lot) qui est identifiée comme **la vue la plus critique et complexe** de la plateforme. Problème à 5 dimensions : produit × client × grossiste × lot × quantité, plus la date d'expiration.

---

## Contexte business

Julie fait l'allocation fine le dernier vendredi du mois. Elle doit attribuer chaque lot de stock à un ou plusieurs clients. C'est un travail qui lui prend 24-48h manuellement sur Excel. L'outil doit réduire ça à quelques heures max.

**Citation Julie** : "J'ai juste à valider, je crois."

---

## Vue cible (par médicament)

### Layout pour UN produit

```
┌─────────────────────────────────────────────────────────────────┐
│ DOLIPRANE 1000MG — CIP13: 3400936...                           │
├──────────┬──────────────────────────────────────────────────────┤
│          │              LOTS DISPONIBLES                        │
│          ├──────────┬──────────┬──────────┬──────────┬─────────┤
│          │ L2026-01 │ L2026-01 │ L2026-02 │ L2026-03 │ TOTAL   │
│          │ CERP     │ OCP      │ GINKGO   │ ALLIANCE │         │
│          │ Qty: 50  │ Qty: 30  │ Qty: 100 │ Qty: 25  │ 205     │
│          │ Exp:07/27│ Exp:07/27│ Exp:12/27│ Exp:03/27│         │
│ CLIENTS  ├──────────┴──────────┼──────────┼──────────┤         │
│          │ Lot L2026-01 (80)   │ L2026-02 │ L2026-03 │         │
│          │ Exp: 07/2027        │ 12/2027  │ 03/2027  │         │
├──────────┼─────────────────────┼──────────┼──────────┼─────────┤
│ ORIFARM  │                     │          │          │         │
│ Dem: 60  │        45           │    15    │  ██████  │   60    │
│ Prix:55€ │                     │          │ (grisé)  │         │
│ Min: 10  │                     │          │          │         │
│ Exp>06/27│                     │          │          │         │
├──────────┼─────────────────────┼──────────┼──────────┼─────────┤
│ MPA      │                     │          │          │         │
│ Dem: 80  │        35           │    45    │    0     │   80    │
│ Prix:53€ │                     │          │          │         │
│ Min: 20  │                     │          │          │         │
│ Exp>03/27│                     │          │          │         │
├──────────┼─────────────────────┼──────────┼──────────┼─────────┤
│ ABACUS   │                     │          │          │         │
│ Dem: 40  │        0            │    40    │    0     │   40    │
│ Prix:52€ │                     │          │          │         │
│ Min: 8   │                     │          │          │         │
│ Mult: x4 │                     │          │          │         │
│ Exp>09/27│                     │          │          │         │
└──────────┴─────────────────────┴──────────┴──────────┴─────────┘
```

### Points clés de la vue

1. **Lots groupés en header** : Le même numéro de lot (L2026-01) peut être chez CERP et OCP → on affiche une seule colonne "lot" avec la quantité totale (80) et les sous-colonnes par grossiste.

2. **Lignes client enrichies** :
   - Demande totale (qty commandée)
   - Prix unitaire proposé par le client
   - Minimum par lot (batch quantity)
   - Multiple de commande (x3, x4, x6) si applicable
   - Expiration minimum acceptée

3. **Cellules grisées** : Quand un client ne travaille pas avec un grossiste → la cellule est grisée et non cliquable. Données de `customer_wholesalers` (Phase 7).

4. **Split lot** : Un lot peut être splitté entre plusieurs clients. La somme des allocations par lot ne doit pas dépasser la quantité disponible.

5. **Vue simplifiée** : Pas de wizard intro/simulation/résultats séparés. Une seule vue :
   - Bouton "Auto-attribuer" qui lance l'algo
   - Résultat directement dans le tableau
   - Ajustement manuel en cliquant sur les cellules
   - Bouton "Valider" quand satisfaite

---

## Tâches détaillées

### T9.1 — Composant AllocationFineTable

Nouveau composant remplaçant le wizard actuel (AllocationExecutionStep).

**Props** :
- `processId` : ID du processus mensuel
- `products` : Liste des produits avec commandes
- `stock` : Lots collectés (collected_stock)
- `customers` : Clients avec préférences
- `customerWholesalers` : Relations client↔grossiste ouvert

**State** :
- `allocations` : Map<productId, Map<lotId, Map<customerId, quantity>>>
- `editingCell` : { productId, lotId, customerId } | null

### T9.2 — Groupage des lots par numéro

Requête pour grouper les lots identiques chez différents grossistes :

```sql
SELECT
  lot_number,
  expiry_date,
  SUM(quantity) as total_qty,
  JSON_AGG(JSON_BUILD_OBJECT(
    'stock_id', id,
    'wholesaler_id', wholesaler_id,
    'wholesaler_name', w.name,
    'quantity', quantity
  )) as sources
FROM collected_stock cs
JOIN wholesalers w ON cs.wholesaler_id = w.id
WHERE cs.process_id = $1
GROUP BY lot_number, expiry_date, cs.product_id
ORDER BY expiry_date ASC;
```

### T9.3 — Edition inline des cellules

Cliquer sur une cellule → input numérique avec :
- Validation : ne pas dépasser le stock disponible du lot
- Validation : respecter le minimum par lot du client
- Validation : respecter les multiples de commande
- Warning : si la péremption est inférieure au minimum du client
- Feedback visuel : rouge si invalide, vert si OK

### T9.4 — Indicateurs visuels

- **Barre de progression** par client : qty allouée / qty demandée
- **Barre de progression** par lot : qty allouée / qty disponible
- **Badge "Complet"** quand un client est 100% couvert
- **Warning** multiple non respecté (ex: 13 alloués mais multiple de 4)
- **Alert** péremption courte

---

## Critères de validation

- [ ] Vue par produit avec lots groupés et sources grossistes
- [ ] Infos client enrichies (prix, min lot, exp min, multiples)
- [ ] Cellules grisées pour client×grossiste non ouvert
- [ ] Split lot entre clients fonctionnel
- [ ] Edition inline avec validations
- [ ] Auto-attribution puis ajustement manuel
- [ ] Indicateurs de progression
- [ ] 0 erreurs TS, 0 console errors

---

## Dépendances

- Phase 7 : `customer_wholesalers` (grossistes ouverts par client)
- Phase 8 : Le flow doit être restructuré en 12 étapes
- Phase 10 : L'algo v3 alimentera cette vue
