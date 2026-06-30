"""
Scraper Pages Jaunes - Artisans avec 06/07 uniquement
Plombiers, Serruriers, Electriciens, Peintres, Macons, Menuisiers, Chauffagistes
Lance: python3 scrape_artisans.py
Résultat: data/artisans.json
"""
import asyncio, json, os, re
from datetime import datetime
from playwright.async_api import async_playwright

OUTPUT = os.path.expanduser("~/Desktop/crm_cgp/data/artisans.json")

DEPTS = [str(i).zfill(2) for i in range(1, 96)] + ['971','972','973','974']

PROFESSIONS = [
    ("plombiers", "Plombier"),
    ("serruriers", "Serrurier"),
    ("electriciens", "Electricien"),
    ("peintres-en-batiment", "Peintre"),
    ("macons", "Macon"),
    ("menuisiers", "Menuisier"),
    ("chauffagistes", "Chauffagiste"),
    ("carreleurs", "Carreleur"),
    ("climatisation", "Climaticien"),
]

tel_re = re.compile(r'0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}')

def fmt(t):
    t = re.sub(r'[\s\.\-]','',t)
    return ' '.join([t[i:i+2] for i in range(0,10,2)]) if len(t)==10 else t

async def scrape_dept(page, dept, prof_slug, prof_label, results, seen_tels):
    url = f"https://www.pagesjaunes.fr/annuaire/{dept}/{prof_slug}"
    try:
        await page.goto(url, timeout=25000, wait_until='domcontentloaded')
        await asyncio.sleep(1.0)
        content = await page.content()
        
        cards = await page.query_selector_all('li.bi.bi-generic, article.bi, .bi-container')
        count = 0
        
        if cards:
            for card in cards:
                try:
                    text = await card.inner_text()
                    tels = tel_re.findall(text)
                    if not tels:
                        continue
                    tel = fmt(tels[0])
                    if tel in seen_tels:
                        continue
                    
                    nom_el = await card.query_selector('a.denomination, .bi-denomination, h2 a')
                    nom = (await nom_el.inner_text()).strip() if nom_el else ''
                    
                    adr_el = await card.query_selector('.bi-adress, [class*="address"]')
                    adresse = (await adr_el.inner_text()).strip() if adr_el else ''
                    
                    cp_m = re.search(r'(\d{5})', adresse)
                    cp = cp_m.group(1) if cp_m else dept
                    ville_m = re.search(r'\d{5}\s+([A-Za-zÀ-ÿ\s\-]+)', adresse)
                    ville = ville_m.group(1).strip()[:25] if ville_m else ''
                    
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
            # Fallback texte brut
            tels = tel_re.findall(content)
            for t in tels:
                tel = fmt(t)
                if tel not in seen_tels:
                    seen_tels.add(tel)
                    results.append({
                        'nom': '',
                        'profession': prof_label,
                        'telephone_direct': tel,
                        'ville': '',
                        'cp': dept,
                        'source': 'Pages Jaunes',
                        'statut': '',
                        'note': '',
                        'date_ajout': datetime.now().strftime('%Y-%m-%d')
                    })
                    count += 1
        
        return count
    except:
        return 0

async def main():
    print("🔧 Scraper Pages Jaunes - ARTISANS avec 06/07")
    
    results = []
    seen_tels = set()
    
    if os.path.exists(OUTPUT):
        with open(OUTPUT) as f:
            results = json.load(f)
        seen_tels = {r['telephone_direct'] for r in results if r.get('telephone_direct')}
        print(f"📊 {len(results)} contacts existants")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1366, 'height': 768}
        )
        page = await context.new_page()
        
        # Cookies
        try:
            await page.goto('https://www.pagesjaunes.fr', timeout=15000)
            await asyncio.sleep(2)
            for sel in ['#didomi-notice-agree-button','button[id*="accept"]']:
                btn = await page.query_selector(sel)
                if btn:
                    await btn.click()
                    break
            await asyncio.sleep(1)
        except:
            pass
        
        total = 0
        for prof_slug, prof_label in PROFESSIONS:
            print(f"\n🔨 {prof_label}")
            prof_total = 0
            
            for dept in DEPTS:
                n = await scrape_dept(page, dept, prof_slug, prof_label, results, seen_tels)
                if n > 0:
                    prof_total += n
                    total += n
                    print(f"  Dept {dept}: +{n} | Total: {total}")
                    
                    if total % 50 == 0:
                        with open(OUTPUT, 'w', encoding='utf-8') as f:
                            json.dump(results, f, ensure_ascii=False)
                
                await asyncio.sleep(0.7)
            
            print(f"✅ {prof_label}: {prof_total} contacts")
            with open(OUTPUT, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False)
        
        await browser.close()
    
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)
    
    print(f"\n🎉 TOTAL ARTISANS: {total} contacts avec 06/07")
    print(f"📁 {OUTPUT}")

if __name__ == '__main__':
    asyncio.run(main())
