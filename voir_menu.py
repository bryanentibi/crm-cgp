from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width':1920,'height':1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9',timeout=30000)
    page.wait_for_timeout(8000)

    # Ouvrir menu
    page.locator('text=Tout').first.click()
    page.wait_for_timeout(2000)

    # Ouvrir Bretagne
    page.locator('text=Bretagne').first.click()
    page.wait_for_timeout(1500)

    # Ouvrir Ile-de-France
    page.locator('text=Île-de-France').first.click()
    page.wait_for_timeout(1500)

    page.screenshot(path='menu_regions.png')

    # Lire tout le texte du menu
    tout = page.locator('body').inner_text()
    lignes = [l.strip() for l in tout.split('\n') if l.strip()]
    for l in lignes[:80]:
        print(l)

    browser.close()
