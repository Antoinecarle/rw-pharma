# Automatisations & Polish - Details (Phase 4)

## 1. Liste ANSM - Produits interdits

### Qu'est-ce que l'ANSM ?
L'Agence Nationale de Securite du Medicament publie regulierement une liste des medicaments en rupture de stock ou en tension d'approvisionnement. Ces medicaments sont **interdits a l'export** pour proteger le marche francais.

### Implementation
- Source : Site web ANSM (format CSV/Excel ou scraping)
- Frequence de mise a jour : hebdomadaire
- Action : Mettre a jour le flag `is_ansm_blocked` sur les produits
- Blocage : Empecher toute allocation de produits bloques
- Alerte : Notification si un produit commande est ajoute a la liste en cours de mois

### Table
```sql
CREATE TABLE ansm_blocked_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cip13 VARCHAR(13) NOT NULL,
  product_name VARCHAR(500),
  blocked_since DATE NOT NULL,
  unblocked_at DATE,                   -- NULL si toujours bloque
  source_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 2. Documents clients reglementaires

### Types de documents
- **WDA** (Wholesale Distribution Authorization) : Autorisation de distribution en gros - delivree par l'autorite competente du pays du client
- **GDP Certificate** (Good Distribution Practice) : Certificat de conformite aux bonnes pratiques de distribution

### Implementation
- Upload dans Supabase Storage : `documents/{customer_code}/{document_type}_{date}.pdf`
- Metadata dans `customers.metadata` : `{ "wda": { "path": "...", "expiry": "2027-06-30" }, "gdp": { ... } }`
- Alerte 30 jours avant expiration
- Vue rapide depuis la fiche client

## 3. Historique mensuel

### Fonctionnalites
- Chaque mois est un "cycle" autonome avec ses commandes et allocations
- Navigation par calendrier (selectionner un mois)
- Statuts du mois : draft → collecting → consolidated → allocated → exported → closed
- Un mois cloture est en lecture seule
- Possibilite de dupliquer les donnees de reference d'un mois precedent

### Implementation
- La table `monthly_orders` sert de pivot
- Toutes les donnees (order_lines, collected_stock, allocations) sont liees au mois
- Filtrage par `monthly_order_id` pour isoler chaque mois

## 4. Dashboard KPIs

### KPIs principaux
| KPI | Calcul | Graphique |
|---|---|---|
| Volume commande | SUM(order_lines.quantity) | Bar chart par client |
| Volume alloue | SUM(allocations.quantity) | Bar chart par client |
| Taux satisfaction | alloue / commande * 100 | Gauge ou progress bar |
| Stock non alloue | stock - alloue | Bar chart |
| CA mensuel | SUM(allocations.quantity * unit_price) | Line chart (evolution) |

### KPIs secondaires
| KPI | Calcul |
|---|---|
| Top 10 produits | ORDER BY SUM(quantity) DESC LIMIT 10 |
| Taux refus par client | refus / total * 100 |
| Repartition par pays | GROUP BY customer.country |
| Produits ANSM bloques | COUNT WHERE is_ansm_blocked |

## 5. Notifications

### Types d'alertes

**Critiques (rouge) :**
- Produit ajoute a la liste ANSM en cours de mois
- Document client (WDA/GDP) expire
- Quota grossiste depasse

**Operationnelles (orange) :**
- Client n'a pas envoye sa commande (J+5, J+10 du mois)
- Grossiste n'a pas envoye son stock (J+20)
- Allocation commencee mais non finalisee depuis 48h
- Export non effectue pour un client

**Informatives (bleu) :**
- Nouveau mois demarre
- Import de commande reussi
- Allocation terminee
- Export genere

### Implementation Supabase
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) CHECK (type IN ('critical', 'warning', 'info')),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  monthly_order_id UUID REFERENCES monthly_orders(id),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Utiliser Supabase Realtime pour les notifications push
- Ou polling toutes les 30 secondes (plus simple)
