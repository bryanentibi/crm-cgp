from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json, os, threading, time
from datetime import datetime, date

app = Flask(__name__, static_folder='static')
CORS(app)
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

def load_json(f):
    p = os.path.join(DATA_DIR, f)
    if not os.path.exists(p): return []
    with open(p, 'r', encoding='utf-8') as fh: return json.load(fh)

def save_json(f, data):
    p = os.path.join(DATA_DIR, f)
    with open(p, 'w', encoding='utf-8') as fh: json.dump(data, fh, ensure_ascii=False, indent=2, default=str)

@app.route('/')
def index(): return send_from_directory('static', 'index.html')

@app.route('/api/stats')
def stats():
    s = load_json('professionnels_sante.json')
    p = load_json('pharmacies.json')
    today = date.today().isoformat()
    def by_status(lst):
        c = {}
        for x in lst: c[x.get('statut','nouveau')] = c.get(x.get('statut','nouveau'),0)+1
        return c
    def by_spe(lst):
        c = {}
        for x in lst: c[x.get('specialite','?')] = c.get(x.get('specialite','?'),0)+1
        return dict(sorted(c.items(), key=lambda x: -x[1]))
    return jsonify({
        'sante': {'total': len(s), 'statuts': by_status(s), 'par_specialite': by_spe(s), 'nouveaux_jour': sum(1 for x in s if x.get('date_ajout','').startswith(today)), 'avec_tel': sum(1 for x in s if x.get('telephone_direct'))},
        'pharmacies': {'total': len(p), 'statuts': by_status(p), 'avec_dirigeant': sum(1 for x in p if x.get('dirigeant')), 'avec_tel': sum(1 for x in p if x.get('telephone_direct'))},
        'mise_a_jour': datetime.now().isoformat()
    })

@app.route('/api/sante')
def get_sante():
    data = load_json('professionnels_sante.json')
    search = request.args.get('search','').lower()
    statut = request.args.get('statut','')
    specialites = request.args.get('specialites','')
    mode = request.args.get('mode','')
    dept = request.args.get('dept','')
    nouveaux = request.args.get('nouveaux','')
    sans_direct = request.args.get('sans_direct','')
    avec_direct = request.args.get('avec_direct','')
    sort = request.args.get('sort','date_debut')
    page = max(1, int(request.args.get('page',1)))
    per_page = min(500, int(request.args.get('per_page',50)))

    f = data
    if search: f = [x for x in f if search in (x.get('nom','')+' '+x.get('prenom','')+' '+x.get('ville','')).lower()]
    if statut: f = [x for x in f if x.get('statut') == statut]
    if specialites:
        sl = [s.lower() for s in specialites.split('|')]
        f = [x for x in f if any(s in x.get('specialite','').lower() for s in sl)]
    if mode: f = [x for x in f if mode.lower() in x.get('mode_exercice','').lower()]
    if dept: f = [x for x in f if x.get('cp','').startswith(dept)]
    if nouveaux == '1':
        today = date.today().isoformat()
        f = [x for x in f if x.get('date_ajout','').startswith(today)]
    if sans_direct == '1': f = [x for x in f if not x.get('telephone_direct')]
    if avec_direct == '1': f = [x for x in f if x.get('telephone_direct')]

    # Tri : avec tel d'abord, puis par date
    f = sorted(f, key=lambda x: (0 if x.get('telephone_direct') else 1, x.get('date_debut') or x.get('date_ajout') or ''), reverse=False)
    if sort == 'date_desc': f = sorted(f, key=lambda x: x.get('date_debut') or x.get('date_ajout') or '', reverse=True)

    total = len(f)
    start = (page-1)*per_page
    return jsonify({'data': f[start:start+per_page], 'total': total, 'page': page, 'pages': max(1,(total+per_page-1)//per_page)})

@app.route('/api/sante/<int:sid>', methods=['PATCH'])
def update_sante(sid):
    data = load_json('professionnels_sante.json')
    body = request.json
    for x in data:
        if x['id'] == sid:
            for k,v in body.items(): x[k] = v
            x['date_modif'] = datetime.now().isoformat()
            break
    save_json('professionnels_sante.json', data)
    return jsonify({'ok': True})

@app.route('/api/pharmacies')
def get_pharmacies():
    data = load_json('pharmacies.json')
    search = request.args.get('search','').lower()
    statut = request.args.get('statut','')
    sans_direct = request.args.get('sans_direct','')
    avec_direct = request.args.get('avec_direct','')
    dept = request.args.get('dept','')
    page = max(1, int(request.args.get('page',1)))
    per_page = min(500, int(request.args.get('per_page',50)))

    f = data
    if search: f = [x for x in f if search in (x.get('nom','')+' '+x.get('dirigeant','')+' '+x.get('ville','')).lower()]
    if statut: f = [x for x in f if x.get('statut') == statut]
    if dept: f = [x for x in f if x.get('cp','').startswith(dept)]
    if sans_direct == '1': f = [x for x in f if not x.get('telephone_direct')]
    if avec_direct == '1': f = [x for x in f if x.get('telephone_direct')]

    f = sorted(f, key=lambda x: (0 if x.get('telephone_direct') else 1, x.get('nom','')))

    total = len(f)
    start = (page-1)*per_page
    return jsonify({'data': f[start:start+per_page], 'total': total, 'page': page, 'pages': max(1,(total+per_page-1)//per_page)})

@app.route('/api/pharmacies/<int:pid>', methods=['PATCH'])
def update_pharmacie(pid):
    data = load_json('pharmacies.json')
    body = request.json
    for x in data:
        if x['id'] == pid:
            for k,v in body.items(): x[k] = v
            x['date_modif'] = datetime.now().isoformat()
            break
    save_json('pharmacies.json', data)
    return jsonify({'ok': True})

scraping_status = {'running': False, 'progress': 0, 'message': '', 'nouveaux': 0}

@app.route('/api/scraping/status')
def scraping_status_route(): return jsonify(scraping_status)

@app.route('/api/scraping/launch', methods=['POST'])
def launch_scraping():
    if scraping_status['running']: return jsonify({'error': 'Déjà en cours'}), 400
    sources = request.json.get('sources', ['powerbi'])
    t = threading.Thread(target=run_scraping, args=(sources,))
    t.daemon = True
    t.start()
    return jsonify({'ok': True})

def run_scraping(sources):
    import subprocess, sys
    scraping_status['running'] = True
    scraping_status['progress'] = 0
    try:
        for i, src in enumerate(sources):
            scraping_status['message'] = f'Scraping {src}...'
            scraping_status['progress'] = int(i/len(sources)*90)
            script = os.path.join(os.path.dirname(__file__), 'scrapers', f'{src}.py')
            if os.path.exists(script):
                subprocess.run([sys.executable, script], timeout=600)
            time.sleep(1)
        scraping_status['progress'] = 100
        scraping_status['message'] = 'Terminé !'
    except Exception as e:
        scraping_status['message'] = f'Erreur: {e}'
    finally:
        scraping_status['running'] = False

if __name__ == '__main__':
    os.makedirs(DATA_DIR, exist_ok=True)
    for f in ['professionnels_sante.json', 'pharmacies.json']:
        if not os.path.exists(os.path.join(DATA_DIR, f)):
            save_json(f, [])
    print('CRM démarré sur http://localhost:5000')
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get("PORT", 8181)))
