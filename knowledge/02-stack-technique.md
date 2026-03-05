# Stack technique - RW Pharma

## Architecture globale

```
[React SPA] ←→ [Supabase API] ←→ [PostgreSQL]
                    ↑
              [Supabase Auth]
              [Supabase Storage] (fichiers Excel)
              [Supabase Edge Functions] (logique metier)
```

## Supabase
- **PostgreSQL** : Base de donnees principale
- **PostgREST** : API REST automatique depuis le schema
- **Auth** : Authentification email/password (multi-tenant en Phase 5)
- **Storage** : Stockage fichiers Excel uploades + documents clients
- **Edge Functions** (Deno) : Logique metier cote serveur (parsing Excel, algorithme allocation)
- **Row Level Security (RLS)** : Securite au niveau des lignes (critique pour le portail client Phase 5)

## Frontend
- **React 18** : Framework UI
- **Vite** : Build tool (rapide, HMR)
- **TypeScript** : Typage strict
- **Tailwind CSS** : Utility-first CSS
- **shadcn/ui** : Components Radix-based
- **Recharts** : Graphiques (Phase 4 dashboard)
- **AG Grid** ou **TanStack Table** : Grille editable performante (Phase 3)

## Libraries cles
- **SheetJS (xlsx)** : Parsing Excel multi-format (.xlsx, .xls, .csv)
- **jsPDF** : Generation PDF (bons de livraison)
- **Claude API** : Mapping intelligent des colonnes Excel heterogenes (Phase 2)

## Hosting
- **Railway** : Hosting du frontend build (static files)
- Token Railway : `021e9d09-df87-47aa-ad45-f1d84b93feb9`

## Decisions techniques

### Pourquoi Supabase et pas un backend custom ?
- API REST auto depuis le schema (rapide a mettre en place)
- Auth integree (pas de JWT a gerer manuellement)
- Storage integre (pas de S3 a configurer)
- RLS pour le portail client multi-tenant (Phase 5)
- Edge Functions pour la logique complexe
- Temps-reel via subscriptions (futur)

### Pourquoi pas Airtable ?
- Volumetrie trop importante (~3100 lignes d'allocation editables)
- Besoins specifiques (grille d'allocation custom, algo semi-auto)
- Scalabilite pour la croissance prevue (+50% volume)
- Besoin d'une vraie base de donnees structuree

### Pourquoi pas n8n ?
- Annule. Les automatisations seront gerees par :
  - Supabase Edge Functions (logique serveur)
  - Supabase Database Functions/Triggers (evenements DB)
  - Cron jobs simples si necessaire
