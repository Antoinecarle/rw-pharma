# Schema de donnees pharmaceutique - Phase 1

## Tables de reference

### products (catalogue ~1760 produits)
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cip13 VARCHAR(13) UNIQUE NOT NULL,  -- Code identifiant unique medicament
  cip7 VARCHAR(7),                     -- Code court (7 derniers chiffres CIP13)
  name VARCHAR(500) NOT NULL,          -- Nom du produit
  eunb VARCHAR(50),                    -- Numero autorisation europeenne
  pfht NUMERIC(12,4),                  -- Prix Fabricant Hors Taxes
  laboratory VARCHAR(255),             -- Laboratoire fabricant
  is_ansm_blocked BOOLEAN DEFAULT false, -- Produit interdit a l'export
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### wholesalers (grossistes francais)
```sql
CREATE TABLE wholesalers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,         -- Ex: Alliance, CERP, OCP
  code VARCHAR(20) UNIQUE,            -- Code court
  contact_email VARCHAR(255),
  drive_folder_url VARCHAR(500),      -- URL Google Drive partage
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### wholesaler_quotas (quotas par produit par mois)
```sql
CREATE TABLE wholesaler_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  month DATE NOT NULL,                -- Premier jour du mois
  quota_quantity INTEGER NOT NULL,    -- Quantite max allouee par le labo
  extra_available INTEGER DEFAULT 0,  -- Quantite supplementaire possible
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wholesaler_id, product_id, month)
);
```

### customers (clients importateurs ~10)
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,          -- Ex: Orifarm, MPA, Axicorp
  code VARCHAR(20) UNIQUE,             -- Code court (ORI, MPA, AXI...)
  country VARCHAR(5),                  -- DE, DK, SE, NO
  contact_email VARCHAR(255),
  is_top_client BOOLEAN DEFAULT false, -- Client prioritaire
  allocation_preferences JSONB DEFAULT '{}', -- Regles specifiques
  excel_column_mapping JSONB DEFAULT '{}',   -- Mapping memorise pour import
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Clients importateurs connus

| Code | Nom | Pays | Top client |
|---|---|---|---|
| ORI | Orifarm | DK | Oui |
| MPA | MPA | DE | - |
| MEDCOR | Medcor | - | - |
| CC | CC Pharma | DE | - |
| ABA | Abacus | - | - |
| BMODESTO | B. Modesto | - | - |
| AXI | Axicorp | DE | - |
| BROCACEF | Brocacef | NL | - |
| 2CARE4 | 2care4 | DK | - |
| MELY | Mely | - | - |

## Relations entre les tables

```
products ←→ wholesaler_quotas ←→ wholesalers
products ←→ order_lines ←→ customers (Phase 2)
products ←→ collected_stock ←→ wholesalers (Phase 3)
collected_stock ←→ allocations ←→ customers (Phase 3)
```

## Notes d'implementation
- Le CIP13 est le pivot central de toutes les donnees
- Le CIP7 = les 7 derniers chiffres du CIP13 (peut etre calcule)
- Le PFHT est le prix de reference pour detecter les incoherences
- Les quotas sont imposes par les laboratoires et changent chaque mois
- Un grossiste peut parfois livrer plus que le quota si disponibilite supplementaire
