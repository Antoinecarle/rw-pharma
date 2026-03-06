# Schema de donnees - Commandes (Phase 2)

## Tables

### monthly_orders (mois de commande)
```sql
CREATE TABLE monthly_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL UNIQUE,           -- Premier jour du mois (ex: 2026-03-01)
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'collecting', 'consolidated', 'allocated', 'exported', 'closed')),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### order_imports (fichiers importes)
```sql
CREATE TABLE order_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_order_id UUID NOT NULL REFERENCES monthly_orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(500),              -- Path dans Supabase Storage
  file_size BIGINT,
  column_mapping JSONB DEFAULT '{}',   -- Mapping utilise pour cet import
  row_count INTEGER,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'mapped', 'imported', 'validated', 'error')),
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### order_lines (lignes de commande normalisees)
```sql
CREATE TABLE order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_order_id UUID NOT NULL REFERENCES monthly_orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  import_id UUID REFERENCES order_imports(id) ON DELETE SET NULL,
  cip13 VARCHAR(13) NOT NULL,
  product_name VARCHAR(500),           -- Nom tel que dans le fichier client
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,4),
  min_expiry_date DATE,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'modified', 'rejected')),
  alerts JSONB DEFAULT '[]',           -- Ex: ["unknown_product", "price_deviation"]
  original_data JSONB DEFAULT '{}',    -- Donnees brutes du fichier source
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### order_exports (exports vers grossistes)
```sql
CREATE TABLE order_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_order_id UUID NOT NULL REFERENCES monthly_orders(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  file_name VARCHAR(500),
  file_path VARCHAR(500),              -- Path dans Supabase Storage
  row_count INTEGER,
  status VARCHAR(20) DEFAULT 'generated'
    CHECK (status IN ('generated', 'sent', 'confirmed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Flux de donnees

```
order_imports (fichier Excel client)
    ↓ parsing + mapping
order_lines (lignes normalisees)
    ↓ consolidation
Vue consolidee (commandes vs quotas via wholesaler_quotas)
    ↓ export
order_exports (fichiers par grossiste)
```

## Index recommandes
```sql
CREATE INDEX idx_order_lines_monthly ON order_lines(monthly_order_id);
CREATE INDEX idx_order_lines_customer ON order_lines(customer_id);
CREATE INDEX idx_order_lines_cip13 ON order_lines(cip13);
CREATE INDEX idx_order_lines_product ON order_lines(product_id);
CREATE INDEX idx_order_imports_monthly ON order_imports(monthly_order_id);
```
