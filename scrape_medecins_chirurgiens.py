"""
Scraper Google Places - Medecins et Chirurgiens avec 06/07
Lance: python3 scrape_medecins_chirurgiens.py
"""
import requests, json, os, re, time
from datetime import datetime

API_KEY = "AIzaSyCDvhSqEYjeGhGDiTgc3DNW6Ns4kYMqczY"
DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@reseau.proxy.rlwy.net:38081/railway')

import psycopg2
from psycopg2.extras import RealDictCursor

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = RealDictCursor
    return conn

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

# Médecins généralistes + chirurgiens avec les spécialités précises (comme demandé : "type de chirurgien c'est écrit")
PROFESSIONS = [
    ("medecin generaliste", "Médecin généraliste"),
    ("chirurgien orthopediste", "Chirurgien orthopédiste"),
    ("chirurgien plasticien", "Chirurgien plasticien"),
    ("chirurgien dentiste", "Chirurgien-dentiste"),
    ("chirurgien viscéral digestif", "Chirurgien viscéral"),
    ("chirurgien cardiaque", "Chirurgien cardiaque"),
    ("chirurgien ophtalmologue", "Chirurgien ophtalmologue"),
    ("chirurgien urologue", "Chirurgien urologue"),
    ("chirurgien gynécologue", "Chirurgien gynécologue"),
    ("chirurgien maxillo-facial", "Chirurgien maxillo-facial"),
    ("cardiologue", "Cardiologue"),
    ("dermatologue", "Dermatologue"),
    ("gynécologue", "Gynécologue"),
    ("ophtalmologue", "Ophtalmologue"),
    ("ORL", "ORL"),
]

tel_re = re.compile(r'0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}')

def fmt_tel(t):
    t = re.sub(r'[\s\.\-]', '', t.strip())
    return ' '.join([t[i:i+2] for i in range(0, 10, 2)]) if len(t) == 10 else t

def search_places(query, lat, lng, radius=15000):
    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.addressComponents,places.types,places.primaryTypeDisplayName"
    }
    body = {
        "textQuery": query,
        "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius}},
        "maxResultCount": 20, "languageCode": "fr"
    }
    try:
        r = requests.post(url, headers=headers, json=body, timeout=15)
        if r.status_code == 200:
            return r.json().get('places', [])
        else:
            print(f"    Erreur API: {r.status_code} - {r.text[:150]}")
            return []
    except Exception as e:
        print(f"    Exception: {e}")
        return []

def extract_cp(address_components):
    for comp in address_components or []:
        if 'postal_code' in comp.get('types', []):
            return comp.get('longText', '')
    return ''

def extract_ville(address_components):
    for comp in address_components or []:
        if 'locality' in comp.get('types', []):
            return comp.get('longText', '')
    return ''

def main():
    print("🩺 Scraper Google Places - MEDECINS / CHIRURGIENS")
    conn = get_db()
    cur = conn.cursor()

    # S'assurer que la table sante a bien telephone_direct et tout le nécessaire (déjà existant)
    cur.execute("SELECT telephone_direct FROM sante WHERE telephone_direct IS NOT NULL AND telephone_direct != ''")
    seen_tels = {r['telephone_direct'] for r in cur.fetchall()}
    print(f"📊 {len(seen_tels)} tels existants en santé")

    total = 0
    today = datetime.now().strftime('%Y-%m-%d')

    for prof_query, prof_label in PROFESSIONS:
        print(f"\n🩺 {prof_label}")
        prof_total = 0

        for ville_name, lat, lng in VILLES:
            places = search_places(f"{prof_query} {ville_name}", lat, lng)

            count = 0
            for place in places:
                tel_national = place.get('nationalPhoneNumber', '')
                tel_intl = place.get('internationalPhoneNumber', '')

                tel = ''
                for t in [tel_national, tel_intl]:
                    tels = tel_re.findall(t)
                    if tels:
                        tel = fmt_tel(tels[0])
                        break

                if not tel or not tel.startswith(('06', '07')):
                    continue
                if tel in seen_tels:
                    continue

                nom = place.get('displayName', {}).get('text', '')[:80]
                adresse = place.get('formattedAddress', '')
                cp = extract_cp(place.get('addressComponents', []))
                ville = extract_ville(place.get('addressComponents', []))
                # Type précis donné par Google (ex: "Chirurgien orthopédiste", "Cabinet médical"...)
                type_precis = place.get('primaryTypeDisplayName', {}).get('text', '') if isinstance(place.get('primaryTypeDisplayName'), dict) else ''
                specialite_finale = type_precis if type_precis else prof_label

                seen_tels.add(tel)
                cur.execute("""
                    INSERT INTO sante (nom, prenom, specialite, telephone_direct, adresse, cp, ville, statut, note, date_ajout, mode_exercice)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (nom, '', specialite_finale, tel, adresse, cp, ville or ville_name, '', '', today, 'liberal'))
                count += 1
                total += 1
                prof_total += 1

            if count > 0:
                print(f"  {ville_name}: +{count} | Total: {total}")
                if total % 30 == 0:
                    conn.commit()

            time.sleep(0.3)

        print(f"✅ {prof_label}: {prof_total} contacts")
        conn.commit()

    conn.close()
    print(f"\n🎉 TOTAL: {total} médecins/chirurgiens avec 06/07")

if __name__ == '__main__':
    main()
