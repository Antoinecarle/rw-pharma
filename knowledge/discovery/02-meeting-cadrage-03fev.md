# Meeting Cadrage - Alfred x RW Pharma (2nd call)

> Date : 3 fevrier 2026
> Type : Reunion de cadrage
> Titre : Developpement outil de courtage pharmaceutique
> Participants : Theo (Alfred), Julie (RW Pharma)
> Source : Notion transcription

---

## Contexte du projet

- Julie gere une activite de courtage de medicaments entre grossistes et importateurs
- Processus actuellement gere manuellement via Excel, entrainant une charge de travail intense (48 heures intenses lors des allocations mensuelles)
- Objectif : developper un outil sur-mesure pour automatiser et optimiser les processus d'allocation

---

## Regles metier et allocation

- **Criteres d'allocation** : definir les minimums de lots acceptables en fonction du prix des medicaments (les medicaments chers peuvent avoir des lots plus petits car meilleure rentabilite)
- **Preferences clients** : possibilite d'integrer des regles specifiques par client (ex: privilegier les top clients comme Orifarm)
- **Allocation semi-automatique** : garder environ 75% d'allocation automatique au meilleur prix, le reste gere manuellement pour entretenir les relations clients
- **Approche equilibree** : automatiser ce qui est recurrent, garder le manuel pour les cas specifiques peu frequents

---

## Flux de donnees et processus

- **Donnees de reference** : produits, grossistes, clients, importateurs (donnees stables)
- **Flux mensuel** : collecte commandes -> consolidation -> allocation -> export
- **Volumetrie** : ~1 500 lignes de commandes par mois, catalogue de produits stable

---

## Fonctionnalites cles proposees

- **Import flexible** : permettre l'import de n'importe quel CSV avec mapping des colonnes a la volee (sans reformatage prealable)
- **Normalisation automatique** : consolidation des commandes et comparaison avec les quotas disponibles
- **Suivi mensuel** : vue de l'avancement du mois (collecte, allocation, etc.)
- **Vue consolidee des lots** : stock disponible par produit, date d'expiration, quantites a allouer
- **Export bons de livraison** : generation automatique des documents pour les clients
- **Gestion des refus** : traitement des lots refuses par les clients avec reallocation ou mise en stock offert
- **Produits interdits** : import automatique de la liste ANSM des medicaments en rupture pour bloquer l'export
- **Stockage centralise** : documents clients (WDA, GDP Certificate) accessibles facilement

---

## Portail client (a discuter)

- Interface dediee pour les clients : possibilite pour les clients de confirmer/refuser les allocations directement dans l'outil plutot que par Excel
- Stock offert : interface permettant aux clients de commander directement les produits non alloues en fin de mois
- Centralisation des echanges : eviter la dispersion (mails, WhatsApp, appels)

---

## Architecture technique

- **Base de donnees** : vraie base de donnees structuree (pas Airtable seul)
- **Interface** : code custom pour interface sur-mesure
- **Approche** : solution scalable avec possibilite d'exporter le code pour internalisation future
- **Recommandation contre Airtable seul** : volumetries importantes et besoins specifiques necessitent une solution plus robuste

---

## Integrations futures

- **ERP-WMS Reims-Valence** : a investiguer a moyen terme pour connexion avec les entrepots
- **Imports/exports** : definir si interface dediee ou recuperation sur drive

---

## Priorisation des fonctionnalites

- **P0** : toutes les fonctionnalites actuellement gerees manuellement, avec semi-automatisation des allocations
- **P1** : allocation avec IA pour regles complexes, alertes, notifications, historique, reporting avance
- **P2** : integration WMS, BI avancee, portail client complet

---

## Modele commercial et accompagnement

- **Setup fee** : montant initial pour le developpement
- **Abonnement mensuel** : incluant maintenance, evolutions, gestion de la stack technique
- **Accompagnement continu** : point mensuel pour identifier ameliorations et nouveaux besoins
- **Retention client** : 88% des clients continuent sur le long terme
- **Equipe vs freelance** : avantage d'avoir une equipe (continuite, complementarite, disponibilite)

---

## Budget et timeline

- Fourchette budgetaire : discussion autour de 10-20k EUR pour setup (a preciser)
- Duree de developpement : estimation entre 1 et 2 mois de developpement pur
- Demarrage potentiel : courant fevrier 2026
- Budget evoque par Julie : 6-15k EUR initialement, consciente que la solution proposee sera dans les fourchettes hautes

---

## Points a clarifier lors du cadrage final

- Regles d'allocation precises et criteres chiffres
- Gestion detaillee des modifications de commandes clients
- Cas d'usage specifiques pour les commentaires clients
- Possibilite d'ajouter/modifier produits et prix en cours de mois

---

## Action Items

- [ ] Julien : finaliser le tableau fonctionnel avec decoupage detaille des priorites
- [ ] Julien : preparer deux scenarios de proposition (P0 seul vs P0+P1) avec estimations budgetaires
- [ ] Julien : inclure timeline estimative dans la proposition
- [ ] Julien : envoyer la proposition avant jeudi si possible
- [ ] Reunion de suivi prevue jeudi 14h30 pour presenter la proposition
- [ ] Organiser une rencontre physique pour finaliser le cadrage (Paris ou Lyon)
