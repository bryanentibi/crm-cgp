"""
Scraper Pages Jaunes Artisans v2 - URL correctes par département
"""
import asyncio, json, os, re
from datetime import datetime
from playwright.async_api import async_playwright

OUTPUT = os.path.expanduser("~/Desktop/crm_cgp/data/artisans.json")

# Codes département -> nom pour l'URL Pages Jaunes
DEPTS = {
    '01': 'ain', '02': 'aisne', '03': 'allier', '04': 'alpes-de-haute-provence',
    '05': 'hautes-alpes', '06': 'alpes-maritimes', '07': 'ardeche', '08': 'ardennes',
    '09': 'ariege', '10': 'aube', '11': 'aude', '12': 'aveyron',
    '13': 'bouches-du-rhone', '14': 'calvados', '15': 'cantal', '16': 'charente',
    '17': 'charente-maritime', '18': 'cher', '19': 'correze', '21': 'cote-d-or',
    '22': 'cotes-d-armor', '23': 'creuse', '24': 'dordogne', '25': 'doubs',
    '26': 'drome', '27': 'eure', '28': 'eure-et-loir', '29': 'finistere',
    '30': 'gard', '31': 'haute-garonne', '32': 'gers', '33': 'gironde',
    '34': 'herault', '35': 'ille-et-vilaine', '36': 'indre', '37': 'indre-et-loire',
    '38': 'isere', '39': 'jura', '40': 'landes', '41': 'loir-et-cher',
    '42': 'loire', '43': 'haute-loire', '44': 'loire-atlantique', '45': 'loiret',
    '46': 'lot', '47': 'lot-et-garonne', '48': 'lozere', '49': 'maine-et-loire',
    '50': 'manche', '51': 'marne', '52': 'haute-marne', '53': 'mayenne',
    '54': 'meurthe-et-moselle', '55': 'meuse', '56': 'morbihan', '57': 'moselle',
    '58': 'nievre', '59': 'nord', '60': 'oise', '61': 'orne',
    '62': 'pas-de-calais', '63': 'puy-de-dome', '64': 'pyrenees-atlantiques',
    '65': 'hautes-pyrenees', '66': 'pyrenees-orientales', '67': 'bas-rhin',
    '68': 'haut-rhin', '69': 'rhone', '70': 'haute-saone', '71': 'saone-et-loire',
    '72': 'sarthe', '73': 'savoie', '74': 'haute-savoie', '75': 'paris',
    '76': 'seine-maritime', '77': 'seine-et-marne', '78': 'yvelines',
    '79': 'deux-sevres', '80': 'somme', '81': 'tarn', '82': 'tarn-et-garonne',
    '83': 'var', '84': 'vaucluse', '85': 'vendee', '86': 'vienne',
    '87': 'haute-vienne', '88': 'vosges', '89': 'yonne', '90': 'territoire-de-belfort',
    '91': 'essonne', '92': 'hauts-de-seine', '93': 'seine-saint-denis',
    '94': 'val-de-marne', '95': 'val-d-oise',
    '971': 'guadeloupe', '972': 'martinique', '973': 'guyane', '974': 'la-reunion',
}

# Slugs Pages Jaunes pour chaque profession
PROFESSIONS = [
    ("plombiers", "Plombier"),
    ("serruriers", "Serrurier"),
    ("electriciens", "Electricien"),
    ("peintres-en-batiment", "Peintre"),
    ("macons", "Macon"),
    ("menuisiers", "Menuisier"),
    ("chauffagistes", "Chauffagiste"),
    ("carreleurs", "Carreleur"),
]

tel_re = re.compile(r'(?:Tél\s*[:\s]*|tél\s*[:\s]*)(0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2})')
tel_re2 = re.compile(r'\b(0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2})\b')

def fmt(t):
    t = re.sub(r'[\s\.\-]','',t.strip())
    return ' '.join([t[i:i+2] for i in range(0,10,2)]) if len(t)==10 else t

async def scrape_dept_prof(page, dept_code, dept_name, prof_slug, prof_label, results, seen_tels):
    # URL format: /annuaire/DEPT-NOM/PROFESSION
    url = f"https://www.pagesjaunes.fr/annuaire/{dept_code}-{dept_name}/{prof_slug}"
    
    count = 0
    page_num = 1
    
    while page_num <= 5:  # Max 5 pages par dept
        full_url = url if page_num == 1 else f"{url}?page={page_num}"
        try:
            resp = await page.goto(full_url, timeout=20000, wait_until='domcontentloaded')
            await asyncio.sleep(1.0)
            
            if resp and resp.status == 404:
                break
            
            # Récupérer le HTML complet
            content = await page.content()
            
            # Chercher tous les 06/07 avec le pattern "Tél :"
            tels_found = tel_re.findall(content)
            
            if not tels_found:
                # Fallback: chercher tous les 06/07
                tels_found = tel_re2.findall(content)
            
            if not tels_found:
                break
            
            # Essayer d'extraire les noms aussi
            cards = await page.query_selector_all('li.bi, .bi-generic, article[class*="bi"]')
            
            if cards:
                for card in cards:
                    try:
                        card_text = await card.inner_text()
                        
                        # Tel dans cette carte
                        card_tels = tel_re.findall(card_text)
                        if not card_tels:
                            card_tels = tel_re2.findall(card_text)
                        if not card_tels:
                            continue
                        
                        tel = fmt(card_tels[0])
                        if tel in seen_tels or not tel.startswith(('06','07')):
                            continue
                        
                        # Nom
                        nom_el = await card.query_selector('a.denomination, .denomination, h2 a, [class*="denom"]')
                        nom = ''
                        if nom_el:
                            nom = (await nom_el.inner_text()).strip()[:60]
                        
                        # Adresse
                        adr_el = await card.query_selector('[class*="adress"], [class*="address"]')
                        adresse = ''
                        if adr_el:
                            adresse = (await adr_el.inner_text()).strip()
                        
                        cp_m = re.search(r'(\d{5})', adresse)
                        cp = cp_m.group(1) if cp_m else dept_code
                        
                        ville_m = re.search(r'\d{5}\s+([A-Za-zÀ-ÿ\s\-]{2,30})', adresse)
                        ville = ville_m.group(1).strip() if ville_m else ''
                        
                        seen_tels.add(tel)
                        results.append({
                            'nom': nom,
                            'profession': prof_label,
                            'telephone_direct': tel,
                            'adresse': adresse,
                            'ville': ville,
                            'cp': cp,
                            'source': 'Pages Jaunes',
                            'statut': '',
                            'note': '',
                            'date_ajout': datetime.now().strftime('%Y-%m-%d')
                        })
                        count += 1
                    except:
                        continue
            else:
                # Pas de cards trouvées - fallback sur les tels bruts
                for t in tels_found[:20]:
                    tel = fmt(t)
                    if tel not in seen_tels and tel.startswith(('06','07')):
                        seen_tels.add(tel)
                        results.append({
                            'nom': '',
                            'profession': prof_label,
                            'telephone_direct': tel,
                            'ville': '',
                            'cp': dept_code,
                            'source': 'Pages Jaunes',
                            'statut': '',
                            'note': '',
                            'date_ajout': datetime.now().strftime('%Y-%m-%d')
                        })
                        count += 1
            
            # Vérifier s'il y a une page suivante
            next_exists = await page.query_selector('[aria-label="Page suivante"]:not([disabled]), .pagination-next:not(.disabled)')
            if not next_exists or count == 0:
                break
            
            page_num += 1
            await asyncio.sleep(0.8)
            
        except Exception as e:
            break
    
    return count

async def main():
    print("🔧 Scraper Pages Jaunes ARTISANS v2")
    print(f"📁 Output: {OUTPUT}")
    
    results = []
    seen_tels = set()
    
    if os.path.exists(OUTPUT):
        with open(OUTPUT, encoding='utf-8') as f:
            results = json.load(f)
        seen_tels = {r['telephone_direct'] for r in results if r.get('telephone_direct')}
        print(f"📊 {len(results)} contacts existants")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport={'width': 1366, 'height': 768},
            locale='fr-FR'
        )
        page = await context.new_page()
        
        # Accepter cookies Pages Jaunes
        try:
            await page.goto('https://www.pagesjaunes.fr', timeout=15000)
            await asyncio.sleep(2)
            for sel in ['#didomi-notice-agree-button', 'button#accept', '[id*="accept-all"]', 'button:text("Tout accepter")']:
                try:
                    btn = await page.query_selector(sel)
                    if btn:
                        await btn.click()
                        print("✅ Cookies acceptés")
                        break
                except:
                    continue
            await asyncio.sleep(1)
        except:
            pass
        
        total = 0
        for prof_slug, prof_label in PROFESSIONS:
            print(f"\n🔨 {prof_label} — scraping 96 départements...")
            prof_total = 0
            
            for dept_code, dept_name in DEPTS.items():
                n = await scrape_dept_prof(page, dept_code, dept_name, prof_slug, prof_label, results, seen_tels)
                if n > 0:
                    prof_total += n
                    total += n
                    print(f"  {dept_code} ({dept_name[:15]}): +{n} | Total: {total}")
                    
                    # Sauvegarde régulière
                    if total % 50 == 0:
                        with open(OUTPUT, 'w', encoding='utf-8') as f:
                            json.dump(results, f, ensure_ascii=False)
                
                await asyncio.sleep(0.6)
            
            print(f"✅ {prof_label}: {prof_total} contacts avec 06")
            with open(OUTPUT, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False)
        
        await browser.close()
    
    # Sauvegarde finale
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)
    
    # Stats par profession
    from collections import Counter
    profs = Counter(r['profession'] for r in results)
    print(f"\n{'='*50}")
    print(f"🎉 TOTAL: {len(results)} artisans avec 06/07")
    for p, n in profs.most_common():
        print(f"  {p}: {n}")
    print(f"📁 {OUTPUT}")

if __name__ == '__main__':
    asyncio.run(main())
