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
  monthly_process_id UUID REFERENCES monthly_processes(id) ON DELETE CASCADE,
  monthly_order_id UUID,
  stock_id UUID,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  wholesaler_id UUID REFERENCES wholesalers(id) ON DELETE CASCADE,
  requested_quantity INTEGER NOT NULL DEFAULT 0,
  allocated_quantity INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  unit_price NUMERIC(12,4),
  prix_applique NUMERIC(12,4),
  allocation_type VARCHAR(20) DEFAULT 'auto',
  status VARCHAR(20) DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  -- Phase 5: Client confirmation
  confirmation_status VARCHAR(20) DEFAULT 'pending' CHECK (confirmation_status IN ('pending', 'confirmed', 'refused')),
  confirmation_note TEXT,
  confirmed_at TIMESTAMPTZ,
  refusal_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
-- Phase 5: Helper functions (multi-tenant RLS)
-- =============================================

-- Returns true if current user is NOT a customer (i.e. is admin/Julie)
CREATE OR REPLACE FUNCTION is_admin_user() RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (SELECT 1 FROM customer_users WHERE auth_user_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns the customer_id linked to the current auth user
CREATE OR REPLACE FUNCTION get_customer_id() RETURNS UUID AS $$
  SELECT customer_id FROM customer_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================
-- Phase 5: customer_users (portail login bridge)
-- =============================================
CREATE TABLE IF NOT EXISTS customer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'owner')),
  email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Phase 5: customer_invitations (invitation workflow)
-- =============================================
CREATE TABLE IF NOT EXISTS customer_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(32) NOT NULL UNIQUE,
  role VARCHAR(20) DEFAULT 'viewer',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by UUID,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Phase 5: customer_documents (documents reglementaires + exports)
-- =============================================
CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('wda', 'gdp', 'export_excel', 'export_pdf', 'other')),
  title VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  uploaded_by UUID,
  monthly_process_id UUID REFERENCES monthly_processes(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Phase 5: offered_stock (marketplace stock non-alloue)
-- =============================================
CREATE TABLE IF NOT EXISTS offered_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  monthly_process_id UUID REFERENCES monthly_processes(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  remaining_quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,4),
  discount_pct NUMERIC(5,2) DEFAULT 0,
  expiry_date DATE,
  lot_number VARCHAR(100),
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'partially_claimed', 'fully_claimed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Phase 5: offered_stock_claims (demandes client sur stock offert)
-- =============================================
CREATE TABLE IF NOT EXISTS offered_stock_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offered_stock_id UUID NOT NULL REFERENCES offered_stock(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped')),
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

-- Orders: multi-tenant (customer voit ses commandes, admin voit tout)
CREATE POLICY "orders_customer_select" ON orders
  FOR SELECT USING (customer_id = get_customer_id() OR is_admin_user());
CREATE POLICY "orders_customer_insert" ON orders
  FOR INSERT WITH CHECK (customer_id = get_customer_id() OR is_admin_user());
CREATE POLICY "orders_customer_update" ON orders
  FOR UPDATE USING (customer_id = get_customer_id() OR is_admin_user());

-- Allocations: multi-tenant (customer voit/confirme ses allocations, admin gere tout)
CREATE POLICY "allocations_customer_select" ON allocations
  FOR SELECT USING (customer_id = get_customer_id() OR is_admin_user());
CREATE POLICY "allocations_customer_update" ON allocations
  FOR UPDATE USING (customer_id = get_customer_id() OR is_admin_user());
CREATE POLICY "allocations_admin_insert" ON allocations
  FOR INSERT WITH CHECK (is_admin_user());
CREATE POLICY "allocations_admin_delete" ON allocations
  FOR DELETE USING (is_admin_user());

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

-- =============================================
-- Phase 5: RLS multi-tenant pour tables portail
-- =============================================

ALTER TABLE customer_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_users_self" ON customer_users
  FOR SELECT USING (auth_user_id = auth.uid() OR is_admin_user());
CREATE POLICY "customer_users_admin_insert" ON customer_users
  FOR INSERT WITH CHECK (is_admin_user());
-- Newly signed-up user can link themselves to a customer
CREATE POLICY "customer_users_self_insert" ON customer_users
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "customer_users_admin_delete" ON customer_users
  FOR DELETE USING (is_admin_user());

ALTER TABLE customer_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitations_admin_all" ON customer_invitations
  FOR ALL USING (is_admin_user());
-- Anon/auth can read pending invitations (for /invite/:token page)
CREATE POLICY "invitations_read_by_token" ON customer_invitations
  FOR SELECT TO anon, authenticated
  USING (status = 'pending' AND expires_at > NOW());
-- Newly signed-up user can mark their own invitation as accepted
CREATE POLICY "invitations_accept_own" ON customer_invitations
  FOR UPDATE TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (status = 'accepted');

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs_customer_select" ON customer_documents
  FOR SELECT USING (customer_id = get_customer_id() OR is_admin_user());
CREATE POLICY "docs_customer_insert" ON customer_documents
  FOR INSERT WITH CHECK (customer_id = get_customer_id() OR is_admin_user());
CREATE POLICY "docs_admin_delete" ON customer_documents
  FOR DELETE USING (is_admin_user());

ALTER TABLE offered_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offered_stock_select" ON offered_stock
  FOR SELECT USING (true);
CREATE POLICY "offered_stock_admin_manage" ON offered_stock
  FOR ALL USING (is_admin_user());

ALTER TABLE offered_stock_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claims_customer_select" ON offered_stock_claims
  FOR SELECT USING (customer_id = get_customer_id() OR is_admin_user());
CREATE POLICY "claims_customer_insert" ON offered_stock_claims
  FOR INSERT WITH CHECK (customer_id = get_customer_id());
CREATE POLICY "claims_customer_update" ON offered_stock_claims
  FOR UPDATE USING (customer_id = get_customer_id() OR is_admin_user());
