# CRM CGP — Prospection Professionnels de Santé

Outil de prospection pour conseiller en gestion de patrimoine ciblant les professionnels de santé libéraux (infirmiers, kinés, médecins, dentistes, pharmaciens...).

---

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances
pip3 install -r requirements.txt

# 2. Lancer le serveur
python3 app.py

# 3. Ouvrir dans le navigateur
# → http://localhost:5000
```

---

## 📁 Structure du projet

```
crm_cgp/
├── app.py                    # Serveur Flask (API)
├── requirements.txt          # Dépendances Python
├── data/
│   ├── pharmacies.json       # 25 472 pharmacies (ton fichier)
│   └── professionnels_sante.json   # Pros de santé scrapés
├── scrapers/
│   ├── rpps.py               # Scraper RPPS / eS-Santé (officiel)
│   ├── annuairesante.py      # Scraper Annuaire Santé AMELI
│   └── enrichissement.py     # Recherche numéros directs (06/07)
└── static/
    └── index.html            # Interface CRM
```

---

## 🔄 Sources de scraping

| Source | Données | Fréquence |
|--------|---------|-----------|
| **RPPS / eS-Santé** | Tous pros de santé France, RPPS, adresse | Mensuelle |
| **Annuaire Santé AMELI** | Libéraux conventionnés, mode d'exercice | Mensuelle |
| **Pages Jaunes** | Enrichissement numéro direct (06/07) | À la demande |
| **Doctolib** | Numéro visible sur profil public | À la demande |

---

## 📊 Fonctionnalités CRM

- **Table de prospection** avec filtres par spécialité, statut, département
- **Mise à jour statut** : Nouveau → Contacté → Intéressé → Client
- **Notes d'appel** par contact
- **Export CSV** de n'importe quelle liste filtrée
- **Enrichissement 06** : cherche le numéro direct automatiquement
- **Tableau de bord** avec stats et pipeline

---

## 🌍 Accès depuis Bali

### Option 1 : ngrok (rapide)
```bash
# Sur ton PC en France
python3 app.py &
ngrok http 5000
# → URL publique type https://abc123.ngrok.io
```

### Option 2 : Railway.app (hébergement cloud, recommandé)
```bash
# Dans le dossier crm_cgp
railway init
railway up
# → URL publique permanente
```

### Option 3 : Render.com
- Mettre le projet sur GitHub (privé)
- Créer un service Web sur render.com
- Déploiement automatique

---

## 💊 Fichier pharmacies

Le fichier `data/pharmacies.json` contient les 25 472 pharmacies converties depuis ton PHARMACIES.xls avec :
- Nom, adresse, CP, ville
- Téléphone fixe (formaté)
- Email
- Dirigeant (64% des fiches)
- Forme juridique, SIRET, CA, effectif

**Enrichissement des 06 directs** : Via le bouton "Enrichir 06" dans l'interface, le scraper cherche le numéro mobile du dirigeant sur Pages Jaunes par lot de 20.

---

## 📞 Stratégie prospection recommandée

1. **Scrape chaque matin** → Nouveaux inscrits RPPS
2. **Filtre infirmiers libéraux** → Ceux sans date de début ancienne
3. **Lance enrichissement** → Cherche leur 06
4. **Appel dans les 72h** → Taux de conversion maximal sur débutants
5. **Marque statut** après chaque appel

---

## 🛠️ Configuration avancée

### Scraping automatique chaque matin (Linux/Mac)
```bash
# Ajouter dans crontab (crontab -e)
0 7 * * 1-5 cd /chemin/vers/crm_cgp && python3 scrapers/rpps.py >> logs/scraping.log 2>&1
```

### Variables d'environnement
```bash
export CRM_PORT=5000        # Port du serveur
export CRM_HOST=0.0.0.0    # Écouter sur toutes les interfaces
```
