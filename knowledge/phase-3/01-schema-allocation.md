# Schema de donnees - Allocation (Phase 3)

> Derniere mise a jour : 2026-03-06 (audit de conformite)

## Tables

### collected_stock (stock recu des grossistes)
```sql
CREATE TABLE collected_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_order_id UUID NOT NULL REFERENCES monthly_orders(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  cip13 VARCHAR(13) NOT NULL,
  lot_number VARCHAR(100) NOT NULL,     -- Numero de lot (critique pharma)
  expiry_date DATE NOT NULL,            -- Date d'expiration du lot
  quantity INTEGER NOT NULL,            -- Quantite collectee
  unit_cost NUMERIC(12,4),              -- Prix d'achat
  import_file_id UUID,                  -- Ref fichier source
  status VARCHAR(20) DEFAULT 'received'
    CHECK (status IN ('received', 'allocated', 'partially_allocated', 'unallocated', 'offered')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### allocations (table hybride : flow actuel + allocation par lot)

La table `allocations` sert deux cas d'usage :

1. **Flow actuel (Phase 2)** : allocation d'une commande (`order_id`) a un grossiste (`wholesaler_id`) dans le cadre d'un processus mensuel (`monthly_process_id`). Utilise `requested_quantity` / `allocated_quantity`.
2. **Allocation par lot (Phase 3)** : allocation d'un lot physique (`stock_id`) a un client. Utilise `monthly_order_id` / `quantity`.

```sql
CREATE TABLE allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Colonnes Phase 3 (allocation par lot) — nullable car non utilisees par le flow Phase 2
  monthly_order_id UUID REFERENCES monthly_orders(id) ON DELETE CASCADE,
  stock_id UUID REFERENCES collected_stock(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,            -- Quantite allouee (modele Phase 3)

  -- Colonnes Flow actuel (Phase 2) — nullable car non utilisees par le modele Phase 3
  monthly_process_id UUID REFERENCES monthly_processes(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  wholesaler_id UUID REFERENCES wholesalers(id) ON DELETE CASCADE,
  requested_quantity INTEGER NOT NULL DEFAULT 0,  -- Quantite demandee (flow actuel)
  allocated_quantity INTEGER NOT NULL DEFAULT 0,  -- Quantite allouee (flow actuel)

  -- Colonnes communes
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  unit_price NUMERIC(12,4),             -- Prix negocie pour ce client
  allocation_type VARCHAR(20) DEFAULT 'auto'
    CHECK (allocation_type IN ('auto', 'manual', 'reallocation', 'offered')),
  status VARCHAR(20) DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'refused', 'cancelled')),
  refusal_reason TEXT,                  -- Si refuse par le client
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

> **Note reconciliation** : A terme, quand la Phase 3 sera pleinement implementee (import stock reel par lot),
> il faudra decider si les deux modeles fusionnent ou si une table separee est creee pour les allocations par lot.
> Le champ `stock_id` deviendra NOT NULL pour les allocations Phase 3.

### allocation_exports (exports par client)
```sql
CREATE TABLE allocation_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_order_id UUID NOT NULL REFERENCES monthly_orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name VARCHAR(500),
  file_path VARCHAR(500),              -- Path Supabase Storage
  file_type VARCHAR(10) DEFAULT 'xlsx'
    CHECK (file_type IN ('xlsx', 'pdf')),
  row_count INTEGER,
  total_value NUMERIC(14,2),           -- Valeur totale de l'export
  status VARCHAR(20) DEFAULT 'generated'
    CHECK (status IN ('generated', 'sent', 'confirmed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Vues utiles

### Vue consolidee par lot (tableau croise)
```sql
CREATE VIEW stock_summary AS
SELECT
  cs.id AS stock_id,
  cs.monthly_order_id,
  p.cip13,
  p.name AS product_name,
  p.pfht,
  cs.lot_number,
  cs.expiry_date,
  w.name AS wholesaler_name,
  cs.quantity AS stock_quantity,
  COALESCE(SUM(a.quantity) FILTER (WHERE a.status != 'cancelled'), 0) AS allocated_quantity,
  cs.quantity - COALESCE(SUM(a.quantity) FILTER (WHERE a.status != 'cancelled'), 0) AS remaining_quantity,
  cs.status
FROM collected_stock cs
JOIN products p ON cs.product_id = p.id
JOIN wholesalers w ON cs.wholesaler_id = w.id
LEFT JOIN allocations a ON a.stock_id = cs.id
GROUP BY cs.id, p.cip13, p.name, p.pfht, w.name;
```

### Vue commandes vs allocations par client
```sql
CREATE VIEW customer_fulfillment AS
SELECT
  ol.monthly_order_id,
  ol.customer_id,
  c.name AS customer_name,
  ol.product_id,
  p.cip13,
  p.name AS product_name,
  SUM(ol.quantity) AS ordered_quantity,
  COALESCE(SUM(a.quantity) FILTER (WHERE a.status != 'cancelled'), 0) AS allocated_quantity,
  SUM(ol.quantity) - COALESCE(SUM(a.quantity) FILTER (WHERE a.status != 'cancelled'), 0) AS gap
FROM order_lines ol
JOIN customers c ON ol.customer_id = c.id
JOIN products p ON ol.product_id = p.id
LEFT JOIN allocations a ON a.customer_id = ol.customer_id
  AND a.product_id = ol.product_id
  AND a.monthly_order_id = ol.monthly_order_id
GROUP BY ol.monthly_order_id, ol.customer_id, c.name, ol.product_id, p.cip13, p.name;
```

## Index
```sql
-- Index Phase 3 (allocation par lot)
CREATE INDEX idx_collected_stock_monthly ON collected_stock(monthly_order_id);
CREATE INDEX idx_collected_stock_product ON collected_stock(product_id);
CREATE INDEX idx_collected_stock_lot ON collected_stock(lot_number);
CREATE INDEX idx_allocations_stock ON allocations(stock_id);
CREATE INDEX idx_allocations_customer ON allocations(customer_id);
CREATE INDEX idx_allocations_monthly ON allocations(monthly_order_id);

-- Index Flow actuel (Phase 2)
CREATE INDEX idx_allocations_monthly_process ON allocations(monthly_process_id);
CREATE INDEX idx_allocations_wholesaler ON allocations(wholesaler_id);
```

## Format d'export par client

| Colonne | Description |
|---|---|
| Product | Nom du produit |
| CIP13 | Code medicament |
| Expiry Date | Date d'expiration du lot |
| Lot Number | Numero de lot |
| Qty [Grossiste A] | Quantite depuis grossiste A |
| Qty [Grossiste B] | Quantite depuis grossiste B |
| Total Qty | Quantite totale |
| Unit Price | Prix unitaire negocie |
| Total Value | Quantite x Prix |
