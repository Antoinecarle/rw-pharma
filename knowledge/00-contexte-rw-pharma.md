# Contexte RW Pharma - Resume complet

## L'entreprise
RW Pharma est un courtier en medicaments specialise dans l'import parallele en Europe. Julie, la fondatrice, met en contact des grossistes francais avec des importateurs europeens (Allemagne, Danemark, Suede, Norvege) pour profiter des differences de prix des medicaments entre pays.

### Caracteristiques cles
- **Courtage pur** : pas de stock physique, les clients collectent directement chez les grossistes francais
- **Localisation** : Basee pres de Lyon (Macon), en expansion avec ouverture d'entrepots a Reims et Valence
- **Equipe** : Julie (fondatrice) + Clement (associe, co-decideur)
- **Processus actuel** : 100% manuel via Excel/Google Sheets
- **Pain point** : 48 heures intenses lors des allocations mensuelles

## Les 2 processus principaux

### Process 1 : Collecte des commandes (debut de mois)
1. Les clients importateurs envoient leurs commandes par Excel (formats tous differents)
2. Julie consolide manuellement (copier-coller, VLOOKUP)
3. Elle alloue les commandes aux grossistes selon les quotas
4. Elle exporte les commandes par grossiste via Google Drive

### Process 2 : Allocation du stock (fin de mois)
1. Les grossistes envoient le stock collecte
2. Julie cree un tableau croise dynamique par lot
3. Elle fait des VLOOKUP pour croiser commandes et stock
4. Elle alloue manuellement chaque lot aux clients
5. Elle exporte les allocations par client

## Donnees cles
- **CIP13** : Code identifiant unique du medicament (13 chiffres) — pivot de toutes les donnees
- **CIP7** : Code court (7 derniers chiffres du CIP13)
- **EUNB** : Numero d'autorisation europeenne
- **PFHT** : Prix Fabricant Hors Taxes
- **Numero de lot** : Critique en pharma pour la tracabilite et les rappels

## Volumetrie
- ~1760 produits dans le catalogue
- ~1500 lignes de commandes par mois
- ~3100 lignes d'allocation par mois
- ~10 clients importateurs
- Plusieurs grossistes francais

## Problematiques identifiees
- Processus tres manuel avec risques d'erreurs multiples
- Impossibilite de former facilement de nouvelles personnes
- Beaucoup de temps perdu en mise en page et copier-coller
- Double saisie source d'erreurs
- Formats Excel differents selon les clients
- Gestion asynchrone par email source de confusion
- Frein a l'acquisition de nouveaux clients par manque de temps

## Perspectives de croissance
- Nouveaux entrepots (Reims, Valence) → +50% volume
- Nouveaux clients potentiels → x2 sur 2 ans
- Integration WMS/ERP → multiplication des echanges
- Expansion Belgique possible
