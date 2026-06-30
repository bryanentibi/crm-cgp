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
    nid = 500000
    today = date.today().isoformat()
    seen_rpps = set()

    def lire_cellules():
        texts = []
        for sel in ['div[role=gridcell]', 'div[class*=cell]', 'div[class*=bodyCells] div']:
            cells = page.locator(sel).all()
            if cells:
                for cell in cells:
                    try:
                        t = cell.inner_text().strip()
                        if t: texts.append(t)
                    except: pass
                if texts: break
        return texts

    def parser(texts):
        nouveaux = 0
        i = 0
        while i < len(texts):
            t = texts[i]
            if re.match(r'^\d{11}$', t) and t not in seen_rpps:
                seen_rpps.add(t)
                nom_prenom = texts[i+2] if i+2 < len(texts) else ''
                tf = tp = cpv = ''
                for j in range(i+3, min(i+11, len(texts))):
                    v = texts[j]
                    if re.match(r'^0033[67]\d{8}$', v): tp = conv(v)
                    elif re.match(r'^0033\d{9}$', v): tf = conv(v)
                    elif re.match(r'^\d{5} - ', v): cpv = v
                parts = nom_prenom.strip().split(' ',1)
                all_infirmiers.append({
                    'id': nid+nouveaux, 'nom': parts[0],
                    'prenom': parts[1].title() if len(parts)>1 else '',
                    'specialite': 'Infirmier', 'rpps': t,
                    'adresse': '', 'cp': cpv.split(' - ')[0] if cpv else '',
                    'ville': cpv.split(' - ')[1] if cpv and ' - ' in cpv else '',
                    'telephone': tf, 'telephone_direct': tp,
                    'email': '', 'mode_exercice': 'liberal',
                    'date_debut': '', 'date_ajout': today,
                    'statut': 'nouveau', 'note': '',
                    'source': 'Ordre National Infirmiers'
                })
                nouveaux += 1
                i += 10
            else:
                i += 1
        return nouveaux

    # Trouver le tableau et scroller dedans
    tableau = page.locator('div[class*=tableEx], div[class*=scrollRegion], div[aria-label*=tableau]').first
    
    for tour in range(500):
        texts = lire_cellules()
        nouveaux = parser(texts)
        avec = sum(1 for x in all_infirmiers if x['telephone_direct'])
        
        if tour % 20 == 0:
            print(f'Tour {tour}: total={len(all_infirmiers)}, portables={avec}')

        # Scroller dans le tableau
        try:
            tableau.evaluate('el => el.scrollTop += 500')
        except:
            page.mouse.wheel(0, 500)
        page.wait_for_timeout(800)

        if tour > 10 and nouveaux == 0:
            # Essayer scroll plus fort
            page.keyboard.press('PageDown')
            page.wait_for_timeout(1000)
            texts2 = lire_cellules()
            if parser(texts2) == 0:
                print(f'Fin a tour {tour}')
                break

    browser.close()

print(f'\nTotal: {len(all_infirmiers)} infirmiers')
avec = [x for x in all_infirmiers if x['telephone_direct']]
print(f'{len(avec)} avec portable')
for e in avec[:10]:
    print(f"  {e['nom']} {e['prenom']} -> {e['telephone_direct']} ({e['ville']})")

with open('data/professionnels_sante.json') as f:
    existing = json.load(f)
all_data = existing + all_infirmiers
with open('data/professionnels_sante.json','w') as f:
    json.dump(all_data, f, ensure_ascii=False)
print(f'Sauvegarde! Total: {len(all_data)}')
