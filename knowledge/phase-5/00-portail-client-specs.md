# Portail Client - Specifications (Phase 5)

## Vue d'ensemble
Le portail client est une interface dediee pour les importateurs europeens. Objectif : supprimer 90% des echanges email/WhatsApp/appels.

## Architecture multi-tenant

### Auth Supabase
- Chaque client importateur a un compte utilisateur dans Supabase Auth
- Role "customer" distinct du role "admin" (Julie)
- Row Level Security (RLS) : un client ne voit que ses propres donnees

### Policies RLS
```sql
-- Un client ne voit que ses commandes
CREATE POLICY customer_orders ON order_lines
  FOR SELECT USING (customer_id = auth.uid());

-- Un client ne voit que ses allocations
CREATE POLICY customer_allocations ON allocations
  FOR SELECT USING (customer_id = auth.uid());

-- Un client peut confirmer/refuser ses allocations
CREATE POLICY customer_allocation_update ON allocations
  FOR UPDATE USING (customer_id = auth.uid())
  WITH CHECK (status IN ('confirmed', 'refused'));
```

## Fonctionnalites du portail

### 1. Depot de commandes
- Le client uploade directement son fichier Excel
- Le mapping est applique automatiquement (memorise)
- Preview et validation avant soumission
- Historique des fichiers deposes

### 2. Suivi des commandes
- Voir les lignes de commande du mois en cours
- Statut de chaque ligne (en attente, validee, rejetee)
- Modifier les quantites/prix (si le mois n'est pas cloture)

### 3. Review des allocations
- Voir les lots alloues avec details (quantite, prix, date exp, n° lot)
- Confirmer : accepter l'allocation
- Refuser : avec motif optionnel
- Vue d'ensemble : taux de satisfaction de sa commande

### 4. Stock offert
- Marketplace de produits non alloues
- Prix reduit par rapport au prix normal
- Premier arrive, premier servi
- Panier + confirmation
- Notifications push quand du stock est disponible

### 5. Documents
- Telecharger ses exports (Excel, PDF)
- Uploader ses documents reglementaires (WDA, GDP)
- Voir l'historique de ses mois precedents

## IA Allocation - Apprentissage

### Donnees d'apprentissage
Apres 3-6 mois de fonctionnement, on dispose de :
- Historique des allocations acceptees par client/produit
- Historique des refus avec motifs
- Preferences implicites (produits, prix, tailles de lot)
- Patterns saisonniers

### Approche avec Claude API
```
Prompt systeme :
"Tu es un assistant d'allocation pharmaceutique. Voici l'historique des 6 derniers mois pour le client {name}:
- Produits acceptes : [...]
- Produits refuses : [...]
- Prix moyen accepte : X EUR
- Taille lot minimum acceptee : Y unites
- Preferences : [...]

Stock disponible ce mois : [...]
Commande du client : [...]

Propose une allocation optimale."
```

### Metriques de succes de l'IA
- Taux d'acceptation des propositions IA vs taux actuel
- Reduction du temps d'allocation manuelle
- Objectif : passer de 75% auto a 90%+ auto

## Budget impact
- P1 : ~70k EUR sur 24 mois
- Le portail supprime 90% des emails (gain temps majeur)
- Permet l'acquisition de nouveaux clients sans charge supplementaire
- Expansion Belgique possible sans recruter
