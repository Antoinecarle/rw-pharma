# Contexte : Allocation des stocks (fin de mois)

## Processus actuel detaille

### Etape par etape
1. **Reception stock** : Les grossistes francais envoient les stocks collectes (ce qu'ils ont reussi a rassembler ce mois-ci)
2. **Copier-coller** : Julie copie le stock brut dans un fichier maitre
3. **Tableau croise dynamique** : Elle cree un tableau croise pour synthetiser par numero de lot
4. **Agregation** : Groupement des quantites par produit/lot/date d'expiration
5. **VLOOKUP** : Elle recupere les commandes mensuelles en face de chaque produit
6. **Allocation manuelle** : Pour chaque lot, elle decide a quel(s) client(s) l'allouer
7. **Criteres** : Taille du lot, prix du produit, preferences clients, relations commerciales
8. **Export** : Elle cree une feuille par client avec ses allocations

### Fichier de reference : ALLOC_2_DEC_25.xlsx

**ETAPE 1 - SUPPLIERS STOCK** : Stock brut recu des grossistes

**ETAPE 2 - TABLEAU CROISE DYNAMIQUE** :
- Synthese par numero de lot
- Agregation des quantites par produit/lot/date exp

**ETAPE 3 - CUSTOMERS ALLOCATION** :
- ~3100 lignes (1 ligne = 1 lot a allouer)
- Pour chaque lot : allocation manuelle vers les clients
- Colonnes par client : ORI, MPA, MEDCOR, CC, ABA, BMODESTO, AXI, BROCACEF, 2CARE4, MELY
- Chaque client a : quantite allouee + prix negocie

**Feuilles d'export par client (AXICORP, ORIFARM, MPA...)** :
Format standardise pour envoi :
- Produit, Date exp, Numero de lot
- Quantites allouees par grossiste source
- Estimation totale, Prix unitaire

## Regles d'allocation detaillees

### Allocation automatique (75%)

**Regle 1 : Priorite top clients**
- Les clients marques `is_top_client` (ex: Orifarm) sont servis en premier
- Ils recoivent leurs commandes en priorite si le stock est suffisant

**Regle 2 : Meilleur prix**
- A priorite egale, le client qui paie le plus cher est servi en premier
- Cela maximise le revenu de RW Pharma

**Regle 3 : Minimums de lots**
- Medicaments chers (PFHT > seuil a definir) : lots de 1-2 unites acceptables
- Medicaments peu chers (PFHT < seuil) : minimum ~50 unites par lot
- Les petits lots de produits peu chers sont souvent refuses → ne pas les allouer automatiquement

**Regle 4 : Proportionnalite**
- Si stock < commande totale : allouer proportionnellement aux commandes
- Exemple : Client A commande 100, Client B commande 200, stock = 150
  → Client A recoit 50, Client B recoit 100

**Regle 5 : Equilibre historique**
- Tenir compte des allocations des mois precedents
- Eviter de toujours favoriser le meme client

### Reserve manuelle (25%)
- Julie garde environ 25% du stock pour allocation manuelle
- Motifs : relations clients, negociations en cours, nouveaux clients, produits rares
- Cette part diminuera avec l'IA (Phase 5)

### Gestion des refus
1. Un client peut refuser un lot apres allocation
2. Motifs courants : lot trop petit, prix trop eleve, date exp trop courte
3. Le lot refuse est remis dans le pool de stock disponible
4. Proposition automatique de reallocation a un autre client
5. Si personne ne veut : "stock offert" a prix reduit

## Importance des numeros de lot
- **Tracabilite pharmaceutique** : Chaque lot est identifie de facon unique
- **Rappels de lots** : En cas de probleme qualite, on doit pouvoir tracer qui a recu quel lot
- **Obligation reglementaire** : La pharma impose un suivi strict des lots
- → Le numero de lot est une donnee critique, jamais optionnelle
