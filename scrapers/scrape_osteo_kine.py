"""
Scraper osteopathie.org + sante.fr
- Ostéopathes avec 06/07 depuis registre ROF
- Kinés avec 06/07 depuis sante.fr
Lance: python3 scrape_osteo_kine.py
Output: data/osteo_kine.json
"""
import asyncio, json, os, re
from datetime import datetime
from playwright.async_api import async_playwright

OUTPUT = os.path.expanduser("~/Desktop/crm_cgp/data/osteo_kine.json")

tel_re = re.compile(r'0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}')

def fmt(t):
    t = re.sub(r'[\s\.\-]','',t.strip())
    return ' '.join([t[i:i+2] for i in range(0,10,2)]) if len(t)==10 else t

# Départements 01-95 + DOM
DEPTS = [str(i).zfill(2) for i in range(1,96)] + ['971','972','973','974']

async def scrape_osteo(page, results, seen_tels):
    """Scraper osteopathie.org par département"""
    print("\n🦴 Scraping osteopathie.org...")
    total = 0
    
    for dept in DEPTS:
        page_num = 1
        while True:
            url = f"https://www.osteopathie.org/?fond=annuaire&departement={dept}&pays=France+m%C3%A9tropolitaine&page={page_num}"
            try:
                await page.goto(url, timeout=20000, wait_until='domcontentloaded')
                await asyncio.sleep(1.0)
                
                content = await page.content()
                
                # Chercher les résultats
                # Format: nom, prénom, ville, tel dans des blocs
                rows = await page.query_selector_all('table tr, .result-item, [class*="praticien"], [class*="osteo"]')
                
                count = 0
                if rows:
                    for row in rows:
                        try:
                            text = await row.inner_text()
                            tels = tel_re.findall(text)
                            if not tels:
                                continue
                            tel = fmt(tels[0])
                            if tel in seen_tels or not tel.startswith(('06','07')):
                                continue
                            
                            lines = [l.strip() for l in text.split('\n') if l.strip()]
                            nom = lines[0] if lines else ''
                            ville = ''
                            cp = dept
                            
                            # Chercher CP dans le texte
                            cp_m = re.search(r'\b(\d{5})\b', text)
                            if cp_m:
                                cp = cp_m.group(1)
                            
                            seen_tels.add(tel)
                            results.append({
                                'nom': nom[:60],
                                'specialite': 'Ostéopathe',
                                'telephone_direct': tel,
                                'ville': ville,
                                'cp': cp,
                                'source': 'ROF Osteopathie',
                                'date_ajout': datetime.now().strftime('%Y-%m-%d')
                            })
                            count += 1
                            total += 1
                        except:
                            continue
                
                # Fallback regex
                if count == 0:
                    tels = tel_re.findall(content)
                    for t in tels[:10]:
                        tel = fmt(t)
                        if tel.startswith(('06','07')) and tel not in seen_tels:
                            seen_tels.add(tel)
                            results.append({
                                'nom': '',
                                'specialite': 'Ostéopathe',
                                'telephone_direct': tel,
                                'ville': '',
                                'cp': dept,
                                'source': 'ROF Osteopathie',
                                'date_ajout': datetime.now().strftime('%Y-%m-%d')
                            })
                            count += 1
                            total += 1
                
                if count > 0:
                    print(f"  Dept {dept} page {page_num}: +{count} | Total: {total}")
                
                # Vérifier page suivante
                next_btn = await page.query_selector('a[href*="page={}"]'.format(page_num + 1))
                if not next_btn or count == 0:
                    break
                page_num += 1
                await asyncio.sleep(0.8)
                
            except Exception as e:
                break
    
    print(f"✅ Ostéopathes: {total} contacts avec 06")
    return total

async def scrape_sante_fr(page, results, seen_tels):
    """Scraper sante.fr pour kinés par département"""
    print("\n💪 Scraping sante.fr kinés...")
    total = 0
    
    professions = [
        ("Kinésithérapie", "Kinésithérapeute"),
        ("Ostéopathie", "Ostéopathe"),
        ("Podologie", "Podologue"),
        ("Orthophonie", "Orthophoniste"),
    ]
    
    for prof_name, prof_label in professions:
        for dept in DEPTS[:20]:  # Top 20 depts pour commencer
            try:
                # URL sante.fr avec département
                url = f"https://www.sante.fr/recherche/trouver/{prof_name.replace(' ','%20')}/departement-{dept}"
                await page.goto(url, timeout=20000, wait_until='domcontentloaded')
                await asyncio.sleep(1.5)
                
                content = await page.content()
                tels = tel_re.findall(content)
                
                count = 0
                for t in tels:
                    tel = fmt(t)
                    if tel.startswith(('06','07')) and tel not in seen_tels:
                        seen_tels.add(tel)
                        results.append({
                            'nom': '',
                            'specialite': prof_label,
                            'telephone_direct': tel,
                            'ville': '',
                            'cp': dept,
                            'source': 'Sante.fr',
                            'date_ajout': datetime.now().strftime('%Y-%m-%d')
                        })
                        count += 1
                        total += 1
                
                if count > 0:
                    print(f"  {prof_label} dept {dept}: +{count} | Total: {total}")
                
                await asyncio.sleep(0.8)
            except:
                continue
    
    print(f"✅ Sante.fr: {total} contacts avec 06")
    return total

async def main():
    print("🚀 Scraper Ostéopathes + Kinés")
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
            headless=False,
            args=['--no-sandbox']
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            locale='fr-FR',
            viewport={'width': 1280, 'height': 800}
        )
        page = await context.new_page()
        
        # Scraper ostéopathes
        await scrape_osteo(page, results, seen_tels)
        
        # Sauvegarder
        with open(OUTPUT, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False)
        
        # Scraper sante.fr
        await scrape_sante_fr(page, results, seen_tels)
        
        await browser.close()
    
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)
    
    from collections import Counter
    specs = Counter(r['specialite'] for r in results)
    print(f"\n🎉 TOTAL: {len(results)} contacts avec 06/07")
    for s, n in specs.most_common():
        print(f"  {s}: {n}")

if __name__ == '__main__':
    asyncio.run(main())
