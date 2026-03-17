-- Migration: manual_attributions
-- Attribution manuelle par client avec historique date pour l'export

-- =============================================
-- Table: manual_attributions (editions manuelles datees)
-- =============================================
CREATE TABLE IF NOT EXISTS manual_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Liens fonctionnels
  monthly_process_id UUID NOT NULL REFERENCES monthly_processes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,

  -- Quantites
  requested_quantity INTEGER NOT NULL DEFAULT 0,
  supplier_quantity INTEGER NOT NULL DEFAULT 0,

  -- Tracabilite temporelle
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_by UUID,
  note TEXT,

  -- Versioning append-only
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_manual_attr_process ON manual_attributions(monthly_process_id);
CREATE INDEX IF NOT EXISTS idx_manual_attr_product_customer ON manual_attributions(product_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_manual_attr_wholesaler ON manual_attributions(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_manual_attr_edited_at ON manual_attributions(edited_at);

-- Un seul enregistrement actif par triplet product/customer/wholesaler par processus
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_attr_unique_active
  ON manual_attributions(monthly_process_id, product_id, customer_id, wholesaler_id)
  WHERE is_active = true;

-- RLS
ALTER TABLE manual_attributions ENABLE ROW LEVEL SECURITY;

-- Admin: acces complet
CREATE POLICY "manual_attr_admin_select" ON manual_attributions
  FOR SELECT USING (is_admin_user());
CREATE POLICY "manual_attr_admin_insert" ON manual_attributions
  FOR INSERT WITH CHECK (is_admin_user());
CREATE POLICY "manual_attr_admin_update" ON manual_attributions
  FOR UPDATE USING (is_admin_user());
CREATE POLICY "manual_attr_admin_delete" ON manual_attributions
  FOR DELETE USING (is_admin_user());

-- Clients portail: lecture seule de leurs propres attributions
CREATE POLICY "manual_attr_customer_select" ON manual_attributions
  FOR SELECT USING (customer_id = get_customer_id());

-- RPC atomique pour upsert (desactiver ancien + inserer nouveau)
CREATE OR REPLACE FUNCTION upsert_manual_attribution(
  p_monthly_process_id UUID,
  p_product_id UUID,
  p_customer_id UUID,
  p_wholesaler_id UUID,
  p_requested_quantity INTEGER,
  p_supplier_quantity INTEGER,
  p_edited_by UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_old_version INTEGER;
  v_new_id UUID;
BEGIN
  -- Desactiver l'ancienne version active (si elle existe)
  UPDATE manual_attributions
  SET is_active = false
  WHERE monthly_process_id = p_monthly_process_id
    AND product_id = p_product_id
    AND customer_id = p_customer_id
    AND wholesaler_id = p_wholesaler_id
    AND is_active = true
  RETURNING version INTO v_old_version;

  -- Inserer la nouvelle version
  INSERT INTO manual_attributions (
    monthly_process_id, product_id, customer_id, wholesaler_id,
    requested_quantity, supplier_quantity,
    edited_by, note,
    version, is_active
  ) VALUES (
    p_monthly_process_id, p_product_id, p_customer_id, p_wholesaler_id,
    p_requested_quantity, p_supplier_quantity,
    p_edited_by, p_note,
    COALESCE(v_old_version, 0) + 1, true
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
