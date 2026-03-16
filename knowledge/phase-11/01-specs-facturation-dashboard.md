# Phase 11 — Facturation & Dashboard global

**Priorité** : P5 (Futur)
**Dates** : Mai 2026
**Source** : Kick-Off 12 mars 2026 (sections 3.2, 7)

---

## Objectif

Ajouter un onglet facturation pour automatiser les factures de commission (perte de revenus identifiée au kick-off) et un dashboard global annuel (P1 du contrat).

---

## Contexte business

### Facturation — Perte de revenus actuelle

Julie facture :
- **Grossistes** : 6 000€ HT/mois par grossiste (commission fixe) — simple mais doit être fait
- **Clients** : % du CA mensuel — seul MPA paie actuellement. Julie oublie de facturer les autres (ex: Brocacef) → **perte de revenus significative**

L'outil peut calculer automatiquement le CA par client par mois (données d'allocation disponibles) et générer les factures de commission.

### Dashboard global — Vision annuelle

Julie n'a aucune visibilité sur l'historique :
- Pas de vue des commandes des mois passés (tableau de synthèse)
- Pas de tendances (volumes, CA, nombre de produits)
- Impossible de comparer un mois à un autre

---

## Tâches — Facturation

### T11.1 — Schema factures

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) CHECK (type IN ('wholesaler_commission', 'client_commission')),
  entity_type VARCHAR(20) CHECK (entity_type IN ('wholesaler', 'customer')),
  entity_id UUID NOT NULL,
  process_id UUID REFERENCES monthly_processes(id),
  month DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(4,2) DEFAULT 20.00,
  amount_ttc NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  due_date DATE,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### T11.2 — Génération auto factures grossistes

À la finalisation d'un processus mensuel :
- Pour chaque grossiste actif → créer une facture draft de 6 000€ HT
- Numérotation : `RW-{YYYY}-{MM}-{CODE_GROSSISTE}`
- Statut initial : `draft`

### T11.3 — Calcul commissions clients

Après finalisation :
- Calculer le CA par client (somme des allocations × prix unitaire)
- Appliquer le % de commission configuré par client
- Générer la facture draft

### T11.4 — Page Facturation

Nouvelle page dans la navigation :
- Liste des factures par mois (filtres : statut, type, entité)
- Actions : Envoyer, Marquer payée, Annuler
- Export PDF (futur)
- Indicateurs : total facturé, total payé, total en attente, total en retard

---

## Tâches — Dashboard global

### T11.5 — Vue historique des processus

Tableau récapitulatif de tous les mois passés :

| Mois | Commandes | Produits | Clients | CA estimé | Couverture | Statut |
|---|---|---|---|---|---|---|

### T11.6 — Graphiques tendances

- Volume de commandes (barres par mois)
- CA estimé (ligne par mois)
- Top produits commandés (barres horizontales)
- Répartition par client (donut)
- Répartition par grossiste (donut)

### T11.7 — KPIs annuels

- CA total année en cours
- Nombre de commandes traitées
- Taux de couverture moyen
- Taux de refus moyen
- Top 5 produits / clients / grossistes

---

## Tâches — Autres

### T11.8 — Portail grossiste (esquisse)

Pas un portail complet mais un export automatisé :
- BL par email au grossiste à la finalisation
- Dashboard simple pour le grossiste (commandes du mois, historique)
- Priorité basse — à scoper avec Julie

### T11.9 — Suivi enlèvements

Julie a mentionné le besoin de suivre les camions/collectes. Simple tableau :
- Date, grossiste, client, statut (planifié, en cours, terminé)
- Notifications de rappel

---

## Critères de validation

- [ ] Factures grossistes auto-générées à la finalisation
- [ ] Factures clients calculées sur le CA
- [ ] Page facturation avec filtres et actions
- [ ] Dashboard historique des processus
- [ ] Graphiques tendances (au moins 3)
- [ ] KPIs annuels
- [ ] 0 erreurs TS, 0 console errors

---

## Dépendances

- Toutes les phases précédentes (6-10) doivent être stables
- Données historiques en DB (15+ processus finalisés disponibles)
- Le calcul du CA nécessite les allocations confirmées
