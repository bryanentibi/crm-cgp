"""
Enrichissement Pappers - Date de création entreprise
Pour infirmiers, artisans, kinés, ostéos, pharmacies
Lance: python3 enrichir_pappers.py
"""
import requests, json, os, time, re
from datetime import datetime

PAPPERS_KEY = "1bae4d03467627977792308ebe0bf059bedc67d12cac79cf"
DB_URL = "postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@reseau.proxy.rlwy.net:38081/railway"

import psycopg2
from psycopg2.extras import RealDictCursor

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = RealDictCursor
    return conn

def search_pappers(nom, prenom='', ville='', profession=''):
    """Recherche une personne sur Pappers et retourne sa date de création"""
    
    # Construire la query
    q = f"{prenom} {nom}".strip()
    
    # 1. Recherche dirigeant
    try:
        url = "https://api.pappers.fr/v2/recherche-dirigeants"
        params = {
            'api_token': PAPPERS_KEY,
            'q': q,
            'par_page': 5,
            'page': 1
        }
        if ville:
            params['departement'] = ville[:2] if ville[:2].isdigit() else ''
        
        r = requests.get(url, params=params, timeout=10)
        if r.status_code == 200:
            data = r.json()
            resultats = data.get('resultats', [])
            
            for res in resultats:
                # Vérifier que le nom correspond
                res_nom = (res.get('nom', '') or '').upper()
                res_prenom = (res.get('prenom', '') or '').upper()
                
                if res_nom != nom.upper() and nom.upper() not in res_nom:
                    continue
                
                # Trouver l'entreprise avec code NAF professions libérales
                for ent in res.get('entreprises', []):
                    naf = ent.get('code_naf', '')
                    date_creation = ent.get('date_creation', '')
                    
                    # Filtrer par code NAF pertinent
                    naf_ok = any([
                        naf.startswith('86'),  # Santé humaine
                        naf.startswith('96'),  # Services personnels
                        naf.startswith('43'),  # Construction/artisans
                        naf.startswith('33'),  # Réparation
                        naf.startswith('49'),  # Transport
                        naf == '',             # Pas de filtre si pas de NAF
                    ])
                    
                    if date_creation and naf_ok:
                        return {
                            'date_creation': date_creation,
                            'siret': ent.get('siret', ''),
                            'nom_entreprise': ent.get('nom_entreprise', ''),
                            'naf': naf,
                            'forme_juridique': ent.get('forme_juridique', '')
                        }
    except Exception as e:
        pass
    
    # 2. Fallback: recherche entreprise par nom
    try:
        url = "https://api.pappers.fr/v2/recherche"
        params = {
            'api_token': PAPPERS_KEY,
            'q': q,
            'par_page': 3,
            'page': 1,
            'code_naf': '8690A,8690B,8690C,8690D,8690E,8690F,4322A,4321A,4334Z'
        }
        
        r = requests.get(url, params=params, timeout=10)
        if r.status_code == 200:
            data = r.json()
            for res in data.get('resultats', []):
                date_creation = res.get('date_creation', '')
                if date_creation:
                    return {
                        'date_creation': date_creation,
                        'siret': res.get('siret', ''),
                        'nom_entreprise': res.get('nom_entreprise', ''),
                        'naf': res.get('code_naf', ''),
                        'forme_juridique': res.get('forme_juridique', '')
                    }
    except:
        pass
    
    return None

def enrichir_table(table, nom_col='nom', prenom_col='prenom', ville_col='ville', 
                   profession_col=None, limit=None):
    """Enrichit une table PostgreSQL avec les dates de création Pappers"""
    
    conn = get_db()
    cur = conn.cursor()
    
    # Ajouter la colonne date_creation si elle n'existe pas
    try:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS date_creation TEXT")
        cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS siret_pappers TEXT")
        cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS nom_entreprise TEXT")
        conn.commit()
        print(f"✅ Colonnes ajoutées à {table}")
    except Exception as e:
        print(f"Colonnes déjà présentes: {e}")
        conn.rollback()
    
    # Récupérer les contacts sans date_creation
    query = f"""
        SELECT id, {nom_col}, {f'{prenom_col},' if prenom_col else ''} {ville_col}
        {f', {profession_col}' if profession_col else ''}
        FROM {table} 
        WHERE date_creation IS NULL OR date_creation = ''
        ORDER BY id
        {f'LIMIT {limit}' if limit else ''}
    """
    cur.execute(query)
    contacts = cur.fetchall()
    
    print(f"\n📊 {len(contacts)} contacts à enrichir dans {table}")
    
    enrichis = 0
    non_trouves = 0
    
    for i, contact in enumerate(contacts):
        nom = contact.get(nom_col, '') or ''
        prenom = contact.get(prenom_col, '') if prenom_col else ''
        ville = contact.get(ville_col, '') or ''
        profession = contact.get(profession_col, '') if profession_col else ''
        
        if not nom:
            continue
        
        result = search_pappers(nom, prenom or '', ville or '', profession or '')
        
        if result:
            cur.execute(f"""
                UPDATE {table} 
                SET date_creation = %s, siret_pappers = %s, nom_entreprise = %s
                WHERE id = %s
            """, (result['date_creation'], result['siret'], result['nom_entreprise'], contact['id']))
            
            enrichis += 1
            if enrichis % 10 == 0:
                conn.commit()
                print(f"  [{i+1}/{len(contacts)}] +{enrichis} enrichis | {non_trouves} non trouvés")
        else:
            non_trouves += 1
        
        # Pause pour respecter les limites de l'API (1000 req/mois gratuit)
        time.sleep(0.5)
        
        # Afficher progression toutes les 50
        if (i+1) % 50 == 0:
            conn.commit()
            print(f"  [{i+1}/{len(contacts)}] ✅ {enrichis} enrichis | ❌ {non_trouves} non trouvés")
    
    conn.commit()
    conn.close()
    
    print(f"\n✅ {table}: {enrichis} enrichis, {non_trouves} non trouvés")
    return enrichis

def main():
    print("🚀 Enrichissement Pappers - Dates de création")
    print(f"📅 {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    
    total = 0
    
    # 1. Infirmiers (priorité 1)
    print("\n" + "="*50)
    print("1️⃣ INFIRMIERS")
    n = enrichir_table('sante', nom_col='nom', prenom_col='prenom', ville_col='ville')
    total += n
    
    # 2. Artisans (priorité 2)
    print("\n" + "="*50)
    print("2️⃣ ARTISANS")
    n = enrichir_table('artisans', nom_col='nom', prenom_col=None, ville_col='ville',
                      profession_col='profession')
    total += n
    
    # 3. Pharmacies
    print("\n" + "="*50)
    print("3️⃣ PHARMACIES")
    n = enrichir_table('pharmacies', nom_col='nom', prenom_col='dirigeant', ville_col='ville')
    total += n
    
    print(f"\n🎉 TOTAL ENRICHI: {total} contacts")

if __name__ == '__main__':
    main()
