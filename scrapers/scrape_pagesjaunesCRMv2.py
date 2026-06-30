"""
Scraper Pages Jaunes - Kinés, Médecins, Ostéos avec 06/07 uniquement
Lance: python3 scrape_pagesjaunesCRMv2.py
Résultat: data/pagesjaunesCRM.json
"""
import asyncio, json, os, re, time
from datetime import datetime
from playwright.async_api import async_playwright

# ── CONFIG ──
PROFESSIONS = [
    ("kinesitherapeute", "Kinésithérapeute"),
    ("medecin-generaliste", "Médecin généraliste"),
    ("osteopathe", "Ostéopathe"),
]
OUTPUT = os.path.expanduser("~/Desktop/crm_cgp/data/pagesjaunesCRM.json")
MAX_PAGES = 50  # pages par profession (20 résultats/page = 1000 max par profession)
DELAY = 1.5     # secondes entre requêtes

tel_re = re.compile(r'0[67][\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}[\s\.\-]?\d{2}')

def fmt_tel(t):
    t = re.sub(r'[\s\.\-]', '', t)
    if len(t) == 10:
        return ' '.join([t[i:i+2] for i in range(0,10,2)])
    return t

async def scrape_profession(page, keyword, label, results):
    print(f"\n{'='*50}")
    print(f"🔍 Scraping: {label}")
    print(f"{'='*50}")
    
    page_num = 1
    total = 0
    
    while page_num <= MAX_PAGES:
        url = f"https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui={keyword}&ou=France&page={page_num}"
        
        try:
            await page.goto(url, timeout=30000, wait_until='domcontentloaded')
            await asyncio.sleep(DELAY)
            
            # Vérifier si on a des résultats
            cards = await page.query_selector_all('.bi-container')
            if not cards:
                cards = await page.query_selector_all('[class*="bi-content"]')
            if not cards:
                cards = await page.query_selector_all('.result-item-container')
            
            if not cards:
                print(f"  Page {page_num}: Aucun résultat trouvé - arrêt")
                break
            
            page_count = 0
            for card in cards:
                try:
                    # Nom
                    nom_el = await card.query_selector('.bi-denomination, .denomination, h2, .name')
                    nom = (await nom_el.inner_text()).strip() if nom_el else ''
                    
                    # Téléphone
                    tel_el = await card.query_selector('.bi-phone, [class*="phone"], .tel')
                    tel_text = ''
                    if tel_el:
                        tel_text = (await tel_el.inner_text()).strip()
                    
                    # Chercher 06/07 dans tout le texte de la carte
                    card_text = await card.inner_text()
                    tels = tel_re.findall(card_text)
                    
                    if not tels:
                        continue  # Pas de 06/07 → on skip
                    
                    tel_direct = fmt_tel(tels[0])
                    
                    # Adresse
                    adr_el = await card.query_selector('.bi-adress, .address, [class*="address"]')
                    adresse = (await adr_el.inner_text()).strip() if adr_el else ''
                    
                    # Ville + CP
                    cp_match = re.search(r'(\d{5})\s+([A-Za-zÀ-ÿ\s\-]+)', adresse)
                    cp = cp_match.group(1) if cp_match else ''
                    ville = cp_match.group(2).strip() if cp_match else ''
                    
                    # Email
                    email_el = await card.query_selector('a[href^="mailto:"]')
                    email = ''
                    if email_el:
                        href = await email_el.get_attribute('href')
                        email = href.replace('mailto:', '').strip() if href else ''
                    
                    if nom and tel_direct:
                        contact = {
                            'nom': nom,
                            'specialite': label,
                            'telephone_direct': tel_direct,
                            'email': email,
                            'adresse': adresse,
                            'ville': ville,
                            'cp': cp,
                            'source': 'Pages Jaunes',
                            'date_ajout': datetime.now().strftime('%Y-%m-%d')
                        }
                        
                        # Dédupliquer par téléphone
                        if not any(r.get('telephone_direct') == tel_direct for r in results):
                            results.append(contact)
                            page_count += 1
                            total += 1
                
                except Exception as e:
                    continue
            
            print(f"  Page {page_num}: +{page_count} contacts avec 06 (total: {total})")
            
            # Sauvegarder à chaque page
            with open(OUTPUT, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            
            # Vérifier s'il y a une page suivante
            next_btn = await page.query_selector('[aria-label="Page suivante"], .pagination-next, a[rel="next"]')
            if not next_btn:
                print(f"  Fin de la pagination à la page {page_num}")
                break
            
            page_num += 1
            await asyncio.sleep(DELAY)
            
        except Exception as e:
            print(f"  Erreur page {page_num}: {e}")
            await asyncio.sleep(3)
            page_num += 1
            continue
    
    print(f"✅ {label}: {total} contacts avec 06 récupérés")
    return total

async def main():
    print("🚀 Démarrage scraper Pages Jaunes")
    print(f"📁 Output: {OUTPUT}")
    
    # Charger les données existantes
    results = []
    if os.path.exists(OUTPUT):
        with open(OUTPUT) as f:
            results = json.load(f)
        print(f"📊 {len(results)} contacts existants chargés")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,  # Visible pour éviter détection
            args=['--no-sandbox', '--disable-dev-shm-usage']
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 800}
        )
        page = await context.new_page()
        
        # Accepter les cookies si nécessaire
        try:
            await page.goto('https://www.pagesjaunes.fr', timeout=15000)
            await asyncio.sleep(2)
            cookie_btn = await page.query_selector('#didomi-notice-agree-button, .accept-all, [id*="accept"]')
            if cookie_btn:
                await cookie_btn.click()
                print("✅ Cookies acceptés")
                await asyncio.sleep(1)
        except:
            pass
        
        total_global = 0
        for keyword, label in PROFESSIONS:
            n = await scrape_profession(page, keyword, label, results)
            total_global += n
            # Pause entre professions
            await asyncio.sleep(3)
        
        await browser.close()
    
    # Sauvegarde finale
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*50}")
    print(f"🎉 TERMINÉ ! {total_global} nouveaux contacts avec 06")
    print(f"📁 Fichier: {OUTPUT}")
    print(f"{'='*50}")

if __name__ == '__main__':
    asyncio.run(main())
