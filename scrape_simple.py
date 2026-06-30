from playwright.sync_api import sync_playwright
import re, json
from datetime import date

def conv(t):
    t = str(t).replace(' ','')
    if t.startswith('0033'): t = '0'+t[4:]
    return t

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width':1920,'height':1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9',timeout=30000)
    page.wait_for_timeout(8000)

    all_inf = []
    seen = set()
    today = date.today().isoformat()
    nid = 600000

    # Scroll vertical dans le tableau — 500 tours
    for tour in range(500):
        # Lire toutes les cellules visibles
        cells = page.locator('div[role=gridcell]').all()
        texts = []
        for c in cells:
            try:
                t = c.inner_text().strip()
                if t: texts.append(t)
            except: pass

        # Parser
        nouveaux = 0
        i = 0
        while i < len(texts):
            t = texts[i]
            if re.match(r'^\d{11}$', t) and t not in seen:
                seen.add(t)
                nom = texts[i+2] if i+2 < len(texts) else ''
                tf = tp = cpv = ''
                for j in range(i+3, min(i+11, len(texts))):
                    v = texts[j]
                    if re.match(r'^0033[67]\d{8}$', v): tp = conv(v)
                    elif re.match(r'^0033\d{9}$', v): tf = conv(v)
                    elif re.match(r'^\d{5} - ', v): cpv = v
                p = nom.strip().split(' ',1)
                all_inf.append({
                    'id': nid+len(all_inf),
                    'nom': p[0],
                    'prenom': p[1].title() if len(p)>1 else '',
                    'specialite': 'Infirmier',
                    'rpps': t,
                    'adresse': '',
                    'cp': cpv.split(' - ')[0] if cpv else '',
                    'ville': cpv.split(' - ')[1] if cpv and ' - ' in cpv else '',
                    'telephone': tf,
                    'telephone_direct': tp,
                    'email': '',
                    'mode_exercice': 'liberal',
                    'date_debut': '',
                    'date_ajout': today,
                    'statut': 'nouveau',
                    'note': '',
                    'source': 'Ordre National Infirmiers'
                })
                nouveaux += 1
                i += 10
            else:
                i += 1

        if tour % 50 == 0:
            avec = sum(1 for x in all_inf if x['telephone_direct'])
            print(f'Tour {tour}: {len(all_inf)} infirmiers, {avec} portables')

        # Scroll vers le bas dans le tableau
        page.mouse.move(900, 400)
        page.mouse.wheel(0, 300)
        page.wait_for_timeout(300)

    browser.close()

print(f'\nTotal: {len(all_inf)} infirmiers')
avec = [x for x in all_inf if x['telephone_direct']]
print(f'{len(avec)} avec portable')
for e in avec[:5]:
    print(f"  {e['nom']} {e['prenom']} -> {e['telephone_direct']} ({e['ville']})")

with open('data/professionnels_sante.json') as f:
    ex = json.load(f)
all_data = ex + all_inf
with open('data/professionnels_sante.json','w') as f:
    json.dump(all_data, f, ensure_ascii=False)
print(f'Sauvegarde! Total: {len(all_data)}')
