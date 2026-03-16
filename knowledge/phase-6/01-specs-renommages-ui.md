# Phase 6 — Renommages & Ajustements UI

**Priorité** : P0 (Quick Wins)
**Dates** : 16 mars → 18 mars 2026
**Source** : Kick-Off 12 mars 2026 (sections 2.2, 2.3)

---

## Objectif

Appliquer les renommages et ajustements rapides décidés au kick-off. Ce sont des modifications cosmétiques/UX qui ne nécessitent pas de changement de schema DB.

---

## Tâches détaillées

### T6.1 — Renommer "Quotas" → "Disponibilités"

**Scope** : Navigation, page QuotasPage, labels, tooltips, breadcrumbs, Command Palette

| Fichier | Modification |
|---|---|
| `src/components/Layout.tsx` | Nav item "Quotas" → "Disponibilités" |
| `src/pages/QuotasPage.tsx` | Titre page, boutons, labels formulaire |
| `src/components/monthly-process/steps/QuotaStep.tsx` | Labels étape |
| `src/components/CommandPalette.tsx` | Entrée navigation + recherche |
| `App.tsx` route | `/quotas` → `/disponibilites` (garder redirect `/quotas`) |

**Attention** : Ne PAS renommer la table `wholesaler_quotas` en DB — trop risqué. Juste le label UI.

### T6.2 — Indicateur ∞ pour produits sans quota

Quand `quota_quantity IS NULL` ou `quota_quantity = 0` pour un produit/grossiste, afficher **∞** au lieu de "0" ou "-".

**Fichiers impactés** :
- `QuotasPage.tsx` : colonne quantité
- `MacroAttributionStep.tsx` : matrice allocation
- Tout composant affichant des quotas

### T6.3 — Retirer le filtre par laboratoire

Sur la page Produits, retirer le dropdown/filtre "Laboratoire". Julie ne filtre jamais par labo.

**Fichier** : `src/pages/ProductsPage.tsx`

### T6.4 — Retirer la date d'expiration du niveau produit

La colonne `expiry_dates` sur la fiche produit n'a de sens qu'au niveau lot. Retirer l'affichage dans le formulaire produit et la liste.

**Fichier** : `src/pages/ProductsPage.tsx` (formulaire create/edit + colonnes table)

### T6.5 — Copie auto des dispos mois précédent

Lors de la création d'un processus mensuel, si la checkbox "Copier les disponibilités" est cochée (déjà implémentée comme "Clone quotas"), s'assurer que le comportement copie bien les quotas du mois précédent par défaut.

**Statut** : Déjà implémenté (session 8) — vérifier que le label dit "Copier les disponibilités du mois précédent".

---

## Critères de validation

- [ ] Le mot "Quotas" n'apparaît nulle part dans l'UI (sauf en DB)
- [ ] Les produits sans quota affichent ∞
- [ ] Pas de filtre labo sur la page Produits
- [ ] Pas d'expiry_dates sur la fiche produit
- [ ] 0 erreurs TypeScript, 0 console errors
- [ ] Railway deploy OK

---

## Dépendances

- Aucune — phase autonome, quick wins purs
