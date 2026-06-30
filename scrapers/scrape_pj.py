"""
Scraper Pages Jaunes - Kinés, Médecins, Ostéos avec 06/07 uniquement
Par département 01-95 + DOM
Lance: python3 scrape_pj.py
"""
import asyncio, json, os, re
from datetime import datetime
from playwright.async_api import async_playwright

OUTPUT = os.path.expanduser("~/Desktop/crm_cgp/data/pagesjaunesCRM.json")

DEPTS = [str(i).zfill(2) for i in range(1, 96)] + ['971','972','973','974']

PROFESSIONS = [
    ("kinesitherapeutes-masseurs-kinesitherapeutes", "Kinésithérapeute"),
    ("medecins-generalistes", "Médecin généraliste"),
    ("osteopathes", "Ostéopathe"),
]

tel_re = re.compile(r'(?:Tél\s*:\s*)?(0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2})')

def fmt(t):
    t = re.sub(r'[\s\.\-]','',t)
    return ' '.join([t[i:i+2] for i in range(0,10,2)]) if len(t)==10 else t

def clean_name(s):
    # Supprimer prefixes Pages Jaunes
    s = re.sub(r'^(Masseur |Médecin |Ostéopathe )', '', s.strip())
    return s.strip()

async def scrape_dept(page, dept, prof_slug, prof_label, results, seen_tels):
    # URL format Pages Jaunes par département
    url = f"https://www.pagesjaunes.fr/annuaire/{dept}/{prof_slug}"
    
    try:
        await page.goto(url, timeout=25000, wait_until='domcontentloaded')
        await asyncio.sleep(1.2)
        
        # Récupérer tout le texte de la page
        content = await page.content()
        
        # Trouver les blocs avec Tél: 06/07
        # Pattern: trouver les 06/07 et remonter pour trouver le nom + adresse
        
        # Extraire tous les blocs de résultats
        cards = await page.query_selector_all('li.bi.bi-generic, article.bi, .bi-container, [class*="result"]')
        
        count = 0
        if cards:
            for card in cards:
                try:
                    text = await card.inner_text()
                    tels = tel_re.findall(text)
                    if not tels:
                        continue
                    
                    tel = fmt(tels[0].replace('Tél : ','').replace('Tél: ',''))
                    if tel in seen_tels:
                        continue
                    
                    # Nom
                    nom_el = await card.query_selector('a.denomination, .bi-denomination, h2 a, .denomination')
                    nom = clean_name(await nom_el.inner_text()) if nom_el else ''
                    
                    # Adresse
                    adr_el = await card.query_selector('.bi-adress, [class*="address"], .adress')
                    adresse = (await adr_el.inner_text()).strip() if adr_el else ''
                    
                    cp_m = re.search(r'(\d{5})', adresse)
                    cp = cp_m.group(1) if cp_m else dept
                    
                    ville_m = re.search(r'\d{5}\s+([A-Za-zÀ-ÿ\s\-]+)', adresse)
                    ville = ville_m.group(1).strip() if ville_m else ''
                    
                    seen_tels.add(tel)
                    results.append({
                        'nom': nom,
                        'specialite': prof_label,
                        'telephone_direct': tel,
                        'adresse': adresse,
                        'ville': ville,
                        'cp': cp,
                        'source': 'Pages Jaunes',
                        'date_ajout': datetime.now().strftime('%Y-%m-%d')
                    })
                    count += 1
                except:
                    continue
        else:
            # Fallback: parser le texte brut de la page
            texts = await page.query_selector_all('*')
            # Chercher pattern "Tél : 06..." dans le HTML
            matches = tel_re.findall(content)
            for m in matches:
                tel = fmt(m)
                if tel not in seen_tels and tel.startswith(('06','07')):
                    seen_tels.add(tel)
                    results.append({
                        'nom': f'Pro {prof_label}',
                        'specialite': prof_label,
                        'telephone_direct': tel,
                        'ville': '',
                        'cp': dept,
                        'source': 'Pages Jaunes',
                        'date_ajout': datetime.now().strftime('%Y-%m-%d')
                    })
                    count += 1
        
        return count
        
    except Exception as e:
        return 0

async def main():
    print("🚀 Scraper Pages Jaunes - 06/07 uniquement")
    
    results = []
    seen_tels = set()
    
    if os.path.exists(OUTPUT):
        with open(OUTPUT) as f:
            results = json.load(f)
        seen_tels = {r['telephone_direct'] for r in results if r.get('telephone_direct')}
        print(f"📊 {len(results)} contacts existants")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=['--no-sandbox']
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1366, 'height': 768}
        )
        page = await context.new_page()
        
        # Accepter cookies
        try:
            await page.goto('https://www.pagesjaunes.fr', timeout=15000)
            await asyncio.sleep(2)
            for sel in ['#didomi-notice-agree-button','button[id*="accept"]','#accept-all']:
                btn = await page.query_selector(sel)
                if btn:
                    await btn.click()
                    break
            await asyncio.sleep(1)
        except:
            pass
        
        total = 0
        for prof_slug, prof_label in PROFESSIONS:
            print(f"\n📋 {prof_label}")
            prof_total = 0
            
            for dept in DEPTS:
                n = await scrape_dept(page, dept, prof_slug, prof_label, results, seen_tels)
                if n > 0:
                    prof_total += n
                    total += n
                    print(f"  Dept {dept}: +{n} (total: {total})")
                    
                    # Sauvegarde toutes les 10 depts
                    if prof_total % 10 == 0:
                        with open(OUTPUT, 'w', encoding='utf-8') as f:
                            json.dump(results, f, ensure_ascii=False)
                
                await asyncio.sleep(0.8)
            
            print(f"✅ {prof_label}: {prof_total} contacts avec 06")
        
        await browser.close()
    
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)
    
    print(f"\n🎉 TOTAL: {total} contacts avec 06/07")
    print(f"📁 {OUTPUT}")

if __name__ == '__main__':
    asyncio.run(main())
