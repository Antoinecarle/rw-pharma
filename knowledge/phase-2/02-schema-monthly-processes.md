# Schema de donnees - Processus Mensuels (Phase 2 - Flow actuel)

> Ce document decrit les tables creees pour le flow d'allocation en 5 etapes,
> qui coexistent avec le modele `monthly_orders` / `order_lines` documente dans `01-schema-commandes.md`.

## Tables

### monthly_processes (orchestration du flow en 5 etapes)
```sql
CREATE TABLE monthly_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER NOT NULL,              -- Numero du mois (1-12)
  year INTEGER NOT NULL,               -- Annee (ex: 2026)
  status VARCHAR NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'importing', 'reviewing_orders', 'allocating', 'reviewing_allocations', 'finalizing', 'completed')),
  current_step INTEGER NOT NULL DEFAULT 1,   -- Etape courante (1-5)
  orders_count INTEGER NOT NULL DEFAULT 0,   -- Compteur de commandes importees
  allocations_count INTEGER NOT NULL DEFAULT 0, -- Compteur d'allocations generees
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)                  -- Un seul processus par mois/annee
);
```

#### Etapes du processus

| Step | status | Description |
|------|--------|-------------|
| 1 | `importing` | Import des commandes (upload CSV/Excel) |
| 2 | `reviewing_orders` | Revue et validation des commandes |
| 3 | `allocating` | Lancement de l'allocation (simulation + execution) |
| 4 | `reviewing_allocations` | Revue des allocations proposees + confirmation |
| 5 | `finalizing` / `completed` | Finalisation, export, cloture |

### orders (commandes simplifiees liees au processus)
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_process_id UUID NOT NULL REFERENCES monthly_processes(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC,
  status VARCHAR NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'allocated', 'rejected')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### monthly_process_steps (suivi detaille des etapes)
```sql
CREATE TABLE monthly_process_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_order_id UUID NOT NULL REFERENCES monthly_orders(id) ON DELETE CASCADE,
  step_key VARCHAR(50) NOT NULL,       -- Ex: 'import', 'review', 'allocate'
  step_order INTEGER NOT NULL,         -- Ordre d'affichage (1, 2, 3...)
  label VARCHAR(255) NOT NULL,         -- Label affiche en UI
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### wholesaler_contacts (contacts par grossiste)
```sql
CREATE TABLE wholesaler_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),                   -- Ex: 'Commercial', 'Logistique'
  email VARCHAR(255),
  phone VARCHAR(50),
  is_primary BOOLEAN DEFAULT false,    -- Contact principal
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Relation entre les deux modeles

```
Modele "monthly_orders" (doc Phase 2/3)     Modele "monthly_processes" (flow actuel)
─────────────────────────────────────────    ────────────────────────────────────────
monthly_orders                               monthly_processes
  └─ order_imports                             └─ orders (simplifie)
  └─ order_lines (enrichi)                     └─ allocations (via monthly_process_id)
  └─ order_exports
  └─ collected_stock (Phase 3)
  └─ allocations (via monthly_order_id)
  └─ allocation_exports
```

Le modele `monthly_processes` a ete cree pour le flow utilisateur en 5 etapes.
Le modele `monthly_orders` reste la reference pour le workflow complet avec stock (Phase 3).

A terme, les deux modeles devront etre reconcilies : soit en migrant vers un modele unique,
soit en reliant `monthly_processes` a `monthly_orders` via une FK.

## Index
```sql
CREATE INDEX idx_orders_monthly_process ON orders(monthly_process_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
CREATE INDEX idx_process_steps_order_key ON monthly_process_steps(monthly_order_id, step_key);
```
