# Analyse MVP - Pre-Kickoff — Compte rendu du 10 mars 2026

> Source : [Notion - Analyse MVP Pre-Kickoff](https://www.notion.so/alfred-builders/Analyse-MVP-Pre-Kickoff-31f1d95b2f8a8058b714cb677ca68fc5)
> Auteur : Theo Auzas Mota
> Date : 10 mars 2026

---

## `Dashboard`

- Pas utile en tant que tel et pas discute dans les ateliers, il faudra le revoir completement. C'est un point qui sera aborde avec Julie jeudi 12 mars lors du kick-off. Il faut le rendre bien plus operationnel :
  - Statut du mois en cours (existant)
  - Evolution du nombre de commandes
  - Evolution du volume d'affaires, du chiffre d'affaires, de la marge brute
  - Acces rapide (existant)

---

## `Allocation`

### Phase 1 — Commandes

#### 1 - Quotas
- Lors du mapping : 4/5 champs ? Quel champs est manquant → C'est pas tres clair ici, on dirait une erreur mais potentiellement pas un champs obligatoire. Il faut clarifier l'UX ici : 2 champs obligatoires (CIP13, Quantite quota, prix? → a confirmer avec Julie)

#### 2 - Commandes
- Je ne suis pas sur que le champs prix unitaire fasse parti des commandes, c'est Julie qui l'attribue, a confirmer en Kick-off
- Meme sujet ici sur l'UX de la barre de progression, je ne suis pas sur qu'elle soit tres claire (3/8 champs, combien sont obligatoires et manquants ? etc)

#### 3 - Revue
- Discuter des anomalies avec Julie, doc obligatoire ?
- Ajouter possibilite de cliquer / filtrer un client pour afficher que ses commandes
- Les barres de progression du volume par client ont deux fois la legende du nom du client, en garder qu'une

#### Nouvelle etape (manquante aujourd'hui)
- Pouvoir faire une premiere attribution macro qui match les commandes aux quotas de grossiste. Exemple :
  - Doliprane, deux clients differents en souhaitent respectivement 200 et 400
  - 2 grossistes en proposent respectivement 300 et 500
  - On doit pouvoir lancer une attribution commandes <> Quota pour permettre ensuite de faire les bons exports
  - Visualisation proposee :
    - Une navigation par client en haut
    - Une liste a gauche des medicaments du / des clients selectionnes
    - Une liste a droite des quotas dispo
    - Avoir une UX permettant de modifier la pre-attribution

#### 4 - Export
- Top rien a dire

---

### Phase 2 — Collecte & Allocation

#### 1 - Stock
- Meme sujet ici sur l'UX de la barre de progression, je ne suis pas sur qu'elle soit tres claire (3/8 champs, combien sont obligatoires et manquants ? etc)

#### 2 - Agregation
- Rien a dire

#### 3 - Allocation
- On peut simplifier l'attribution en reutilisant la logique de l'attribution macro de la Phase 1 :
  - Doliprane, deux clients differents en souhaitent respectivement 200 et 400
  - On a des lots chez 2 grossistes differents :
    - Grossiste 1
      - Lot 1 : 30
      - Lot 2 : 300
    - Grossiste 2
      - Lot 3 : 200
      - Lot 4 : 200 - Date d'expiration a -10 mois
  - On doit pouvoir lancer une attribution commandes <> lot pour permettre ensuite de faire les bons exports
  - Visualisation proposee :
    - Une navigation par client en haut
    - Une liste a gauche des medicaments du / des clients selectionnes
    - Une liste a droite des Grossistes et lots dispos
    - Avoir une UX permettant de modifier la pre-attribution
  - Exemple d'attribution :
    - Client 1 : Commande = 200
      - Lot 3 → 200
    - Client 2 : Commande = 400
      - Lot 2 = 300
      - Lot 1 = 30 → alerte petit lot
      - Lot 4 = 70 → alerte date d'expiration

---

### Phase 3 — Livraison et cloture

#### Revue Allocations
- Les graphiques par grossiste et par client sont bizarres :
  - Par client : meme quand on est a 100% la barre de progression n'est pas forcement a fond car c'est fonction de la quantite, hors ici on est sur une vue de completion (revue)
  - Les couleurs devraient etre fonction du niveau de completion et pas aleatoires
  - Je ne sais pas a quel point le graph par grossiste est pertinent — a discuter avec Julie
- Le tableau : attention, pour une meme commande (une ligne) on pourrait avoir plusieurs lots du coup

#### Final
- Ok on verra plus tard ici

#### Stock Order → Nouvelle phase au besoin (a discuter avec Julie)
- Avoir une vue de tous les lots non-attribues pour les exporter et les proposer aux clients pour les ajouter ensuite aux commandes / Bons de livraison
- Logique a confirmer avec Julie avant de faire des modifs

---

## `Stock`

- A afficher par mois, les stocks sont variables d'un mois a l'autre
- A discuter avec Julie de l'utilite de cette page

---

## `Metriques`

- De meme a afficher par mois (selection du mois)
- Devrait potentiellement etre inclus dans les "allocations" directement avec une section dashboard dans un mois d'allocation

---

## `Dettes`

- On peut laisser mais je ne pense pas que ce soit utile
- Je me demande si l'IA n'a pas confondu avec ce qu'on appelle la feature de "Stock Order" qui correspond a l'export de tous les lots non attribues qui sont ensuite re-proposes aux clients en plus de leur commande

---

## Resume des points a confirmer avec Julie (Kick-off 12 mars)

| # | Sujet | Section |
|---|---|---|
| 1 | Dashboard : le rendre operationnel (KPIs, evolution CA/marge) | Dashboard |
| 2 | Champs obligatoires mapping quotas (CIP13, qty, prix ?) | Phase 1 - Quotas |
| 3 | Prix unitaire dans commandes : attribue par Julie ou par client ? | Phase 1 - Commandes |
| 4 | UX barres de progression : clarifier champs obligatoires vs optionnels | Phase 1 - Commandes / Phase 2 - Stock |
| 5 | Anomalies revue : doc obligatoire ? | Phase 1 - Revue |
| 6 | Nouvelle etape attribution macro commandes <> quotas | Phase 1 - Nouvelle etape |
| 7 | Pertinence du graph par grossiste en revue alloc | Phase 3 - Revue Alloc |
| 8 | Stock Order : nouvelle phase ou integration dans Phase 3 ? | Phase 3 - Stock Order |
| 9 | Utilite de la page Stock standalone | Stock |
| 10 | Metriques : page separee ou integre dans allocation ? | Metriques |
| 11 | Utilite de la page Dettes vs feature Stock Order | Dettes |
