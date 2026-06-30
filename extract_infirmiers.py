import json, re
from datetime import date

with open('powerbi_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

resp4 = data[3]
result = resp4['results'][0]['result']['data']
dsr = result.get('dsr', {})
ds = dsr.get('DS', [{}])[0]
ph = ds.get('PH', [])

def convert_tel(t):
    t = str(t).replace(' ','').replace('.','')
    if t.startswith('0033'):
        t = '0' + t[4:]
    return t

infirmiers = []
next_id = 200000
today = date.today().isoformat()

for row in ph:
    for item in row.get('DM0', []):
        c = item.get('C', [])
        nom = rpps = tel_fixe = tel_port = adresse = cp_ville = None
        for val in c:
            if not isinstance(val, str):
                continue
            if re.match(r'^\d{11}$', val):
                rpps = val
            elif re.match(r'^0033\d+$', val):
                if not tel_fixe:
                    tel_fixe = convert_tel(val)
                else:
                    tel_port = convert_tel(val)
            elif re.match(r'^\d{5} - ', val):
                cp_ville = val
            elif len(val) > 5 and re.search(r'[A-Z]', val):
                if re.match(r'^\d', val):
                    adresse = val
                else:
                    nom = val
        if nom and rpps:
            parts = nom.strip().split(' ', 1)
            infirmiers.append({
                'id': next_id,
                'nom': parts[0],
                'prenom': parts[1].title() if len(parts) > 1 else '',
                'specialite': 'Infirmier',
                'rpps': rpps,
                'adresse': adresse or '',
                'cp': cp_ville.split(' - ')[0] if cp_ville else '',
                'ville': cp_ville.split(' - ')[1] if cp_ville and ' - ' in cp_ville else '',
                'telephone': tel_fixe or '',
                'telephone_direct': tel_port or '',
                'email': '',
                'mode_exercice': 'liberal',
                'date_debut': '',
                'date_ajout': today,
                'statut': 'nouveau',
                'note': '',
                'source': 'Ordre National Infirmiers'
            })
            next_id += 1

print(f'{len(infirmiers)} infirmiers extraits')
avec_port = [i for i in infirmiers if i['telephone_direct']]
print(f'{len(avec_port)} avec portable')
if infirmiers:
    print('Exemple:', infirmiers[0])

with open('data/professionnels_sante.json', 'r', encoding='utf-8') as f:
    existing = json.load(f)

all_data = existing + infirmiers
with open('data/professionnels_sante.json', 'w', encoding='utf-8') as f:
    json.dump(all_data, f, ensure_ascii=False)

print(f'Total: {len(all_data)}')
