"""
Enrichissement societe.com - Date de création entreprise
Pour infirmiers, artisans, kinés, ostéos, pharmacies
Lance: python3 enrichir_societe.py
"""
import requests, json, os, time, re
from datetime import datetime
from bs4 import BeautifulSoup

DB_URL = "postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@reseau.proxy.rlwy.net:38081/railway"

import psycopg2
from psycopg2.extras import RealDictCursor

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9',
}

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = RealDictCursor
    return conn

def search_societe(nom, prenom='', ville=''):
    """Cherche sur societe.com et retourne date de création + SIREN"""
    
    query = f"{prenom} {nom}".strip().replace(' ', '+')
    url = f"https://www.societe.com/cgi-bin/search?champs={query}"
    
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None
        
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Chercher les résultats
        results = soup.select('.search-results-list .company-item, .liste_resultat li, .rs')
        
        for result in results[:3]:
            text = result.get_text(' ', strip=True)
            
            # Vérifier que le nom correspond
            if nom.upper() not in text.upper():
                continue
            
            # Chercher la date de création dans le texte
            date_match = re.search(r'[Cc]réée?\s+le\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4})', text)
            if not date_match:
                date_match = re.search(r'(\d{4})', text)
            
            # Chercher le SIREN
            siren_match = re.search(r'\b(\d{9})\b', text)
            siren = siren_match.group(1) if siren_match else ''
            
            # Chercher le lien vers la fiche
            link = result.select_one('a[href*="/societe/"]')
            if link:
                href = link.get('href', '')
                # Aller sur la fiche pour avoir la vraie date
                fiche = get_fiche_societe(href)
                if fiche:
                    return fiche
            
            if date_match:
                return {
                    'date_creation': date_match.group(1),
                    'siren': siren,
                    'nom_entreprise': ''
                }
        
        return None
        
    except Exception as e:
        return None

def get_fiche_societe(url):
    """Récupère les infos depuis la fiche societe.com"""
    
    if not url.startswith('http'):
        url = 'https://www.societe.com' + url
    
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None
        
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Date de création
        date_creation = ''
        
        # Pattern 1: "DATE DE CREATION" label
        for el in soup.find_all(['dt', 'th', 'div', 'span', 'label']):
            if 'création' in el.get_text().lower() or 'creation' in el.get_text().lower():
                # Chercher la valeur à côté
                next_el = el.find_next_sibling() or el.find_next()
                if next_el:
                    date_text = next_el.get_text(strip=True)
                    date_match = re.search(r'(\d{1,2}\s+\w+\s+\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4})', date_text)
                    if date_match:
                        date_creation = date_match.group(1)
                        break
        
        # Pattern 2: chercher dans tout le HTML
        if not date_creation:
            date_matches = re.findall(r'(?:créée? le|création)[^\d]*(\d{1,2}\s+\w+\s+\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{4})', r.text, re.IGNORECASE)
            if date_matches:
                date_creation = date_matches[0]
        
        # SIREN depuis l'URL
        siren_match = re.search(r'-(\d{9})\.html', url)
        siren = siren_match.group(1) if siren_match else ''
        
        # Nom entreprise
        title = soup.select_one('h1, .company-name, #identite_denomination')
        nom_ent = title.get_text(strip=True) if title else ''
        
        if date_creation:
            return {
                'date_creation': date_creation,
                'siren': siren,
                'nom_entreprise': nom_ent[:100]
            }
        return None
        
    except Exception as e:
        return None

def add_columns(conn, table):
    """Ajoute les colonnes nécessaires si elles n'existent pas"""
    cur = conn.cursor()
    for col, dtype in [
        ('date_creation', 'TEXT'),
        ('siren_societe', 'TEXT'),
        ('nom_entreprise_societe', 'TEXT')
    ]:
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {dtype}")
        except:
            conn.rollback()
    conn.commit()

def enrichir_table(table, nom_col, prenom_col=None, ville_col='ville', limit=None):
    """Enrichit une table PostgreSQL avec les dates de création"""
    
    conn = get_db()
    add_columns(conn, table)
    cur = conn.cursor()
    
    # Contacts sans date_creation
    cols = f"id, {nom_col}"
    if prenom_col:
        cols += f", {prenom_col}"
    cols += f", {ville_col}"
    
    q = f"""
        SELECT {cols} FROM {table}
        WHERE (date_creation IS NULL OR date_creation = '')
        AND {nom_col} IS NOT NULL AND {nom_col} != ''
        ORDER BY id
        {f'LIMIT {limit}' if limit else ''}
    """
    cur.execute(q)
    contacts = list(cur.fetchall())
    print(f"📊 {len(contacts)} contacts à enrichir dans {table}")
    
    enrichis = 0
    non_trouves = 0
    
    for i, contact in enumerate(contacts):
        nom = contact.get(nom_col, '') or ''
        prenom = contact.get(prenom_col, '') if prenom_col else ''
        ville = contact.get(ville_col, '') or ''
        
        if not nom or len(nom) < 2:
            continue
        
        result = search_societe(nom, prenom or '', ville or '')
        
        if result and result.get('date_creation'):
            cur.execute(f"""
                UPDATE {table}
                SET date_creation = %s,
                    siren_societe = %s,
                    nom_entreprise_societe = %s
                WHERE id = %s
            """, (
                result['date_creation'],
                result.get('siren', ''),
                result.get('nom_entreprise', ''),
                contact['id']
            ))
            enrichis += 1
            
            if enrichis % 20 == 0:
                conn.commit()
        else:
            non_trouves += 1
        
        # Afficher progression
        if (i+1) % 20 == 0 or (i+1) == len(contacts):
            conn.commit()
            pct = round((i+1)/len(contacts)*100)
            print(f"  [{i+1}/{len(contacts)}] {pct}% | ✅ {enrichis} trouvés | ❌ {non_trouves} non trouvés")
        
        time.sleep(1.0)  # 1 seconde entre requêtes
    
    conn.commit()
    conn.close()
    
    print(f"\n✅ {table}: {enrichis}/{len(contacts)} enrichis")
    return enrichis

def main():
    print("🚀 Enrichissement societe.com - Dates de création")
    print(f"📅 {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    
    total = 0
    
    # 1. Infirmiers
    print("\n" + "="*50)
    print("1️⃣  INFIRMIERS / SANTE")
    n = enrichir_table('sante', nom_col='nom', prenom_col='prenom', ville_col='ville')
    total += n
    
    # 2. Artisans
    print("\n" + "="*50)
    print("2️⃣  ARTISANS")
    n = enrichir_table('artisans', nom_col='nom', prenom_col=None, ville_col='ville')
    total += n
    
    # 3. Pharmacies
    print("\n" + "="*50)
    print("3️⃣  PHARMACIES")
    n = enrichir_table('pharmacies', nom_col='nom', prenom_col='dirigeant', ville_col='ville')
    total += n
    
    print(f"\n🎉 TOTAL: {total} contacts enrichis")

if __name__ == '__main__':
    main()
