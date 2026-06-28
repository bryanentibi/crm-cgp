from playwright.sync_api import sync_playwright
import re, json, os
from datetime import date

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')

def conv(t):
    t = str(t).replace(' ','')
    if t.startswith('0033'): t = '0'+t[4:]
    return t

def load_existing():
    path = os.path.join(DATA_DIR, 'professionnels_sante.json')
    if os.path.exists(path):
        with open(path) as f: return json.load(f)
    return []

def save_all(data):
    path = os.path.join(DATA_DIR, 'professionnels_sante.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

existing = load_existing()
seen = {x.get('rpps') for x in existing if x.get('rpps')}
today = date.today().isoformat()
nid = max((x.get('id',0) for x in existing), default=0) + 1
nouveaux = []
print('Scraping Ordre National Infirmiers...')

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1920,'height':1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9', timeout=30000)
    page.wait_for_timeout(8000)
    stagnation = 0
    tour = 0
    while tour < 5000:
        tour += 1
        cells = page.locator('div[role=gridcell]').all()
        texts = []
        for c in cells:
            try:
                t = c.inner_text().strip()
                if t: texts.append(t)
            except: pass
        nb = 0
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
                nouveaux.append({'id':nid+len(nouveaux),'nom':p[0],'prenom':p[1].title() if len(p)>1 else '','specialite':'Infirmier','rpps':t,'adresse':'','cp':cpv.split(' - ')[0] if cpv else '','ville':cpv.split(' - ')[1] if cpv and ' - ' in cpv else '','telephone':tf,'telephone_direct':tp,'email':'','mode_exercice':'liberal','date_debut':'','date_ajout':today,'statut':'nouveau','note':'','source':'Ordre National Infirmiers'})
                nb += 1
                i += 10
            else:
                i += 1
        if nb == 0:
            stagnation += 1
            if stagnation > 30:
                print(f'Fin a tour {tour}')
                break
        else:
            stagnation = 0
        if tour % 100 == 0:
            avec = sum(1 for x in nouveaux if x['telephone_direct'])
            print(f'Tour {tour}: {len(nouveaux)} nouveaux, {avec} portables')
            save_all(existing + nouveaux)
        page.mouse.move(900, 400)
        page.mouse.wheel(0, 200)
        page.wait_for_timeout(200)
    browser.close()

save_all(existing + nouveaux)
avec = sum(1 for x in nouveaux if x['telephone_direct'])
print(f'Done: {len(nouveaux)} infirmiers, {avec} portables')
