# Meeting Intro - Alfred x RW Pharma

> Date : 26 janvier 2026
> Type : Intro / Discovery
> Participants : Theo (Alfred), Julie (RW Pharma)
> Source : Notion transcription

---

## Presentation d'Alfred

- Alfred est une agence specialisee dans l'efficience operationnelle (developpement d'outils sur mesure pour les entreprises)
- Fondee debut 2024 par Theo et Tony (anciens collegues pendant 4-5 ans)
- L'equipe compte actuellement 9 personnes, principalement basees a Paris, avec un objectif de 15-20 personnes d'ici fin d'annee
- Clients varies allant des PME aux grands comptes (Disney, Shadeo, Content Square, Dot)
- Methodologie axee sur la comprehension des problematiques avant la solution technique
- Technologies utilisees : 50% low-code/no-code (type Airtable), 50% developpement classique, avec integration IA/LLM selon les besoins

---

## Contexte RW Pharma

- Julie est courtiere en medicaments specialisee dans l'import parallele en Europe
- Met en contact des grossistes francais avec des importateurs europeens (Allemagne, Danemark, Suede, Norvege)
- Profite des differences de prix des medicaments entre pays europeens pour faciliter le commerce
- Basee pres de Lyon (Macon), mais en expansion avec ouverture de nouveaux entrepots pharmaceutiques a Reims et Valence
- RW Pharma fait uniquement du courtage sans gestion de stock physique - les clients collectent directement chez les grossistes francais

---

## Processus actuel et problematiques

### Gestion des commandes (debut de mois)

- Utilisation actuelle de Google Sheets comme outil principal
- Portfolio produits avec informations : CIP 13, CIP 7, prix d'achat fabricant, disponibilites par grossiste
- Les laboratoires imposent des quotas mensuels par grossiste pour eviter les ruptures de stock
- Collecte manuelle des commandes clients en debut de mois (Excel de chaque importateur)
- Process actuel : copier-coller des Excel clients + VLOOKUP pour consolider
- Allocation manuelle des commandes aux differents grossistes francais
- Les grossistes peuvent parfois livrer plus que le quota si disponibilite supplementaire
- Reexport manuel des commandes par grossiste (copier-coller et filtrage)
- Partage via Google Drive dedie par grossiste pour eviter les confusions d'email
- Les commandes evoluent pendant le mois (ajouts de produits, modifications de quantites/prix)

### Gestion de l'allocation de stock (fin de mois)

- Reception des stocks collectes par les grossistes francais
- Creation d'un second fichier avec tableau croise dynamique pour synthetiser par numero de lot
- Les numeros de lot sont critiques en pharma pour le tracage et les rappels eventuels
- Process actuel : copier-coller du stock brut, creation tableau dynamique, puis copier-coller pour allocation
- VLOOKUP pour recuperer les commandes mensuelles en face de chaque produit
- Allocation manuelle en fonction de criteres : taille des lots, prix du produit, preferences clients
- Les petits lots de produits peu chers sont souvent refuses par manque de rentabilite

### Problemes identifies

- Processus tres manuel avec risques d'erreurs multiples
- Impossibilite de former facilement de nouvelles personnes avec le systeme actuel
- Beaucoup de temps perdu en mise en page et copier-coller
- Double saisie source d'erreurs
- Formats Excel differents selon les clients
- Gestion asynchrone par email source de confusion

---

## Solution envisagee

### Automatisation possible

- 95% du processus peut etre automatise tout en gardant une interface pour les ajustements manuels
- Import automatique des fichiers Excel clients malgre formats differents
- Classification et consolidation automatique
- Export automatique vers les grossistes
- Interface pour suivre les commandes par mois avec historique
- Possibilite de modifications rapides et flexibles des commandes
- Automatisation partielle de l'allocation selon des regles metier

### Architecture technique a valider

- Questionnement sur l'utilisation d'Airtable vs base de donnees structuree avec interface custom
- Necessite d'une solution scalable pour la volumetrie future
- Perspective d'interconnexion future avec WMS/ERP des entrepots
- Besoin potentiel de Business Intelligence pour analyses
- Importance d'une base de donnees bien structuree comme fondation

### Fonctionnalites futures possibles

- Espaces clients avec acces personnalise
- Ajout de commentaires
- Developpements progressifs par etapes
- Connexion future aux systemes WMS/ERP des entrepots de Ginkgo, Reims et Valence

---

## Action Items

- [ ] Theo a envoyer un NDA a Julie (aujourd'hui ou demain)
- [ ] Julie a signer le NDA et partager son Google Drive avec les fichiers
- [ ] Theo a preparer un document de reflexion apres analyse des fichiers
- [ ] Reunion de suivi programmee mardi prochain a 14h (1 heure)
