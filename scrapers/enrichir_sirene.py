"""
Enrichissement INSEE Sirene - Date de création entreprise
Lance: python3 enrichir_sirene.py
"""
import requests, json, os, time, re
from datetime import datetime

DB_URL = "postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@reseau.proxy.rlwy.net:38081/railway"

import psycopg2
from psycopg2.extras import RealDictCursor

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = RealDictCursor
    return conn

def search_insee(nom, prenom='', cp=''):
    """Cherche date de création via API gouvernementale"""
    try:
        # Inverser l'ordre : prénom + nom (l'API répond mieux ainsi)
        query = f"{prenom} {nom}".strip() if prenom else nom
        params = {'q': query, 'per_page': 5}
        if cp and len(cp) >= 2:
            params['departement'] = cp[:2]

        r = requests.get(
            'https://recherche-entreprises.api.gouv.fr/search',
            params=params, timeout=8
        )
        if r.status_code != 200:
            return None

        results = r.json().get('results', [])
        nom_upper = nom.upper().strip()
        prenom_upper = prenom.upper().strip() if prenom else ''

        for res in results:
            nom_res = (res.get('nom_complet', '') or '').upper()
            
            # Vérification souple : nom dans le résultat OU prénom dans le résultat
            nom_ok = nom_upper in nom_res
            prenom_ok = prenom_upper in nom_res if prenom_upper else True
            
            if not (nom_ok or prenom_ok):
                continue
            
            # Au moins le nom doit correspondre
            if not nom_ok:
                continue

            date_creation = res.get('date_creation', '')
            if date_creation:
                return {
                    'date_creation': date_creation,
                    'siren': res.get('siren', ''),
                    'nom_entreprise': res.get('nom_complet', ''),
                    'naf': res.get('activite_principale', '')
                }
    except Exception as e:
        pass
    return None

def add_columns(conn, table):
    cur = conn.cursor()
    for col, dtype in [
        ('date_creation', 'TEXT'),
        ('siren', 'TEXT'),
        ('nom_entreprise_sirene', 'TEXT'),
        ('naf', 'TEXT')
    ]:
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {dtype}")
        except:
            conn.rollback()
    conn.commit()

def enrichir_table(table, nom_col, prenom_col=None, ville_col='ville', cp_col='cp', limit=None):
    conn = get_db()
    add_columns(conn, table)
    cur = conn.cursor()

    cols = f"id, {nom_col}"
    if prenom_col:
        cols += f", {prenom_col}"
    if cp_col:
        cols += f", {cp_col}"

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
        cp = contact.get(cp_col, '') if cp_col else ''

        if not nom or len(nom) < 2:
            continue

        result = search_insee(nom, prenom or '', cp or '')

        if result and result.get('date_creation'):
            cur.execute(f"""
                UPDATE {table}
                SET date_creation=%s, siren=%s, nom_entreprise_sirene=%s, naf=%s
                WHERE id=%s
            """, (
                result['date_creation'],
                result.get('siren', ''),
                result.get('nom_entreprise', ''),
                result.get('naf', ''),
                contact['id']
            ))
            enrichis += 1
            if enrichis % 20 == 0:
                conn.commit()
                print(f"  [{i+1}/{len(contacts)}] ✅ {enrichis} trouvés | ❌ {non_trouves} non trouvés")
        else:
            non_trouves += 1

        if (i+1) % 100 == 0:
            conn.commit()
            pct = round((i+1)/len(contacts)*100)
            print(f"  [{i+1}/{len(contacts)}] {pct}% | ✅ {enrichis} | ❌ {non_trouves}")

        time.sleep(0.2)

    conn.commit()
    conn.close()
    print(f"✅ {table}: {enrichis}/{len(contacts)} enrichis")
    return enrichis

def main():
    print("🚀 Enrichissement INSEE Sirene - Dates de création")
    print(f"📅 {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    total = 0

    print("\n" + "="*50)
    print("1️⃣  INFIRMIERS / SANTE")
    total += enrichir_table('sante', nom_col='nom', prenom_col='prenom', cp_col='cp')

    print("\n" + "="*50)
    print("2️⃣  ARTISANS")
    total += enrichir_table('artisans', nom_col='nom', prenom_col=None, cp_col='cp')

    print("\n" + "="*50)
    print("3️⃣  PHARMACIES")
    total += enrichir_table('pharmacies', nom_col='dirigeant', prenom_col=None, cp_col='cp')

    print(f"\n🎉 TOTAL: {total} contacts enrichis")

if __name__ == '__main__':
    main()
