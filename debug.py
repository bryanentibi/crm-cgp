import json, re

with open('powerbi_dept.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Chercher toutes les strings qui ressemblent a des numeros
all_nums = []
def find_nums(obj):
    if isinstance(obj, str):
        if re.match(r'^0033\d{8,}$', obj) or re.match(r'^06\d{8}$', obj) or re.match(r'^07\d{8}$', obj):
            all_nums.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            find_nums(v)
    elif isinstance(obj, list):
        for v in obj:
            find_nums(v)

find_nums(data)
print(f'{len(all_nums)} numeros trouves au total')
print('Exemples:', all_nums[:20])

# Chercher specifiquement les portables (06/07)
portables = [n for n in all_nums if n.startswith('06') or n.startswith('07') or n.startswith('00336') or n.startswith('00337')]
print(f'{len(portables)} portables trouves')
print('Portables:', portables[:10])
