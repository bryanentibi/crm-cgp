from playwright.sync_api import sync_playwright
import re, json
from datetime import date

def conv(t):
    t = str(t).replace(' ','')
    if t.startswith('0033'): t = '0'+t[4:]
    return t

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9', timeout=30000)
    page.wait_for_timeout(8000)

    all_infirmiers = []
    nid = 400000
    today = date.today().isoformat()
    seen_rpps = set()

    for tour in range(200):
        # Meme selecteur que lire_tableau.py qui a marche
        cells = page.locator('div[role=gridcell]').all()
        if not cells:
            cells = page.locator('div[class*=cell]').all()

        texts = []
        for cell in cells:
            try:
                t = cell.inner_text().strip()
                if t: texts.append(t)
            except: pass

        if not texts:
            break

        # Parser
        nouveaux = 0
        i = 0
        while i < len(texts):
            t = texts[i]
            if re.match(r'^\d{11}$', t) and t not in seen_rpps:
                seen_rpps.add(t)
                rpps = t
                nom_prenom = texts[i+2] if i+2 < len(texts) else ''
                tf = tp = adr = cpv = ''
                for j in range(i+3, min(i+11, len(texts))):
                    v = texts[j]
                    if re.match(r'^0033[67]\d{8}$', v): tp = conv(v)
                    elif re.match(r'^0033\d{9}$', v): tf = conv(v)
                    elif re.match(r'^\d{5} - ', v): cpv = v
                    elif len(v)>5 and re.match(r'^\d+\s', v): adr = v
                parts = nom_prenom.strip().split(' ',1)
                all_infirmiers.append({
                    'id': nid, 'nom': parts[0],
                    'prenom': parts[1].title() if len(parts)>1 else '',
                    'specialite': 'Infirmier', 'rpps': rpps,
                    'adresse': adr, 'cp': cpv.split(' - ')[0] if cpv else '',
                    'ville': cpv.split(' - ')[1] if cpv and ' - ' in cpv else '',
                    'telephone': tf, 'telephone_direct': tp,
                    'email': '', 'mode_exercice': 'liberal',
                    'date_debut': '', 'date_ajout': today,
                    'statut': 'nouveau', 'note': '',
                    'source': 'Ordre National Infirmiers'
                })
                nid += 1
                nouveaux += 1
                i += 10
            else:
                i += 1

        avec = sum(1 for x in all_infirmiers if x['telephone_direct'])
        print(f'Tour {tour+1}: +{nouveaux} nouveaux, total={len(all_infirmiers)}, portables={avec}')

        if nouveaux == 0:
            break

        # Scroll vers le bas pour charger la suite
        page.keyboard.press('End')
        page.wait_for_timeout(2000)

    browser.close()

print(f'\nTotal: {len(all_infirmiers)} infirmiers')
avec = [x for x in all_infirmiers if x['telephone_direct']]
print(f'{len(avec)} avec portable')
for e in avec[:5]:
    print(f"  {e['nom']} {e['prenom']} -> {e['telephone_direct']} ({e['ville']})")

with open('data/professionnels_sante.json') as f:
    existing = json.load(f)
all_data = existing + all_infirmiers
with open('data/professionnels_sante.json','w') as f:
    json.dump(all_data, f, ensure_ascii=False)
print(f'Sauvegarde! Total base: {len(all_data)}')
