# Phase 7 — Données de référence enrichies

**Priorité** : P1
**Dates** : 18 mars → 25 mars 2026
**Source** : Kick-Off 12 mars 2026 (sections 2.3, 2.5, 2.6)

---

## Objectif

Enrichir les données de référence (produits, clients, grossistes) avec les champs et relations découverts au kick-off. Nécessite des migrations Supabase.

---

## Tâches détaillées

### T7.1 — Statut "Discontinued" sur les produits

Ajouter un champ `is_discontinued` (boolean, default false) sur la table `products`.

**Migration Supabase** :
```sql
ALTER TABLE products ADD COLUMN is_discontinued BOOLEAN DEFAULT false;
COMMENT ON COLUMN products.is_discontinued IS 'Produit qui ne se fait plus / non existant';
```

**UI** :
- Badge "Discontinued" rouge sur la fiche produit (à côté du badge ANSM)
- Alerte dans la revue des commandes si un client commande un produit discontinued
- Filtre "Inclure les produits discontinués" sur ProductsPage

### T7.2 — Historique des mises à jour (Audit Trail)

Créer une table `product_audit_log` pour tracer les changements critiques.

**Migration** :
```sql
CREATE TABLE product_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  field_changed VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);
CREATE INDEX idx_product_audit_product ON product_audit_log(product_id);
```

**Champs à tracer** : `is_ansm_blocked`, `is_discontinued`, `pfht`, `name`

**UI** : Onglet "Historique" dans le dialog de détail produit, timeline des changements.

### T7.3 — Dernière date d'expiration connue (vue calculée)

Créer une vue qui remonte la dernière expiry depuis `collected_stock`.

```sql
CREATE OR REPLACE VIEW product_latest_expiry AS
SELECT DISTINCT ON (cs.product_id)
  cs.product_id,
  cs.expiry_date AS latest_expiry,
  cs.lot_number AS latest_lot
FROM collected_stock cs
WHERE cs.expiry_date IS NOT NULL
ORDER BY cs.product_id, cs.expiry_date DESC;
```

**UI** : Afficher sur la fiche produit "Dernière péremption : MM/YYYY (lot XXX)"

### T7.4 — Dernier meilleur prix (vue calculée)

```sql
CREATE OR REPLACE VIEW product_best_price AS
SELECT DISTINCT ON (o.product_id)
  o.product_id,
  o.unit_price AS best_price,
  c.name AS best_price_customer,
  mp.month AS best_price_month
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN monthly_processes mp ON o.process_id = mp.id
WHERE o.unit_price IS NOT NULL AND o.unit_price > 0
ORDER BY o.product_id, o.unit_price DESC;
```

**UI** : Afficher sur la fiche produit "Meilleur prix : XX.XX€ (Client, Mois)"

### T7.5 — Contacts multiples par client

Créer une table `customer_contacts`.

```sql
CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(50),
  role VARCHAR(100),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_customer_contacts_customer ON customer_contacts(customer_id);
```

**UI** : Section "Contacts" dans le formulaire client. Liste de contacts avec add/edit/delete. Badge "Principal" sur le contact primary.

### T7.6 — Lien client ↔ grossistes ouverts

Table pivot pour configurer quels grossistes sont ouverts pour chaque client.

```sql
CREATE TABLE customer_wholesalers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  wholesaler_id UUID REFERENCES wholesalers(id) ON DELETE CASCADE,
  is_open BOOLEAN DEFAULT true,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(customer_id, wholesaler_id)
);
```

**UI** :
- Section "Grossistes ouverts" sur la fiche client (checkboxes de tous les grossistes)
- Indication visuelle dans l'allocation fine (cellules grisées si non ouvert)

### T7.7 — Documents grossistes (WDA, GDP, RIB)

Utiliser le Storage Supabase (déjà utilisé pour les docs clients).

**Migration** :
```sql
ALTER TABLE wholesalers ADD COLUMN documents JSONB DEFAULT '[]';
-- Format: [{"type": "wda", "name": "WDA_2026.pdf", "path": "wholesalers/{id}/wda.pdf", "uploaded_at": "..."}]
```

**UI** : Même pattern que les documents clients dans le portail (upload/download/delete).

---

## Critères de validation

- [ ] Produits discontinued : badge + filtre + alerte commande
- [ ] Audit trail : historique ANSM/prix/discontinued affiché
- [ ] Dernière expiry remontée sur fiche produit
- [ ] Meilleur prix affiché sur fiche produit
- [ ] Contacts multiples par client (CRUD)
- [ ] Grossistes ouverts par client (checkboxes)
- [ ] Documents grossistes (upload/download)
- [ ] Migrations Supabase appliquées
- [ ] RLS configurée sur les nouvelles tables
- [ ] 0 erreurs TS, 0 console errors

---

## Dépendances

- Phase 6 (renommages) doit être terminée avant
- Les vues calculées (T7.3, T7.4) dépendent des données existantes en DB
