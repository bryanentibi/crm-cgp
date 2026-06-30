from playwright.sync_api import sync_playwright
import re, json
from datetime import date

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto('https://app.powerbi.com/view?r=eyJrIjoiNmY5NjQwZDAtY2UyOC00OGY5LTlkNzgtNDZmMzMxNmZjOTNlIiwidCI6IjZmMjdmNjhjLWFmMTYtNDkzZC1iNDgzLTAxOTI2OGY1YTFiOCIsImMiOjl9', timeout=30000)
    page.wait_for_timeout(8000)

    infirmiers = []
    page_num = 0

    while True:
        page_num += 1
        print(f'Page {page_num}...')

        # Lire toutes les cellules du tableau
        cells = page.locator('div[class*=bodyCells] div[class*=cell]').all()
        if not cells:
            cells = page.locator('div[role=gridcell]').all()

        texts = []
        for cell in cells:
            try:
                t = cell.inner_text().strip()
                if t:
                    texts.append(t)
            except:
                pass

        print(f'  {len(texts)} cellules trouvees')
        if texts:
            print('  Apercu:', texts[:10])

        # Chercher les portables
        portables = [t for t in texts if re.match(r'^0033[67]', t)]
        print(f'  {len(portables)} portables: {portables[:3]}')

        with open(f'tableau_page{page_num}.txt', 'w') as f:
            f.write('\n'.join(texts))

        break  # Une page pour tester

    browser.close()
