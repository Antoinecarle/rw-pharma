# 2nd call - Alfred x RW Pharma (3 février 2026)

## Résumé


#### Contexte du projet

- Julie gère une activité de courtage de médicaments entre grossistes et importateurs
- Processus actuellement géré manuellement via Excel, entraînant une charge de travail intense (48 heures intenses lors des allocations mensuelles)
- Objectif : développer un outil sur-mesure pour automatiser et optimiser les processus d'allocation

#### Règles métier et allocation

- Critères d'allocation : définir les minimums de lots acceptables en fonction du prix des médicaments (les médicaments chers peuvent avoir des lots plus petits car meilleure rentabilité)
- Préférences clients : possibilité d'intégrer des règles spécifiques par client (ex: privilégier les top clients comme Orifarm)
- Allocation semi-automatique : garder environ 75% d'allocation automatique au meilleur prix, le reste géré manuellement pour entretenir les relations clients
- Approche équilibrée : automatiser ce qui est récurrent, garder le manuel pour les cas spécifiques peu fréquents

#### Flux de données et processus

- Données de référence : produits, grossistes, clients, importateurs (données stables)
- Flux mensuel :
- Volumétrie : ~1 500 lignes de commandes par mois, catalogue de produits stable

#### Fonctionnalités clés proposées

- Import flexible : permettre l'import de n'importe quel CSV avec mapping des colonnes à la volée (sans reformatage préalable)
- Normalisation automatique : consolidation des commandes et comparaison avec les quotas disponibles
- Suivi mensuel : vue de l'avancement du mois (collecte, allocation, etc.)
- Vue consolidée des lots : stock disponible par produit, date d'expiration, quantités à allouer
- Export bons de livraison : génération automatique des documents pour les clients
- Gestion des refus : traitement des lots refusés par les clients avec réallocation ou mise en stock offert
- Produits interdits : import automatique de la liste ANSM des médicaments en rupture pour bloquer l'export
- Stockage centralisé : documents clients (WDA, GDP Certificate) accessibles facilement

#### Portail client (à discuter)

- Interface dédiée pour les clients : possibilité pour les clients de confirmer/refuser les allocations directement dans l'outil plutôt que par Excel
- Stock offert : interface permettant aux clients de commander directement les produits non alloués en fin de mois
- Centralisation des échanges : éviter la dispersion (mails, WhatsApp, appels)

#### Architecture technique

- Base de données : Xano ou WeWeb (vraie base de données structurée, pas Airtable)
- Interface : WeWeb ou code custom pour interface sur-mesure
- Approche low-code/code : solution scalable avec possibilité d'exporter le code pour internalisation future
- Recommandation contre Airtable seul : volumétries importantes et besoins spécifiques nécessitent une solution plus robuste

#### Intégrations futures

- ERP-WMS Reims-Valence : à investiguer à moyen terme pour connexion avec les entrepôts
- Imports/exports : définir si interface dédiée ou récupération sur drive

#### Priorisation des fonctionnalités

- P0 : toutes les fonctionnalités actuellement gérées manuellement, avec semi-automatisation des allocations
- P1 : allocation avec IA pour règles complexes, alertes, notifications, historique, reporting avancé
- P2 : intégration WMS, BI avancée, portail client complet

#### Modèle commercial et accompagnement

- Setup fee : montant initial pour le développement
- Abonnement mensuel : incluant maintenance, évolutions, gestion de la stack technique
- Accompagnement continu : point mensuel pour identifier améliorations et nouveaux besoins
- Rétention client : 88% des clients continuent sur le long terme
- Équipe vs freelance : avantage d'avoir une équipe (continuité, complémentarité, disponibilité)

#### Budget et timeline

- Fourchette budgétaire : discussion autour de 10-20k€ pour setup (à préciser)
- Durée de développement : estimation entre 1 et 2 mois de développement pur
- Démarrage potentiel : courant février 2025
- Budget évoqué par Julie : 6-15k€ initialement, consciente que la solution proposée sera dans les fourchettes hautes

#### Points à clarifier lors du cadrage final

- Règles d'allocation précises et critères chiffrés
- Gestion détaillée des modifications de commandes clients
- Cas d'usage spécifiques pour les commentaires clients
- Possibilité d'ajouter/modifier produits et prix en cours de mois

#### Action Items

- [ ] Julien : finaliser le tableau fonctionnel avec découpage détaillé des priorités
- [ ] Julien : préparer deux scénarios de proposition (P0 seul vs P0+P1) avec estimations budgétaires
- [ ] Julien : inclure timeline estimative dans la proposition
- [ ] Julien : envoyer la proposition avant jeudi si possible
- [ ] Réunion de suivi prévue jeudi 14h30 pour présenter la proposition
- [ ] Organiser une rencontre physique pour finaliser le cadrage (Paris ou Lyon)

## Notes

_Aucune note pour ce meeting._

## Transcript


Je cherche le minimum de lois à respecter, donc ouais c'est ça, c'est exactement ça. Ce qu'il faudra définir si on lance le projet, c'est de définir quels sont les chiffres derrière ça. Là ça donne les grandes règles et les métriques qu'il faudra mettre, mais derrière il faudra qu'on définisse les chiffres.


Est-ce que les minimums de l'eau acceptables, en fonction du prix, parce que ce que tu disais c'est que quand c'est des médicaments qui sont chers, tu acceptes que ce soit des plus petits d'eau ? Exactement ! La rentabilité est meilleure, donc c'est ça. J'imagine que ceux qui sont chers, c'est ceux qui sont produits en plus petite quantité, donc du coup qui sont plus chers parce qu'il y a beaucoup moins de demandes. Ouais.


Et puis des préférences peut-être qui sont liées à des clients qu'on pourra mettre dans le futur. Par exemple, il y a peut-être des clients qui ont des demandes spécifiques et du coup on pourrait peut-être les mettre dans le futur aussi en logique. Ça impliquerait que du coup par client on ait des règles d'allocation spécifiques et donc...


Ça veut dire rajouter une petite brique là-dessus. D'accord, ouais. Et des fois, comme tu dis, préférence client, c'est par exemple mes top clients. J'ai trois clients à Balèze. Le plus gros, c'est Orifarm. Et puis, effectivement, je vais le sous-shooter un peu plus, quoi.


C'est... Effectivement, il y a des trucs où il n'y a pas forcément de… Je ne sais pas si c'est automatisable, mais effectivement, c'est pour ça que je fais beaucoup à la main et pas au meilleur prix parce que je n'alloue pas automatiquement au meilleur prix.


J'alloue aller peut-être 75% au meilleur prix, mais même les autres, s'ils sont un petit peu en dessous, j'alloue quand même pour faire plaisir, garder le client actif, entretenir le portofolio, tout ça. Donc, c'est sûr qu'il y a une règle à définir ensemble, mais des fois il n'y a que... La préférence client, effectivement, c'est suite à un rendez-vous, c'est pas louer certains produits plus qu'un autre.


Oui c'est ça, le but c'est pas de faire une usine à gaz non plus parce qu'il faut que tu puisses quand même garder la main. En fait dans tous les cas ça va te faire gagner du temps en termes d'interface parce que c'est un peu plus confortable qu'un Excel pour venir allouer à droite à gauche.


Mais en fait qu'on puisse automatiser ce qu'on peut et le reste le garder potentiellement pour le moment en semi-automatique et voir s'il y a des sujets qui en découlent et qui sont réguliers. Parce que mettre des règles sur un cas spécifique qui arrive une fois tous les trois mois, peut-être qu'il ne faut pas le faire.


Exactement. Ça va nous coûter plus de temps, nous, de notre côté, à mettre en place, et du coup c'est pas rentable pour toi, in fine, alors que ça te prend peut-être une heure par mois à te mettre en place. Ça c'était pour le sujet des règles d'allocation.


Je vais rentrer un peu dans le détail de technique, mais j'ai commencé à tracer les tables du schéma de données qui auraient derrière. Il n'y a peut-être pas toutes les colonnes. il en manquera, il en manque probablement, mais en fait l'idée c'est de comprendre qu'est-ce qu'il y a en termes de grande entité de données et surtout ce que j'ai fait c'est que j'ai pris un exemple


Et là-dessus, on peut passer dessus, parce que c'est peut-être un peu plus explicatif, mais j'ai pris un exemple de, en fait, qu'est-ce que ça veut dire, derrière, d'un point de vue processus ? Quelle est la traduction de cette table d'un point de vue processus ?


Oui. Et en fait, le chemin de la donnée, pour la faire de manière assez rapide, c'est que déjà, tu as toute la partie de données de référence qui ne bougent pas ou peu, qui sont les produits, tes grossisses, tes clients. Tu peux avoir de gros clients, évidemment, mais ce que je veux dire, ce n'est pas quelque chose qui est dynamique tous les mois et qui va être amené à bouger tous les mois.


Ensuite, à grosso modo, l'ouverture d'un mois, tu vas recevoir tes quotas, tu vas pouvoir les remplir. et les mettre, derrière tu as la part des commandes clients donc chacun de tes clients va te demander les commandes qui sont structurées de manière plus ou moins similaire, oui c'est ça, chacun a son format


Et donc du coup le but c'est, comme je te montrais dans la vidéo, c'est de pouvoir permettre d'importer n'importe quel CSV et de dire tes colognes correspondent à celle-ci, celle-ci, celle-ci, et hop tu importes et ce serait beaucoup plus simple. J'ai même pas besoin de le pré...


j'ai pas besoin de vraiment le mettre en format avant de l'importer, je peux le faire... sur le logiciel quoi. Ouais, exactement. En gros, il faudra peut-être leur demander juste qu'ils te donnent des CSV plus des Excel, on verra, mais pour eux, ça revient au même en termes d'export.


Mais effectivement, le but, c'est qu'en gros, t'aies pas besoin de reformater le nom des colonnes. Et ça non, en fait, c'est de te dire, t'as une colonne qui correspond à celle-ci. Et on verra, peut-être que pour certaines, il y aura besoin de mettre en place des logiques, par exemple sur les prix, ou parfois les prix sont avec des virgules, d'autres des points, selon le formatting, c'est anglais, européen, américain.


Donc il y aura ces logiques à mettre en place, mais sinon sur le reste, non, on ne t'aura pas besoin. Donc là, j'importe les commandes, ensuite ça s'additionne. Exactement, ça se normalise, c'est ce que je viens de dire. Ça te permettrait de pouvoir tirer assez rapidement des conclusions de ce genre.


C'est-à-dire, il y a le total de commandés d'un certain médicament, c'est tant, le quota disponible c'est 800, donc on pourra potentiellement pas tout servir ou il faudra trouver des moyens de le faire en allant au-dessus des quotas comme tu le dis déjà.


Peut-être qu'après du coup tu pourras, ce sera intéressant d'exporter vers les grossistes les... Ouais, ça je sais pas si je t'en ai bien expliqué ou pas. Quand je reçois les commandes des importateurs, j'additionne tout et après je fais les allocations de commandes, exactement comme tu dis, donc là j'en avais 1500 à basse agglare et je les ai répartis en fonction de leurs quotas.


déconsiste et du coup ben en fait les allocations de commandes je pouvais le faire aussi là je sais plus parce que j'ai vu que je peux allouer effectivement les numéros de l'eau pour l'allocation en fin de mois du stock dispatcher les commandes je sais plus si je t'avais bien expliqué ça mais bon après voilà c'est dans un sens ou dans l'autre en fait ça on pourra le modifier mais du coup pour bien comprendre


Donc tu reçois tes commandes, tu reçois tes quotas, tu les importes, ça te permet assez vite de voir en fait si c'est à ce moment là que tu fais ton allocation. C'est ça, en fait dans le mois j'ai deux allocations, j'ai une allocation en début de mois où je split les commandes totales, je les split pour les grossistes et après j'envoie au prochain grossiste.


Et en fin de mois, tous les grossistes m'envoient le stock collecté, leur stock collecté, donc c'est exactement ce que tu as dit, je ne fais rien de stock, et après le stock je le réalloue aux importateurs par numéro et tout. C'est exactement ça. C'est exactement ça.


En fait, ça, ça te permet assez vite de pouvoir... de pouvoir faire le pan entre les commandes et les quotas. Ça permet de faire l'export vers les grossisses des quantités que potentiellement tu pourrais t'envoyer. ça te permet de recevoir peut-être de leur côté je sais pas quand est-ce que tu reçois, j'ai mis des fausses dates mais on n'aura pas compte C'est exactement ça, t'as fait ce métier avant ou t'es impuneré ?


Non, non, non, mais j'ai passé un peu de temps à réfléchir, donc... Franchement, c'est exactement ça. Là, les allocations, je les ai faites la semaine dernière, je crois qu'on a fait notre rendez-vous la semaine dernière. Ouais, c'est ça. La semaine dernière où je dors peu pendant les allocations, j'ai 48 heures où tu te couches tard, tu te lèves tôt, c'est n'importe quoi parce que je fais cette misère-là en fait, donc c'est exactement pareil. Du coup, c'est un peu l'enfer.


Du coup, tu peux plus aller au sport. Alors si, je peux courir de chez moi en fait, je cours vite, du coup j'ai des chronos de dingue et après je m'en remets vite, c'est compliqué. Pas trop de vie pendant ces 48h, 3 jours, c'est compliqué. Du coup, le but, c'est qu'on essaie de te libérer un peu de temps là-dessus. Ouais, bah c'est ça. Mais du coup, tu as donc réception de la partie stock. Le but, c'est que ça crée automatiquement les lots à l'import,


du coup tu sais là où tu reçois les lots, si j'ai bien compris, donc t'as ton stock collecté, etc, le but c'est qu'on puisse suivre, j'ai mis ça, mais c'est du détail, mais qu'on puisse suivre là où on en est dans le mois, donc en gros qu'il y ait On voit pour le mois de janvier dans quelles stations on en est, est-ce qu'on en est en collègue, est-ce qu'on en est en allocation, etc. Ensuite le but c'est que du coup t'aies une vue qui soit consolidée, qui te permette de voir que par exemple pour telle lot, tel produit, telle date d'expiration, il y a tant de stock.


et qu'il y en a tant à allouer, quoi. Ouais. Ensuite, faire les allocations. Du coup, tu vas avoir... Bon, j'ai mis des IDs, mais en gros, ce qu'il faut comprendre, c'est qu'ici, t'as le... C'était le lot de telle, de Epsilon par exemple, et donc par exemple de se dire que pour la commande de Horifarm t'as une quantité allouée qui est de tant, à tel prix, statut confirmé, il y a probablement des commandes qui manquent mais tu as l'idée quoi.


Ça permet de faire l'allocation. Ça c'est vraiment d'un point de vue base de données, donc c'est pas très sexy là, mais c'est surtout pour comprendre comment ça navigue. Ouais, d'accord. De pouvoir dire qu'il y a des lots qui sont refusés, par exemple, il y a une allocation qui est refusée.


Et d'avoir surtout une synthèse par client, de voir combien il y en a qui ont été demandés, combien à louer, est-ce qu'on est bon, est-ce qu'il y en a qui sont partiellement à louer, et de voir ce que tu peux faire toi aussi. D'ailleurs, ça permet de faire de l'export type bombe-livraison. C'est ça, exactement. Parce que du coup là, je ne sais plus si je t'ai parlé des...


des commentaires que je fais avec les clients parce qu'alors du coup exactement là le bond de livraison à Orifarm donc là une fois que j'ai alloué la commande pour Orifarm, je lui envoie et là c'est là qu'il va me accepter et refuser certains lots, c'est possible.


Donc en fait je lui envoie pour confirmation. Et après, je retraite encore ces commentaires, je ne sais plus si je t'avais montré ça, mais donc exactement là, je ferai exporter le bon de livraison, je lui envoie un Excel. Aujourd'hui, c'est ce que je fais, je fais copier-coller, je mets dans un Excel, je lui envoie et ligne par ligne, il me met OK, OK, refusé pour XP, machin, et du coup, moi, je réintègre ça dans mon truc et je...


C'est peut-être ma vision utopiste du sujet, mais je pense qu'il pourrait le faire directement sur une interface qu'il aurait dédiée et que tu puisses, après en un clic, prendre pour telle ligne et dire je désallouerais à l'eau ailleurs ou je ne sais pas ce que je fais.


Exactement, c'est ça, c'est exactement ça l'idée c'est comme les grossistes peuvent avoir une interface pour déposer du stock, est-ce que plus tard à l'avenir les clients pourraient se connecter pour me faire un feedback sur le bon de livraison, c'est ça, exactement.


Tout à fait, mais ça, complètement, ça ferait... Les différents bandes livraisons, et ensuite clôture du mois où tu vas retrouver ta synthèse de 2026 avec ce qui a été fait in fine, tes valeurs. Dans toute cette réflexion-là, je ne l'ai pas inclue, mais on pourrait inclure ta valeur de marge, parce que je ne l'ai pas mise, mais on pourrait implanter ta valeur de marge pour faire ton suivi à toi. Et du coup, avoir les chiffres de ton activité accessoirement et pas mourir de les avoir par l'eau.


Du coup, c'est le résumé de tout ce qu'on s'est dit. d'accord super et du coup ça correspond à ce que je t'ai envoyé comme démo Après, c'était vraiment une maquette, donc il faut prendre avec des pincettes. Il y a des choses qu'on va probablement modifier et ce qu'il faudra qu'on fasse, c'est se mettre autour d'une table pour se dire, tel truc, je préférerais le gérer de telle manière, etc.


Pour qu'on prenne en compte tous les cas dans le cadrage final. et qu'ensuite on commence à développer tout à ce moment-là pour gagner du temps après.


Bon voilà, du coup ça c'était juste les processus tels qu'on vient de les passer grosso modo. Les règles métiers on en a parlé, les règles de gestion de commandes on en a parlé un petit peu. J'avais retracé les volumétries, je ne sais pas si ça te semblait juste. Oui, oui, j'ai regardé ça, c'est intéressant et c'est ça, oui. Link commandé, c'est environ ça aussi.


À l'occasion du mois, produits au catalogue, c'est ça, clients, c'est ça. Ça a pris le fichier de janvier, je ne vais pas chercher à comprendre, mais... Ça reste tout de même, les grossisses et les clients... Et les importateurs c'est toujours les mêmes en fait, ce qui bouge c'est plutôt les lignes quoi. Ouais et c'est pour ça que du coup moi ma recommandation c'est effectivement d'avoir un outil qui est plutôt structuré avec une vraie base de données parce qu'en fait tu vas te retrouver avec des volumétries assez importantes.


Et c'est surtout, je pense qu'en termes d'interface, pour être très efficace, tu as besoin d'une interface vraiment sur mesure. Et tu vois, autant pour faire de la gestion de projet, Rtable, c'est très bien. Nous on a des gros clients même du Disney sur l'investissement de projets sur Airtable et dans ton cas en fait t'as des besoins assez spécifiques et c'est pour ça que je t'ai poussé une maquette qui est plus sur une interface qui est plus...


qui serait dédié à ce que tu fais. Et c'est pareil, c'est du no code, low code ? C'est pareil ou il y a un peu des deux quand même ? C'est plutôt du low code là en l'occurrence, voire code à certains endroits. d'accord ok mais en fait honnêtement c'est ce qui permettra d'être le plus scalable dans le futur c'est ça exactement ouais


Donc moi je te recommande vivement d'aller dans cette direction. Ok, donc c'est un peu hybride entre les deux ? Oui, tout à fait. Mais par exemple, on pourrait très bien exporter le code et si un jour... Je te donne un exemple particulier mais... Si un jour, au bout de quelques temps, tu veux réinternaliser cette compétence, on pourrait très bien t'exporter le code et te le mettre à disposition, et du coup tu pourrais avoir quelqu'un en interne qui te gère, ça c'est important pour toi.


Non, je ne sais pas. En deux ans, pour le moment, tu vas peut-être te concentrer sur d'autres sujets, mais... Oui. OK, super. Bref, il y aura peut-être certaines intégrations qu'on pourra identifier. Est-ce qu'on récupère des mails ? Est-ce qu'on arrive à structurer sous puce, sous forme d'interface ?


Est-ce qu'on met à disposition une interface pour les dépôts des fichiers ou est-ce qu'on vient les récupérer sur un drive ? Je préférais qu'on ait une interface mais on pourrait réfléchir pour ne pas trop changer les habitudes. Et après, il y a la partie import-export de fichiers. Moyen terme, ce que je tenais, c'est que potentiellement, vous aurez un ERP-WMS côté Reims-Valence. Donc, ce sera intéressant d'investiguer dans le futur, pas forcément court terme, mais à moyen terme, ce qu'on...


avec comment on peut s'intégrer avec ce que vous aurez là-bas. D'accord. Et puis voilà. Après, je t'ai parlé de l'architecture technique, effectivement, du coup, c'est... Ça pourrait être côté base de données, quelque chose comme du... Pourquoi il a mis ça là ?


Je suis un peu fatigué quand j'ai fini. Mais ça pourrait être côté base de données, soit quelque chose comme XanoWeWeb qui est de la vraie base de données structurée, donc c'est pas comme Rtable où en fait c'est une base de données individuelle très simple.


Et après, côté interface, ça pourrait être du WeWeb ou du code derrière. Donc, c'est pas vraiment pour faire des surmesures, surmiseurs. D'accord, ok. Voilà, bon, j'ai fait un découpage fonctionnel. Pareil, c'est pas très important, on sait exactement ce qu'on vient de se dire.


Le seul truc qui est important, c'est qu'en P2, j'ai mis tout ce qui est intégration WPMS, BI avancé, portail client, peut-être. On va voir si c'est du P2 ou du P1, le portail client, au vu des discussions qu'on va avoir. Oui, d'accord. Mais le reste, en fait, en gros, pour faire simple, tout ce qui est en priorité zéro, c'est tout ce que tu fais déjà aujourd'hui, mais sur quelque chose qui te permettrait de gagner beaucoup plus de temps.


et de semi-automatiser la partie allocation. En P1, j'ai mis potentiellement des sujets d'allocation avec de l'IA si on veut mettre en place des règles plus complexes que juste, tu vois, des quotas ou des choses comme ça. et potentiellement de l'alerte, de la notification, de l'historique et du reporting, avec des tableaux de bord dédiés, spécifiques, enfin bref. D'accord. Je vais mettre ça comme ça.


Ok. Bon t'as la démo, les estimations je les ai pas encore faites, en fait je t'en parlerai après à la fin mais je vais juste voir si on a répondu à toutes les questions mais je t'en parlerai. Oui, d'accord. Au côté des règles de l'allocation, on en a un peu parlé, mais du coup il faut qu'on formalise précisément les critères. Oui. La gestion des modifications de commandes, tu en as parlé sur la partie comment tu fais tes modifications, mais pareil, quand on se mettra autour d'une table au moment d'un lancement de projet, je pense que ce sera intéressant que tu m'expliques en gros les cas que tu as en termes de commentaires clients et comment tu les gères.


Ok, c'est exactement ça. Et aussi que du coup les commandes, après je pense que tout est possible, mais que pendant le mois, tu vois, je puisse appuyer. ajouter des produits, changer des prix, ajouter des lignes, que ce soit tout de même. Oui, en fait, le but, c'est que tu puisses faire ton gros upload au début de mois, mais qu'après, tu puisses, si tu as besoin, rajouter une ligne pour un médicament, pour un client donné.


que tu puisses le faire en fait. Oui, c'est ça, oui. Produit interdit, ah oui, tu n'as même plus ça. Produit interdit, en fait, c'est tout ce qui est en rupture. Et du coup, quand c'est en rupture, on n'a pas le droit d'exporter. Effectivement, je fais tout un micmac, je vais sur le site de l'ANSM pour exporter un fichier, c'est un fichier CSV.


qui est publié et du coup à chaque fois je fais des recherches V pour ne pas que j'alloue ces produits interdits export à cause de ruptures. D'accord, et tu le fais tous les mois ça ? Ouais, c'est ça. Quand je crée mon super tableau, je mets mon fichier interdit à jour.


Et du coup, je vais sur l'ANSM ou base des données. Base des données publiques des médicaments et après il y a téléchargement et du coup je télécharge. Bon je te montrerai mais en fait c'est ça. Exactement, tous les mois je fais attention à ne pas me faire engueuler et exporter des produits qui sont en rupture sur le marché français, il faut faire attention. Le format ne change pas de 7 ans.


Ouais, à chaque fois, ils envoient du CSV, c'est toujours pareil, les mêmes colonnes, c'est pareil. Du coup, ça, on pourrait prévoir de l'importer pour les prendre en compte. Du coup, c'est quoi le traitement que tu as là ? C'est interdit parce que tu as deux stocks, etc.


tu t'interdises du coup de les commandes qui sont dessus c'est vraiment elles sont alors des fois je peux les passer en commande parce que le statut du produit peut changer pendant le mois donc des fois je vais les passer en commande mais c'est surtout à la fin du mois quand je fais mes allocations c'est le produit est toujours en rupture de stock pour


il faut que je le dégage, il faut qu'il soit bloqué, c'est ça, exactement. Ok, super clair. Bon ça c'est une question un peu de base, mais quand tu as un nouveau client... Comment tu l'onboard aujourd'hui, c'est quoi ton processus s'il y en a un ? Alors eux ils m'envoient un questionnaire


C'est surtout eux en fait qui m'envoient un questionnaire. Moi, je contrôle plutôt leurs licences. Alors, tu peux dire la WDA et le JDP Certificate. Contrôle des licences, c'est ça sur WDA et GDP, c'est ça.


Merci.


c'est ça ok et après c'est après c'est ils t'envoient leur première commande directement et tu les traites ouais exactement ouais c'est ça


Tu stockes ces documents ? Oui, si. C'est un bordel, mais j'arrive à les avoir quelque part. Mais ça doit être par là. Mais ça serait bien que ce soit tout centralisé, je ne sais pas si c'est... C'est un peu ma question, c'est par exemple pour un client, on pourrait avoir tous les documents du client stockés. Oui, ce serait super. Ça ne prend pas beaucoup de temps à ajouter, ce que je veux dire, c'est que ça serait pas centralisé pour un client, avec les dates où tu les as uploadés, ce serait quand même pas...


d'accord Ça c'est une des questions, ça fait partie un peu des gestions de modifications, mais quand tu as un lot qui est refusé par un client, c'est quoi tes différentes règles, tes différents cas ? Alors en fait, quand je fais mes allocations, quand le lot est refusé,


Du coup, il y a le commentaire refusé dans son Excel. Du coup, j'enlève le produit et à la fin du mois, j'envoie un espèce de stock offer de tous les produits qui ont été rejetés. Donc je peux soit dans un premier temps l'allouer à un autre client ou soit il finit dans un stock offert de tous les invendus. Oui, c'est ça.


Et du coup, tu leur envoies un fichier de stock offert et c'est eux qui te renvoient des mails pour te dire si c'est... Absolument. Ils me renvoient le Excel avec les commentaires. Je peux prendre ça à 100 euros, telle quantité. Voilà. Mais du coup, tu ne peux pas gérer le cas où il y a plusieurs clients en même temps qui demandent la même chose.


Des fois, ils me répondent avec le même prix. Des fois, il y en a un qui n'accorde pas le produit. Mais bon, de toute façon, les médicaments, c'est super compliqué. La dispo est compliquée avec les ruptures, tout ça. Donc, ils ont l'habitude de commander et pas avoir le produit.


Ouais, c'est la guerre à l'époque, c'est un peu spécial, ouais. Ok, mais en fait c'est pareil, du coup on pourrait très bien... C'est très bon, ça marche mieux, tu vois, franchement.


Excusez-moi, je fais de la musique là.


Je vous souhaite une bonne soirée et je vous dis à très bientôt pour une nouvelle vidéo.


C'est mon chargeur qui vient de me rendre là, mais je rêve là. Dis-moi que tu peux sortir une boîte d'informatique, c'est-à-dire que tu peux donner une boîte d'informatique. Dis ça à moi ! Au revoir.


Bah là tu vois, j'avais pas répondu à des mails, donc du coup les clients me contactent par Whatsapp parce que je suis un bordel quoi, c'est... Ah ouais, par Whatsapp ! Ah ouais, quand je suis trop longue, ils me contactent par Whatsapp, par appel, par...


Typiquement, c'est le genre de sujet où je me demande à quel point il ne faut pas qu'on inclue le sujet de l'interface plus rapidement parce que... Pareil pour la partie stock offert, en fait on pourrait très bien avoir une partie stock offert fin de mois qui est mise à disposition où ils peuvent cliquer je prends, j'en prends tant et toi tu les reçois de ton côté directement plutôt que... Ouais.


recentraliser les échanges parce qu'il n'y a rien de pire, on fait tous les deux des métiers de service, il n'y a rien de pire qu'avoir du défocus, il y en a un qui t'envoie un mail, un Whatsapp, un machin, alors que tu pourrais avoir une structure de projet global.


Merci ça, bye. Ok, bye.


Très clair, bon ça on en a parlé, on en a parlé, numéros de lots, ah non ça les numéros de lots tu les connais qu'au moment où tu reçois ton stock. Exactement, à la fin du mois, quand je reçois, tout le monde m'envoie leur stock, c'est ça, ouais. Ok. Après j'ai des questions qui étaient plus projets, là il y aurait une date, une timeline qui tirerait bien de projet pour lancer ce sujet-là ?


Au plus vite, mais après, je sais que ça prend du temps, donc t'es comment dans tes projets, t'as beaucoup de taf ? Là, quand vous êtes beaucoup occupé, c'est quoi, j'imagine ? On est souvent occupé, on n'a pas trop de problèmes de projets aujourd'hui. On a plus de problèmes de recensement.


Et on essaie d'agencer les projets en fonction des clients aussi et de leurs besoins. Parce que tu vois, il y en a d'autres qui me disent c'est un projet de 2026 et on sait qu'on va le faire en jour. C'est pour ça que je te pose la question, j'ai pas besoin d'avoir une timeline précise, mais quand tu me dis au plus vite, on pourra s'arranger. En gros, on pourrait potentiellement démarrer courant février en fonction de...


quand on finit un projet là qui est en train de se terminer cette semaine ou la semaine prochaine, mais grosso modo on pourrait commencer en février je pense. D'accord. Et t'estimes à combien de temps le temps de développement ? C'est une bonne question, suite à ce meeting, il faudra que je finisse de caler un peu toutes les priorités qu'on vient de choisir et que je te fasse une proposition. Ce que je vais faire, c'est que je vais te faire deux propositions en fait. C'est un peu plus long, je vais commencer à mettre là.


C'est qu'en fait, je vais te faire une proposition. Scénario 1, on fait la version, qui est très très fonctionnelle, attention, mais avec tout ce qui est les prix au zéro. Et après, je te fais une version 1 avec l'épée 0 et l'épée 1. Et après, le but, c'est plutôt d'avoir une discussion sur, est-ce que ça te semble cohérent, qu'est-ce que tu penses ?


faire ça. Est-ce qu'il y en a que tu veux enlever, rajouter ? Oui, ok. Pour cette typologie de projet, en général, on a un fonctionnement qui est peut-être un peu différent de ce que tu peux avoir l'habitude d'avoir ailleurs. C'est que nous, on... En gros, ce qu'on fait, c'est qu'on fait de l'abonnement pour éviter aux clients qui sortent 30 000 euros pour développer un projet d'une fois, quoi. Mais on fait un abonnement où, en gros, on a une partie qu'on appelle setup fee, grosso modo, qui est un montant X ou Y que je te donnerai une fois que j'aurai fini mes calculs, du coup.


et après on fait un abonnement par mois qui nous permet de gérer à la fois la maintenance, l'évolution, on s'occupe de la stack technique, t'as pas besoin de t'en occuper. parce que je pense que c'est inconfortable pour nos clients qui sont des PME de gérer des stacks techniques de logiciels. D'accord. C'est pour ça qu'on le fait et on peut inclure des évolutions dedans aussi.


En fait, ça te permet d'avoir quelque chose d'assez confortable et c'est comme tu paierais un outil, tu paies un outil x ou y, t'as un abonnement, c'est juste que c'est du sur-mesure donc les montants sont un peu supplémentaires mais par contre ça te permettrait de partir les cours et d'avoir quelqu'un qui t'accompagne au jour le jour.


D'accord, trop bien. Ça faisait partie d'une de mes questions, parce que mon associé m'a aussi demandé... Parce que c'est vrai que nous, on a les WMS. Après, en fait... Là, cet outil-là, c'est pour mon activité de courtage de médicaments. Mais après, j'ai aussi d'autres entreprises sur lesquelles je suis associée. Là, je suis toute seule, mais les entrepôts pharmaceutiques, là, je suis associée avec un pote. Et du coup, là, on a des logiciels beaucoup plus poussés.


En fait, on a des entrepôts pharmaceutiques, on achète au laboratoire, on stocke dans nos dépôts et on vend aux pharmacies. Et du coup, effectivement, des fois ça plante et c'est sûr que c'est important qu'il y ait de la maintenance, tout ça, donc c'est pour ça que ma question c'était ça, comment t'accompagnes après si j'ai un problème ?


« Est-ce que je peux te rappeler ? Est-ce que je suis seule et que je dois trouver une nouvelle personne ? » Ça faisait partie de ça aussi, parce que du coup c'est super important, c'est... C'est... Ouais. Ouais, non, on est à dispo sur ce sujet-là. Et surtout, le sujet en général, ce qu'on essaie de faire, c'est qu'on essaie de faire un point par mois avec toi. Mais ce point, il n'a pas pour vocation à dépiler des bugs, il a juste pour vocation à comprendre est-ce qu'aujourd'hui tu rencontres des problématiques avec l'outil ?


Est-ce que tu veux améliorer certains de tes sujets ? Quel est l'invention que tu as à plus long terme ? Parce que ton activité du coup... Une fois qu'on aura mis ça... Du coup, tu vas dédier du temps sur d'autres choses et tu vas te rendre compte d'autres sujets et donc tu auras probablement une terre évoluée différemment pour continuer à gagner du temps. Bref, du coup, le sujet il est plutôt là-dessus, c'est comment on t'accompagne dans la durée.


d'accord ok et ben c'était ma question aussi donc c'est d'accord donc c'est possible aussi quoi de rester avec vous et de payer un abonnement et donc du coup ça serait donc un genre de setup fee et après mensuel ouais tout à fait C'est pas pour nous jeter des fleurs mais en fait on faisait la synthèse en fin de mois dernier sur l'année 2026.


On a 88% de nos clients qui continuent sur du long terme avec nous. D'accord. En fait, avant jusqu'en 2024, on faisait un format plutôt fort fait, etc., qu'on arrête de faire grosso modo. Et en fait, malgré ça, même quand on était au forfait, nos clients, ils continuaient. On a des clients qu'on a depuis trois ans parce qu'on les avait déjà même avant de monter la boîte. D'accord.


Donc voilà, mais oui du coup le but c'est d'accompagner sur le long terme et potentiellement il y aura d'autres sujets, peut-être qu'on fera d'autres choses pour vous dans le futur. Ça a du sens ! Surtout dans ce genre d'entreprise, il y a toujours des nouveaux trucs à développer. Le WMS, c'est mon associé qui l'a choisi, je le déteste, c'est notre WMS. Et du coup, le gars qui nous a fait le WMS...


m'a pondu un truc un peu pour m'aider, mais c'est catastrophique en fait, c'est inexploitable, je te le montrerai à l'occasion, tu vas rigoler quoi, je ne peux pas filtrer, je ne peux rien faire, de ne peu importer qu'en csv au bon format s'il y a une lettre qui change ça me rejette je juste pour importer un fichier je vais passer 20 minutes quoi c'est une catastrophe


Donc, du coup, je l'ai commencé avec lui, mais j'ai arrêté parce que j'ai dit, et puis aussi, c'est super important. Je trouve qu'il n'y a pas que votre technique qui est importante, il y a aussi la communication, qu'on doit bien se comprendre, bien se parler, mais c'est la base de la réussite d'un outil, je trouve.


Et ce gars, malheureusement, c'est un con, du coup, c'est compliqué de bosser avec des cons. C'est un vieux monsieur qui a du mal avec les femmes, je pense, donc il parle comme un associé. Et du coup, ben, coucou, c'est moi qui développe l'outil. Ce n'est pas mon associé qui fait l'export. Il faut que tu apprennes à me parler, répondre à mes e-mails. Donc, en fait, ça fait un genre de téléphone arabe.


donc voilà c'est pas possible quoi je peux si je développe un outil t'as vu comment c'est technique je peux pas passer par mon associé pour te parler quoi c'est compliqué Malheureusement, je trouve que la communication c'est super important, sinon on est à côté de la plaque, l'outil est à côté.


C'est ce que je me suis expliqué à nos clients, c'est qu'en fait, nous avec Tony, on vient tous les deux du produit à la base et pour nous, c'est super important de passer du temps à bien comprendre ce que vous faites, à poser les bonnes questions, à poser sur papier déjà ce qu'on s'est dit.


Parce que sinon ça nous fait perdre du temps parce qu'au final on va commencer à développer un truc, ça va pas marcher parce que c'est pas exactement ce que t'avais besoin donc on va le rechanger et au final c'est de la perte de temps pour tout le monde et d'énergie pour tout le monde.


C'est ça, exactement, et du coup on a passé du temps, de l'argent sur des produits qui vont pas alors qu'il vaut mieux perdre un petit peu de temps au début mais au moins on est sur le bon truc et c'est parti quoi, on a tout validé quoi. Et du coup, je pense que pour moi, c'était un point important aussi. Ce n'est pas que l'aspect technique, mais il faut que la communication, ça passe et que j'arrive à être claire et que voilà, mais voilà, donc.


D'un point de vue fonctionnel, je pense qu'on commence à être clair, de toute façon ce qu'il faudra Bien clarifié c'est quand on lancera, je pense que ça pourrait être sympa de peut-être se voir en physique pour finaliser le sujet, donc soit nous on descendra, soit c'est possible.


Si jamais t'es de passage sur Paris, avec plaisir aussi. Souvent sur Paris, ouais, pour les clients import, ils arrivent beaucoup sur Paris, donc je monte assez rapidement en TGV sur Paris. J'y suis souvent sur Paris, peut-être pas tous les mois, mais un mois sur deux, j'y suis quand même. Ok, écoute, carrément, on pourra se prévoir ça, pareil, s'il faut qu'on descende à Lyon, honnêtement, bon pareil, moi je suis lyonnais à la base, donc c'est pas très compliqué de descendre.


Ouais, d'accord. J'ai de la famille à Lyon, donc ça me va bien. Enfin, normal, ça m'ont dit la dernière fois, mais donc on pourra faire ça. Moi, du coup, mon rôle, là, ça va être de... Ça va être de finaliser le tableau fonctionnel et du coup les estimations de budget pour la partie setup fee et abonnement. Ouais, d'accord. Est-ce que tu avais une idée de, en fait ça va me permettre de définir sur les priorités qu'est-ce que je mets au-dessus ou qu'est-ce que je mets en-dessous, est-ce que tu avais une idée de budget que tu voulais mettre ?


ou que tu t'étais dit que tu voulais mettre pour ce genre de projet, ce genre d'outils, par rapport au bouquin, en tant que ça va te faire gagner. Ouais, alors par exemple, si je parle de la PO par exemple, tout ce qui est prioritaire, c'est ça ? De manière globale, et comme ça, ça me permettra de...


J'essaierai de pouvoir voir si j'arrive à rentrer déjà dans ce budget, parce que ça me permettra de te mettre des fonctionnalités plus ou moins au-dessus ou en-dessous. tout en gardant en tête qu'il faut qu'il y ait une cohérence globale quand même, sinon ça n'a aucun sens. C'est ça, après je vais te dire des chiffres mais je n'en ai aucune idée, je ne sais pas du tout, j'ai un peu une idée parce qu'effectivement on a développé ce truc avec le gars du WMS,



Mais je ne sais pas, après c'est sûr que vu qu'il y a du no-code et vu que ça va peut-être un peu plus vite c'est peut-être... Voilà, mais derrière toi aussi tu as quand même de la technologie un peu plus compliquée, c'est pas que du R-Table. Mais je ne sais pas, je dirais, j'en ai aucune idée, dis-moi si je me trompe, je ne sais pas du tout, je ne veux pas dire de bêtises et paraître par une débile mais...


Je ne sais pas, peut-être entre 6 et 15 000, je n'en sais rien. Je ne sais pas ce qu'on a au-dessus de 30, 50, je ne sais pas. Nous, c'est un peu spécifique parce qu'on est sur d'autres formats d'abonnement et qu'on inclut de la maintenance, etc., mais je pense qu'on sera plutôt sur les fourchettes hautes, on pense, par exemple. Ouais, voilà, entre 10, 15, 20, je ne sais pas.


Ouais, c'est ça, je pense qu'on sera plutôt tenté d'avoir des frangettes des ordres de grandeur qui sont hauts, effectivement. Parce que je pense qu'en termes de temps de développement, on aura...


Disons qu'en termes de temps pur de développement, je pense qu'on sera aux alentours de...


Je vais pas te dire de bêtises, mais tu aurais deux mois potentiellement. Ah ouais, d'accord. Entre un mois et deux mois, et après, en fait, il y a de la partie projet qu'on met dedans et donc, du coup, ça permet de... Mais je te mettrais une timeline aussi pour que t'aies l'ordre de grandeur, une timeline estimative pour que t'aies l'ordre de grandeur et que tu puisses te projeter aussi.


Mais le but, c'est qu'on aille le plus vite possible et que derrière tu en puisses te le mettre dans les mains le plus rapidement possible parce que c'est le meilleur moyen qu'on puisse tester derrière. C'est vrai que c'est compliqué parce qu'il y a de tous les prix parce que ça dépend effectivement des technologies et de l'accompagnement et aussi après de la maintenance du SAV.


maintenant tu sais j'ai pour rien me cacher un peu j'ai tu sais j'avais fait sur malt donc j'ai fait un rendez-vous avec toi et avec deux autres gars aussi un que j'ai complètement mis de côté parce que ben Oui, on avait fait le rendez-vous, puis après c'était à moi de renvoyer un e-mail plus explicatif, plus de « on a passé une heure en vidéo, t'as pas compris un peu ce que j'ai fait ».


Et le deuxième, effectivement, il est tout seul alors que vous, vous êtes en équipe et je pense que c'est bien d'avoir une équipe parce que du coup ça va aller plus vite, il y a des idées complémentaires, des personnalités complémentaires, des compétences complémentaires.


et puis il y a l'accompagnement derrière alors que lui il est tout seul et alors oui effectivement c'est moins cher mais comme tu dis il m'a proposé RT Gol, seulement, donc ça peut être bien. Mais j'ai peur d'être limitée. Je te confirme un peu le sujet. Et pourtant, nous, on s'en sert à Narcissus. Si je pouvais, je te conseillerais d'aller là-dessus. Mais au vu du projet, je te le déconseille fortement.


Et puis oui, après, c'est vrai que l'avantage, c'est que nous, on est plusieurs. Donc, ça permet d'avoir plusieurs cerveaux sur un sujet, donc d'avoir de bonnes idées. Et ça te permet aussi de, quand il y en a un, un truc bête, mais quand il y en a un qui est en vacances et quelqu'un d'autre qui est disconnu.


Exactement, c'est ça, et c'est pour ça qu'il m'a dit un estimatif plus bas mais c'est pas la même, il faut comparer ce qui est comparable et là c'est pas comparable en fait, bien consciente. Mais je ne suis pas du tout contre à payer plus si ça va me faire gagner du temps et que ça va pouvoir s'intégrer mieux dans mes WMS plus tard. Enfin voilà, c'est pour ça que je te dis 6 parce que c'était à peu près son demi, tu vois.


Mais j'ai constat que ce n'est pas du tout le même outil en fait, c'est pour ça. C'est un peu différent. Par exemple, tout ce qui est sujet de fichiers sur la table, tu ne pourras pas le faire. Tout ce qui est de l'import de fichiers, comme tu voudrais le faire, en fait je présuppose qu'il va vouloir faire, c'est qu'en fait il va se servir de la fonctionnalité d'import d'Airtable pour balancer des fichiers en masse dans un... dans une table et en fait ce sera semi-structuré en fait et du coup tu risques d'avoir du travail manuel à certains moments.


Tu risques par exemple d'avoir besoin de retravailler certains chiffres parce qu'on a le même sujet pour Disney où il y avait des centaines de milliers de livrables sur des travaux d'agrandissement des parcs. J'imagine que c'est gigantesque, en gros, ils suivent à la prise qui est installée dans un bâtiment. D'accord, ah ouais. Et en fait, l'import de fichiers ça ne marchait pas, du coup on a dû faire toute une logique d'import avec un système qui retravaille les fichiers pour pouvoir faire en sorte que ça fonctionne correctement.


Donc c'est pour ça que je pense que dans ton cas, il faut vraiment que tu aies quelque chose de custom et après on pourra effectivement les intégrer au WMS derrière. d'accord ok mais c'est pas pour tirer du tout dans les pattes de quelqu'un d'autre mais c'est que je suis convaincu oui oui mais c'est pour ça aussi malgré qu'il soit très gentil très bien il a vite compris aussi mais j'ai peur d'être limité il est tout seul donc du coup


Si j'ai besoin de lui, tout repose sur lui, ça me fait un peu peur parce que c'est quand même un gros outil, ça va être un peu le cœur du métier, si demain ça plante et qu'il… Je sais pas moi, il a fait un burn-out, il est plus là, je sais pas, c'est quand même un peu catacroire.


Je suis consciente qu'il n'était pas cher mais c'est pas ce que je recherche, je veux pas du pas cher, je veux un truc qui est quand même adapté aussi à mon métier quoi, donc... Voilà, je veux un bon rapport qualité-prix, comme tout le monde. Mais je ne veux pas perdre de l'argent à mettre 6-7 000 euros dans un truc et au final ça ne va pas marcher.


Je suis d'accord, mais écoute, avec plaisir, moi je finis ce travail là. Qu'est-ce que je voulais dire ? Si on doit se prévoir un lancement, je pourrais te proposer aussi des dates derrière. D'accord. Au passage, je dis ça, mais je ne sais pas à quelle heure j'arrive, ça va être un peu compliqué. En fait, je suis de passage sur Lyon.


le week-end du 13-14 et du coup peut-être le lundi parce que je suis pas assez sur Lyon parce que je dois descendre à minuit mais en fait je suis là le 13-14 enfin non c'est 14-15 je crois le week-end je sais plus et du coup je serai là j'arrive le vendredi soir mais par contre le début de semaine suivante je pourrais peut-être rester à Lyon s'il faut.


Et bien là je vais au Pays-Bas, du 16 au 20, je suis à Amsterdam, toute la semaine. On se croise juste à Amsterdam il y a une semaine. Ah ouais ? Ouais, c'est pour les vacances, c'est pour aller voir les clients, mais bon, ça va, c'est cool. C'est des bonnes idées. Mais ok, bah écoute, on se trouvera un moment, mais je finis ça rapidement d'ici aujourd'hui ou demain, plutôt demain je pense.


et je t'envoie une proposition et je te propose qu'on se calinjute à un point pour que je te fasse une petite récite rapide, pas aussi longue, mais je te fasse une récite et puis on essaie de voir ensemble. si ça marche pour toi, autant en termes fonctionnels que propositions connaissantes, je crois. Ok, ok, super. Est-ce qu'on peut se mettre ça, est-ce que tu as un créneau, tu penses, par exemple, jeudi ?


jeudi c'est bon ouais ouais dis moi honnêtement je suis assez libre c'est l'un des seuls jours de la semaine attends je regarde ce que des fois je dis oui puis après non Non c'est bon c'est vendredi, c'est bon je dis n'importe quand, en début d'après-midi si ça me va.


au début d'après ça marche pour moi avant 15h j'ai le dispo on peut se mettre à 14h30 par exemple Oui, très bien. Ok. Je t'envoie une. Et du coup, la boîte, tu disais que tu l'avais créée à Dublin à la base ? Ouais, alors en fait, moi je suis habitée en Angleterre jusqu'en 2022. Ok.


Et du coup, avec le Brexit, je ne pouvais pas exercer mon activité en Angleterre. Il fallait une licence européenne de courtage de médicaments. Du coup, je l'ai foutu en Irlande. Et moi je ne pensais pas revenir en France en fait et je suis revenue en France à cause des grossistes que j'ai fait avec mon associé. Donc c'est pour ça que pour le moment j'ai mon entreprise en RWF en Irlande.


Mais vu que j'ai mes licences là-bas, tous mes comptes à signer avec RWE Pharma, c'est un putain de casse-tête de déplacer une entreprise en fait. Une fois que t'as signé des accords de courtage, des... J'ai pas envie, j'ai pas trop envie de revenir sur ce que t'as signé. Donc, c'est un peu complexe. Je suis en train de voir comment faire, si je rebazarre tout en France ou pas. Donc, je ne sais pas si je vais rester en France. Voilà encore donc.


Pour le moment oui, mais voilà. Ok, ça marche. Voilà, t'as du dire en irlandais qu'est-ce qu'elle fait, elle encore... On a des clients à Amsterdam, des clients à droite à gauche, donc ça va. Non, je me demandais parce que j'ai vécu en Irlande, c'est pour ça que je m'inquiète pas du tout. Ah ouais, d'accord ! Où ça ? Dublin ? Dublin. Ah, c'est trop bien, j'aime trop l'Irlande. Ouais, c'est trop cool. Juste le temps, au bout d'un moment...


Oui, mais le soleil il est dans la tête des gens, les gens ils sont trop de bonne humeur, trop cool, enfin j'aime trop l'Irlande, l'Angleterre, j'aime trop. Nous, on a le chocolat et nous, on est des aigris, là. Je ne te le fais pas dire. J'en pense qu'à moi. En plus, moi j'ai une entre deux, ma conjointe. Elle a vécu pendant trois ans en Espagne et elle est revenue en France. C'était un peu difficile.


Ah bah ouais, l'Espagne c'est pareil, ça doit être une... Le soleil il est partout là, dans la tête des gens et... C'est clair, c'est clair. C'est vrai que Dublin j'aime trop, l'Irlande c'est... C'est le choix de toi, c'est le choix de la société. Bon écoute, impeccable. Merci pour ton temps. Je t'envoie ça, on en discute. Si j'ai le temps de te l'envoyer avant le point, j'essaie de le faire parce que c'est quand même plus confortable de le relire avant.


et puis on en discute jeudi, on voit dans quelles directions on va. Allez, et bien super, ça marche. Merci à toi Julien. Merci, merci Julie, à plus. Allez, bon après-midi, salut. Sous-titres réalisés para la communauté d'Amara.org

