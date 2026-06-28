#!/usr/bin/env python3
"""
Enrichissement numéros directs
Sources : Pages Jaunes, Doctolib, Docaposte, LinkedIn
Cherche le 06/07 des professionnels de santé et pharmaciens
"""

import json
import os
import sys
import time
import re
import urllib.request
import urllib.parse
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')

def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)

def extract_phones(text):
    """Extrait tous les numéros de téléphone d'un texte HTML"""
    # Patterns français : 06, 07, 01-05, 08, 09
    patterns = [
        r'0[67]\s*[\.\-]?\s*\d{2}\s*[\.\-]?\s*\d{2}\s*[\.\-]?\s*\d{2}\s*[\.\-]?\s*\d{2}',
        r'\+33\s*[67]\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}',
        r'0[1-9]\s*[\.\-\s]?\d{2}\s*[\.\-\s]?\d{2}\s*[\.\-\s]?\d{2}\s*[\.\-\s]?\d{2}',
    ]
    phones = []
    for p in patterns:
        found = re.findall(p, text, re.IGNORECASE)
        phones.extend(found)
    
    # Nettoyer
    cleaned = []
    for ph in phones:
        clean = re.sub(r'[\s\.\-]', '', ph)
        if clean.startswith('+33'):
            clean = '0' + clean[3:]
        if len(clean) == 10:
            cleaned.append(clean)
    
    return list(set(cleaned))

def search_pages_jaunes(nom, prenom, ville, specialite=''):
    """
    Recherche sur PagesJaunes.fr
    """
    query = f"{prenom} {nom} {specialite}".strip()
    params = {
        'quoi': query,
        'ou': ville,
        'univers': 'sante_medecin' if any(s in specialite.lower() for s in ['médecin','docteur','chirur']) else 'sante',
    }
    
    url = "https://www.pagesjaunes.fr/pagesblanches/recherche?" + urllib.parse.urlencode({
        'quoiqui': query,
        'ou': ville,
        'page': 1
    })
    
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://www.pagesjaunes.fr/',
    })
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            phones = extract_phones(html)
            mobiles = [p for p in phones if p.startswith('06') or p.startswith('07')]
            fixes = [p for p in phones if not p.startswith('06') and not p.startswith('07')]
            return mobiles[0] if mobiles else (fixes[0] if fixes else '')
    except Exception as e:
        return ''

def search_doctolib(nom, prenom, ville, specialite=''):
    """
    Recherche sur Doctolib - extrait le numéro affiché
    """
    slug_nom = nom.lower().replace(' ', '-')
    slug_prenom = prenom.lower().replace(' ', '-')
    
    url = f"https://www.doctolib.fr/search_results.json?query={urllib.parse.quote(prenom+' '+nom)}&location={urllib.parse.quote(ville)}"
    
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible)',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    })
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            doctors = data.get('data', {}).get('doctors', [])
            if doctors:
                d = doctors[0]
                phone = d.get('phone_number', '') or d.get('landline_number', '')
                return phone
    except:
        pass
    return ''

def enrich_contact(contact):
    """
    Enrichit un contact avec son numéro direct
    Essaie plusieurs sources dans l'ordre
    """
    nom = contact.get('nom', '')
    prenom = contact.get('prenom', '')
    ville = contact.get('ville', '')
    specialite = contact.get('specialite', '')
    
    if not nom:
        return ''
    
    # 1. Pages Jaunes (Pages Blanches pour les pros)
    phone = search_pages_jaunes(nom, prenom, ville, specialite)
    if phone:
        print(f"    PJ: {nom} {prenom} → {phone}")
        return phone
    
    # 2. Doctolib
    time.sleep(0.5)
    phone = search_doctolib(nom, prenom, ville, specialite)
    if phone:
        print(f"    Doctolib: {nom} {prenom} → {phone}")
        return phone
    
    return ''

def enrich_pharmacien(pharmacie):
    """
    Cherche le numéro direct du dirigeant d'une pharmacie
    """
    nom_pharma = pharmacie.get('nom', '')
    dirigeant = pharmacie.get('dirigeant', '')
    ville = pharmacie.get('ville', '')
    
    if dirigeant:
        # Chercher le dirigeant directement
        parts = dirigeant.split()
        if len(parts) >= 2:
            # Essayer prénom + nom (ordre variable dans les données)
            phone = search_pages_jaunes(parts[-1], ' '.join(parts[:-1]), ville, 'pharmacien')
            if phone:
                return phone
    
    # Sinon chercher la pharmacie elle-même
    phone = search_pages_jaunes(nom_pharma, '', ville, 'pharmacie')
    return phone

def run_enrichment(target='sante', limit=20):
    """
    Lance l'enrichissement pour N contacts sans numéro direct
    """
    print(f"🔍 Enrichissement {target} (limite: {limit})")
    
    if target == 'pharmacies':
        data = load_json('pharmacies.json')
        to_enrich = [p for p in data if not p.get('telephone_direct') and p.get('nom')][:limit]
        
        enriched = 0
        for pharmacie in to_enrich:
            phone = enrich_pharmacien(pharmacie)
            if phone:
                pharmacie['telephone_direct'] = phone
                pharmacie['date_enrichissement'] = datetime.now().isoformat()
                enriched += 1
            time.sleep(1)  # Pause pour ne pas se faire bloquer
        
        save_json('pharmacies.json', data)
        print(f"✅ {enriched}/{len(to_enrich)} pharmacies enrichies")
        
    else:  # sante
        data = load_json('professionnels_sante.json')
        to_enrich = [p for p in data if not p.get('telephone_direct') and p.get('nom')][:limit]
        
        enriched = 0
        for contact in to_enrich:
            phone = enrich_contact(contact)
            if phone:
                contact['telephone_direct'] = phone
                contact['date_enrichissement'] = datetime.now().isoformat()
                enriched += 1
            time.sleep(1)
        
        save_json('professionnels_sante.json', data)
        print(f"✅ {enriched}/{len(to_enrich)} contacts enrichis")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'sante'
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    run_enrichment(target, limit)
