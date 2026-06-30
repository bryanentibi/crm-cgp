from playwright.sync_api import sync_playwright
import re, json
from datetime import date

def conv(t):
    t = str(t).replace(' ','')
    if t.startswith('0033'): t = '0'+t[4:]
    return t

def lire_et_parser(page, seen_rpps, nid, today):
    infirmiers = []
    cells = page.locator('div[role=gridcell]').all()
    texts = []
    for cell in cells:
        try:
            t = cell.inner_text().strip()
            if t: texts.append(t)
        except: pass
    
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
            infirmiers.append({
                'id': nid+len(infirmiers), 'nom': parts[0],
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
            i += 10
        else:
            i += 1
    return infirmiers

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9', timeout=30000)
    page.wait_for_timeout(8000)

    all_infirmiers = []
    seen_rpps = set()
    nid = 500000
    today = date.today().isoformat()

    # Ouvrir menu et lire tous les CIDOI disponibles
    page.locator('text=Tout').first.click()
    page.wait_for_timeout(2000)
    
    # Lire tous les items du menu
    items = page.locator('div[class*=slicerItemContainer]').all()
    cidoi_names = []
    for item in items:
        try:
            t = item.inner_text().strip()
            if 'CIDOI' in t or 'CDOI' in t:
                cidoi_names.append(t)
        except: pass
    
    print(f'CIDOI trouves: {cidoi_names}')
    
    # Fermer menu
    page.keyboard.press('Escape')
    page.wait_for_timeout(1000)

    # Pour chaque CIDOI
    for cidoi in cidoi_names[:5]:  # Commencer par 5 pour tester
        print(f'\nTraitement {cidoi}...')
        
        # Rouvrir menu
        page.locator('text=Tout').first.click()
        page.wait_for_timeout(1500)
        
        # Cliquer sur le CIDOI
        try:
            page.locator(f'text={cidoi}').first.click()
            page.wait_for_timeout(4000)
            
            nouveaux = lire_et_parser(page, seen_rpps, nid + len(all_infirmiers), today)
            all_infirmiers.extend(nouveaux)
            avec = sum(1 for x in nouveaux if x['telephone_direct'])
            print(f'  {len(nouveaux)} infirmiers, {avec} portables')
            
            # Deselectionner
            page.locator(f'text={cidoi}').first.click()
            page.wait_for_timeout(1000)
        except Exception as e:
            print(f'  Erreur: {e}')
        
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)

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
print(f'Sauvegarde! Total: {len(all_data)}')
