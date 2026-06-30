"""
Scraper Google Places API (New) - Artisans avec 06/07
Plombiers, Serruriers, Electriciens, Peintres, Macons, Menuisiers, Chauffagistes
Lance: python3 scrape_google_places.py
"""
import requests, json, os, re, time
from datetime import datetime

API_KEY = "AIzaSyCDvhSqEYjeGhGDiTgc3DNW6Ns4kYMqczY"
OUTPUT = os.path.expanduser("~/Desktop/crm_cgp/data/artisans.json")

# Villes principales France
VILLES = [
    ("Paris", 48.8566, 2.3522),
    ("Lyon", 45.7640, 4.8357),
    ("Marseille", 43.2965, 5.3698),
    ("Toulouse", 43.6047, 1.4442),
    ("Bordeaux", 44.8378, -0.5792),
    ("Nantes", 47.2184, -1.5536),
    ("Strasbourg", 48.5734, 7.7521),
    ("Lille", 50.6292, 3.0573),
    ("Rennes", 48.1173, -1.6778),
    ("Reims", 49.2583, 4.0317),
    ("Nice", 43.7102, 7.2620),
    ("Toulon", 43.1242, 5.9280),
    ("Grenoble", 45.1885, 5.7245),
    ("Dijon", 47.3220, 5.0415),
    ("Angers", 47.4784, -0.5632),
    ("Nimes", 43.8367, 4.3601),
    ("Saint-Etienne", 45.4397, 4.3872),
    ("Le Havre", 49.4944, 0.1079),
    ("Clermont-Ferrand", 45.7772, 3.0870),
    ("Brest", 48.3905, -4.4860),
    ("Tours", 47.3941, 0.6848),
    ("Amiens", 49.8941, 2.2958),
    ("Limoges", 45.8336, 1.2611),
    ("Montpellier", 43.6108, 3.8767),
    ("Metz", 49.1193, 6.1757),
    ("Besancon", 47.2380, 6.0243),
    ("Orleans", 47.9029, 1.9093),
    ("Rouen", 49.4432, 1.0993),
    ("Mulhouse", 47.7508, 7.3359),
    ("Caen", 49.1829, -0.3707),
    ("Nancy", 48.6921, 6.1844),
    ("Avignon", 43.9493, 4.8055),
    ("Poitiers", 46.5802, 0.3404),
    ("Pau", 43.2951, -0.3707),
    ("Aix-en-Provence", 43.5297, 5.4474),
    ("Calais", 50.9513, 1.8587),
    ("La Rochelle", 46.1603, -1.1511),
    ("Perpignan", 42.6887, 2.8948),
    ("Troyes", 48.2973, 4.0744),
    ("Annecy", 45.8992, 6.1294),
    ("Valence", 44.9334, 4.8924),
    ("Dunkerque", 51.0343, 2.3770),
    ("Lorient", 47.7484, -3.3674),
    ("Niort", 46.3237, -0.4624),
    ("Bayonne", 43.4832, -1.4840),
    ("Chambery", 45.5646, 5.9178),
    ("Colmar", 48.0793, 7.3585),
    ("Quimper", 47.9976, -4.0979),
    ("Belfort", 47.6389, 6.8633),
    ("Ajaccio", 41.9192, 8.7386),
    ("Cergy", 49.0320, 2.0728),
    ("Evry", 48.6240, 2.4280),
    ("Creteil", 48.7904, 2.4560),
    ("Versailles", 48.8014, 2.1301),
    ("Argenteuil", 48.9472, 2.2467),
    ("Montreuil", 48.8638, 2.4483),
    ("Boulogne-Billancourt", 48.8352, 2.2400),
    ("Nanterre", 48.8924, 2.2065),
    ("Courbevoie", 48.8976, 2.2532),
    ("Neuilly-sur-Seine", 48.8846, 2.2693),
    ("Issy-les-Moulineaux", 48.8236, 2.2735),
    ("Antibes", 43.5804, 7.1282),
    ("Cannes", 43.5528, 7.0174),
    ("Montauban", 44.0175, 1.3544),
    ("Albi", 43.9272, 2.1480),
    ("Tarbes", 43.2327, 0.0786),
    ("Perigueux", 45.1845, 0.7218),
    ("Brive-la-Gaillarde", 45.1590, 1.5313),
    ("Chalon-sur-Saone", 46.7806, 4.8536),
    ("Macon", 46.3076, 4.8286),
    ("Bourg-en-Bresse", 46.2050, 5.2253),
    ("Gap", 44.5592, 6.0773),
    ("Narbonne", 43.1836, 3.0030),
    ("Carcassonne", 43.2119, 2.3499),
    ("Beziers", 43.3441, 3.2150),
    ("Sete", 43.4030, 3.6953),
]

PROFESSIONS = [
    ("plombier", "Plombier"),
    ("serrurier", "Serrurier"),
    ("electricien", "Electricien"),
    ("peintre batiment", "Peintre"),
    ("macon", "Macon"),
    ("menuisier", "Menuisier"),
    ("chauffagiste", "Chauffagiste"),
    ("carreleur", "Carreleur"),
]

tel_re = re.compile(r'0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}')

def fmt(t):
    t = re.sub(r'[\s\.\-]','',t.strip())
    return ' '.join([t[i:i+2] for i in range(0,10,2)]) if len(t)==10 else t

def search_places(query, lat, lng, radius=15000):
    """Google Places API (New) - Text Search"""
    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.addressComponents"
    }
    body = {
        "textQuery": query,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius
            }
        },
        "maxResultCount": 20,
        "languageCode": "fr"
    }
    
    try:
        r = requests.post(url, headers=headers, json=body, timeout=15)
        if r.status_code == 200:
            return r.json().get('places', [])
        else:
            print(f"    Erreur API: {r.status_code} - {r.text[:100]}")
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
    print("🔧 Scraper Google Places API - ARTISANS")
    print(f"📁 Output: {OUTPUT}")
    
    results = []
    seen_tels = set()
    seen_names = set()
    
    if os.path.exists(OUTPUT):
        with open(OUTPUT, encoding='utf-8') as f:
            results = json.load(f)
        seen_tels = {r['telephone_direct'] for r in results if r.get('telephone_direct')}
        print(f"📊 {len(results)} contacts existants")
    
    total = 0
    
    for prof_query, prof_label in PROFESSIONS:
        print(f"\n🔨 {prof_label}")
        prof_total = 0
        
        for ville_name, lat, lng in VILLES:
            query = f"{prof_query} {ville_name}"
            places = search_places(query, lat, lng)
            
            count = 0
            for place in places:
                # Numéro national
                tel_national = place.get('nationalPhoneNumber', '')
                tel_intl = place.get('internationalPhoneNumber', '')
                
                # Chercher 06/07
                tel = ''
                for t in [tel_national, tel_intl]:
                    tels = tel_re.findall(t)
                    if tels:
                        tel = fmt(tels[0])
                        break
                
                if not tel or not tel.startswith(('06','07')):
                    continue
                if tel in seen_tels:
                    continue
                
                nom = place.get('displayName', {}).get('text', '')
                adresse = place.get('formattedAddress', '')
                cp = extract_cp(place.get('addressComponents', []))
                ville = extract_ville(place.get('addressComponents', []))
                
                seen_tels.add(tel)
                results.append({
                    'nom': nom[:60],
                    'profession': prof_label,
                    'telephone_direct': tel,
                    'adresse': adresse,
                    'ville': ville or ville_name,
                    'cp': cp,
                    'source': 'Google Places',
                    'statut': '',
                    'note': '',
                    'date_ajout': datetime.now().strftime('%Y-%m-%d')
                })
                count += 1
                total += 1
                prof_total += 1
            
            if count > 0:
                print(f"  {ville_name}: +{count} | Total: {total}")
                if total % 50 == 0:
                    with open(OUTPUT, 'w', encoding='utf-8') as f:
                        json.dump(results, f, ensure_ascii=False)
            
            time.sleep(0.3)  # Pause légère entre requêtes
        
        print(f"✅ {prof_label}: {prof_total} contacts")
        with open(OUTPUT, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False)
    
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)
    
    from collections import Counter
    profs = Counter(r['profession'] for r in results)
    print(f"\n🎉 TOTAL: {len(results)} artisans avec 06/07")
    for p, n in profs.most_common():
        print(f"  {p}: {n}")
    print(f"📁 {OUTPUT}")

if __name__ == '__main__':
    main()
