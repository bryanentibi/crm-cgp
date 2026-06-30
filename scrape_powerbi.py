from playwright.sync_api import sync_playwright
import json

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    responses = []

    def handle_response(response):
        if 'querydata' in response.url:
            try:
                body = response.json()
                responses.append(body)
            except:
                pass

    page.on('response', handle_response)
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9', timeout=30000)
    page.wait_for_timeout(6000)

    # Cliquer sur le filtre departement et choisir 75 Paris
    print('Clic sur filtre departement...')
    dropdowns = page.locator('div[class*=slicer], div[class*=dropdown]').all()
    print(f'{len(dropdowns)} dropdowns trouves')
    
    # Essayer de cliquer sur Region/Departement
    try:
        page.locator('text=Tout').first.click()
        page.wait_for_timeout(2000)
        page.screenshot(path='powerbi_filter.png')
        print('Screenshot filtre sauvegarde')
    except Exception as e:
        print(f'Erreur clic: {e}')

    page.wait_for_timeout(3000)
    browser.close()

    print(f'{len(responses)} reponses capturees')
    with open('powerbi_data4.json', 'w') as f:
        json.dump(responses, f, ensure_ascii=False, indent=2)
