# Algorithme d'allocation semi-automatique

## Vue d'ensemble

L'allocation est le coeur metier de RW Pharma. L'objectif est d'automatiser 75% des decisions d'allocation tout en laissant 25% a Julie pour les cas speciaux.

## Pseudo-code de l'algorithme

```
POUR CHAQUE produit ayant du stock ce mois :
  1. Recuperer tous les lots de ce produit (stock collecte)
  2. Recuperer toutes les commandes de ce produit (par client)
  3. Calculer : stock_total vs commande_totale

  SI stock_total >= commande_totale :
    → Satisfaire toutes les commandes
    → Repartir le surplus : top clients d'abord

  SI stock_total < commande_totale :
    → Allocation proportionnelle avec priorite

  POUR CHAQUE lot de ce produit :
    4. Verifier le minimum de lot :
       SI pfht > SEUIL_CHER (a definir, ex: 50 EUR) :
         min_lot = 1
       SINON :
         min_lot = 50 (ou configurable)

    5. SI lot.quantity < min_lot :
         → Marquer comme "stock offert" (ne pas allouer auto)
         → Passer au lot suivant

    6. Trier les clients par priorite :
       a. is_top_client = true en premier
       b. A priorite egale : client qui paie le plus cher
       c. A prix egal : proportionnel a la commande

    7. POUR CHAQUE client (dans l'ordre de priorite) :
       remaining_order = commande_client - deja_alloue_client

       SI remaining_order > 0 ET lot.remaining > 0 :
         allocation = MIN(remaining_order, lot.remaining)

         // Verifier le minimum de lot pour CE client
         SI allocation < min_lot ET lot.remaining == lot.quantity :
           → Ne pas allouer (lot trop petit pour ce client)
           → Passer au client suivant

         CREER allocation(lot, client, allocation, prix_client)
         lot.remaining -= allocation

    8. SI lot.remaining > 0 :
         → Marquer comme "stock offert" ou garder pour allocation manuelle
```

## Parametres configurables

| Parametre | Description | Valeur par defaut |
|---|---|---|
| SEUIL_CHER | PFHT au-dessus duquel un produit est "cher" | 50 EUR |
| MIN_LOT_CHEAP | Minimum d'unites pour un produit peu cher | 50 |
| MIN_LOT_EXPENSIVE | Minimum d'unites pour un produit cher | 1 |
| AUTO_RATIO | Pourcentage d'allocation automatique | 75% |
| MANUAL_RESERVE | Pourcentage reserve pour allocation manuelle | 25% |

## Gestion de la reserve manuelle (25%)

Option A : **Reserve par lot**
- Pour chaque lot, ne pas allouer les derniers 25%
- Julie les alloue manuellement ensuite

Option B : **Reserve par client** (recommande)
- Satisfaire d'abord 75% des commandes de chaque client automatiquement
- Les 25% restants sont alloues manuellement par Julie
- Plus flexible et plus coherent

## Gestion des refus

```
QUAND un client refuse une allocation :
  1. Remettre le lot dans le pool de stock disponible
  2. Recalculer l'allocation pour les autres clients
  3. SI aucun client ne veut le lot :
     → Marquer comme "stock offert" (prix reduit)
  4. Notifier Julie du refus
```

## Metriques de performance

Apres chaque allocation, calculer :
- **Taux de satisfaction** : % de commandes satisfaites par client
- **Taux d'allocation** : % du stock alloue
- **Stock offert** : % du stock non alloue
- **Ecart prix** : difference entre prix commande et prix alloue
- **Temps d'allocation** : duree de l'algo vs duree manuelle (benchmark)
