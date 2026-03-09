### Sommaire.

---

---

# :camera-alfred: Témoignages clients

> 🎥 Plus de cas d’usage ici → [https://www.alfred.builders/usecase](https://www.alfred.builders/usecase)

# :potion-alfred: Méthodologie.

![](https://prod-files-secure.s3.us-west-2.amazonaws.com/2adc5933-e1ea-40af-98c4-16357de5311a/d24edc8c-23db-44ac-b2a1-cac7855ed957/Deck_simple_-_Alfred_%282%29.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466ZPVZ5IOC%2F20260309%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260309T110123Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEGMaCXVzLXdlc3QtMiJHMEUCIG%2BOYSdJYA9fs%2Fl%2F45l5Cz3IPxyArtJ4Lh6HokwRQLkFAiEAvgE2qIXF%2FEjhdLm%2Fl77%2BkkzGTJ8Ad4pc3UVCW%2FBosRAq%2FwMILBAAGgw2Mzc0MjMxODM4MDUiDPpT%2FXJQztJFsgV5xircA7Wj%2FccEJanaB55FehPHWBxffmEfb8kKtpNBvzr84CvNbu4VqD240HLmNxBB9DkQsBhBoW8Tl%2Bb3%2F5D8sehhcIRelZ3AB7Re%2B5O2sGMa7vSlNyCkh7Ew910QdlRBOGjW2sScXvAuKtr6TbKBWXtEPaf6Ci5yeKqxbcmNe5JKwNxYetTptKqCpmaXAOlr6WR2dvkazyyJtJY5XTCEdJgYWEzYp3FqQsnMSi4BN7390rFChvlZjeFQfcqZ6r0guo69D5Uxq4gajRhxnxUb4%2BR8UHOMikDl6ZiUkNAjqSlmTE7fwix%2BNoHnZaStq8VP6r2Xk3JCKjx4raB2nwpuhoiV36iohgthMX8axD8%2F6FTCTPRqe1N3f6u%2BkD3a4IzeaXrSSE764DlyhHTR1UfsXCPHb03q22NfowVjLBL1Gn5ae5CZM9kPHf3cbWnhtvTYE5Ulzk6a1TzOEGfaBy%2FFBrcT1ef%2BfnsDIiGO8UhGtAtQ3Jlgq5KDUCd1TJzq7kWhSij3Y6oQFgL1xQDRyurSQQiEKmR0NCtO4Rwn%2BpYuDeia8sT0TQ6lphUl59%2Bs6xnOB8IyQzV%2FOs%2F5Xp9r6pCsg%2FCtXv%2FS62nK2yb9ZY2HJCJ0hZ202OlQZiFtjJjn0BFwMKLOus0GOqUBpk3OadGBD20BCg%2FMjEQgXEnParxDZavMp8QYiWjv9Zke3oOwul%2Foliyn0zRMCH1SrwNoSgA34LySUn72OMR6fTdZqW%2FDL2EH8AAiAmZg3T3vlJ2jt3jjQS8rjEz2YViBxzxPSFicBvGaxmG6jip4G79L9presTDuUE8aQ%2BRooOD8qFQ%2Fz0aqgh%2Fc3qzdjLcCuCQW0Q1l1sYOBlqigNRS77rSDeBv&X-Amz-Signature=de75f7d8b9e1f35ad7df90b8abb7089ee99cd7d6787864ce5a2c9caa05ce6189&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

# :users-alfred: Interlocuteurs projet.

# 1. Synthèse du besoin client

## Contexte RW Pharma

**RW Pharma** est un courtier en médicaments spécialisé dans l'import parallèle en Europe. Julie, la fondatrice, met en contact des grossistes français avec des importateurs européens (Allemagne, Danemark, Suède, Norvège) pour profiter des différences de prix des médicaments entre pays.

> ℹ️ **Caractéristiques clés :**

## Problématiques identifiées

# 2. Analyse des fichiers de travail

> 📁 

## 2.1 Fichier JANVIER_ORDER_26.xlsx (Commandes début de mois)

### Structure principale (feuille ‘SALES’)

- **~1760 lignes de produits** (portefeuille produits RW Pharma)
- **~116 colonnes** réparties entre :
### Feuilles clients (formats hétérogènes !)

> 💡 **Observation clé** : Les formats d'import sont très différents mais tous partagent les données essentielles (CIP, Produit, Quantité, Prix).

### Données clés identifiées

- **CIP13** : Code identifiant unique du médicament (pivot de toutes les données)
- **CIP7** : Code court (dérivable du CIP13)
- **EUNB** : Numéro d'autorisation européenne
- **EXPIRIES** : Dates d'expiration (critique pour l'allocation)
- **Quotas grossistes** : Disponibilités par grossiste français
- **PFHT** : Prix Fabricant Hors Taxes (prix de référence)
## 2.2 Fichier ALLOC_2_DEC_25.xlsx (Allocation fin de mois)

### Structure du workflow d'allocation

**ÉTAPE 1 - SUPPLIERS STOCK** (Stock reçu des grossistes)

**ÉTAPE 2 - TABLEAU CROISÉ DYNAMIQUE**

- Synthèse par numéro de lot
- Agrégation des quantités par produit/lot/date exp
**ÉTAPE 3 - CUSTOMERS ALLOCATION**

- **~3100 lignes** (1 ligne = 1 lot à allouer)
- Pour chaque lot : allocation manuelle vers les clients
- Colonnes par client : ORI, MPA, MEDCOR, CC, ABA, BMODESTO, AXI, BROCACEF, 2CARE4, MELY
- Chaque client a : quantité allouée + prix négocié
### Feuilles d'export par client (ex: AXICORP, ORIFARM, MPA...)

Format standardisé pour envoi :

- Produit, Date exp, Numéro de lot
- Quantités allouées par grossiste source
- Estimation totale, Prix unitaire
# 3. Modèle de données cible

## 3.1 Schéma des tables principales

![](https://prod-files-secure.s3.us-west-2.amazonaws.com/2adc5933-e1ea-40af-98c4-16357de5311a/b0593a41-f80f-45a5-974d-1413f722c12d/12d007ab-e5fa-4c6d-8dab-dbeada32c4b1.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466ZPVZ5IOC%2F20260309%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260309T110124Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEGMaCXVzLXdlc3QtMiJHMEUCIG%2BOYSdJYA9fs%2Fl%2F45l5Cz3IPxyArtJ4Lh6HokwRQLkFAiEAvgE2qIXF%2FEjhdLm%2Fl77%2BkkzGTJ8Ad4pc3UVCW%2FBosRAq%2FwMILBAAGgw2Mzc0MjMxODM4MDUiDPpT%2FXJQztJFsgV5xircA7Wj%2FccEJanaB55FehPHWBxffmEfb8kKtpNBvzr84CvNbu4VqD240HLmNxBB9DkQsBhBoW8Tl%2Bb3%2F5D8sehhcIRelZ3AB7Re%2B5O2sGMa7vSlNyCkh7Ew910QdlRBOGjW2sScXvAuKtr6TbKBWXtEPaf6Ci5yeKqxbcmNe5JKwNxYetTptKqCpmaXAOlr6WR2dvkazyyJtJY5XTCEdJgYWEzYp3FqQsnMSi4BN7390rFChvlZjeFQfcqZ6r0guo69D5Uxq4gajRhxnxUb4%2BR8UHOMikDl6ZiUkNAjqSlmTE7fwix%2BNoHnZaStq8VP6r2Xk3JCKjx4raB2nwpuhoiV36iohgthMX8axD8%2F6FTCTPRqe1N3f6u%2BkD3a4IzeaXrSSE764DlyhHTR1UfsXCPHb03q22NfowVjLBL1Gn5ae5CZM9kPHf3cbWnhtvTYE5Ulzk6a1TzOEGfaBy%2FFBrcT1ef%2BfnsDIiGO8UhGtAtQ3Jlgq5KDUCd1TJzq7kWhSij3Y6oQFgL1xQDRyurSQQiEKmR0NCtO4Rwn%2BpYuDeia8sT0TQ6lphUl59%2Bs6xnOB8IyQzV%2FOs%2F5Xp9r6pCsg%2FCtXv%2FS62nK2yb9ZY2HJCJ0hZ202OlQZiFtjJjn0BFwMKLOus0GOqUBpk3OadGBD20BCg%2FMjEQgXEnParxDZavMp8QYiWjv9Zke3oOwul%2Foliyn0zRMCH1SrwNoSgA34LySUn72OMR6fTdZqW%2FDL2EH8AAiAmZg3T3vlJ2jt3jjQS8rjEz2YViBxzxPSFicBvGaxmG6jip4G79L9presTDuUE8aQ%2BRooOD8qFQ%2Fz0aqgh%2Fc3qzdjLcCuCQW0Q1l1sYOBlqigNRS77rSDeBv&X-Amz-Signature=0becfc1c44a23d8a18ef8cc7a8827483a3c5c617525e98e41b3557550a0f7d90&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

## 3.2 Exemple du processus sur un mois

**[Child Page: Processs détaillé]**

# 4. Processus cibles

## 4.1 Process 1 : Collecte des commandes (début de mois)

```javascript
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   IMPORT     │───▶│ NORMALISATION│───▶│ CONSOLIDATION│───▶│  VALIDATION  │
│   EXCEL      │    │   AUTO       │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
     │                    │                    │                    │
     ▼                    ▼                    ▼                    ▼
  Client dépose      IA/Mapping          Agrégation par      Julie valide
  son fichier        identifie les       produit avec        les commandes
  (format libre)     colonnes et         vue des quotas      et ajuste
                     transforme          disponibles         si nécessaire
```

**Fonctionnalités clés :**

- Import intelligent multi-format (IA pour mapping colonnes)
- Mapping automatique CIP → Fiche produit
- Alertes sur produits inconnus / prix incohérents
- Vue consolidée commandes vs quotas disponibles
- Interface de modification rapide (ajout/suppression/modification qté)
- Export automatisé vers grossistes (format standardisé)
## 4.2 Process 2 : Allocation du stock (fin de mois)

```javascript
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   IMPORT     │───▶│  SYNTHÈSE    │───▶│ ALLOCATION   │───▶│   EXPORT     │
│   STOCK      │    │  PAR LOT     │    │  ASSISTÉE    │    │  PAR CLIENT  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
     │                    │                    │                    │
     ▼                    ▼                    ▼                    ▼
  Grossistes         Groupement           Julie alloue        Génération
  envoient les       automatique          avec suggestions    automatique
  stocks collectés   par produit/lot      IA (prix, taille    des bons de
                     /date exp            lot, préférences)   livraison
```

**Fonctionnalités clés :**

- Import stock collecté (format grossiste)
- Tableau croisé automatique par lot
- “VLOOKUP” automatique commandes ↔ stock
- Suggestion d'allocation intelligente selon règles métier :
- Interface d’ajustement de l’allocation manuelle
- Calcul automatique écarts (commandé vs alloué)
- Export formaté par client (PDF ou Excel)
# 5. Règles métier identifiées

## 5.1 Règles d'allocation

## 5.2 Règles de gestion des commandes

# 6. Volumétrie & scalabilité

## Données actuelles

## Perspectives de croissance

- Nouveaux entrepôts (Reims, Valence) → +50% volume
- Nouveaux clients potentiels → x2 sur 2 ans
- Intégration WMS/ERP → multiplication des échanges
# 7. Intégrations identifiées

## 7.1 Court terme (V1)

## 7.2 Moyen terme (V2+)

# 8. Architecture technique recommandée

## Stack hébergée Alfred (CSaaS)

**Stack technique :**

- **Supabase** : Backend / Base de données / API
- Framework JS : Interface utilisateur custom
- **n8n** : Automatisations
> 💡 **Pourquoi cette stack pour RW Pharma :**

> 🟢 **Avantages :**

# 9. Découpage fonctionnel (priorisation) & Démo

**[Child Database: Découpage fonctionnel]**

## `Démo maquettes`

# 10. Proposition commerciale

## Modèle CSaaS hébergé Alfred

>  **`Abonnement tout inclus`**

---

## Offre P0 - Fondamentaux (choisie)

> 📦 **Setup : 6 900€**

**Inclus :**

- Référentiel produits, clients, grossistes
- Gestion des mois (workflow ouverture/clôture)
- Import commandes multi-format (mapping IA)
- Consolidation commandes vs quotas
- Export vers grossistes
- Import stock collecté avec validation lots
- Tableau d'allocation manuel
- Export bons de livraison
## Offre P0+P1 - Version complète

> 🚀 **Setup : 7 900€**

**Tout le P0 +**

- **Portail client** : les importateurs saisissent et confirment directement leurs commandes/allocations
- **Portail grossiste** : réception stock automatisée, fin de la ressaisie
- **Allocation IA** : 75% des allocations automatisées selon vos règles métier
- **Alertes & notifications** : relances automatiques, alertes quotas, expirations
- **Reporting & historique** : tableaux de bord, analyses en 1 clic
## Calcul de ROI

### Situation actuelle

- **48 heures intenses** lors des allocations mensuelles (pics de charge)
- ~70h/mois total sur le process (import, consolidation, allocation, exports)
- Process manuel impossible à transmettre → **nécessiterait une embauche pour scaler**
- Pics de stress en fin de mois qui limitent la capacité à prendre de nouveaux clients
- Communication fragmentée : mails, WhatsApp, appels avec clients et grossistes
### L'alternative classique : embaucher

- Profil : Assistant(e) / Gestionnaire opérationnel
- Coût chargé : **~3 500 - 4 000€/mois**
- Coûts cachés : recrutement (~3-5k€), formation (2-3 mois improductifs), management, turnover
- Résultat : une nouvelle personne-clé, même dépendance qu'aujourd'hui
### Comparatif global

## Bénéfices clés

### 📈 Absorber plus de clients

- Capacité de scale **illimitée** sans embauche
- Avec P0+P1 : doubler voire tripler le volume sans stress
- Nouveaux entrepôts (Reims, Valence) intégrables facilement
### ⏰ Lisser la charge mensuelle

- Fin des "48h intenses" en fin de mois
- P0+P1 : **les clients et grossistes font le travail eux-mêmes** via les portails
- Julie se concentre sur les décisions stratégiques et la relation commerciale
### 🔮 Préparer le moyen terme

- Process documenté et transmissible
- Base solide pour intégrations futures (WMS, ERP)
- Données structurées = pilotage par la donnée
- **Valorisation de l'entreprise** : process industrialisé = plus attractive

> 💡 **Notre recommandation : P0+P1**

# 11. Questions ouvertes

## Questions métier

1. **Règles d'allocation** : Peut-on formaliser précisément les critères de priorité d'allocation ? (poids de chaque critère)
1. **Gestion des modifications** : Comment sont gérées les modifications de commandes en cours de mois ? Historisation nécessaire ?
1. **Produits interdits** : La feuille "INTERDIT" correspond à quoi exactement ? Gestion nécessaire dans l'outil ?
1. **Nouveaux clients** : Quel est le process d'onboarding d'un nouveau client ? Son format d'import est-il imposé ou s'adapte-t-on ?
1. **Refus de lots** : Quand un client refuse un lot, que devient-il ? Réallocation automatique ?
## Questions techniques

1. **Dépôt fichier grossistes** : Peut-on imaginer une interface de dépôt des fichiers ?
1. **Format export grossistes** : Y a-t-il un format imposé pour les commandes envoyées aux grossistes ?
1. **Numéros de lot** : Les numéros de lot sont-ils connus à l'avance ou uniquement à réception du stock ?
## Questions projet

1. **Timeline** : Y a-t-il une date cible de mise en production ?
1. **Budget** : Fourchette budgétaire mensuel envisagée ?
# 12. Annexes

## A. Mapping formats clients identifiés

## B. Liste des grossistes français

- EPSILON
- GINK'GO
- DELTA
- SO
- SNA
- MEZEGEL
- MEDIANE
- SAGITTA
- MHGC
## C. Liste des clients (importateurs)

- ORIFARM (Danemark)
- MPA
- MEDCOR
- CC PHARMA
- ABACUS
- BMODESTO
- AXICORP
- BROCACEF
- 2CARE4
- MELY / MELYFARM
- INPHARM
- BNS
- SIGMA
- IMED