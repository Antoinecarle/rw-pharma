# Exemple Process Mensuel - Janvier 2026

> Source : Notion "Processs détaillé" — https://alfred-builders.notion.site/Processs-d-taill-2fb1d95b2f8a805fa7dfe448a5a64ab0

Ce document illustre le fonctionnement complet du systeme sur un mois, de la commande a l'allocation.

---

## Contexte du mois

Julie ouvre le mois de Janvier 2026. Elle va :

1. Recevoir les commandes des importateurs europeens
2. Les consolider et verifier les quotas disponibles
3. Envoyer les commandes aux grossistes francais
4. Recevoir le stock collecte avec les numeros de lots
5. Allouer le stock aux clients
6. Generer les bons de livraison

---

# Donnees de reference (permanentes)

## PRODUITS

| CIP13 | CIP7 | EUNB | nom_produit | fabricant | PFHT |
|---|---|---|---|---|---|
| 3400930087367 | 3008736 | EU/1/17/1205/001 | OLUMIANT 2MG CPR BT28 | LILLY | 830 |
| 3400930040072 | 3004007 | EU/1/14/944/012 | ABASAGLAR 100U/ML STY BT5 | LILLY FRANCE | 28.58 |

## GROSSISTES

| id | nom | contact | lien_gdrive |
|---|---|---|---|
| 1 | EPSILON | epsilon@contact.fr | /drive/epsilon |
| 2 | GINK'GO | ginkgo@contact.fr | /drive/ginkgo |
| 3 | SNA | sna@contact.fr | /drive/sna |
| 4 | SO | so@contact.fr | /drive/so |

## CLIENTS

| id | nom | pays | format_import | min_lot |
|---|---|---|---|---|
| 1 | ORIFARM | Danemark | External, Itemname, Quantity, Unitprice | 500 |
| 2 | MPA | Allemagne | LocalCode/EMA, Product, Quantity, Price | 300 |
| 3 | AXICORP | Allemagne | CIPcode, Product, Price, POqnt | 400 |
| 4 | MEDCOR | Pays-Bas | ProductNumber, Name, Qty, Price | 200 |

---

# Etape 1 : Ouverture du mois (2 janvier)

## MOIS

| id | mois_annee | statut | date_ouverture | date_cloture |
|---|---|---|---|---|
| 1 | 2026-01 | **Commandes** | 2026-01-02 | - |

## QUOTAS_MENSUELS

| id | produit_cip13 | grossiste_id | mois_id | quota_disponible | utilise |
|---|---|---|---|---|---|
| 1 | 3400930040072 (ABASAGLAR) | 1 (EPSILON) | 1 | 250 | 0 |
| 2 | 3400930040072 (ABASAGLAR) | 2 (GINK'GO) | 1 | 100 | 0 |
| 3 | 3400930040072 (ABASAGLAR) | 3 (SNA) | 1 | 150 | 0 |
| 4 | 3400930040072 (ABASAGLAR) | 4 (SO) | 1 | 300 | 0 |
| 5 | 3400930087367 (OLUMIANT) | 3 (SNA) | 1 | 15 | 0 |

> **Total quota ABASAGLAR disponible : 800 unites**

---

# Etape 2 : Import des commandes clients (3-5 janvier)

Julie recoit 4 fichiers Excel avec des formats differents :

### Fichier ORIFARM (format: External, Itemname, Quantity, Unitprice)

```
3004007 | MP:Abasaglar Kwikpen:100:U/ml:5x3ml | 1500 | 34
```

### Fichier MPA (format: LocalCode/EMA, Product, Quantity, Price)

```
3400930040072 | Abasaglar 100U/ML | 500 | 33
```

### Fichier AXICORP (format: CIPcode, Product, Price, POqnt)

```
3400930040072 | ABASAGLAR 100U/ML STY BT5 | 34 | 50
3400930087367 | OLUMIANT 2MG CPR BT28 | 830 | 5
```

### Fichier MEDCOR (format: ProductNumber, Name, Qty, Price)

```
3400930040072 | ABASAGLAR INJVLST 100E/ML PEN 3ML 5ST | 500 | 30,00
```

## COMMANDES_CLIENTS (apres import et normalisation)

| id | mois_id | client_id | produit_cip13 | qte_dem | prix_neg | statut | commentaire |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 (ORIFARM) | 3400930040072 | 1500 | 34 | Importe | High price |
| 2 | 1 | 2 (MPA) | 3400930040072 | 500 | 33 | Importe | - |
| 3 | 1 | 3 (AXICORP) | 3400930040072 | 50 | 34 | Importe | confirmed |
| 4 | 1 | 4 (MEDCOR) | 3400930040072 | 500 | 30 | Importe | - |
| 5 | 1 | 3 (AXICORP) | 3400930087367 | 5 | 830 | Importe | confirmed |

> **Total commande ABASAGLAR : 2 550 unites**
> **Total quota disponible : 800 unites**
> **Ecart : -1 750 unites (on ne pourra pas tout servir)**

---

# Etape 3 : Export vers grossistes (6 janvier)

Julie genere les fichiers de commande par grossiste :

- **Export EPSILON (quota: 250)** — ABASAGLAR : 250 unites
- **Export GINK'GO (quota: 100)** — ABASAGLAR : 100 unites
- **Export SNA (quota: 150 + 15)** — ABASAGLAR : 150 unites, OLUMIANT : 15 unites
- **Export SO (quota: 300)** — ABASAGLAR : 300 unites

## MOIS (changement de statut)

| id | mois_annee | statut | date_ouverture | date_cloture |
|---|---|---|---|---|
| 1 | 2026-01 | **Collecte** | 2026-01-02 | - |

---

# Etape 4 : Reception du stock (25-27 janvier)

Les grossistes envoient ce qu'ils ont reussi a collecter :

### Fichier stock EPSILON
```
ABASAGLAR | D800305N | 09/2026 | 224
```

### Fichier stock GINK'GO
```
ABASAGLAR | D787612N | 08/2026 | 46
ABASAGLAR | D763187G | 03/2026 | 13
```

### Fichier stock SNA
```
ABASAGLAR | D787612N | 08/2026 | 15
OLUMIANT | D891135 | 08/2026 | 8
```

### Fichier stock SO
```
ABASAGLAR | D800305N | 09/2026 | 203
```

## LOTS (crees automatiquement a l'import)

| id | produit_cip13 | numero_lot | date_expiration | date_fabrication | origine |
|---|---|---|---|---|---|
| 1 | 3400930040072 | D787612N | 2026-08-01 | 2025-02-01 | France |
| 2 | 3400930040072 | D800305N | 2026-09-01 | 2025-03-01 | France |
| 3 | 3400930040072 | D763187G | 2026-03-01 | 2024-09-01 | France |
| 4 | 3400930087367 | D891135 | 2026-08-27 | 2025-02-27 | Irlande |

## STOCK_COLLECTE

| id | lot_id | grossiste_id | mois_id | quantite | date_reception |
|---|---|---|---|---|---|
| 1 | 2 (D800305N) | 1 (EPSILON) | 1 | 224 | 2026-01-25 |
| 2 | 1 (D787612N) | 2 (GINK'GO) | 1 | 46 | 2026-01-25 |
| 3 | 3 (D763187G) | 2 (GINK'GO) | 1 | 13 | 2026-01-25 |
| 4 | 1 (D787612N) | 3 (SNA) | 1 | 15 | 2026-01-26 |
| 5 | 4 (D891135) | 3 (SNA) | 1 | 8 | 2026-01-27 |
| 6 | 2 (D800305N) | 4 (SO) | 1 | 203 | 2026-01-26 |

### Synthese par lot

| Lot | Exp | Grossistes | Total |
|---|---|---|---|
| D800305N | 09/2026 | EPSILON (224) + SO (203) | **427** |
| D787612N | 08/2026 | GINK'GO (46) + SNA (15) | **61** |
| D763187G | 03/2026 | GINK'GO (13) | **13** |
| D891135 | 08/2026 | SNA (8) | **8** |

> **Total stock ABASAGLAR : 501 unites** (vs 800 quota, vs 2550 commande)

## MOIS (changement de statut)

| id | mois_annee | statut | date_ouverture | date_cloture |
|---|---|---|---|---|
| 1 | 2026-01 | **Allocation** | 2026-01-02 | - |

---

# Etape 5 : Allocation par Julie (28 janvier)

## Vue consolidee (ce que voit Julie)

| Lot | Produit | Exp | Stock total | Grossistes | A allouer |
|---|---|---|---|---|---|
| D800305N | ABASAGLAR | 09/2026 | 427 | EPSILON (224), SO (203) | 427 |
| D787612N | ABASAGLAR | 08/2026 | 61 | GINK'GO (46), SNA (15) | 61 |
| D763187G | ABASAGLAR | 03/2026 | 13 | GINK'GO (13) | 13 |
| D891135 | OLUMIANT | 08/2026 | 8 | SNA (8) | 5 |

### Regles d'allocation appliquees

- FIFO sur dates d'expiration
- Priorite aux gros clients (ORIFARM)
- Respect du min_lot_acceptable par client
- Refus lots exp < 6 mois si client refuse

## ALLOCATIONS

| id | stock_id | commande_id | qte_allouee | prix | statut | date |
|---|---|---|---|---|---|---|
| 1 | 1 (D800305N/EPSILON) | 1 (ORIFARM) | 200 | 34 | Confirme | 2026-01-28 |
| 2 | 6 (D800305N/SO) | 1 (ORIFARM) | 152 | 34 | Confirme | 2026-01-28 |
| 3 | 4 (D787612N/SNA) | 2 (MPA) | 15 | 33 | Confirme | 2026-01-28 |
| 4 | 2 (D787612N/GINK'GO) | 2 (MPA) | 46 | 33 | Confirme | 2026-01-28 |
| 5 | 3 (D763187G/GINK'GO) | 2 (MPA) | 13 | 33 | **Refuse** | 2026-01-28 |
| 6 | 1 (D800305N/EPSILON) | 3 (AXICORP) | 24 | 34 | Confirme | 2026-01-28 |
| 7 | 6 (D800305N/SO) | 3 (AXICORP) | 26 | 34 | Confirme | 2026-01-28 |
| 8 | 6 (D800305N/SO) | 4 (MEDCOR) | 25 | 30 | Confirme | 2026-01-28 |
| 9 | 5 (D891135/SNA) | 5 (AXICORP) | 5 | 830 | Confirme | 2026-01-28 |

> **Allocation #5 refusee** : Lot D763187G expire en mars 2026 (trop proche pour MPA)

## COMMANDES_CLIENTS (statuts mis a jour)

| id | client_id | produit_cip13 | demande | alloue | statut |
|---|---|---|---|---|---|
| 1 | ORIFARM | ABASAGLAR | 1500 | **352** | Partiellement alloue |
| 2 | MPA | ABASAGLAR | 500 | **61** | Partiellement alloue |
| 3 | AXICORP | ABASAGLAR | 50 | **50** | Alloue |
| 4 | MEDCOR | ABASAGLAR | 500 | **25** | Partiellement alloue |
| 5 | AXICORP | OLUMIANT | 5 | **5** | Alloue |

---

# Etape 6 : Export bons de livraison (29 janvier)

Julie genere les exports par client avec tracabilite complete :

## Bon de livraison ORIFARM (Danemark)

| Produit | Lot | Exp | Grossiste | Qte | Prix | Total |
|---|---|---|---|---|---|---|
| ABASAGLAR 100U/ML | D800305N | 09/2026 | SO | 152 | 34 | 5 168 |
| ABASAGLAR 100U/ML | D800305N | 09/2026 | EPSILON | 200 | 34 | 6 800 |
| **TOTAL** | | | | **352** | | **11 968** |

> Commande: 1500 - Alloue: 352 - **Taux: 23%**

## Bon de livraison MPA (Allemagne)

| Produit | Lot | Exp | Grossiste | Qte | Prix | Total |
|---|---|---|---|---|---|---|
| ABASAGLAR 100U/ML | D787612N | 08/2026 | GINK'GO | 46 | 33 | 1 518 |
| ABASAGLAR 100U/ML | D787612N | 08/2026 | SNA | 15 | 33 | 495 |
| **TOTAL** | | | | **61** | | **2 013** |

> Commande: 500 - Alloue: 61 - **Taux: 12%**

## Bon de livraison AXICORP (Allemagne)

| Produit | Lot | Exp | Grossiste | Qte | Prix | Total |
|---|---|---|---|---|---|---|
| ABASAGLAR 100U/ML | D800305N | 09/2026 | SO | 26 | 34 | 884 |
| ABASAGLAR 100U/ML | D800305N | 09/2026 | EPSILON | 24 | 34 | 816 |
| OLUMIANT 2MG | D891135 | 08/2026 | SNA | 5 | 830 | 4 150 |
| **TOTAL** | | | | **55** | | **5 850** |

> ABASAGLAR: 50/50 = **100%** | OLUMIANT: 5/5 = **100%**

## Bon de livraison MEDCOR (Pays-Bas)

| Produit | Lot | Exp | Grossiste | Qte | Prix | Total |
|---|---|---|---|---|---|---|
| ABASAGLAR 100U/ML | D800305N | 09/2026 | SO | 25 | 30 | 750 |
| **TOTAL** | | | | **25** | | **750** |

> Commande: 500 - Alloue: 25 - **Taux: 5%**

---

# Etape 7 : Cloture du mois (31 janvier)

## MOIS (statut final)

| id | mois_annee | statut | date_ouverture | date_cloture |
|---|---|---|---|---|
| 1 | 2026-01 | **Cloture** | 2026-01-02 | 2026-01-31 |

---

# Synthese Janvier 2026

## Par client

| Client | Produit | Commande | Alloue | Taux | Valeur |
|---|---|---|---|---|---|
| MPA | ABASAGLAR | 500 | 61 | 12% | 2 013 |
| AXICORP | OLUMIANT | 5 | 5 | 100% | 4 150 |
| ORIFARM | ABASAGLAR | 1 500 | 352 | 23% | 11 968 |
| AXICORP | ABASAGLAR | 50 | 50 | 100% | 1 700 |
| MEDCOR | ABASAGLAR | 500 | 25 | 5% | 750 |
| **TOTAL** | | **2 555** | **493** | **19%** | **20 581** |

## Par lot (tracabilite)

| Lot | Produit | Exp | Stock | Alloue | Reste | Clients |
|---|---|---|---|---|---|---|
| D787612N | ABASAGLAR | 08/2026 | 61 | 61 | 0 | MPA |
| D891135 | OLUMIANT | 08/2026 | 8 | 5 | 3 | AXICORP |
| D800305N | ABASAGLAR | 09/2026 | 427 | 427 | 0 | ORIFARM, AXICORP, MEDCOR |
| D763187G | ABASAGLAR | 03/2026 | 13 | 0 | **13** | Refuse (exp proche) |

---

# Chaine de tracabilite complete

```
ABASAGLAR (CIP13: 3400930040072)
|
+-- Lot D800305N (exp 09/2026) -- 100% alloue
|   |
|   +-- Stock EPSILON : 224 unites
|   |   +-- -> ORIFARM : 200 unites @ 34 = 6 800
|   |   +-- -> AXICORP : 24 unites @ 34 = 816
|   |
|   +-- Stock SO : 203 unites
|       +-- -> ORIFARM : 152 unites @ 34 = 5 168
|       +-- -> AXICORP : 26 unites @ 34 = 884
|       +-- -> MEDCOR : 25 unites @ 30 = 750
|
+-- Lot D787612N (exp 08/2026) -- 100% alloue
|   |
|   +-- Stock SNA : 15 unites
|   |   +-- -> MPA : 15 unites @ 33 = 495
|   |
|   +-- Stock GINK'GO : 46 unites
|       +-- -> MPA : 46 unites @ 33 = 1 518
|
+-- Lot D763187G (exp 03/2026) -- INVENDU
    |
    +-- Stock GINK'GO : 13 unites
        +-- -> REFUSE (expiration trop proche)


OLUMIANT (CIP13: 3400930087367)
|
+-- Lot D891135 (exp 08/2026)
    |
    +-- Stock SNA : 8 unites
        +-- -> AXICORP : 5 unites @ 830 = 4 150
            (reste 3 unites en stock)
```
