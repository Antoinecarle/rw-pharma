# MCP Gemini Design - MANDATORY UNIQUE WORKFLOW

## ABSOLUTE RULE

You NEVER write frontend/UI code yourself. Gemini is your frontend developer.

---

## AVAILABLE TOOLS

### `generate_vibes`
Generates a visual page with 5 differently styled sections. The user opens the page, sees all 5 vibes, and picks their favorite. The code from the chosen vibe becomes the design-system.md.

### `create_frontend`
Creates a NEW complete file (page, component, section).

### `modify_frontend`
Makes ONE design modification to existing code. Returns a FIND/REPLACE block to apply.

### `snippet_frontend`
Generates a code snippet to INSERT into an existing file. For adding elements without rewriting the entire file.

---

## WORKFLOW (NO ALTERNATIVES)

### STEP 1: Check for design-system.md

BEFORE any frontend call → check if `design-system.md` exists at project root.

### STEP 2A: If design-system.md DOES NOT EXIST

1. Call `generate_vibes` with projectDescription, projectType, techStack
2. Receive the code for a page with 5 visual sections
3. Ask: "You don't have a design system. Can I create vibes-selection.tsx so you can visually choose your style?"
4. If yes → Write the page to the file
5. User chooses: "vibe 3" or "the 5th one"
6. Extract THE ENTIRE CODE between `<!-- VIBE_X_START -->` and `<!-- VIBE_X_END -->`
7. Save it to `design-system.md`
8. Ask: "Delete vibes-selection.tsx?"
9. Continue normally

### STEP 2B: If design-system.md EXISTS

Read it and use its content for frontend calls.

### STEP 3: Frontend Calls

For EVERY call (create_frontend, modify_frontend, snippet_frontend), you MUST pass:

- `designSystem`: Copy-paste the ENTIRE content of design-system.md (all the code, not a summary)
- `context`: Functional/business context WITH ALL REAL DATA. Include:
  - What it does, features, requirements
  - ALL real text/labels to display (status labels, button text, titles...)
  - ALL real data values (prices, stats, numbers...)
  - Enum values and their exact meaning
  - Any business-specific information

**WHY**: Gemini will use placeholders `[Title]`, `[Price]` for missing info. If you don't provide real data, you'll get placeholders or worse - fake data.

---

## FORBIDDEN

- Writing frontend without Gemini
- Skipping the vibes workflow when design-system.md is missing
- Extracting "rules" instead of THE ENTIRE code
- Manually creating design-system.md
- Passing design/styling info in `context` (that goes in `designSystem`)
- Summarizing the design system instead of copy-pasting it entirely
- Calling Gemini without providing real data (labels, stats, prices, etc.) → leads to fake info

## EXPECTED

- Check for design-system.md BEFORE anything
- Follow the complete vibes workflow if missing
- Pass the FULL design-system.md content in `designSystem`
- Pass functional context in `context` (purpose, features, requirements)

## EXCEPTIONS (you can code these yourself)

- Text-only changes
- JS logic without UI
- Non-visual bug fixes
- Data wiring (useQuery, etc.)

# RW Pharma - Phase 1 : Setup & Donnees de reference

## Contexte projet
RW Pharma est un courtier en medicaments specialise dans l'import parallele en Europe. Julie (fondatrice) met en contact des grossistes francais avec des importateurs europeens (Allemagne, Danemark, Suede, Norvege) pour profiter des differences de prix des medicaments.

**Probleme** : Processus 100% manuel via Excel/Google Sheets. 48h intenses par allocation mensuelle. Impossible de scaler sans recruter.

**Solution** : Outil sur-mesure pour automatiser la collecte des commandes et l'allocation des stocks.

## Stack technique
- **Supabase** : Backend / DB PostgreSQL / API REST auto / Auth / Storage / Edge Functions
- **React 18 + Vite** : Frontend SPA
- **TypeScript** : Typage strict
- **Tailwind CSS + shadcn/ui** : Design system
- **Railway** : Hosting

## Objectif de cette phase
Poser les fondations techniques et creer les CRUD des donnees de reference.

## Taches

### 1. Setup Supabase
- Creer le projet Supabase (ou utiliser le MCP Supabase)
- Configurer l'authentification (email/password)
- Definir les Row Level Security (RLS) policies
- Configurer le Storage pour les fichiers Excel

### 2. Schema de donnees pharmaceutique

```sql
-- Table produits (catalogue ~1760 produits)
products:
  - id (uuid, PK)
  - cip13 (varchar, UNIQUE, NOT NULL) -- Code identifiant unique medicament
  - cip7 (varchar) -- Code court (derivable du CIP13)
  - name (varchar, NOT NULL) -- Nom du produit
  - eunb (varchar) -- Numero autorisation europeenne
  - pfht (numeric) -- Prix Fabricant Hors Taxes
  - laboratory (varchar) -- Laboratoire fabricant
  - expiry_dates (jsonb) -- Dates d'expiration connues
  - is_ansm_blocked (boolean, default false) -- Produit interdit a l'export
  - metadata (jsonb)
  - created_at, updated_at (timestamptz)

-- Table grossistes francais
wholesalers:
  - id (uuid, PK)
  - name (varchar, NOT NULL) -- Ex: Alliance, CERP, OCP
  - code (varchar, UNIQUE) -- Code court
  - contact_email (varchar)
  - drive_folder_url (varchar) -- URL Google Drive pour partage
  - metadata (jsonb)
  - created_at, updated_at (timestamptz)

-- Table quotas grossistes (par produit par mois)
wholesaler_quotas:
  - id (uuid, PK)
  - wholesaler_id (FK -> wholesalers)
  - product_id (FK -> products)
  - month (date) -- Premier jour du mois
  - quota_quantity (integer) -- Quantite maximale allouee par le labo
  - extra_available (integer, default 0) -- Quantite supplementaire possible
  - metadata (jsonb)
  - created_at (timestamptz)

-- Table clients importateurs (~10 clients)
customers:
  - id (uuid, PK)
  - name (varchar, NOT NULL) -- Ex: Orifarm, MPA, Axicorp, Medcor
  - code (varchar, UNIQUE) -- Code court (ORI, MPA, AXI...)
  - country (varchar) -- DE, DK, SE, NO
  - contact_email (varchar)
  - is_top_client (boolean, default false) -- Client prioritaire
  - allocation_preferences (jsonb) -- Regles specifiques
  - excel_column_mapping (jsonb) -- Mapping memorise pour import
  - documents (jsonb) -- WDA, GDP Certificate paths
  - metadata (jsonb)
  - created_at, updated_at (timestamptz)
```

### 3. CRUD Produits
- Liste paginee avec recherche par CIP13, nom, labo
- Formulaire creation/edition
- Import bulk depuis Excel (catalogue initial)
- Indicateur produit bloque ANSM
- Filtre par laboratoire

### 4. CRUD Grossistes
- Liste des grossistes francais
- Gestion des quotas mensuels par produit
- Lien vers Google Drive de partage

### 5. CRUD Clients importateurs
- Liste des clients avec pays, code
- Configuration preferences d'allocation par client
- Stockage mapping Excel memorise
- Documents reglementaires (WDA, GDP)

### 6. Import initial catalogue
- Parser le fichier JANVIER_ORDER_26.xlsx (feuille SALES)
- Extraire les ~1760 lignes de produits
- Mapper CIP13, CIP7, EUNB, PFHT, laboratoire
- Inserer en bulk dans Supabase

## Donnees de reference

### Clients importateurs connus
| Code | Nom | Pays |
|---|---|---|
| ORI | Orifarm | DK |
| MPA | MPA | DE |
| MEDCOR | Medcor | - |
| CC | CC Pharma | DE |
| ABA | Abacus | - |
| BMODESTO | B. Modesto | - |
| AXI | Axicorp | DE |
| BROCACEF | Brocacef | NL |
| 2CARE4 | 2care4 | DK |
| MELY | Mely | - |

### Donnees produit cles
- **CIP13** : Code a 13 chiffres, pivot de toutes les donnees
- **CIP7** : 7 derniers chiffres du CIP13
- **EUNB** : Numero d'autorisation europeenne
- **PFHT** : Prix Fabricant Hors Taxes (reference de prix)
- **Expiry** : Dates d'expiration (critique pour allocation)

## Dependances
- Aucune (phase fondatrice)

## Criteres de completion
- [ ] Projet Supabase fonctionnel avec auth
- [ ] Schema DB cree avec toutes les tables
- [ ] RLS configuree
- [ ] Frontend React/Vite connecte a Supabase
- [ ] CRUD Produits fonctionnel
- [ ] CRUD Grossistes fonctionnel
- [ ] CRUD Clients fonctionnel
- [ ] Catalogue initial importe (~1760 produits)
