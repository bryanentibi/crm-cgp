from playwright.sync_api import sync_playwright
import re

infirmiers = []

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9', timeout=30000)
    page.wait_for_timeout(6000)
    
    # Ouvrir menu
    page.locator('text=Tout').first.click()
    page.wait_for_timeout(2000)
    
    # Faire defiler le menu vers le bas pour voir plus de regions
    menu = page.locator('div[class*=slicerItemContainer], div[class*=slicer]').first
    for i in range(5):
        page.keyboard.press('PageDown')
        page.wait_for_timeout(500)
    
    page.screenshot(path='menu_scroll.png')
    
    # Lire tout le contenu du menu
    all_text = page.locator('body').inner_text()
    lines = [l.strip() for l in all_text.split('\n') if l.strip()]
    cidoi_lines = [l for l in lines if 'CIDOI' in l or 'Paris' in l or '75' in l]
    print('Lignes menu trouvees:')
    for l in cidoi_lines[:30]:
        print(' ', l)
    
    browser.close()
