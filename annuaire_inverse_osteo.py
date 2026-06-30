"""
Annuaire inversé Pages Jaunes - Retrouve les noms des contacts sans nom
Lance: python3 annuaire_inverse_osteo.py
"""
import requests, re, time, os
from bs4 import BeautifulSoup

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@reseau.proxy.rlwy.net:38081/railway')

import psycopg2
from psycopg2.extras import RealDictCursor

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'fr-FR,fr;q=0.9',
}

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = RealDictCursor
    return conn

def annuaire_inverse(numero):
    """Cherche un numéro sur l'annuaire inversé Pages Jaunes, retourne (nom, prenom) ou None"""
    numero_clean = re.sub(r'[\s\.\-]', '', numero)
    if len(numero_clean) != 10:
        return None

    try:
        url = f"https://www.pagesjaunes.fr/annuaireinverse/recherche?quoiqui={numero_clean}"
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return None

        soup = BeautifulSoup(r.text, 'html.parser')

        # Chercher le nom dans les balises typiques de résultat
        nom_el = soup.select_one('.denomination-links, .bi-denomination, h1.noTrad, .nom-resultat')
        if nom_el:
            full_name = nom_el.get_text(strip=True)
            parts = full_name.split(' ', 1)
            if len(parts) == 2:
                return {'nom': parts[0], 'prenom': parts[1]}
            return {'nom': full_name, 'prenom': ''}

        return None
    except Exception:
        return None

def enrichir_noms_osteo():
    print("🔍 Annuaire inversé - Recherche des noms d'ostéopathes")
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, telephone_direct FROM sante
        WHERE specialite = 'Ostéopathe'
        AND (nom IS NULL OR nom = '')
        AND telephone_direct IS NOT NULL AND telephone_direct != ''
        LIMIT 200
    """)
    contacts = list(cur.fetchall())
    print(f"📊 {len(contacts)} ostéopathes sans nom à identifier")

    trouves = 0
    for i, c in enumerate(contacts):
        result = annuaire_inverse(c['telephone_direct'])
        if result and result.get('nom'):
            cur.execute("UPDATE sante SET nom=%s, prenom=%s WHERE id=%s",
                       (result['nom'], result.get('prenom', ''), c['id']))
            trouves += 1
            print(f"  ✅ {c['telephone_direct']} -> {result['nom']} {result.get('prenom','')}")
        
        if (i+1) % 20 == 0:
            conn.commit()
            print(f"  [{i+1}/{len(contacts)}] {trouves} noms trouvés")
        
        time.sleep(1.2)  # Respecter le site

    conn.commit()
    conn.close()
    print(f"\n🎉 {trouves}/{len(contacts)} noms identifiés via annuaire inversé")

if __name__ == '__main__':
    enrichir_noms_osteo()
