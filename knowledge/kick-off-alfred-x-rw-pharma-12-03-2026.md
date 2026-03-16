# Kick-Off — Alfred x RW Pharma

**Date** : 12 mars 2026
**Participants** : Théo (Alfred) + Julie (cliente RW Pharma)
**Objet** : Présentation du prototype de la plateforme, collecte de feedback détaillé, co-construction des parcours fonctionnels
**Type** : Kick Off
**Status** : Prep Note

---

## 1. Introduction & Design System

Théo ouvre le call en expliquant qu'il y a deux sujets préparés : la revue de la maquette et un sujet secondaire à aborder ensuite. Il propose plusieurs types de design system à la cliente (Julie) car RW Pharma n'a pas de charte graphique définie ni de site web — la cliente (Julie) confirme qu'elle communique très peu sur RW Pharma et n'a "rien" en termes de branding. Le choix du design system sera fait après la revue fonctionnelle. En fin de call, la cliente (Julie) indique qu'elle aime bien le design system actuel tel que présenté dans le prototype.

---

## 2. Données de référence

### 2.1 Structure générale

La plateforme présente un premier affichage avec les données de référence "statiques" : produits, grossistes, clients. Les quotas y sont aussi placés, même s'ils ne sont pas vraiment statiques.

### 2.2 Quotas → renommés en "Disponibilités"

**Discussion clé** : Théo pensait que les quotas étaient mis à jour chaque mois, mais la cliente (Julie) explique que c'est plutôt tous les 3 mois, car les quotas dépendent de la part de marché nationale qui est recalculée trimestriellement. Elle ne les upload donc pas tous les mois systématiquement. C'est "assez figé", ça bouge beaucoup moins qu'une commande.

Il y a cependant des exceptions ponctuelles : quand un labo n'a pas atteint son target en fin d'année, il ouvre la disponibilité de certains produits. Exemple donné : un produit à 7 000€ avec un quota de 10 par mois, et soudainement le labo ouvre et on peut en commander 120 ou 220 d'un coup.

**Décision majeure** : Renommer l'onglet "Quotas" en "Disponibilités" (dispo). Raison : il y a aussi des produits sans quota (ex. vaccins) qui sont déplafonnés, et la cliente (Julie) doit pouvoir les inclure dans la même vue. Pour les produits sans quota, on met un indicateur "infini" ou un trait au lieu d'un nombre. Cela permet de voir à la fois les produits à quota et les produits disponibles librement, ce qui est essentiel pour la phase de stock offerts en milieu de mois.

**Fonctionnement retenu pour les dispos** :

- Par défaut, les dispos d'un mois à l'autre se copient automatiquement (reprend le mois précédent sauf update)
- On doit pouvoir importer un fichier, sélectionner pour quel grossiste il est, et pour quel mois
- La mise à jour peut être manuelle ponctuellement, ou par import fichier
- Les quotas/dispos restent dans les données de référence (pas dans l'allocation mensuelle), car la cliente (Julie) ne vient pas forcément les mettre à jour chaque mois

### 2.3 Catalogue Produits

**Fiche produit — ce qu'on garde** :

- CIP 13 (identifiant principal utilisé par la cliente (Julie), rarement CIP 7 — sauf Orifarm qui travaille en CIP 7)
- Nom produit
- Statut ANSM (bloqué/autorisé) — impacte directement l'allocation et les commandes. Si un médicament est bloqué par l'ANSM, il doit remonter comme alerte partout
- Nombre total de références
- Recherche par CIP 13 ou par nom

**Fiche produit — ce qu'on retire** :

- La date d'expiration au niveau produit → n'a de sens qu'au niveau lot
- La partie labo (la cliente (Julie) ne filtre pas par labo, elle travaille par produit)

**Fiche produit — ce qu'on ajoute** :

- Statut "ne se fait plus" / "non existant" pour les produits discontinués → permet de remonter des alertes quand un client commande un produit qui n'existe plus
- Historique des mises à jour (logs) : si le statut ANSM change, pouvoir voir à quelle date ça a été modifié
- Dernière date d'expiration connue (remontée depuis les lots) → utile en début de mois pour décider si on recommande ou pas. Exemple concret donné : un produit Ulio à 50 000€ à courte péremption non vendu le mois précédent à l'export → il faut éviter de le recommander ce mois-ci
- Dernier meilleur prix (le meilleur prix obtenu le mois dernier) → Théo et la cliente (Julie) hésitent sur le placement (fiche produit, stock, ou allocations). À trancher.
- Filtre par date de péremption dans les filtres de recherche

**Import produits** : Capacité d'import Excel qui permet soit d'ajouter de nouveaux produits (CIP non existant), soit de mettre à jour des produits existants (matching par CIP). Notamment pour les prix.

**Recherche produit** : La barre de recherche doit fonctionner sur tout (nom, CIP, dosage "10mg", labo…). La cliente (Julie) confirme qu'elle cherche plutôt par produit, pas par prix ou par labo.

### 2.4 Sujet Prix — À clarifier

Théo souligne qu'il ne sait pas comment la cliente (Julie) structure les prix aujourd'hui. La discussion révèle un mécanisme complexe :

**Côté grossistes** : Les grossistes achètent tous au même prix au labo (prix fabricant). La cliente (Julie) ne négocie pas les prix avec les grossistes — ils lui font confiance pour maximiser les ventes. Si un grossiste a un autre client qui propose un meilleur prix, il retire simplement le produit de l'allocation de la cliente (Julie) sans discussion. La relation est rapide et basée sur la confiance. Les grossistes veulent juste connaître le "max price" que la cliente (Julie) peut obtenir.

**Côté clients** : C'est la cliente (Julie) qui fixe les prix. Elle fait des feedbacks sur les PO (Purchase Orders) des clients : "ici j'ai besoin de 2€ de plus", "là je peux t'en avoir 500 ou 200". Quand un prix baisse (mise à jour mensuelle des prix), un produit qui n'était plus vendable peut le redevenir.

**Export vers grossistes** : Quand la cliente (Julie) exporte les commandes aux grossistes, elle leur communique la quantité à commander ET le meilleur prix client. Ça donne une idée du marché aux grossistes et les aide à calibrer par rapport à leurs autres clients.

**Commissions** :

- Grossistes : commission fixe de 6 000€ HT/mois par grossiste (initialement c'était un %, mais ça devenait déconnant — montait à 15-20k€/mois — donc switch au fixe pour pérenniser la relation)
- Clients : un seul client (MPA) paie une commission basée sur le chiffre d'affaires. C'est MPA qui calcule et indique le montant à facturer. La cliente (Julie) admet ne pas avoir envoyé ces factures à d'autres clients (ex. Brocassette) par manque de temps, ce qui représente une perte de revenus significative.

### 2.5 Grossistes

**Vue simple** : Pas besoin de 200 grossistes, la cliente (Julie) en a environ 8 (SN1, SO, Sagittar, Médiane, Miségène, MAGC, Psylone + Ginkgo qui est "le sien").

**Ce qu'on ajoute** :

- Documents à associer : licences (WDA), GDP (Good Distribution Practice), RIB → aujourd'hui envoyés manuellement quand on ouvre un nouveau grossiste
- Point de contact (anticipation du portail grossiste futur)
- Lien vers le drive si besoin

### 2.6 Clients

**Clients prioritaires** : 3 clients favoris (Orifarm, MPA, Abacus) qui représentent ~70% du chiffre d'affaires. Pas de classement entre eux, juste un statut "prio".

**Points de contact multiples** : Orifarm a 2 contacts, Abacus a 2 contacts, MPA en a 1. Il faut pouvoir gérer plusieurs contacts par client.

**Documents clients** : Comme les grossistes, les clients ont des documents à stocker.

**Accès portail** : Anticipation d'un portail client avec gestion des accès (on/off).

**Grossistes ouverts par client** : Tous les clients ne travaillent pas avec tous les grossistes. Certains petits clients (ex. MedCorp, Axicorp) ne sont ouverts qu'avec certains grossistes. Exemple : Diane et Zégelles ne sont ouverts qu'avec Orifarm, Abacus et Altea. Il faut pouvoir configurer ces liens client ↔ grossiste.

---

## 3. Dashboard

La cliente (Julie) a très fortement réagi sur le concept de tableau de bord. Deux niveaux envisagés :

### 3.1 Tableau de bord du mois en cours (P0)

- Vue de l'avancement des étapes du mois (où j'en suis dans le cycle)
- La cliente (Julie) est en phase avec la proposition
- Elle insiste : "Le mois ça va vite, j'ai beaucoup de tâches, j'oublie où j'en suis". Exemple : elle vient de réaliser qu'elle n'avait pas encore envoyé les factures
- Elle aimerait des indicateurs visuels de progression (type petits ronds/jalons)

### 3.2 Tableau de bord global (P1 — pas dans la première version)

- Vue année en cours ou mois glissants
- Nombre de commandes, volumes, etc.
- Vue de synthèse des commandes des mois précédents sous forme de tableau → point identifié comme manquant : aujourd'hui on ne voit que la commande du mois en cours, pas d'historique
- Prévu au contrat en P1, à construire dans un second temps

---

## 4. Recherche avancée

Recherche "profonde" avec actions rapides / accès rapides. Pas juste un filtre classique mais une recherche transversale (médicament, produit, client, etc.).

---

## 5. Portail client Alfred (hors plateforme RW Pharma)

Théo explique qu'un portail client sera mis en place pour tous les clients Alfred. Ce n'est pas une feature de la plateforme RW Pharma mais un outil externe mis à disposition par Alfred dans le cadre de la relation client. La cliente (Julie) pourra :

- Pousser des questions / signaler des bugs
- Pousser des demandes de fonctionnalités
- Avoir un thread de discussion

Ce portail servira de base pour les points réguliers (mensuels ou bimensuels au début). Alfred observera aussi l'utilisation de la plateforme pour faire du feedback proactif.

---

## 6. Allocations — Le cœur du call

### 6.1 Les grandes étapes du cycle mensuel (co-construites pendant le call)

Théo et la cliente (Julie) ont tracé ensemble la chronologie complète :

**Semaine 1 du mois :**

1. Mise à jour éventuelle des disponibilités (pas systématique)
2. Réception des commandes clients (PO)
3. Allocation des commandes par grossiste (pré-attribution)
4. Export des commandes vers les grossistes

**Semaine 2-3 :**

5. **PHASE NÉGO** (nouvelle étape découverte pendant le call — n'était pas prévue dans le prototype) : feedbacks clients, ajustements de prix, propositions supplémentaires, rendez-vous clients
6. Ré-export grossistes avec ajouts et modifications (avec dates d'ajout sur les lignes)

**Semaine 4 :**

7. Réception des stocks des grossistes (fichiers Excel/CSV)
8. Allocation fine par lot (la grosse allocation)
9. Proposition aux clients (dernier jour du mois au plus tard, vendredi matin)

**Semaine 1 du mois suivant (chevauchement) :**

10. Retours clients (24-48h)
11. Réajustement des stocks (produits refusés reviennent en stock)
12. Premier export des BL aux grossistes pour les produits validés par les clients
13. Réallocation des produits revenus en stock (sans passer par stock offert si une commande existe déjà)
14. Stock offerts (produits restants, fonds de tiroir proposés aux clients)
15. Retour des stock offerts
16. Export des BL d'ajouts aux grossistes
17. Envoi des factures

**Timing actuel vs futur** :

- Aujourd'hui, les allocations prennent entre 24 et 48 heures de travail manuel (Excel, copier-coller, tri)
- Avec l'outil, la cliente (Julie) pense pouvoir tout faire en semaine 1 au lieu de déborder

### 6.2 Import des commandes clients

Chaque client envoie ses commandes dans un format différent :

**Colonnes importantes** : CIP 13 (ou CIP 7 pour Orifarm), quantité, prix unitaire, minimum par lot (batch quantity), commentaires (contiennent souvent les multiples type "nid multiple 4")

**Problèmes de format identifiés** :

- Orifarm envoie en CIP 7 au lieu de CIP 13 → à gérer
- Orifarm envoie aussi un PDF en plus du Excel → préférer le Excel
- Certains mettent des points dans les chiffres (format américain/anglais) → Antoine et Théo ont anticipé un système de mapping de format (américain, anglais, français) pour les prix et quantités
- Les colonnes ne sont pas les mêmes d'un client à l'autre → le mapping est essentiel

**Minimum par lot** : C'est une info du client qui apparaît dans les commandes. Certains clients (ex. Abacus) indiquent "minimum batch quantity" qui s'applique à la phase d'allocation par lot (pas à la première allocation macro).

**Volumétrie** : Environ 500 lignes de commande par mois au total (10 clients × ~30-50 produits chacun). Chaque produit peut être commandé par 2-3 clients différents, donc ~2000-3000 lignes à traiter en incluant la dimension client.

La cliente (Julie) enverra ses fichiers de commandes clients réels pour que l'équipe puisse analyser les colonnes nécessaires.

### 6.3 Revue des commandes & anomalies

Après l'import, une vue de synthèse montre l'ensemble des commandes, le volume par client. On doit détecter des anomalies :

- **Produit inconnu** (CIP non existant dans la base) → permettre de le créer en direct ou de le marquer comme "ne se fait plus"
- **Produit bloqué ANSM** → highlight/alerte
- **Produit discontinué** → alerte

### 6.4 Première allocation (macro — par grossiste)

Vue : une ligne = un produit, agrégation de tous les clients.

**Modes d'auto-attribution proposés** :

- Par grossiste à prioriser (top grossiste)
- Maximum de couverture (couvrir le plus de produits possible)
- Proportionnelle en fonction des quotas

La cliente (Julie) confirme qu'en début de mois, pour l'allocation macro, elle n'a pas besoin du détail par client — elle veut juste voir le total à allouer, tous clients confondus.

**Cas particulier — produits sans quota** : Pour les produits non quotés, la cliente (Julie) priorise au max les grossistes de son associé et d'elle-même (Ginkgo). Exemple : 5 000 Avrix en commande → ~4 000 commandés chez Ginkgo, 200-200-200 distribués aux autres. Elle aimerait pouvoir définir un curseur ou pourcentage d'allocation pour les produits non quotés (ex. "les secondes grossistes ont droit à 15% max des produits non quotés").

### 6.5 Phase négociation & ajustement (NOUVELLE ÉTAPE DÉCOUVERTE)

C'est la principale découverte du call. Entre l'export initial aux grossistes et la réception des stocks, il y a une phase de négociation intense avec les clients.

**Ce qu'il faut** :

- Une vue produit par produit, avec pour chaque produit les différents clients qui l'ont commandé, leurs prix respectifs, et un "best price"
- Possibilité de filtrer par client (pour les meetings) : "Je suis en rendez-vous avec Orifarm, je ne vois que les médicaments d'Orifarm"
- Possibilité de faire des feedbacks/ajustements (modifier les quantités, les prix, ajouter un commentaire)
- Pouvoir cocher/valider produit par produit quand le feedback est fait
- Tous les mois, la cliente (Julie) voit tous les clients (en visio ou face-à-face). Elle fait des feedbacks sur les PO, dit "ici j'ai besoin de 2€ de plus", ou propose des produits supplémentaires

**Sous-étapes de la phase négo** :

1. Vue de toutes les commandes avec possibilité d'ajuster par produit (tous les clients qui commandent le même produit visibles ensemble)
2. Visibilité sur les updates que ça implique au global
3. Vue d'export pour ré-exporter les fichiers mis à jour (avec nouvelle ligne par date d'ajout)
4. La validation se fait ligne par ligne, et un médicament est "validé" quand tous les clients sont traités

**Export ajouts** : Quand la cliente (Julie) ajoute des produits à la commande, elle ne crée pas un nouveau fichier — elle ajoute des lignes dans le fichier initial avec une nouvelle date. Le grossiste voit ainsi les commandes initiales + les ajouts datés.

### 6.6 Collecte des stocks grossistes

Les grossistes envoient leurs fichiers stock (chez eux, pas dans l'entrepôt RW Pharma — les clients collectent directement chez les grossistes).

**Import** : Mapping automatique si le nom du fournisseur est trouvé dans les métadatas du fichier. Sinon, sélection manuelle du grossiste.

**Colonnes stock** : CIP 13, numéro de lot, date d'expiration, quantité. À confirmer s'il y a d'autres colonnes nécessaires.

### 6.7 Allocation fine (par lot) — La vue la plus complexe

C'est la vue que la cliente (Julie) et Théo identifient comme la plus critique et la plus complexe. C'est un problème à 5 dimensions : produit × client × grossiste × lot × quantité, avec en plus pour chaque lot la date d'expiration.

**Vue retenue** : Tableau par médicament, avec :

- En header : les numéros de lot groupés (quand le même lot est chez plusieurs grossistes), avec la quantité totale du lot et la date d'expiration
- En colonnes : les grossistes avec leurs quantités par lot
- En lignes : les clients avec leur demande, leur prix, leur minimum par lot, leur expiration minimum acceptée
- Cellules grisées quand un client ne travaille pas avec un grossiste donné
- Possibilité de splitter un lot entre plusieurs clients (cas très fréquent)

**Vue par numéro de lot** : C'est ce que les clients veulent voir. Quand la cliente (Julie) envoie l'allocation aux clients, ils veulent voir "lot X = 111 pièces" car c'est très courant que le même lot soit chez plusieurs grossistes. La vision par numéro de lot est donc essentielle.

**Simplification** : Théo note que le prototype initial avait trop d'étapes (introduction → simulation → attribution → résultats). Il veut simplifier en une seule vue : lancer l'auto-attribution puis ajuster directement dans le tableau principal. La cliente (Julie) valide : "J'ai juste à valider, je crois."

**Ce qu'il manque dans la vue allocation fine** :

- Prix du client (pas visible actuellement)
- Minimum par lot par client
- Date d'expiration minimum acceptée par client
- Griser les cellules pour les combinaisons client × grossiste non ouvertes

**Confirmation d'expiration par client** : La cliente (Julie) explique qu'avant elle envoyait un "exp confirmation" en début de mois pour demander aux clients s'ils acceptaient telle péremption. Elle ne le fait plus par manque de temps, mais les rejets arrivent quand même. Implication : si on sait en amont qu'un client va refuser une péremption, bloquer l'allocation pour ce client sur ce lot.

### 6.8 Auto-attribution — Règles d'allocation

**Règles identifiées (récapitulatif fait en fin de call)** :

1. **Minimum par lot** : quantité minimum à allouer par lot (ex. Abacus : minimum batch de 1000 sur Eléthysie)
2. **Expiration minimum acceptée** : chaque client a un seuil en-dessous duquel il refusera le produit. Doit bloquer l'allocation si non atteint
3. **Grossistes ouverts** : on n'alloue qu'aux grossistes avec lesquels le client travaille
4. **Prix** : premier différenciateur — on alloue en priorité aux clients qui paient le plus cher
5. **Priorité client** : les 3 clients prio sont traités en premier. Pas de classement entre eux.
6. **Date d'expiration** : favoriser les péremptions les plus longues, mais si un client accepte une courte péremption, lui donner en priorité les lots courts pour garder les lots longs en stock
7. **Multiples de commande** : certains clients exigent des multiples (x3, x4, x6) car ils repaquètent. Ex. Abacus repaque par 4 → quantités 8, 16, 32, 64. Aujourd'hui la cliente (Julie) ne filtre pas toujours, elle envoie et attend le feedback. Indicateur souhaité dans l'outil.
8. **Écart de prix maximum** : la cliente (Julie) mentionne un curseur possible pour définir l'écart de prix max qu'elle tolère entre les clients (ex. si la différence entre 55€ et 55,50€ est acceptable, allouer quand même un peu au client le moins cher)

**Logique de traitement** :

1. D'abord les clients prio → prendre leurs règles, les traiter
2. Ensuite les clients secondaires → avec ce qui reste
3. Entre les clients prio, le prix est le premier différenciateur
4. Si pas de minimum d'expiration bloquant, on alloue

**Approche algorithmique** : Algo d'optimisation type "plus court chemin" (Dijkstra et similaires). Pas d'IA dans un premier temps — un algo déterministe qui prend les paramètres (prio, prix, grossistes ouverts, expiration, minimum par lot, péremption (courte en priorité si acceptée), multiples) et optimise. L'algo va résoudre ~80% des cas. L'IA pourrait intervenir plus tard pour les cas nuancés. Théo a fait une analogie avec l'optimisation aéroportuaire pour expliquer le concept à la cliente (Julie).

### 6.9 Post-allocation : propositions clients et feedback

Après l'allocation, la cliente (Julie) exporte et envoie aux clients. L'export contient : CIP, quantité, prix, numéro de lot, date d'expiration. Les clients valident ou refusent ligne par ligne.

**Gestion des retours client** : Aujourd'hui la cliente (Julie) envoie un Excel, le client commente ligne par ligne (refusé, réduit à X, etc.), et la cliente (Julie) doit retraiter manuellement tous les commentaires. C'est pénible et chronophage.

**Solution idéale (portail client)** : Les clients se connectent sur un espace dédié, valident/refusent en cochant, ajustent les quantités, mettent des commentaires. La cliente (Julie) voit les modifications en direct. Théo précise que c'est la priorité N°1 (plus important que le portail grossiste car les échanges sont beaucoup plus fréquents avec les clients).

**Solution intermédiaire** : En attendant le portail, ajouter une colonne commentaire dans l'export Excel et demander aux clients de ne toucher qu'aux quantités et aux commentaires.

### 6.10 Stock offerts (fonds de tiroir)

Après l'allocation et les retours clients, il reste des lots non attribués.

**Process actuel** :

- Quand ce sont des petits lots → pas proposés, on s'en fiche
- Quand ce sont des lots intéressants → marqués "offert", filtrés, envoyés en Excel aux clients avec le message "je peux ajouter ça à votre palette"
- Les clients peuvent prendre tout ou une partie
- Si un stock offert est confirmé, on le reprend et on l'attribue

**Ordre de traitement** :

1. D'abord réallouer les produits revenus en stock à des clients qui ont déjà une commande (sans passer par le stock offert) → simple réallocation
2. Ensuite proposer en stock offert les produits restants qui n'ont pas de commande correspondante

**Dans l'outil** : Filtrer dans la vue stock les produits non alloués. Possibilité de réallouer directement dans l'allocation, puis de basculer le reste en stock offert.

### 6.11 Export des BL (bons de livraison)

Export final vers les grossistes pour la préparation des commandes. Format : un onglet = un client, avec CIP, quantité, prix, numéro de lot, date d'expiration. Les grossistes reçoivent tout prêt pour préparer.

Il y a aussi des exports d'ajouts (lignes supplémentaires avec date d'ajout).

**Sujet futur mentionné** : La cliente (Julie) aimerait aussi un suivi des enlèvements (camions). Pas prioritaire mais mentionné. Pendant le call, elle a reçu un appel pour gérer la collecte d'un camion BTS entre 14h et 15h — illustration du chaos quotidien.

---

## 7. Facturation

### 7.1 Situation actuelle

- Les grossistes facturent directement les clients, mais comme ils ne sont pas en contact direct, ils déposent leurs factures sur un Google Drive partagé que la cliente (Julie) récupère et transmet
- La cliente (Julie) facture des commissions aux grossistes (6 000€/mois fixe, très simple)
- Pour les clients, la commission est sur CA mais la cliente (Julie) admet ne pas facturer régulièrement (une fois tous les 3 à 6 mois, voire pas du tout pour certains comme Brocassette)
- Elle utilise Indy aujourd'hui pour sa comptabilité/facturation personnelle

### 7.2 Opportunité identifiée

Théo explique que demain, un onglet facturation pourrait être connecté. Si la plateforme a toutes les données de commandes et de CA, les factures de commission pourraient être générées automatiquement → gain de temps et arrêt des pertes de revenus liées à l'oubli de facturation.

### 7.3 Piste comptable

Discussion sur les outils comptables. Théo recommande Douze (12) pour la compta. Il utilise Conto + Pennylane pour Alfred. La cliente (Julie) envisage de changer de comptable (son comptable actuel est "une vieille de la vieille" qui fonctionne par email). Théo mentionne que Pennylane pourrait être intéressant (banque + compta) et que Douze est très bien aussi (~100€/mois pour un suivi avec contact dédié).

---

## 8. Enjeux business & contexte

### 8.1 Volumétrie et enjeux financiers

- La cliente (Julie) gère entre 10 et 12 millions d'euros de commandes par mois
- Les erreurs d'achat peuvent coûter 200 000€ à 500 000€ d'invendus
- Un oubli de filtre sur un copier-coller la semaine précédente a causé l'envoi de 10 unités au lieu de 80 en préparation

### 8.2 Impossibilité de recruter sans l'outil

La cliente (Julie) explique qu'elle ne peut pas recruter quelqu'un pour l'aider à faire ce travail car :

- Le risque d'erreur est monumental (erreurs d'achat, erreurs d'allocation)
- La formation serait extrêmement longue et complexe
- Elle ne veut pas donner cette responsabilité à un salarié

L'outil automatise et fiabilise → permet ensuite de recruter quelqu'un qui valide des pré-attributions plutôt que de tout faire à la main. La personne recrutée gérerait plutôt la relation client/grossiste (le côté humain que l'outil ne peut pas remplacer).

### 8.3 Valeur de la plateforme sur mesure

La cliente (Julie) confirme : "Si tu ne le fais pas sur mesure, c'est impossible. Il n'y a pas d'outil du marché qui peut gérer ça." La combinaison des dimensions (produit × client × grossiste × lot × expiration × prix × règles client) rend tout ERP standard inadapté.

---

## 9. Décisions prises & modifications à faire

### 9.1 Données de référence

- [ ] Renommer "Quotas" → "Disponibilités" (dispo)
- [ ] Pour les produits sans quota → indicateur "infini" / déplafonné
- [ ] Par défaut, copier les dispos du mois précédent sauf update
- [ ] Import fichier dispo : sélectionner grossiste + mois
- [ ] Retirer la date d'expiration du niveau produit
- [ ] Retirer le filtre par labo
- [ ] Ajouter statut ANSM (bloqué/autorisé) avec impact sur l'allocation
- [ ] Ajouter statut produit "ne se fait plus" / "non existant"
- [ ] Ajouter historique des mises à jour (logs) sur la fiche produit
- [ ] Ajouter dernière date d'expiration connue
- [ ] Ajouter dernier meilleur prix (placement à définir)
- [ ] Ajouter filtre par date de péremption dans la recherche produit
- [ ] Documents à associer aux grossistes : WDA, GDP, RIB
- [ ] Contacts multiples par client
- [ ] Lien client ↔ grossistes ouverts (configurable)

### 9.2 Allocations

- [ ] Ajouter la phase "Négociation et ajustement des commandes" dans le workflow
- [ ] Vue négo : par produit avec tous les clients qui commandent, prix, best price, filtre par client
- [ ] Commentaires et validation produit par produit dans la phase négo
- [ ] Export ajouts avec dates sur les lignes
- [ ] Allocation fine : header avec lots groupés (numéro de lot + quantité totale + date d'expiration)
- [ ] Allocation fine : afficher prix client, minimum par lot, expiration minimum sur les lignes client
- [ ] Allocation fine : griser les cellules client × grossiste non ouverts
- [ ] Allocation fine : possibilité de splitter un lot entre plusieurs clients
- [ ] Simplifier les étapes d'allocation fine (supprimer intro/simulation/résultats séparés → une seule vue)
- [ ] Vue historique des commandes des mois passés (tableau de synthèse)
- [ ] Indicateur de multiple de commande (x3, x4, x6)
- [ ] Gestion du mapping de format (US/UK/FR) pour les imports

### 9.3 Algorithme d'allocation

- [ ] Implémenter les règles : prio client, prix, grossistes ouverts, expiration minimum, minimum par lot, péremption (courte en priorité si acceptée), multiples
- [ ] Bloquer automatiquement si minimum par lot non atteint
- [ ] Bloquer si péremption rejetée par le client
- [ ] Curseur d'écart de prix max toléré
- [ ] Curseur de % max de produits non quotés pour les grossistes secondaires

### 9.4 Futur / à planifier

- [ ] Portail client (priorité N°1 après le core) → validation en direct, commentaires, plus d'allers-retours Excel
- [ ] Portail grossiste (priorité moindre)
- [ ] Onglet facturation (connecté aux données de commandes pour automatiser les factures de commission)
- [ ] Suivi des enlèvements (camions)
- [ ] Relances automatiques factures impayées

---

## 10. Prochaines étapes

- Alfred avance sur les modifications cette semaine
- Planifier 1 à 2 rituels de suivi dans les semaines qui suivent
- La cliente (Julie) enverra ses fichiers de commandes clients réels pour analyse des colonnes
- La cliente (Julie) : "Super, j'ai hâte de l'utiliser"
