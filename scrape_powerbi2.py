from playwright.sync_api import sync_playwright
import json

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    all_responses = []

    def handle_response(response):
        if 'querydata' in response.url:
            try:
                body = response.json()
                all_responses.append(body)
            except:
                pass

    page.on('response', handle_response)
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9', timeout=30000)
    page.wait_for_timeout(6000)

    # Ouvrir le menu departement
    page.locator('text=Tout').first.click()
    page.wait_for_timeout(2000)

    # Cliquer sur Auvergne-Rhone-Alpes pour deployer
    page.locator('text=Auvergne-Rhône-Alpes').click()
    page.wait_for_timeout(1000)

    # Cliquer sur CIDOI 01-38
    page.locator('text=CIDOI 01-38').click()
    page.wait_for_timeout(4000)

    page.screenshot(path='powerbi_dept.png')
    print('Screenshot sauvegarde')
    print(f'{len(all_responses)} reponses capturees')

    with open('powerbi_dept.json', 'w') as f:
        json.dump(all_responses, f, ensure_ascii=False)

    browser.close()
