# Phase 8 — Étape Négociation

**Priorité** : P2
**Dates** : 25 mars → 5 avril 2026
**Source** : Kick-Off 12 mars 2026 (section 6.5)

---

## Objectif

Ajouter la phase de négociation dans le workflow mensuel. C'est la principale découverte du kick-off : entre l'export initial aux grossistes (étape 5) et la réception des stocks (étape 6 actuelle → 7), il y a une phase de négociation intense avec les clients durant les semaines 2-3 du mois.

---

## Contexte business

Julie voit **tous ses clients chaque mois** (visio ou face-à-face). Pendant ces rendez-vous :
- Elle fait des feedbacks sur les PO : "ici j'ai besoin de 2€ de plus"
- Elle propose des produits supplémentaires
- Elle ajuste les quantités selon la disponibilité
- Les clients acceptent, refusent ou contre-proposent

Après la négo, elle ré-exporte les commandes aux grossistes avec les ajouts datés.

---

## Impact sur le workflow

### Flow actuel (10 étapes)
```
Phase 1: 1-Dispos, 2-Commandes, 3-Revue, 4-Macro, 5-Export
Phase 2: 6-Stocks, 7-Agrégation, 8-Allocation
Phase 3: 9-Revue, 10-Finalisation
```

### Flow cible (12 étapes)
```
Phase 1: 1-Dispos, 2-Commandes, 3-Revue, 4-Macro, 5-Export grossistes
Phase 2 (NÉGO): 6-Négociation, 7-Ré-export grossistes
Phase 3 (COLLECTE): 8-Stocks, 9-Agrégation, 10-Allocation fine
Phase 4 (LIVRAISON): 11-Revue allocations, 12-Finalisation
```

**Migration DB** : Incrémenter `current_step` pour tous les process au-delà de l'étape 5.

---

## Tâches détaillées

### T8.1 — Restructuration du flow (PhaseTabBar + PhaseSubSteps)

Passer de 3 phases / 10 étapes à 4 phases / 12 étapes.

**Fichiers impactés** :
- `MonthlyProcessDetailPage.tsx` : step definitions
- `PhaseTabBar.tsx` : 4 phases au lieu de 3
- `PhaseSubSteps.tsx` : sous-étapes par phase
- `MonthlyProcessCard.tsx` : affichage progression
- `StepQualityScore.tsx` : scoring
- `ReopenPhaseDialog.tsx` : 4 phases
- `CommandPalette.tsx` : navigation étapes
- `FinalizationStep.tsx` : validation

### T8.2 — NegotiationStep (étape 6)

**Vue principale** : Tableau par produit avec tous les clients qui le commandent.

| Colonne | Description |
|---|---|
| Produit (CIP13 + nom) | Le médicament |
| Client 1 (qty, prix) | Commande du client 1 |
| Client 2 (qty, prix) | Commande du client 2 |
| ... | Autant de colonnes que de clients |
| Best Price | Le meilleur prix parmi tous les clients |
| Statut | Non traité / En cours / Validé |

**Fonctionnalités** :
- **Filtre par client** : "Je suis en RDV avec Orifarm → je ne vois que les produits d'Orifarm"
- **Feedback inline** : Cliquer sur une cellule client pour modifier qty, prix, ajouter un commentaire
- **Validation produit par produit** : Un produit est "validé" quand tous les clients sont traités
- **Compteur de progression** : "42/150 produits traités"
- **Best price highlight** : Le meilleur prix est mis en valeur visuellement
- **Alertes** : Produit ANSM bloqué, produit discontinued

**Schema DB** :
```sql
-- Ajouter sur orders
ALTER TABLE orders ADD COLUMN nego_status VARCHAR(20) DEFAULT 'pending'
  CHECK (nego_status IN ('pending', 'in_progress', 'validated', 'rejected'));
ALTER TABLE orders ADD COLUMN nego_comment TEXT;
ALTER TABLE orders ADD COLUMN nego_original_qty INTEGER;
ALTER TABLE orders ADD COLUMN nego_original_price NUMERIC;
ALTER TABLE orders ADD COLUMN nego_updated_at TIMESTAMPTZ;
```

### T8.3 — ReExportStep (étape 7)

**Objectif** : Ré-exporter les commandes aux grossistes avec les modifications de la négo.

**Vue** : Tableau par grossiste avec les lignes de commande, dont :
- Lignes initiales (date d'import originale)
- **Lignes ajoutées** (avec date d'ajout mise en valeur)
- Lignes modifiées (qty/prix changés, highlight différence)

**Export** : Même format que l'étape 5 (Export grossistes) mais avec :
- Colonne "Date d'ajout" pour les nouvelles lignes
- Colonne "Modification" pour les lignes changées
- Format CSV/Excel au choix

---

## Critères de validation

- [ ] Flow passé de 10 à 12 étapes sans casser les process existants
- [ ] NegotiationStep : vue produit×clients fonctionnelle
- [ ] Filtre par client opérationnel
- [ ] Feedback inline (modifier qty/prix/commentaire)
- [ ] Validation produit par produit avec compteur
- [ ] ReExportStep : export avec lignes datées
- [ ] Migration DB appliquée (current_step + colonnes nego)
- [ ] Tous les process existants migrent correctement
- [ ] 0 erreurs TS, 0 console errors
- [ ] Railway deploy OK

---

## Dépendances

- Phase 7 (données enrichies) pour les grossistes ouverts par client
- Nécessite que les commandes existent (étapes 1-5 du flow)
