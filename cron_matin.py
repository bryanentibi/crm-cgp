"""
Job automatique Railway - Lance chaque matin à 8h
1. Scraping Google Places nouveaux artisans
2. Scraping osteopathie.org nouveaux ostéopathes
3. Enrichissement INSEE dates de création
"""
import requests, json, os, time, re
from datetime import datetime, date
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@postgres.railway.internal:5432/railway')
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY', 'AIzaSyCDvhSqEYjeGhGDiTgc3DNW6Ns4kYMqczY')

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = RealDictCursor
    return conn

# ── PARTIE 1 : Google Places nouveaux artisans ──

VILLES = [
    ("Paris", 48.8566, 2.3522), ("Lyon", 45.7640, 4.8357),
    ("Marseille", 43.2965, 5.3698), ("Toulouse", 43.6047, 1.4442),
    ("Bordeaux", 44.8378, -0.5792), ("Nantes", 47.2184, -1.5536),
    ("Strasbourg", 48.5734, 7.7521), ("Lille", 50.6292, 3.0573),
    ("Rennes", 48.1173, -1.6778), ("Nice", 43.7102, 7.2620),
    ("Toulon", 43.1242, 5.9280), ("Grenoble", 45.1885, 5.7245),
    ("Montpellier", 43.6108, 3.8767), ("Reims", 49.2583, 4.0317),
    ("Aix-en-Provence", 43.5297, 5.4474), ("Angers", 47.4784, -0.5632),
    ("Dijon", 47.3220, 5.0415), ("Saint-Etienne", 45.4397, 4.3872),
    ("Le Havre", 49.4944, 0.1079), ("Clermont-Ferrand", 45.7772, 3.0870),
]

PROFESSIONS_ARTISANS = [
    ("plombier", "Plombier"), ("serrurier", "Serrurier"),
    ("electricien", "Electricien"), ("peintre batiment", "Peintre"),
    ("macon", "Macon"), ("menuisier", "Menuisier"),
    ("chauffagiste", "Chauffagiste"), ("carreleur", "Carreleur"),
    ("couvreur", "Couvreur"), ("jardinier paysagiste", "Jardinier"),
    ("coiffeur", "Coiffeur"),
]

tel_re = re.compile(r'0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}')

def fmt_tel(t):
    t = re.sub(r'[\s\.\-]', '', t.strip())
    return ' '.join([t[i:i+2] for i in range(0, 10, 2)]) if len(t) == 10 else t

def scrape_google_places():
    print("\n🔧 SCRAPING GOOGLE PLACES - ARTISANS")
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT telephone_direct FROM artisans WHERE telephone_direct IS NOT NULL")
    seen_tels = {r['telephone_direct'] for r in cur.fetchall()}
    print(f"📊 {len(seen_tels)} tels existants")

    total_new = 0
    today = date.today().isoformat()

    # On tourne sur un sous-ensemble différent chaque jour pour varier (basé sur le jour de l'année)
    day_offset = date.today().timetuple().tm_yday
    villes_today = VILLES[day_offset % len(VILLES):] + VILLES[:day_offset % len(VILLES)]

    for prof_query, prof_label in PROFESSIONS_ARTISANS:
        prof_new = 0
        for ville_name, lat, lng in villes_today[:8]:  # 8 villes par jour pour rester rapide
            try:
                url = "https://places.googleapis.com/v1/places:searchText"
                headers = {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_API_KEY,
                    "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.addressComponents"
                }
                body = {
                    "textQuery": f"{prof_query} {ville_name}",
                    "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 15000}},
                    "maxResultCount": 20, "languageCode": "fr"
                }
                r = requests.post(url, headers=headers, json=body, timeout=15)
                if r.status_code != 200:
                    continue

                places = r.json().get('places', [])
                for place in places:
                    tel_raw = place.get('nationalPhoneNumber', '')
                    tels = tel_re.findall(tel_raw)
                    if not tels:
                        continue
                    tel = fmt_tel(tels[0])
                    if not tel.startswith(('06', '07')) or tel in seen_tels:
                        continue

                    nom = place.get('displayName', {}).get('text', '')[:60]
                    adresse = place.get('formattedAddress', '')
                    cp = ''
                    ville = ville_name
                    for comp in place.get('addressComponents', []):
                        if 'postal_code' in comp.get('types', []):
                            cp = comp.get('longText', '')
                        if 'locality' in comp.get('types', []):
                            ville = comp.get('longText', '')

                    seen_tels.add(tel)
                    cur.execute("""
                        INSERT INTO artisans (nom, profession, telephone_direct, adresse, ville, cp, source, statut, note, date_ajout)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (nom, prof_label, tel, adresse, ville, cp, 'Google Places', '', '', today))
                    prof_new += 1
                    total_new += 1

                time.sleep(0.3)
            except Exception:
                continue

        if prof_new > 0:
            print(f"  {prof_label}: +{prof_new} nouveaux")
        conn.commit()

    conn.close()
    print(f"✅ Google Places: {total_new} nouveaux artisans")
    return total_new

# ── PARTIE 2 : Ostéopathes ROF (osteopathie.org) ──

DEPTS_CYCLE = [str(i).zfill(2) for i in range(1, 96)] + ['971', '972', '973', '974']

def scrape_osteopathes():
    print("\n🦴 SCRAPING OSTEOPATHIE.ORG")
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT telephone_direct FROM sante WHERE telephone_direct IS NOT NULL")
    seen_tels = {r['telephone_direct'] for r in cur.fetchall()}
    print(f"📊 {len(seen_tels)} tels existants en santé")

    total_new = 0
    today = date.today().isoformat()

    # On scanne 10 départements différents chaque jour (rotation)
    day_offset = date.today().timetuple().tm_yday
    start_idx = (day_offset * 10) % len(DEPTS_CYCLE)
    depts_today = (DEPTS_CYCLE[start_idx:] + DEPTS_CYCLE[:start_idx])[:10]

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
    }

    for dept in depts_today:
        try:
            url = f"https://www.osteopathie.org/?fond=annuaire&departement={dept}&pays=France+m%C3%A9tropolitaine&page=1"
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code != 200:
                continue

            tels = tel_re.findall(r.text)
            count = 0
            for t in tels:
                tel = fmt_tel(t)
                if tel.startswith(('06', '07')) and tel not in seen_tels:
                    seen_tels.add(tel)
                    cur.execute("""
                        INSERT INTO sante (nom, prenom, specialite, telephone_direct, cp, statut, note, date_ajout)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """, ('', '', 'Ostéopathe', tel, dept, '', '', today))
                    count += 1
                    total_new += 1

            if count > 0:
                print(f"  Dept {dept}: +{count}")
            conn.commit()
            time.sleep(0.8)
        except Exception:
            continue

    conn.close()
    print(f"✅ Ostéopathes: {total_new} nouveaux")
    return total_new

# ── PARTIE 3 : Enrichissement INSEE ──

def search_insee(nom, prenom='', cp=''):
    try:
        query = f"{prenom} {nom}".strip()
        params = {'q': query, 'per_page': 5}
        if cp and len(cp) >= 2:
            params['departement'] = cp[:2]

        r = requests.get('https://recherche-entreprises.api.gouv.fr/search', params=params, timeout=8)
        if r.status_code != 200:
            return None

        results = r.json().get('results', [])
        nom_upper = nom.upper().strip()
        prenom_upper = prenom.upper().strip() if prenom else ''

        for res in results:
            nom_res = (res.get('nom_complet', '') or '').upper()
            nom_ok = nom_upper in nom_res
            prenom_ok = prenom_upper in nom_res if prenom_upper else True
            if not (nom_ok or prenom_ok) or not nom_ok:
                continue

            date_creation = res.get('date_creation', '')
            if date_creation:
                return {
                    'date_creation': date_creation,
                    'siren': res.get('siren', ''),
                    'nom_entreprise': res.get('nom_complet', ''),
                    'naf': res.get('activite_principale', '')
                }
    except Exception:
        pass
    return None

def enrichir_insee():
    print("\n📅 ENRICHISSEMENT INSEE - DATES DE CRÉATION")
    conn = get_db()
    cur = conn.cursor()

    for table in ['sante', 'artisans', 'pharmacies']:
        for col in ['date_creation', 'siren', 'nom_entreprise_sirene', 'naf']:
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} TEXT")
                conn.commit()
            except Exception:
                conn.rollback()

    total_enrichis = 0
    tables = [
        ('sante', 'nom', 'prenom', 'cp'),
        ('artisans', 'nom', None, 'cp'),
        ('pharmacies', 'dirigeant', None, 'cp'),
    ]

    for table, nom_col, prenom_col, cp_col in tables:
        cols = f"id, {nom_col}"
        if prenom_col:
            cols += f", {prenom_col}"
        if cp_col:
            cols += f", {cp_col}"

        try:
            cur.execute(f"""
                SELECT {cols} FROM {table}
                WHERE (date_creation IS NULL OR date_creation = '')
                AND {nom_col} IS NOT NULL AND {nom_col} != ''
                LIMIT 300
            """)
            contacts = list(cur.fetchall())
        except Exception:
            continue

        print(f"  {table}: {len(contacts)} à enrichir")
        enrichis = 0

        for contact in contacts:
            nom = contact.get(nom_col, '') or ''
            prenom = contact.get(prenom_col, '') if prenom_col else ''
            cp = contact.get(cp_col, '') if cp_col else ''

            if not nom:
                continue

            result = search_insee(nom, prenom or '', cp or '')
            if result and result.get('date_creation'):
                cur.execute(f"""
                    UPDATE {table}
                    SET date_creation=%s, siren=%s, nom_entreprise_sirene=%s, naf=%s
                    WHERE id=%s
                """, (result['date_creation'], result['siren'], result['nom_entreprise'], result['naf'], contact['id']))
                enrichis += 1
                total_enrichis += 1

            time.sleep(0.15)

        conn.commit()
        print(f"  ✅ {table}: {enrichis} enrichis")

    conn.close()
    print(f"✅ INSEE total: {total_enrichis} enrichis")
    return total_enrichis

def main():
    print("="*60)
    print(f"🌅 JOB MATINAL - {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("="*60)

    n_artisans = scrape_google_places()
    n_osteo = scrape_osteopathes()
    n_insee = enrichir_insee()

    print("\n" + "="*60)
    print(f"🎉 TERMINÉ: +{n_artisans} artisans | +{n_osteo} ostéopathes | {n_insee} enrichis INSEE")
    print("="*60)

if __name__ == '__main__':
    main()
