import json, re
from datetime import date

with open('powerbi_dept.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

def convert_tel(t):
    t = str(t).replace(' ','').replace('.','')
    if t.startswith('0033'):
        t = '0' + t[4:]
    return t

infirmiers = []
today = date.today().isoformat()
next_id = 300000

for resp in data:
    results = resp.get('results', [])
    for res in results:
        dsr = res.get('result', {}).get('data', {}).get('dsr', {})
        for ds in dsr.get('DS', []):
            for row in ds.get('PH', []):
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
                        elif len(val) > 5 and re.search(r'[A-Z]', val) and not val.startswith('00'):
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
if avec_port:
    print('Exemple:', avec_port[0]['nom'], avec_port[0]['prenom'], '->', avec_port[0]['telephone_direct'])
