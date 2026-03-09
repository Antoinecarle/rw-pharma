# Intro - Alfred x RW Pharma (26 janvier 2026)

## Résumé


#### Présentation d'Alfred

- Alfred est une agence spécialisée dans l'efficience opérationnelle (développement d'outils sur mesure pour les entreprises)
- Fondée début 2024 par Théo et Tony (anciens collègues pendant 4-5 ans)
- L'équipe compte actuellement 9 personnes, principalement basées à Paris, avec un objectif de 15-20 personnes d'ici fin d'année
- Clients variés allant des PME aux grands comptes (Disney, Shadeo, Content Square, Dot)
- Méthodologie axée sur la compréhension des problématiques avant la solution technique
- Technologies utilisées : 50% low-code/no-code (type Airtable), 50% développement classique, avec intégration IA/LLM selon les besoins

#### Contexte RW Pharma

- Julie est courtière en médicaments spécialisée dans l'import parallèle en Europe
- Met en contact des grossistes français avec des importateurs européens (Allemagne, Danemark, Suède, Norvège)
- Profite des différences de prix des médicaments entre pays européens pour faciliter le commerce
- Basée près de Lyon (Macron), mais en expansion avec ouverture de nouveaux entrepôts pharmaceutiques à Reims et Valence
- RW Pharma fait uniquement du courtage sans gestion de stock physique - les clients collectent directement chez les grossistes français

#### Processus actuel et problématiques


Gestion des commandes (début de mois)

- Utilisation actuelle de Google Sheets comme outil principal
- Portfolio produits avec informations : CIP 13, CIP 7, prix d'achat fabricant, disponibilités par grossiste
- Les laboratoires imposent des quotas mensuels par grossiste pour éviter les ruptures de stock
- Collecte manuelle des commandes clients en début de mois (Excel de chaque importateur)
- Process actuel : copier-coller des Excel clients + VLOOKUP pour consolider
- Allocation manuelle des commandes aux différents grossistes français
- Les grossistes peuvent parfois livrer plus que le quota si disponibilité supplémentaire
- Réexport manuel des commandes par grossiste (copier-coller et filtrage)
- Partage via Google Drive dédié par grossiste pour éviter les confusions d'email
- Les commandes évoluent pendant le mois (ajouts de produits, modifications de quantités/prix)

Gestion de l'allocation de stock (fin de mois)

- Réception des stocks collectés par les grossistes français
- Création d'un second fichier avec tableau croisé dynamique pour synthétiser par numéro de lot
- Les numéros de lot sont critiques en pharma pour le traçage et les rappels éventuels
- Process actuel : copier-coller du stock brut, création tableau dynamique, puis copier-coller pour allocation
- VLOOKUP pour récupérer les commandes mensuelles en face de chaque produit
- Allocation manuelle en fonction de critères : taille des lots, prix du produit, préférences clients
- Les petits lots de produits peu chers sont souvent refusés par manque de rentabilité

Problèmes identifiés

- Processus très manuel avec risques d'erreurs multiples
- Impossibilité de former facilement de nouvelles personnes avec le système actuel
- Beaucoup de temps perdu en mise en page et copier-coller
- Double saisie source d'erreurs
- Formats Excel différents selon les clients
- Gestion asynchrone par email source de confusion

#### Solution envisagée


Automatisation possible

- 95% du processus peut être automatisé tout en gardant une interface pour les ajustements manuels
- Import automatique des fichiers Excel clients malgré formats différents
- Classification et consolidation automatique
- Export automatique vers les grossistes
- Interface pour suivre les commandes par mois avec historique
- Possibilité de modifications rapides et flexibles des commandes
- Automatisation partielle de l'allocation selon des règles métier

Architecture technique à valider

- Questionnement sur l'utilisation d'Airtable vs base de données structurée avec interface custom
- Nécessité d'une solution scalable pour la volumétrie future
- Perspective d'interconnexion future avec WMS/ERP des entrepôts
- Besoin potentiel de Business Intelligence pour analyses
- Importance d'une base de données bien structurée comme fondation

Fonctionnalités futures possibles

- Espaces clients avec accès personnalisé
- Ajout de commentaires
- Développements progressifs par étapes
- Connexion future aux systèmes WMS/ERP des entrepôts de Ginkgo, Reims et Valence

#### Prochaines étapes

- [ ] Théo à envoyer un NDA à Julie (aujourd'hui ou demain)
- [ ] Julie à signer le NDA et partager son Google Drive avec les fichiers
- [ ] Théo à préparer un document de réflexion après analyse des fichiers
- [ ] Réunion de suivi programmée mardi prochain à 14h (1 heure)

## Notes

_Aucune note pour ce meeting._

## Transcript


Sous-titres réalisés para la communauté d'Amara.org


Bonjour ! Pardon, désolée, je suis un petit peu à la bourre. C'est pas grave.


Est-ce qu'on peut se tutoyer déjà? Ce sera plus simple. Ouais, très bien. Ce sera plus simple. Ce que je te propose, c'est de me présenter rapidement et présenter ce qu'on fait. Comme ça, t'as un peu de contexte. Et après, m'expliquer un peu le tien pour comprendre où t'en es, ce dont t'as besoin.


pourquoi tu commandes le projet quoi ok ok parfait super pour faire pour faire rapide avec mon associé actuel on vient tous les deux du produit on bossait ensemble dans notre précédente boîte pendant 4-5 ans. On arrive au début, on est parti quand on était une cinquantaine. Et en parallèle de ça, on faisait du freelance pour accompagner des boîtes sur les mêmes sujets que les tiens, ce qu'on appelle de l'efficience opérationnelle.


C'est un terme très pompeux pour dire que, grosso modo, on fait des outils sur mesure pour les boîtes, quoi. Ok. Et aujourd'hui, on a monté une agence, donc on a quitté notre job en tout début 2024, on a monté une agence qui s'appelle Alfred et on fait ça plein temps avec des collaborateurs aussi aujourd'hui.


Donc on est neuf, principalement basé à Paris, et on devrait être entre 15 et 20 en fin d'année. C'est top ! Ouais, on s'amuse bien ! Mais grosso modo, aujourd'hui, on bosse toujours avec des clients de toute taille. Honnêtement, on bosse autant avec de la PME.


du grand compte. Nos clients ça va vraiment du de la PME dans tous les domaines, je suis commissaire priseur, mais du grand compte comme Disney, Shadeo, Content Square, Dot, ces boîtes là. D'accord, ok. Et vous optimisez leur process ? Exactement, pour faire un point rapide méthodo, nous on vient tous les deux du produit avec Tony, donc on a une bonne relation.


Un fort attrait, une forte coloration, à comprendre d'abord les problématiques. C'est pour ça que je te demandais de m'expliquer ton contexte parce qu'on n'est pas du genre à nous dire ok, voilà le cahier des charges, on l'applique, on passe un peu de temps à essayer de comprendre.


vos problématiques, où est-ce que vous allez, quels sont les sujets du futur aussi, pour prendre en compte ça et se dire qu'est-ce qu'il faut faire à court, moyen, long terme et où est-ce qu'on vous apporte de la valeur dans un premier temps. Donc voilà, grosso modo pour le contexte. Ok, d'accord. Et du coup, c'est principalement, vous développez sur des apps style Rtable, c'est du low-code, low-code, c'est ça ? Ouais, du low-code type Rtable, on n'en a pas.


pas mal, on a beaucoup de aussi en fait c'est à peu près 50-50 de low-code voir code aujourd'hui donc on a on va dire 50% de vertible type on va dire et 50% sur des outils un peu plus low-code voir dev quand on a besoin. On a des différentes typologies de profils, on a tendance à faire différentes choses même dans un même projet, on peut arriver à avoir des différents types de profils.


Je te donne un exemple, on peut arriver à avoir du no-code pour du back-office, du code pour des applis terrain, typiquement, et après même du LLM, de l'IA, parce qu'il y a des besoins d'analyse et donc on vient remettre une brique d'automatisation par tube pour faire des analyses.


C'est très varié, honnêtement c'est pareil, on a des projets qui sont déployés sur plus de 1000, 2000 personnes, donc c'est assez varié. d'accord ok ok alors moi c'est simple quand même je me présente rapidement un petit peu mon industrie dans laquelle j'ai évolué


Donc moi en fait je suis courtière en médicaments, si tu veux je peux partager mon écran comme ça je peux montrer un petit peu ce que je... C'est un truc que j'ai fait vraiment rapido juste pour expliquer.


Là, c'est bon, tu vois mon PC ? Oui, nickel. Donc, du coup, moi, je suis courtière en médicaments, et en fait, c'est dans l'import parallèle de médicaments en Europe. Donc en fait, moi je mets en contact des grossistes en médicaments français avec mes clients européens qui sont allemands, danois, suèdes, norvèges, voilà un peu principalement d'Europe du Nord. Ok, j'imagine que c'est basé à Lyon du coup.


Ouais c'est ça, ben en fait, t'as dit quoi, je suis basée à Lyon ? Ouais. Ouais, alors en fait je suis à côté de Lyon, je suis à Macron exactement, je suis dans la campagne. Je vois très bien, mais moi je suis lyonnais de base. Ah d'accord, et là maintenant vous êtes sur Paris, c'est ça ? Ouais c'est ça, mais moi je suis long story short, j'ai fait mes études à Lyon, j'étais à l'INSA sur le campus de la Doha.


Mais ma famille est dans l'un aujourd'hui. Ah bah moi aussi je suis dans l'un, justement. C'est pour ça que je connais très bien. Ah bah voilà. Bah moi je suis où ? Parma, Lyon, ça fait cent ans. J'ai été à l'étranger pendant un moment, je suis revenu en 2022-2023 pour m'associer à d'autres entreprises, mais là l'outil c'est dans un premier temps pour RW Pharma.


donc ma boîte de courtage en médicaments. Donc du coup, comme je te disais, je suis le point de contact entre des grossistes français et mes clients, les importateurs européens. Parce que du coup, comme tu peux le voir sur la carte, un médicament a plusieurs prix dans un pays. En France, il est à 127 euros, en Allemagne, il est à 130. Voilà, donc du coup, on traite des médicaments comme on va traiter du blé ou des actions. Enfin voilà, c'est exactement pareil.


Et donc du coup, moi aujourd'hui, je suis au milieu, c'est RWB et j'ai les grossistes français à gauche et j'ai les importateurs à droite, donc je travaille avec plusieurs pays. Et du coup, la problématique c'est qu'on a des infos qui arrivent de tous les côtés. J'ai des e-mails, des appels, des visios. Donc côté client, on va me demander la dispo de tel produit, le prix de tel produit.


J'ai plein de demandes côté client et après côté fournisseur, c'est pareil. On va me proposer des nouveaux produits. Julie, on a accès à ce nouveau produit, est-ce que tu peux me le proposer ? Vu que je suis un peu au milieu, je gère un peu le poids de contact de tout le monde et du coup j'ai beaucoup de d'atteints à...


Et du coup, je dois gérer les commandes parce que ces gros sites-là, c'est d'importateurs. En fait, on travaille sur un cycle mensuel. Donc, en début de mois, ils m'envoient leurs commandes. Aujourd'hui, je travaille sur Google Sheets, je vais te montrer après. Et du coup, je saisis les commandes de tout le monde. Et après, j'alloue, je redivise les commandes et je les envoie aux grossistes français.


Voilà. Et donc du coup, là, voilà, je peux te montrer rapidement mon Google Sheets. J'en ai un peu honte parce que ça part dans tous les sens. Et du coup, en fait, là, aujourd'hui, je m'en sors parce que je suis toute seule. Mais là on grossit beaucoup, je suis en train de m'associer, d'ouvrir de nouveaux entrepôts pharmaceutiques et si je veux recruter des gens, former des gens, il faut un outil simple.


Il ne faut pas une usine de gaz comme mon bordel, donc du coup, je voudrais simplifier tout ça. Tu vois mon Google Sheets ? C'est bon ? Oui, nickel. Je vais essayer de faire simple, donc du coup, moi, je travaille beaucoup par produit. Donc, en fait, on parle beaucoup d'un produit. Donc là, par exemple, tu m'arrêtes si ça va trop vite ou si... Ça va, on a l'habitude.


Je t'arrête là s'il y a besoin. Mais du coup, donc là c'est Abba Saglar par exemple, c'est un produit. Là, en fait, c'est un peu ma bible, c'est mon porte-foulie aux produits. Donc, les premières colonnes, ça va être la fiche pour du produit, donc le CIP 13, le CIP 7, le Inambordible.


produits, blablabla, et après, en fait, là, j'ai le prix d'achat. FHT, c'est le fabricant, et là, c'est mon best price, là. Et après, du coup, quand je vais sur la droite... en fait c'est la misère. Donc là j'ai tous les grossistes français, voilà. Donc là j'ai Epsilon, Ginkgo, voilà. La AVI c'est la disponibilité, donc par exemple la Saglar, Epsilon, par mois il en a 292 parce qu'en fait...


Dans l'industrie pharma, il y a beaucoup de ruptures de médicaments, donc pour ne pas aller à ça, les labos mettent des quotas en place pour ne pas qu'on achète des camions de médicaments. Donc du coup, pour chaque grossiste, j'ai leurs ISPO, leur AIV.


Donc là, Epsilon AIV 292, Ginkgo AIV 94. Et après, en face, donc ça c'est fixe en fait, sous CD Heavy, ça ne bouge pas. Tous les mois, c'est les mêmes. Mais par contre, ce qui va changer, c'est les orders et les prices tous les mois. Voilà. Et donc du coup, les premières colonnes, là, c'est les grossistes français. S.O.S.N.A, c'est les grossistes français. C'est toi qui j'achète.


Et à partir de la ligne rouge, là on passe côté importateur. Donc là c'est mes clients. Orifarm, c'est une grosse entreprise danoise. MTS, c'est une grosse entreprise allemande. Et du coup là en fait, je collecte ici toutes les commandes. Donc en début de mois, les clients m'envoient leurs commandes en Excel. Et là, c'est tout à la mano, donc je copie l'Excel ici.


Et je fais un vieux V-look-up, et après, je copy-colle, en fait, ça me rend. L'Excel, de leur côté, il vient de leur outil A.E., ou est-ce qu'ils les reconstituent manuellement ? Dans leurs outils, ils font leurs allocations et ils exportent en Excel et du coup tout le monde envoie leur Excel.


La forme n'est pas la même, mais les infos sont toujours les mêmes. C'est CIP, nom du produit, quantité, prix, minimum de lot. Moi, je l'enlève, mais il faudrait que je le laisse. Mais en tout cas, là je te donne un exemple, c'est Medcorp, MPS c'est pareil, CIP, quantité, prix, Hori Farm, CIP, Internet de main de bord, ça c'est leur truc.


Voilà mais du coup en fait je pourrais très bien imaginer, c'est ce que je rêve un peu, c'est de pouvoir importer automatiquement quand j'ai juste remis en forme très rapidement, supprimé une colonne voilà très rapidement et que je puisse importer dans mon outil.


rapidement les commandes sans faire de copier-coller, de look-up, machin quoi, c'est... Ok, et du coup si je comprends bien, désolée je te coupe en cours de route, si je redis avec mes mots, du coup le CIP13 en l'occurrence c'est ce qui te permet dans 95% du temps de faire des TV look-up dessus pour avoir un ID unique.


Exactement. Du coup, ils t'envoient chacun leurs documents, toi tu fais des Vlookup, tu les mets sur ton tableau là, mais en réalité tu fais un GSheet par mois, justement il s'appelle Janvier, du coup tu fais un GSheet par mois. Exactement ça, c'est un cycle, c'est mon cycle.


Et toi, après, ton travail manuel, c'est de répartir en fonction des availability les commandes sur les différents produits. Donc si t'en as 1900 ou je sais plus combien d'un produit, t'essaies de les répartir. Par contre, le seul truc que je n'ai pas compris, c'est que là, par exemple, sur Epsilon, tu en as 292 qui sont available, mais tu en mets 500. Du coup, c'est quoi le délire particulier ? Alors, en fait, c'est la magie des labos, en fait. Ils nous délivrent en fonction de...


Ça, c'est leur dispo, les vies. Mais des fois, parce qu'ils ont plus de réception ou ils n'ont pas atteint leur target, ils vont ouvrir les vannes et ils vont nous envoyer plus que notre quota. Donc, c'est pour ça que je mets 500 pour dire bon, essayez d'en avoir 500, j'arriverai à les vendre si vous en avez 500.


Des fois je commande un petit peu plus parce que je sais que je peux les vendre alors j'essaye de commander un peu plus quoi, ouais, c'est ça, c'est la suite. des labos quoi. Donc là c'est ma grosse partie, en début de mois c'est ça, c'est réception des commandes.


allocation et après une fois que j'ai alloué mon petit bazar là et ben du coup je fais encore du copier-coller je filtre sur l'équivalent et je fais copier-coller je prends un excel que j'envoie à Simone, que j'envoie à Ginko. Tu redécoupes après derrière pour chacun quoi.


Voilà, donc c'est beaucoup de mise en page qui est relou, il y a un risque d'erreur. Voilà, donc demain, je recrute une personne, enfin voilà, c'est beaucoup d'admin en fait. Je pense qu'avant de recruter, je peux beaucoup optimiser tout ça. C'est juste que j'ai jamais pris le temps de me mettre dessus et de trouver une personne qui m'aidait à développer ce truc, quoi. Mais je pense que c'est faisable, c'est pas ce que je te dis, ça va vite dans ta tête, je pense. Oui, ça va. Mais en fait, dans ma tête, il n'y a même pas besoin de recruter.


si c'est juste pour gérer ça quoi ouais voilà oui oui c'est ça en fait aujourd'hui on peut automatiser 95% du sujet et avoir une interface qui permet quand même de faire du manuel parce que tu auras toujours du manuel sur sur quels sont les choix et les logiques qui sont quand même très palpables. Là, je peux en mettre plus sur celui-ci parce que j'ai mon historique, j'ai l'habitude, etc. Je le connais.


Mais par contre, importer les fichiers, les classifier automatiquement, venir te les remplir et après faire les exports et même l'idéal, c'est que tu leur envoies comment après ? Par mail ? En fait, vu que je n'ai pas beaucoup de grossistes, je n'en ai que 8, pour faciliter les échanges, avant j'envoyais par e-mail, mais les e-mails, ça se perd, et finalement, il avait travaillé avec un ancien Excel, il m'a dit « non, je te l'ai envoyé le dernier ».


Pour éviter tout ça, en fait, à chacun, je leur partage des drives aussi. Donc là, par exemple, c'est Sagittar, et là, je l'ai copié, ça commande de janvier. Comme ça, on parle du même truc. Voilà, et donc du coup, c'est... Voilà, c'est comme ça. Et après, là, c'est la partie commande. Après, je te parlerai de la partie allocation. Mais voilà, la partie commande, c'est comme ça. Donc, en début de mois, je reçois, j'alloue et je renvoie aux grossistes françaises qui doivent commander.


Ok, super clair. Bah ouais, clairement, du coup, en fait, ça, on pourrait très bien lui mettre en place une... En fait, il y a plusieurs possibilités. C'est soit il faut refaire un export et on met ça dans un GSheet, mais bon. Soit on lui met en place une interface où il peut suivre par moi les commandes qui ont été faites et même suivre l'historique si ça l'intéresse. Et si tu as envie de le mettre à disposition, il y a peut-être des cas pour lesquels tu ne voudrais pas le faire.


Oui, effectivement il y a certains qui peuvent avoir accès à tout, d'autres qui peuvent ne pas avoir accès à tout. Mais c'est exactement comme tu dis, parce que dans la commande, il y a la commande initiale et après... Dans le mois, en fait, j'ai des rendez-vous tout le temps avec mes clients, donc je vais ajouter des produits, je vais augmenter des quantités, modifier des prix. Donc c'est pour ça que là, dans ma colonne...


Tu vois, commande initiale et après, tu vois que le 2201, j'ai fait des ajouts. Donc voilà, l'idée c'est, comme tu dis, soit qu'ils aient accès à une commande, qu'ils ont leur espace et qu'ils puissent se connecter, ou alors, soit que je puisse rapidement copier-coller très facilement ici et que eux, ils gardent cette interface-là.


Je ne sais pas, mais voilà, à voir, je pense, dans le temps. De toute façon, ce que j'imagine, c'est peut-être dans un premier temps, faire le gros de la base et après, petit à petit, faire des nouveaux développements, des nouveaux développements. Il ne faut pas que ce soit trop d'un coup. Oui, je pense qu'il y a la base qu'il faut mettre en place. Après on pourra voir, par exemple, si à un moment donné ils veulent rajouter des fonctionnalités pour rajouter des commentaires, je dis n'importe quoi.


Ça, c'est pas plus tard, mais par contre, effectivement, mettre la logique métier de base en place et prioriser, ça peut être très bien. OK. OK. Donc voilà. Et c'est vrai qu'après il faut que les commandes, vu qu'il y a de l'évolution, il faut que ça reste facilement modifiable. Donc là par exemple, que je puisse me connecter sur la commande de Hori Farm et mettre 300 au lieu de 200 très rapidement. Que rien ne soit figé, que je puisse...


Voilà. Faire évoluer la commande des clients. Ok. Voilà. 100%. Ok. Très clair. Et puis après, le gros du mois, je travaille sur ce fichier-là. Jusqu'au milieu de mois et après à la fin du mois, il y a la partie allocation de stock. Et là, la partie allocation de stock, en fin de mois, tous les grossistes français m'envoient le stock qu'ils ont collecté.


suite aux commandes passées et en fait là je fais un deuxième fichier où là ça s'appelle allocation voilà et là c'est pareil c'est encore une autre usine à gaz Donc là, en fait, ce que je fais, je fais un tableau croisé dynamique. Donc là, par exemple, dans un premier temps, mon premier fichier, c'est là. Donc là, je copie le stock.


de tous les grossistes, voilà, de tous les grossistes. Donc là, Abilify, on a regardé tout à l'heure Abilify, ben là c'est Abilify de tout le monde, mais Zezel, il en a tant, de Tello... La problématique dans la pharma, c'est que le numéro de l'eau, c'est très important parce qu'en cas de rappel de l'eau, c'est un lot qui est ciblé.


Quand on repaque un lot, on repaque toujours par numéro d'eau. Donc quand je fais mes allocations, en fait, j'envoie à la fin du mois un espèce, je dois préparer un espèce de bond de livraison. à toi doit me valider. Ok Julie, ça je te prends, ça je te prends, ça je te prends, ça je te prends plus, voilà c'est parce que du coup c'est quand même super technique et alors du coup donc je copie les stocks ici, après je fais mon super tableau croisé dynamique qui lui va me


synthétisé par numéro de lot. Donc là, par exemple, je vais prendre un exemple de lot où il y a beaucoup de quantités. Donc là, femme, pira, le lot machin, le lot tac-tac, et bien là, je peux voir que j'ai plusieurs quantités. de ce lot chez tout le monde. Ensuite, je copie ça et après je fais mes allocations sur ça. Donc là, en fait, tu peux voir par numéro de lot.


du coup j'ai le stock des grossistes français par numéro d'eau et ensuite donc là c'est tout du coup pié-collé en fait, il n'y a pas de formule dedans. Ah oui, tu copie-colle tout à la main ? Ok, d'accord. Là, c'est du copier-coller de mon tableau dynamique. Il y a quelques formules. Les formules, ça va être libellé.


Et comment le client, comment le client en fait parce que du coup là je copie-colle ici et après je vais chercher des formules, tu vois il y a des formules dans Orif, Orifarm. Parce que du coup là, on va rechercher les commandes en face de ce produit, en fait, les commandes du mois en face de ce promis. Donc à Basse-Aglar.


Au Reef Farm, on en avait commandé 1500, donc là je fais VLOOKUP, les commandes reviennent ici à 34 euros. Voilà, là je vois qu'après je vais là, hop, il y avait AXICORP qui en avait commandé 50 à 34 euros. D'accord, tu le fais sur tout le table pour chacun à chaque fois.


Exactement, et après du coup j'alloue à la main, je suis obligée d'allouer. Après je pense que lire, je peux automatiser beaucoup d'allocations. Mais du coup là aujourd'hui je le fais beaucoup à la main, donc j'alloue. Est-ce que tu arriverais à dire la logique que tu suis, grosso modo, pour faire l'allocation ?


Je regarde les tailles des lots, un lot de 100, c'est un bon lot, donc Aurélie Fargne va me le prendre, par contre si c'est un lot de 10... Je sais qu'on va me refuser par exemple Abilify, c'est un produit cher donc c'est possible, mais les produits qui ne sont pas très chers, les petits lots, on en voit bouler.


Voilà, parce que c'est pas cher, il n'y a pas beaucoup de marge, donc on se fait pas chier avec un lot de 10 ou de 15, on s'en fout. Après, je suis sûre que je peux mettre des infos pour dire que je suis ma loue au meilleur offrant, tant de quantités, tant de pourcentages du stock. Je pense qu'on peut automatiser tout ça.


Mais à l'heure actuelle, dans ce fichier, je peux rien faire, quoi, c'est... Ouais, c'est clair. Mais du coup, du coup, OK, bon, ça, effectivement, je pense qu'il y a un travail à faire, qu'il faut gagner pas mal de temps aussi. J'ai une question bête, mais tu gères du stock toi ou c'est envoyé directement ? Tu veux que moi j'en reçois chez moi ? Ouais, est-ce que toi t'as de la gestion d'entrepôt ou tu fais du warehouse management grosso modo pour faire de la gestion ?


en fait là c'est que l'activité de courtage. Après j'ai des entrepôts aussi, pharmaceutiques, où là on a un WMS, un ERP, donc à terme. Mais bon, je ne veux pas trop faire tout de suite une bombe atomique, et c'est pour ça qu'au début je vais d'abord développer la partie courtage de médicaments, et après dans un second temps, effectivement, connecter à notre WMS.


Par exemple, là Jinko, je suis associée dedans et on est en train d'en ouvrir deux autres. Un à Reims et un à Valence, où là je suis associée dedans aussi. Je pourrais faire plus de développement pour qu'il soit rattaché au WMS ou à l'ERP, je ne sais pas encore comment faire tout ça.


Mais en tout cas, RW Pharma, je ne stocke pas de stock physiquement. En fait, c'est les clients au re-farm qui va collecter directement chez les grossistes français. Moi, j'ai des cas de courtage avec eux, ils ont pas le droit de nous court-circuiter.


RWA ne gère pas de stock, mais j'en gère un peu, enfin j'ai quand même du stock parce que tu vois tout ça là, mais c'est plutôt c'est pas la propriétaire du stock, c'est fictif en fait, c'est... Ouais, je m'entraîne. Ouais, j'ai... voilà. Ok. Voilà, voilà.


L'idéal, ce serait de pouvoir importer des commandes facilement, réexporter les allocations que j'ai faites facilement. Parce qu'après, c'est beaucoup de copier-coller, je fais ça tout le temps, je passe un temps dingue et c'est source d'erreur. Ça de la double saisie, c'est ce qu'on voit chez tous nos clients, c'est le classique.


classique de la base de la source d'erreur. Il y a deux sujets de source d'erreur, c'est trois, c'est des fichiers déstructurés, ce qui est un poil moins le cas là. mais de la double saisie, et la troisième c'est les échanges asynchrones. Les échanges asynchrones ? Les échanges asynchrones, les mails, les whatsapp, tout ce qui est échanges asynchrones qui font que...


Au final l'info finit par se perdre quelque part. Oui, c'est ça, oui. Ok. Je me demande si Rtable, c'est vraiment la bonne solution pour des sujets de volumétrie à terme. Et surtout, je pense que tu as besoin d'interfaces un peu spécifiques. L'EQR table ça peut vite devenir limitant en gestion et que tu vas te retrouver dans des mêmes sujets de traverser des tables pour pouvoir recéder de l'information, la remanipuler des tables, où est-ce que tu as besoin d'un truc en particulier.


Mais je peux me tromper donc il faut que je me pose à la tête reposée pour faire la réflexion, ce que je ferai juste après. Mais grosso modo ce que je pense c'est que c'est exactement ce que tu as dit, c'est que déjà de base il faut structurer la donnée, il faut avoir une base qui est structurée et ensuite...


On top de ça, venir mettre une interface qui te permettra de le gérer. Donc à voir si c'est du Rtable ou si c'est vraiment une base structurée sur laquelle après on met une interface par dessus. Enfin c'est pareil, c'est pas un gros sujet. Surtout si c'est dans une logique de un peu moyen-long terme où en gros ça va servir pour d'autres sujets et puis ça pourrait être interconnecté à d'autres choses dans le futur. Et tu aurais peut-être besoin à un terme de faire de la business, enfin de la BI dessus pour pouvoir faire des analyses ou ce genre de sujets.


Je pense qu'il va falloir quelque chose d'un peu structuré, je vais mettre un peu à plat les notes de réunion, je me demande à quel point c'est possible pour toi de m'envoyer un document dans la mesure du possible, si il y a besoin qu'on signe un billet, je t'envoie un billet.


Ouais et ben je veux bien à la limite si on peut signer un truc de confidentialité le plus simple c'est que je te partage carrément le drame quoi Ouais que ce serait top Tu pourrais voir les formules, où est-ce qu'elle va chercher ça Ce serait parfait


Ok, donc on fait ça, donc ce que je fais c'est que moi je t'envoie Andy aujourd'hui ou demain comme ça après tu peux me le partager, je te l'envoie sur RWFarma Je vais trouver ça et ensuite tu peux me le partager et ce qu'on peut faire c'est comme ça c'est fait je te prendrai pas plus de temps parce qu'elle est un point de suivi la semaine prochaine par exemple ou en fonction d'à quel point t'es pressé on peut donner potentiellement fin de semaine.


Oui, et bien non, semaine prochaine c'est très bien parce que là j'arrive dans ma partie allocation et c'est carnage. Oui, semaine prochaine alors. Oui, semaine prochaine, très bien. je sais pas n'importe peut-être à partir de mardi peut-être à mardi


Mardi 14h, très bien. Ok, super. Je nous mets un peu plus de temps pour qu'on ait le temps de dépiler le truc et qu'on... Je nous mets une heure, on verra si on a besoin de temps, mais... Ok. Et je t'envoie une invitation dans la foulée. Ok, super. Super, et comme ça, je signe ton truc et dès que j'ai ça, après je te le partage. Ouais, avec plaisir. L'idée, c'est que tu commences à regarder avant qu'on fasse le call, peut-être, ouais. Ouais, mais je vais même faire un document de réflexion et...


Merci à toi. Bonne fin de journée, ou plutôt bonne après-midi. Merci, ciao.

