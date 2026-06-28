from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json, os
from datetime import datetime, date

app = Flask(__name__, static_folder='static')
CORS(app)

DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    def get_db():
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    USE_DB = True
    print("Mode PostgreSQL Railway")
else:
    USE_DB = False
    print("CRM demarré sur http://localhost:8181")

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/stats')
def stats():
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as total FROM sante")
        total_sante = cur.fetchone()['total']
        cur.execute("SELECT COUNT(*) as total FROM sante WHERE telephone_direct IS NOT NULL AND telephone_direct != ''")
        avec_tel = cur.fetchone()['total']
        cur.execute("SELECT COUNT(*) as total FROM sante WHERE date_ajout = CURRENT_DATE::text")
        nouveaux = cur.fetchone()['total']
        cur.execute("SELECT specialite, COUNT(*) as cnt FROM sante GROUP BY specialite ORDER BY cnt DESC LIMIT 10")
        par_spe = {r['specialite']: r['cnt'] for r in cur.fetchall() if r['specialite']}
        cur.execute("SELECT statut, COUNT(*) as cnt FROM sante GROUP BY statut")
        statuts_s = {r['statut']: r['cnt'] for r in cur.fetchall()}
        cur.execute("SELECT COUNT(*) as total FROM pharmacies")
        total_phr = cur.fetchone()['total']
        cur.execute("SELECT COUNT(*) as total FROM pharmacies WHERE dirigeant IS NOT NULL AND dirigeant != ''")
        avec_dir = cur.fetchone()['total']
        cur.execute("SELECT statut, COUNT(*) as cnt FROM pharmacies GROUP BY statut")
        statuts_p = {r['statut']: r['cnt'] for r in cur.fetchall()}
        conn.close()
        return jsonify({
            'sante': {'total': total_sante, 'avec_tel': avec_tel, 'nouveaux_jour': nouveaux, 'par_specialite': par_spe, 'statuts': statuts_s},
            'pharmacies': {'total': total_phr, 'avec_dirigeant': avec_dir, 'avec_tel': 0, 'statuts': statuts_p},
            'mise_a_jour': datetime.now().isoformat()
        })
    else:
        sante = load_json('professionnels_sante.json')
        pharmacies = load_json('pharmacies.json')
        today = date.today().isoformat()
        par_spe = {}
        statuts_s = {}
        avec_tel = 0
        nouveaux = 0
        for c in sante:
            s = c.get('specialite', 'Inconnu') or 'Inconnu'
            par_spe[s] = par_spe.get(s, 0) + 1
            st = c.get('statut', 'nouveau') or 'nouveau'
            statuts_s[st] = statuts_s.get(st, 0) + 1
            if c.get('telephone_direct'): avec_tel += 1
            if c.get('date_ajout', '')[:10] == today: nouveaux += 1
        statuts_p = {}
        avec_dir = 0
        for p in pharmacies:
            st = p.get('statut', 'nouveau') or 'nouveau'
            statuts_p[st] = statuts_p.get(st, 0) + 1
            if p.get('dirigeant'): avec_dir += 1
        return jsonify({
            'sante': {'total': len(sante), 'avec_tel': avec_tel, 'nouveaux_jour': nouveaux, 'par_specialite': par_spe, 'statuts': statuts_s},
            'pharmacies': {'total': len(pharmacies), 'avec_dirigeant': avec_dir, 'avec_tel': 0, 'statuts': statuts_p},
            'mise_a_jour': datetime.now().isoformat()
        })

@app.route('/api/sante')
def api_sante():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))
    search = request.args.get('search', '').lower()
    statut = request.args.get('statut', '')
    avec_direct = request.args.get('avec_direct', '')
    sans_direct = request.args.get('sans_direct', '')
    nouveaux = request.args.get('nouveaux', '')
    specialites = request.args.get('specialites', '')

    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        where = ["1=1"]
        params = []
        if search:
            where.append("(LOWER(nom) LIKE %s OR LOWER(ville) LIKE %s OR LOWER(prenom) LIKE %s)")
            params += [f'%{search}%', f'%{search}%', f'%{search}%']
        if statut:
            where.append("statut = %s")
            params.append(statut)
        if avec_direct:
            where.append("telephone_direct IS NOT NULL AND telephone_direct != ''")
        if sans_direct:
            where.append("(telephone_direct IS NULL OR telephone_direct = '')")
        if nouveaux:
            where.append("date_ajout = CURRENT_DATE::text")
        if specialites:
            spes = specialites.split('|')
            where.append("(" + " OR ".join(["LOWER(specialite) LIKE %s"] * len(spes)) + ")")
            params += [f'%{s.lower()}%' for s in spes]
        where_str = " AND ".join(where)
        cur.execute(f"SELECT COUNT(*) as total FROM sante WHERE {where_str}", params)
        total = cur.fetchone()['total']
        offset = (page - 1) * per_page
        cur.execute(f"SELECT * FROM sante WHERE {where_str} ORDER BY id LIMIT %s OFFSET %s", params + [per_page, offset])
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return jsonify({'data': rows, 'total': total, 'page': page, 'pages': (total + per_page - 1) // per_page})
    else:
        data = load_json('professionnels_sante.json')
        if search:
            data = [c for c in data if search in (c.get('nom','') or '').lower() or search in (c.get('ville','') or '').lower() or search in (c.get('prenom','') or '').lower()]
        if statut:
            data = [c for c in data if c.get('statut','nouveau') == statut]
        if avec_direct:
            data = [c for c in data if c.get('telephone_direct')]
        if sans_direct:
            data = [c for c in data if not c.get('telephone_direct')]
        if specialites:
            spes = [s.lower() for s in specialites.split('|')]
            data = [c for c in data if any(s in (c.get('specialite','') or '').lower() for s in spes)]
        total = len(data)
        start = (page - 1) * per_page
        return jsonify({'data': data[start:start+per_page], 'total': total, 'page': page, 'pages': (total + per_page - 1) // per_page})

@app.route('/api/sante/<int:id>', methods=['PATCH'])
def update_sante(id):
    body = request.json
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        fields = []
        params = []
        for k in ['statut', 'note', 'telephone_direct']:
            if k in body:
                fields.append(f"{k} = %s")
                params.append(body[k])
        if fields:
            cur.execute(f"UPDATE sante SET {', '.join(fields)} WHERE id = %s", params + [id])
            conn.commit()
        conn.close()
    else:
        data = load_json('professionnels_sante.json')
        for c in data:
            if c.get('id') == id:
                c.update(body)
                break
        save_json('professionnels_sante.json', data)
    return jsonify({'ok': True})

@app.route('/api/pharmacies')
def api_pharmacies():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))
    search = request.args.get('search', '').lower()
    statut = request.args.get('statut', '')
    avec_direct = request.args.get('avec_direct', '')

    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        where = ["1=1"]
        params = []
        if search:
            where.append("(LOWER(nom) LIKE %s OR LOWER(dirigeant) LIKE %s OR LOWER(ville) LIKE %s)")
            params += [f'%{search}%', f'%{search}%', f'%{search}%']
        if statut:
            where.append("statut = %s")
            params.append(statut)
        if avec_direct:
            where.append("telephone_direct IS NOT NULL AND telephone_direct != ''")
        where_str = " AND ".join(where)
        cur.execute(f"SELECT COUNT(*) as total FROM pharmacies WHERE {where_str}", params)
        total = cur.fetchone()['total']
        offset = (page - 1) * per_page
        cur.execute(f"SELECT * FROM pharmacies WHERE {where_str} ORDER BY id LIMIT %s OFFSET %s", params + [per_page, offset])
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return jsonify({'data': rows, 'total': total, 'page': page, 'pages': (total + per_page - 1) // per_page})
    else:
        data = load_json('pharmacies.json')
        if search:
            data = [c for c in data if search in (c.get('nom','') or '').lower() or search in (c.get('dirigeant','') or '').lower() or search in (c.get('ville','') or '').lower()]
        if statut:
            data = [c for c in data if c.get('statut','nouveau') == statut]
        if avec_direct:
            data = [c for c in data if c.get('telephone_direct')]
        total = len(data)
        start = (page - 1) * per_page
        return jsonify({'data': data[start:start+per_page], 'total': total, 'page': page, 'pages': (total + per_page - 1) // per_page})

@app.route('/api/pharmacies/<int:id>', methods=['PATCH'])
def update_pharmacies(id):
    body = request.json
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        fields = []
        params = []
        for k in ['statut', 'note', 'telephone_direct']:
            if k in body:
                fields.append(f"{k} = %s")
                params.append(body[k])
        if fields:
            cur.execute(f"UPDATE pharmacies SET {', '.join(fields)} WHERE id = %s", params + [id])
            conn.commit()
        conn.close()
    else:
        data = load_json('pharmacies.json')
        for c in data:
            if c.get('id') == id:
                c.update(body)
                break
        save_json('pharmacies.json', data)
    return jsonify({'ok': True})

@app.route('/api/scraping/launch', methods=['POST'])
def launch_scraping():
    return jsonify({'ok': True, 'message': 'Scraping non disponible sur Railway'})

@app.route('/api/scraping/status')
def scraping_status():
    return jsonify({'running': False, 'progress': 100, 'message': 'Idle'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8181))
    app.run(debug=True, host='0.0.0.0', port=port)
