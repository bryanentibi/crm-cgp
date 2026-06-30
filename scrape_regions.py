from playwright.sync_api import sync_playwright
import re, json
from datetime import date

def conv(t):
    t = str(t).replace(' ','')
    if t.startswith('0033'): t = '0'+t[4:]
    return t

def lire(page, seen, nid, today):
    res = []
    try:
        cells = page.locator('div[role=gridcell]').all()
        texts = [c.inner_text().strip() for c in cells if c.inner_text().strip()]
    except: return res
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
            res.append({'id':nid+len(res),'nom':p[0],'prenom':p[1].title() if len(p)>1 else '','specialite':'Infirmier','rpps':t,'adresse':'','cp':cpv.split(' - ')[0] if cpv else '','ville':cpv.split(' - ')[1] if cpv and ' - ' in cpv else '','telephone':tf,'telephone_direct':tp,'email':'','mode_exercice':'liberal','date_debut':'','date_ajout':today,'statut':'nouveau','note':'','source':'Ordre National Infirmiers'})
            i += 10
        else:
            i += 1
    return res

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width':1920,'height':1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9',timeout=30000)
    page.wait_for_timeout(8000)

    all_inf = []
    seen = set()
    today = date.today().isoformat()

    # Ouvrir menu
    page.locator('text=Tout').first.click()
    page.wait_for_timeout(2000)

    # Cliquer sur toutes les regions pour les decouvrir
    regions = [
        'Antilles-Guyane', 'Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté',
        'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est',
        'Hauts-de-France', 'Île-de-France', 'Normandie',
        'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire',
        "Provence-Alpes-Côte d'Azur", 'Réunion-Mayotte', 'Océan Indien'
    ]

    # Decouvrir toutes les regions d'abord
    print('Decouverte des regions...')
    for region in regions:
        try:
            r = page.locator(f'text={region}').first
            r.scroll_into_view_if_needed()
            r.click()
            page.wait_for_timeout(800)
            print(f'  OK: {region}')
        except:
            print(f'  Pas trouve: {region}')

    page.wait_for_timeout(1000)

    # Maintenant lire tous les CIDOI visibles
    all_cidois = []
    containers = page.locator('div[class*=slicerItemContainer]').all()
    for cb in containers:
        try:
            t = cb.inner_text().strip()
            if 'CIDOI' in t or 'CDOI' in t:
                all_cidois.append(t)
        except: pass

    print(f'\n{len(all_cidois)} CIDOI trouves:')
    for c in all_cidois: print(f'  {c}')

    # Traiter chaque CIDOI
    for nom_cidoi in all_cidois:
        print(f'\n{nom_cidoi}...')
        try:
            cb = page.locator(f'span.slicerText:text-is("{nom_cidoi}")').first
            cb.scroll_into_view_if_needed()
            page.wait_for_timeout(300)
            cb.click()
            page.wait_for_timeout(4000)

            nouveaux = lire(page, seen, 500000+len(all_inf), today)
            all_inf.extend(nouveaux)
            avec = sum(1 for x in nouveaux if x['telephone_direct'])
            print(f'  {len(nouveaux)} infirmiers, {avec} portables')

            cb.scroll_into_view_if_needed()
            cb.click()
            page.wait_for_timeout(1000)
        except Exception as e:
            print(f'  Erreur: {e}')

    browser.close()

print(f'\nTotal: {len(all_inf)} infirmiers')
avec = [x for x in all_inf if x['telephone_direct']]
print(f'{len(avec)} avec portable ({round(len(avec)/max(len(all_inf),1)*100)}%)')
for e in avec[:5]:
    print(f"  {e['nom']} {e['prenom']} -> {e['telephone_direct']} ({e['ville']})")

with open('data/professionnels_sante.json') as f:
    ex = json.load(f)
all_data = ex + all_inf
with open('data/professionnels_sante.json','w') as f:
    json.dump(all_data, f, ensure_ascii=False)
print(f'Sauvegarde! Total: {len(all_data)}')
