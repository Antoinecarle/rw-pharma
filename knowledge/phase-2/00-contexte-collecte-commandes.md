# Contexte : Collecte des commandes (debut de mois)

## Processus actuel detaille

### Etape par etape
1. **Debut de mois** : Julie envoie a chaque client importateur la liste des produits disponibles avec les quotas
2. **Retour clients** : Chaque client renvoie un fichier Excel avec sa commande
3. **Formats heterogenes** : Chaque client utilise un format different (colonnes, nommage, ordre)
4. **Consolidation manuelle** : Julie copie-colle chaque Excel dans son fichier maitre (feuille SALES)
5. **VLOOKUP** : Elle utilise des formules pour consolider les commandes vs quotas grossistes
6. **Allocation aux grossistes** : Elle repartit manuellement les commandes entre les grossistes
7. **Export par grossiste** : Elle copie-colle et filtre pour creer un fichier par grossiste
8. **Partage** : Elle partage chaque fichier via un Google Drive dedie par grossiste

### Fichier de reference : JANVIER_ORDER_26.xlsx

**Feuille SALES (feuille principale) :**
- ~1760 lignes de produits (tout le catalogue RW Pharma)
- ~116 colonnes reparties entre :
  - Donnees produit : CIP13, CIP7, nom, laboratoire, PFHT
  - Quotas par grossiste : quantites disponibles par grossiste francais
  - Commandes par client : colonnes dediees a chaque importateur

**Feuilles clients (formats heterogenes) :**
- Chaque client a sa propre feuille avec un format different
- Mais tous partagent les donnees essentielles : CIP (13 ou 7), produit, quantite, prix

## Donnees essentielles a mapper

| Champ | Obligatoire | Description | Exemples de noms dans les Excel clients |
|---|---|---|---|
| CIP13 | Oui | Code medicament 13 chiffres | CIP13, CIP, Code CIP, Product Code, Artikelnummer |
| Nom produit | Non | Nom commercial | Product, Name, Designation, Produkt |
| Quantite | Oui | Nombre commande | Qty, Quantity, Quantite, Menge, Bestell |
| Prix unitaire | Oui | Prix souhaite | Price, Unit Price, Prix, Preis, Einkaufspreis |
| CIP7 | Non | Code court | CIP7, Short Code |
| EUNB | Non | N° europeen | EUNB, EU Number |
| Date exp min | Non | Expiration minimale | Expiry, Min Expiry, MHD |
| Notes | Non | Commentaires | Notes, Comments, Bemerkung |

## Regles metier des commandes

1. **Les commandes evoluent pendant le mois** : Un client peut modifier ses quantites/prix en cours de mois
2. **Quotas grossistes** : Imposes par les laboratoires, ne peuvent etre depasses (sauf extra)
3. **Un grossiste peut livrer plus** : Si disponibilite supplementaire, le quota est un minimum garanti
4. **Produits ANSM** : Certains medicaments sont interdits a l'export (liste mise a jour regulierement)
5. **Formats variables** : Certains clients envoient en CSV, d'autres en XLSX, avec des colonnes dans un ordre aleatoire

## Approche technique pour le mapping

### Strategie a 3 niveaux
1. **Mapping memorise** (priorite) : Pour chaque client, sauvegarder le mapping une fois configure
   - Stocker dans `customers.excel_column_mapping` (JSONB)
   - Format : `{"cip13": "Code CIP", "quantity": "Menge", "unit_price": "Preis"}`
2. **Detection IA** (fallback) : Si nouveau format, utiliser Claude API pour detecter les colonnes
   - Envoyer les 5 premieres lignes + headers au LLM
   - Demander de mapper vers le schema cible
3. **Mapping manuel** (dernier recours) : Interface drag & drop pour mapper les colonnes

### Validation post-import
- Verifier que tous les CIP13 existent dans le catalogue
- Alerter si un prix est > 20% different du PFHT
- Alerter si la quantite totale depasse le quota disponible
- Detecter les doublons (meme produit, meme client)
