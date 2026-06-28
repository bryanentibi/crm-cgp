#!/usr/bin/env python3
"""
Scraper Annuaire Santé AMELI
Source : annuaire.sante.fr (Assurance Maladie)
API publique non authentifiée
"""

import json
import os
import urllib.request
import urllib.parse
import time
from datetime import datetime, date

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')

# API Annuaire Santé AMELI
BASE_URL = "https://api.sante.fr/v1"
SEARCH_URL = "https://api.sante.fr/v1/professionnel-sante"

# Professions cibles (codes API AMELI)
PROFESSIONS = {
    "Infirmier": "50",
    "Masseur-kinésithérapeute": "60",
    "Ostéopathe": "91",
    "Médecin": "10",
    "Dentiste": "30",
    "Pharmacien": "21",
    "Psychologue": "93",
    "Orthophoniste": "69",
    "Pédicure-podologue": "70",
}

# Departements à scraper (tous)
DEPARTEMENTS = [
    '01','02','03','04','05','06','07','08','09','10',
    '11','12','13','14','15','16','17','18','19','2A','2B',
    '21','22','23','24','25','26','27','28','29','30',
    '31','32','33','34','35','36','37','38','39','40',
    '41','42','43','44','45','46','47','48','49','50',
    '51','52','53','54','55','56','57','58','59','60',
    '61','62','63','64','65','66','67','68','69','70',
    '71','72','73','74','75','76','77','78','79','80',
    '81','82','83','84','85','86','87','88','89','90',
    '91','92','93','94','95','971','972','973','974'
]

def load_existing():
    path = os.path.join(DATA_DIR, 'professionnels_sante.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_all(data):
    path = os.path.join(DATA_DIR, 'professionnels_sante.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)

def get_next_id(existing):
    if not existing:
        return 1
    return max(p.get('id', 0) for p in existing) + 1

def search_annuaire_sante(profession_code, departement, page=1):
    """
    Appelle l'API annuaire.sante.fr
    """
    # Annuaire Santé - endpoint de recherche
    url = f"https://api.sante.fr/v1/practitioner-search"
    params = {
        'profession': profession_code,
        'postalCode': departement,
        'page': page,
        'perPage': 50,
        'mode': 'liberal'
    }
    
    # Fallback: scraping direct du site annuaire.sante.fr via leur API REST
    # L'API publique est disponible sur data.ameli.fr
    ameli_url = "https://api.ameli.fr/medecins/v1/professionnel-sante/search"
    params2 = {
        'codePostal': departement.zfill(5),
        'professionSante': profession_code,
        'page': page - 1,
        'size': 50
    }
    
    full_url = ameli_url + '?' + urllib.parse.urlencode(params2)
    
    req = urllib.request.Request(full_url, headers={
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CRM-CGP/1.0)',
        'Referer': 'https://www.ameli.fr/'
    })
    
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        # Essayer l'API data.gouv.fr en fallback
        return fetch_datagouv_rpps(profession_code, departement)

def fetch_datagouv_rpps(profession_code, departement):
    """
    Fallback: API eS-Santé FHIR
    """
    url = "https://gateway.api.esante.gouv.fr/fhir/v1/Practitioner"
    params = {
        '_count': 50,
        'address-postalcode': departement,
        '_format': 'json'
    }
    full_url = url + '?' + urllib.parse.urlencode(params)
    
    req = urllib.request.Request(full_url, headers={
        'Accept': 'application/json',
        'ESANTE-API-KEY': '',  # Clé publique optionnelle
    })
    
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return {'entries': data.get('entry', []), 'source': 'fhir'}
    except:
        return None

def parse_entry(entry, profession_label, source='ameli'):
    """Parse une entrée selon la source"""
    if source == 'fhir':
        res = entry.get('resource', {})
        names = res.get('name', [{}])
        n = names[0] if names else {}
        nom = ' '.join(n.get('family', ['']))
        prenom = ' '.join(n.get('given', []))
        addrs = res.get('address', [{}])
        a = addrs[0] if addrs else {}
        cp = a.get('postalCode', '')
        ville = a.get('city', '')
        tel = next((t.get('value','') for t in res.get('telecom',[]) if t.get('system')=='phone'), '')
        rpps = next((i.get('value','') for i in res.get('identifier',[]) if 'rpps' in i.get('system','').lower()), '')
        return nom, prenom, cp, ville, tel, '', rpps, res.get('meta',{}).get('lastUpdated','')
    else:
        # Format AMELI / autre API
        nom = entry.get('nom', entry.get('lastName', ''))
        prenom = entry.get('prenom', entry.get('firstName', ''))
        cp = entry.get('codePostal', entry.get('postalCode', ''))
        ville = entry.get('commune', entry.get('city', ''))
        tel = entry.get('telephone', entry.get('phone', ''))
        email = entry.get('email', '')
        rpps = entry.get('rpps', entry.get('identifiantNational', ''))
        date_debut = entry.get('dateDebutActivite', entry.get('startDate', ''))
        return nom, prenom, cp, ville, tel, email, rpps, date_debut

def scrape_annuaire_sante():
    """Scrape l'annuaire santé pour tous les professionnels cibles"""
    print("📥 Scraping Annuaire Santé (AMELI / eS-Santé)")
    
    existing = load_existing()
    existing_rpps = {p.get('rpps') for p in existing if p.get('rpps')}
    existing_combo = {(p.get('nom',''), p.get('prenom',''), p.get('cp','')) for p in existing}
    next_id = get_next_id(existing)
    nouveaux = []
    
    for profession_label, code in PROFESSIONS.items():
        print(f"\n  🔍 {profession_label} (code {code})...")
        
        # Scraper par département pour avoir tous les résultats
        # (limiter aux 10 premiers pour ne pas surcharger)
        for dept in DEPARTEMENTS[:10]:
            result = search_annuaire_sante(code, dept)
            if not result:
                continue
            
            entries = result.get('entries', result.get('content', []))
            source = result.get('source', 'ameli')
            
            for entry in entries:
                try:
                    nom, prenom, cp, ville, tel, email, rpps, date_debut = parse_entry(entry, profession_label, source)
                    
                    if not nom:
                        continue
                    
                    # Anti-doublon
                    combo = (nom.upper(), prenom.upper(), cp)
                    if rpps and rpps in existing_rpps:
                        continue
                    if combo in existing_combo:
                        continue
                    
                    prof = {
                        'id': next_id,
                        'nom': nom.upper(),
                        'prenom': prenom.title(),
                        'specialite': profession_label,
                        'mode_exercice': 'libéral',
                        'rpps': rpps,
                        'adresse': '',
                        'cp': cp,
                        'ville': ville.upper() if ville else '',
                        'telephone': tel,
                        'telephone_direct': '',
                        'email': email,
                        'statut': 'nouveau',
                        'note': '',
                        'date_ajout': date.today().isoformat(),
                        'date_debut': date_debut,
                        'date_modif': '',
                        'source': f'Annuaire Santé ({source})'
                    }
                    
                    nouveaux.append(prof)
                    existing_combo.add(combo)
                    if rpps:
                        existing_rpps.add(rpps)
                    next_id += 1
                    
                except Exception as e:
                    continue
            
            time.sleep(0.3)
        
        print(f"    → {sum(1 for n in nouveaux if n['specialite']==profession_label)} trouvés")
    
    if nouveaux:
        all_data = existing + nouveaux
        save_all(all_data)
        print(f"\n✅ {len(nouveaux)} nouveaux professionnels ajoutés")
    else:
        print("\n⚠️  Aucun nouveau (vérifier connectivité réseau)")
    
    return len(nouveaux)

if __name__ == '__main__':
    scrape_annuaire_sante()
