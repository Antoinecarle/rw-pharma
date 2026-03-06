# Document de Cadrage - RW Pharma

> Source : Notion - Page Documents RW Pharma
> Auteur : Theo Auzas Mota (Alfred Builders)
> Date : Janvier 2026

---

## 1. Synthese du besoin client

### Contexte RW Pharma

RW Pharma est un courtier en medicaments specialise dans l'import parallele en Europe. Julie, la fondatrice, met en contact des grossistes francais avec des importateurs europeens (Allemagne, Danemark, Suede, Norvege) pour profiter des differences de prix des medicaments entre pays.

**Caracteristiques cles :**
- Courtage pur (pas de stock physique)
- ~1760 produits au catalogue
- ~10 clients importateurs
- ~6 grossistes francais
- Expansion prevue : nouveaux entrepots a Reims et Valence

### Problematiques identifiees

- Processus 100% manuel via Excel/Google Sheets
- 48h intenses par allocation mensuelle
- Risques d'erreurs multiples (copier-coller, double saisie)
- Impossibilite de former facilement de nouvelles personnes
- Formats Excel differents selon les clients
- Gestion asynchrone par email source de confusion
- Impossible de scaler sans recruter

---

## 2. Analyse des fichiers de travail

### 2.1 Fichier JANVIER_ORDER_26.xlsx (Commandes debut de mois)

#### Structure principale (feuille 'SALES')
- ~1760 lignes de produits (portefeuille produits RW Pharma)
- ~116 colonnes reparties entre :
  - Donnees produit (CIP13, CIP7, EUNB, nom, labo, PFHT)
  - Quotas par grossiste
  - Commandes par client

#### Feuilles clients (formats heterogenes !)

> Observation cle : Les formats d'import sont tres differents mais tous partagent les donnees essentielles (CIP, Produit, Quantite, Prix).

#### Donnees cles identifiees
- **CIP13** : Code identifiant unique du medicament (pivot de toutes les donnees)
- **CIP7** : Code court (derivable du CIP13)
- **EUNB** : Numero d'autorisation europeenne
- **EXPIRIES** : Dates d'expiration (critique pour l'allocation)
- **Quotas grossistes** : Disponibilites par grossiste francais
- **PFHT** : Prix Fabricant Hors Taxes (prix de reference)

### 2.2 Fichier ALLOC_2_DEC_25.xlsx (Allocation fin de mois)

#### Structure du workflow d'allocation

**ETAPE 1 - SUPPLIERS STOCK** (Stock recu des grossistes)

**ETAPE 2 - TABLEAU CROISE DYNAMIQUE**
- Synthese par numero de lot
- Agregation des quantites par produit/lot/date exp

**ETAPE 3 - CUSTOMERS ALLOCATION**
- ~3100 lignes (1 ligne = 1 lot a allouer)
- Pour chaque lot : allocation manuelle vers les clients
- Colonnes par client : ORI, MPA, MEDCOR, CC, ABA, BMODESTO, AXI, BROCACEF, 2CARE4, MELY
- Chaque client a : quantite allouee + prix negocie

#### Feuilles d'export par client (ex: AXICORP, ORIFARM, MPA...)
Format standardise pour envoi :
- Produit, Date exp, Numero de lot
- Quantites allouees par grossiste source
- Estimation totale, Prix unitaire

---

## 3. Modele de donnees cible

### 3.1 Schema des tables principales

Tables identifiees :
- **products** : Catalogue medicaments (~1760 produits)
- **wholesalers** : Grossistes francais (~6)
- **customers** : Clients importateurs (~10)
- **wholesaler_quotas** : Quotas mensuels par grossiste/produit
- **orders** : Commandes clients mensuelles
- **order_lines** : Lignes de commande (produit, qte, prix)
- **stock_receipts** : Stock recu des grossistes
- **stock_lines** : Detail par lot (produit, lot, date exp, qte)
- **allocations** : Allocation d'un lot vers un client
- **delivery_notes** : Bons de livraison generes

---

## 4. Processus cibles

### 4.1 Process 1 : Collecte des commandes (debut de mois)

```
IMPORT EXCEL -> NORMALISATION AUTO -> CONSOLIDATION -> VALIDATION
```

- Client depose son fichier (format libre)
- IA/Mapping identifie les colonnes et transforme
- Agregation par produit avec vue des quotas disponibles
- Julie valide les commandes et ajuste si necessaire

**Fonctionnalites cles :**
- Import intelligent multi-format (IA pour mapping colonnes)
- Mapping automatique CIP -> Fiche produit
- Alertes sur produits inconnus / prix incoherents
- Vue consolidee commandes vs quotas disponibles
- Interface de modification rapide (ajout/suppression/modification qte)
- Export automatise vers grossistes (format standardise)

### 4.2 Process 2 : Allocation du stock (fin de mois)

```
IMPORT STOCK -> SYNTHESE PAR LOT -> ALLOCATION ASSISTEE -> EXPORT PAR CLIENT
```

- Grossistes envoient les stocks collectes
- Groupement automatique par produit/lot/date exp
- Julie alloue avec suggestions IA (prix, taille lot, preferences)
- Generation automatique des bons de livraison

**Fonctionnalites cles :**
- Import stock collecte (format grossiste)
- Tableau croise automatique par lot
- "VLOOKUP" automatique commandes <-> stock
- Suggestion d'allocation intelligente selon regles metier
- Interface d'ajustement de l'allocation manuelle
- Calcul automatique ecarts (commande vs alloue)
- Export formate par client (PDF ou Excel)

---

## 5. Regles metier identifiees

### 5.1 Regles d'allocation
- Lots minimums selon prix du medicament (medicaments chers = lots plus petits acceptes)
- Preferences clients (top clients prioritaires ex: Orifarm)
- 75% allocation automatique au meilleur prix, 25% manuel pour relations
- Petits lots de produits peu chers souvent refuses (manque de rentabilite)
- Numeros de lot critiques pour tracabilite pharma

### 5.2 Regles de gestion des commandes
- Les commandes evoluent pendant le mois (ajouts, modifications)
- Produits ANSM bloques a l'export (liste a importer automatiquement)
- Quotas laboratoires a respecter par grossiste

---

## 6. Volumetrie & scalabilite

### Donnees actuelles
- ~1760 produits au catalogue
- ~10 clients importateurs
- ~6 grossistes francais
- ~1500 lignes de commandes par mois
- ~3100 lignes d'allocation par mois

### Perspectives de croissance
- Nouveaux entrepots (Reims, Valence) -> +50% volume
- Nouveaux clients potentiels -> x2 sur 2 ans
- Integration WMS/ERP -> multiplication des echanges

---

## 7. Integrations identifiees

### 7.1 Court terme (V1)
- Import/Export Excel (formats clients heterogenes)
- Google Drive (partage fichiers grossistes)
- Liste ANSM (produits bloques a l'export)

### 7.2 Moyen terme (V2+)
- ERP-WMS Reims-Valence (connexion entrepots)
- Business Intelligence / reporting avance
- Portail client complet

---

## 8. Architecture technique recommandee

### Stack hebergee Alfred (CSaaS)
- **Supabase** : Backend / Base de donnees / API
- **Framework JS** : Interface utilisateur custom
- **n8n** : Automatisations
