-- RW Pharma - Phase 1 : Schema de donnees de reference
-- A executer dans le SQL Editor de Supabase

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- Table: products (catalogue ~1760 produits)
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cip13 VARCHAR(13) UNIQUE NOT NULL,
  cip7 VARCHAR(7),
  name VARCHAR(500) NOT NULL,
  eunb VARCHAR(50),
  pfht NUMERIC(12,4),
  laboratory VARCHAR(255),
  is_ansm_blocked BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_products_cip13 ON products(cip13);
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector('french', name));
CREATE INDEX IF NOT EXISTS idx_products_laboratory ON products(laboratory);

-- =============================================
-- Table: wholesalers (grossistes francais)
-- =============================================
CREATE TABLE IF NOT EXISTS wholesalers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20) UNIQUE,
  contact_email VARCHAR(255),
  drive_folder_url VARCHAR(500),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Table: wholesaler_quotas (quotas par produit par mois)
-- =============================================
CREATE TABLE IF NOT EXISTS wholesaler_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  monthly_process_id UUID REFERENCES monthly_processes(id) ON DELETE SET NULL,
  month DATE NOT NULL,
  quota_quantity INTEGER NOT NULL,
  extra_available INTEGER DEFAULT 0,
  import_file_name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wholesaler_id, product_id, month)
);

CREATE INDEX IF NOT EXISTS idx_quotas_wholesaler ON wholesaler_quotas(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_quotas_product ON wholesaler_quotas(product_id);
CREATE INDEX IF NOT EXISTS idx_quotas_month ON wholesaler_quotas(month);
CREATE INDEX IF NOT EXISTS idx_quotas_process ON wholesaler_quotas(monthly_process_id);

-- =============================================
-- Table: customers (clients importateurs ~10)
-- =============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20) UNIQUE,
  country VARCHAR(5),
  contact_email VARCHAR(255),
  is_top_client BOOLEAN DEFAULT false,
  allocation_preferences JSONB DEFAULT '{}',
  excel_column_mapping JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Table: monthly_processes (processus d'allocation mensuelle)
-- =============================================
CREATE TABLE IF NOT EXISTS monthly_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'importing_quotas', 'importing_orders', 'reviewing_orders', 'macro_allocating', 'exporting_wholesalers', 'collecting_stock', 'allocating_lots', 'reviewing_allocations', 'finalizing', 'completed')),
  current_step INTEGER NOT NULL DEFAULT 1,
  quotas_count INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  allocations_count INTEGER DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- =============================================
-- Table: orders (commandes clients pour un processus)
-- =============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_process_id UUID NOT NULL REFERENCES monthly_processes(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,4),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'allocated', 'rejected')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_process ON orders(monthly_process_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);

-- =============================================
-- Table: allocations (resultats d'allocation)
-- =============================================
CREATE TABLE IF NOT EXISTS allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_process_id UUID NOT NULL REFERENCES monthly_processes(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  requested_quantity INTEGER NOT NULL,
  allocated_quantity INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocations_process ON allocations(monthly_process_id);

-- =============================================
-- Table: ansm_blocked_products (liste ANSM)
-- =============================================
CREATE TABLE IF NOT EXISTS ansm_blocked_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cip13 VARCHAR(13) UNIQUE NOT NULL,
  product_name VARCHAR(500),
  blocked_date TIMESTAMPTZ DEFAULT NOW(),
  source_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ansm_blocked_cip13 ON ansm_blocked_products(cip13);

-- =============================================
-- Table: ansm_sync_logs (historique synchronisations)
-- =============================================
CREATE TABLE IF NOT EXISTS ansm_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  message TEXT,
  products_blocked INTEGER DEFAULT 0,
  products_unblocked INTEGER DEFAULT 0,
  total_ansm_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Trigger: updated_at automatique
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER wholesalers_updated_at
  BEFORE UPDATE ON wholesalers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER monthly_processes_updated_at
  BEFORE UPDATE ON monthly_processes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS Policies (securite)
-- =============================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesalers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesaler_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Politique: utilisateurs authentifies ont acces complet
CREATE POLICY "Authenticated users can read products" ON products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products" ON products
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON products
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete products" ON products
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read wholesalers" ON wholesalers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert wholesalers" ON wholesalers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update wholesalers" ON wholesalers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete wholesalers" ON wholesalers
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read quotas" ON wholesaler_quotas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert quotas" ON wholesaler_quotas
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update quotas" ON wholesaler_quotas
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete quotas" ON wholesaler_quotas
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read customers" ON customers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON customers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON customers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete customers" ON customers
  FOR DELETE TO authenticated USING (true);

ALTER TABLE monthly_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read monthly_processes" ON monthly_processes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert monthly_processes" ON monthly_processes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update monthly_processes" ON monthly_processes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete monthly_processes" ON monthly_processes
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read orders" ON orders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert orders" ON orders
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update orders" ON orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete orders" ON orders
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read allocations" ON allocations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert allocations" ON allocations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update allocations" ON allocations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete allocations" ON allocations
  FOR DELETE TO authenticated USING (true);

ALTER TABLE ansm_blocked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ansm_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ansm_blocked_products" ON ansm_blocked_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ansm_blocked_products" ON ansm_blocked_products
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ansm_blocked_products" ON ansm_blocked_products
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete ansm_blocked_products" ON ansm_blocked_products
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read ansm_sync_logs" ON ansm_sync_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ansm_sync_logs" ON ansm_sync_logs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ansm_sync_logs" ON ansm_sync_logs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete ansm_sync_logs" ON ansm_sync_logs
  FOR DELETE TO authenticated USING (true);
