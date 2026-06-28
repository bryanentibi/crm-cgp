#!/usr/bin/env python3
"""
Scraper RPPS - data.gouv.fr
Source officielle des professionnels de santé inscrits en France
Données publiques, mise à jour mensuelle
"""

import json
import os
import urllib.request
import urllib.parse
import time
import csv
from datetime import datetime, date

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')

# Spécialités cibles avec codes RPPS
SPECIALITES_CIBLES = {
    "Infirmier": ["40", "41"],
    "Masseur-kinésithérapeute": ["50", "51"],
    "Ostéopathe": ["80"],
    "Médecin généraliste": ["10"],
    "Chirurgien": ["11", "12", "13"],
    "Cardiologue": ["14"],
    "Radiologue": ["15"],
    "Dentiste / Chirurgien-dentiste": ["21"],
    "Pharmacien": ["21"],
    "Psychologue": ["93"],
}

# API data.gouv.fr RPPS via data.esante.gouv.fr
RPPS_API_URL = "https://gateway.api.esante.gouv.fr/fhir/v1/Practitioner"

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

def fetch_rpps_page(specialite_code, offset=0, count=100):
    """
    Requête l'API FHIR eS-Santé pour récupérer les praticiens
    """
    params = {
        '_count': count,
        '_offset': offset,
        'qualification-code': specialite_code,
        '_sort': '-_lastUpdated',  # Plus récents en premier
    }
    url = RPPS_API_URL + '?' + urllib.parse.urlencode(params)
    
    req = urllib.request.Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': 'CRM-CGP/1.0'
    })
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"  Erreur API: {e}")
        return None

def parse_practitioner(entry, specialite_label):
    """Extrait les infos d'un praticien FHIR"""
    resource = entry.get('resource', {})
    
    # Nom
    names = resource.get('name', [{}])
    name = names[0] if names else {}
    nom = ' '.join(name.get('family', ['']))
    prenom = ' '.join(name.get('given', []))
    
    # Identifiants (RPPS)
    identifiers = resource.get('identifier', [])
    rpps = ''
    for ident in identifiers:
        if 'rpps' in ident.get('system', '').lower():
            rpps = ident.get('value', '')
            break
    
    # Adresse
    addresses = resource.get('address', [{}])
    addr = addresses[0] if addresses else {}
    ville = addr.get('city', '')
    cp = addr.get('postalCode', '')
    adresse = ' '.join(addr.get('line', []))
    
    # Télécom
    telecoms = resource.get('telecom', [])
    telephone = ''
    email = ''
    for t in telecoms:
        if t.get('system') == 'phone' and not telephone:
            telephone = t.get('value', '')
        if t.get('system') == 'email' and not email:
            email = t.get('value', '')
    
    # Date de dernière mise à jour (proxy pour date début activité)
    meta = resource.get('meta', {})
    last_updated = meta.get('lastUpdated', '')
    
    return {
        'nom': nom.upper(),
        'prenom': prenom.title(),
        'specialite': specialite_label,
        'mode_exercice': 'libéral',  # à affiner selon les données
        'rpps': rpps,
        'adresse': adresse,
        'cp': cp,
        'ville': ville.upper(),
        'telephone': telephone,
        'telephone_direct': '',
        'email': email,
        'statut': 'nouveau',
        'note': '',
        'date_ajout': date.today().isoformat(),
        'date_debut': '',  # à enrichir
        'date_modif': '',
        'source': 'RPPS eS-Santé',
        'last_updated_rpps': last_updated
    }

def scrape_rpps():
    """Scrape principal RPPS"""
    print("📥 Scraping RPPS (eS-Santé) - Professionnels de santé")
    
    existing = load_existing()
    existing_rpps = {p.get('rpps') for p in existing if p.get('rpps')}
    next_id = get_next_id(existing)
    nouveaux = []
    
    for specialite_label, codes in SPECIALITES_CIBLES.items():
        print(f"\n  🔍 {specialite_label}...")
        
        for code in codes:
            offset = 0
            page_count = 0
            
            while page_count < 3:  # Max 3 pages par code = 300 résultats
                result = fetch_rpps_page(code, offset)
                if not result:
                    break
                
                entries = result.get('entry', [])
                if not entries:
                    break
                
                for entry in entries:
                    praticien = parse_practitioner(entry, specialite_label)
                    rpps = praticien.get('rpps')
                    
                    # Pas de doublons
                    if rpps and rpps in existing_rpps:
                        continue
                    if not praticien['nom']:
                        continue
                    
                    praticien['id'] = next_id
                    next_id += 1
                    nouveaux.append(praticien)
                    if rpps:
                        existing_rpps.add(rpps)
                
                print(f"    Page {page_count+1}: {len(entries)} entrées")
                offset += len(entries)
                page_count += 1
                time.sleep(0.5)  # Respecter l'API
    
    if nouveaux:
        all_data = existing + nouveaux
        save_all(all_data)
        print(f"\n✅ {len(nouveaux)} nouveaux professionnels ajoutés (total: {len(all_data)})")
    else:
        print("\n✅ Aucun nouveau professionnel trouvé")
    
    return len(nouveaux)

if __name__ == '__main__':
    scrape_rpps()
