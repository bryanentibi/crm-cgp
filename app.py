from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json, os
from datetime import datetime, date
from zoneinfo import ZoneInfo

def paris_today():
    """Date du jour en heure française (Railway tourne en UTC)"""
    return datetime.now(ZoneInfo("Europe/Paris")).strftime('%Y-%m-%d')


import hashlib, secrets
from functools import wraps

USERS = {
    "bryanentibi": {
        "password_hash": "27bb63ed6f711388cd6e7b053728de769515945977022b6414ecc9ca546a0889",
        "role": "admin",
        "nom": "Bryan Entibi",
        "restricted": []
    },
    "quentin": {
        "password_hash": "27bb63ed6f711388cd6e7b053728de769515945977022b6414ecc9ca546a0889",
        "role": "user",
        "nom": "Quentin",
        "restricted": ["arbitrage", "ro"]
    }
}

SESSIONS = {}

def check_session(request):
    token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
    return SESSIONS.get(token)


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

# ================= CRM GESTION (base Elyon) =================
@app.route('/gestion')
def gestion_page():
    if not check_session(request):
        return send_from_directory('static', 'index.html')  # pas connecté -> login du CRM
    return send_from_directory('static', 'gestion.html')

def kv_conn():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS kv_store (k TEXT PRIMARY KEY, v TEXT)")
    # Migration unique : les données Gestion existantes appartiennent à Bryan
    cur.execute("UPDATE kv_store SET k = 'bryanentibi::' || k WHERE k NOT LIKE %s", ['%::%'])
    conn.commit()
    return conn, cur

def kv_namespace():
    """Chaque utilisateur Prospection a SA propre base Gestion"""
    s = check_session(request)
    return (s.get('username') if s else 'anon') + '::'  

@app.route('/api/storage', methods=['GET'])
def kv_list():
    if not check_session(request):
        return jsonify({'error': 'unauthorized'}), 401
    ns = kv_namespace()
    prefix = request.args.get('prefix', '')
    conn, cur = kv_conn()
    cur.execute("SELECT k FROM kv_store WHERE k LIKE %s", [ns + prefix + '%'])
    keys = [r['k'][len(ns):] for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify({'keys': keys})

@app.route('/api/storage/<path:key>', methods=['GET', 'PUT', 'DELETE'])
def kv_item(key):
    if not check_session(request):
        return jsonify({'error': 'unauthorized'}), 401
    key = kv_namespace() + key
    conn, cur = kv_conn()
    try:
        if request.method == 'GET':
            cur.execute("SELECT v FROM kv_store WHERE k = %s", [key])
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'not found'}), 404
            return jsonify({'key': key, 'value': json.loads(row['v'])})
        elif request.method == 'PUT':
            value = (request.get_json(silent=True) or {}).get('value')
            cur.execute(
                "INSERT INTO kv_store (k, v) VALUES (%s, %s) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
                [key, json.dumps(value)]
            )
            conn.commit()
            return jsonify({'key': key, 'value': value})
        else:  # DELETE
            cur.execute("DELETE FROM kv_store WHERE k = %s", [key])
            conn.commit()
            return jsonify({'key': key, 'deleted': True})
    finally:
        cur.close(); conn.close()

@app.route('/api/stats')
def stats():
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as total FROM sante")
        total_sante = cur.fetchone()['total']
        cur.execute("SELECT COUNT(*) as total FROM sante WHERE telephone_direct IS NOT NULL AND telephone_direct != ''")
        avec_tel = cur.fetchone()['total']
        cur.execute("SELECT COUNT(*) as total FROM sante WHERE date_ajout LIKE %s", [paris_today() + '%'])
        nouveaux = cur.fetchone()['total']
        cur.execute("SELECT specialite, COUNT(*) as cnt FROM sante GROUP BY specialite ORDER BY cnt DESC")
        par_spe = {r['specialite']: r['cnt'] for r in cur.fetchall() if r['specialite']}
        cur.execute("SELECT statut, COUNT(*) as cnt FROM sante GROUP BY statut")
        statuts_s = {(r['statut'] or ''): r['cnt'] for r in cur.fetchall()}
        cur.execute("SELECT COUNT(*) as total FROM sante WHERE date_creation IS NOT NULL AND date_creation != ''")
        avec_creation = cur.fetchone()['total']
        cur.execute("SELECT COUNT(*) as total FROM pharmacies")
        total_phr = cur.fetchone()['total']
        cur.execute("SELECT COUNT(*) as total FROM pharmacies WHERE dirigeant IS NOT NULL AND dirigeant != ''")
        avec_dir = cur.fetchone()['total']
        cur.execute("SELECT statut, COUNT(*) as cnt FROM pharmacies GROUP BY statut")
        statuts_p = {(r['statut'] or ''): r['cnt'] for r in cur.fetchall()}

        # Compteurs globaux NRP/RDV/KO sur les 3 tables (sante + artisans + pharmacies)
        # Les 'rappeler' sont comptés avec les 'nrp' (carte "À rappeler" du dashboard)
        global_counts = {'nrp': 0, 'rdv': 0, 'ko': 0}
        for table in ['sante', 'artisans', 'pharmacies']:
            try:
                cur.execute(f"SELECT statut, COUNT(*) as cnt FROM {table} WHERE statut IN ('nrp','rdv','ko','rappeler') GROUP BY statut")
                for r in cur.fetchall():
                    key = 'nrp' if r['statut'] == 'rappeler' else r['statut']
                    global_counts[key] = global_counts.get(key, 0) + r['cnt']
            except:
                conn.rollback()

        # Nouveaux du jour tous types confondus (sante + artisans)
        global_nouveaux_jour = nouveaux
        try:
            cur.execute("SELECT COUNT(*) as total FROM artisans WHERE date_ajout LIKE %s", [paris_today() + '%'])
            global_nouveaux_jour += cur.fetchone()['total']
        except:
            conn.rollback()

        conn.close()
        return jsonify({
            'sante': {'total': total_sante, 'avec_tel': avec_tel, 'nouveaux_jour': nouveaux, 'avec_date_creation': avec_creation, 'par_specialite': par_spe, 'statuts': statuts_s},
            'pharmacies': {'total': total_phr, 'avec_dirigeant': avec_dir, 'avec_tel': 0, 'statuts': statuts_p},
            'global': {'nrp': global_counts['nrp'], 'rdv': global_counts['rdv'], 'ko': global_counts['ko'], 'nouveaux_jour': global_nouveaux_jour},
            'mise_a_jour': datetime.now().isoformat()
        })
    else:
        sante = load_json('professionnels_sante.json')
        pharmacies = load_json('pharmacies.json')
        today = paris_today()
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
    annee = request.args.get('annee', '')
    sort_col = request.args.get('sort_col', '')
    sort_dir = request.args.get('sort_dir', 'desc')

    ALLOWED_SORT = {'nom','specialite','ville','telephone_direct','telephone','date_creation','statut'}
    if sort_col not in ALLOWED_SORT:
        sort_col = ''
    sort_dir = 'ASC' if sort_dir == 'asc' else 'DESC'

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
            where.append("date_ajout LIKE %s")
            params.append(paris_today() + '%')
        if annee == 'recent':
            where.append("date_creation IS NOT NULL AND date_creation != '' AND date_creation::date > (CURRENT_DATE - INTERVAL '1 year')")
        elif annee == 'recent3':
            where.append("date_creation IS NOT NULL AND date_creation != '' AND date_creation::date > (CURRENT_DATE - INTERVAL '3 years')")
        elif annee:
            where.append("date_creation LIKE %s")
            params.append(f'{annee}-%')
        if specialites:
            spes = specialites.split('|')
            where.append("(" + " OR ".join(["LOWER(specialite) LIKE %s"] * len(spes)) + ")")
            params += [f'%{s.lower()}%' for s in spes]
        where_str = " AND ".join(where)
        cur.execute(f"SELECT COUNT(*) as total FROM sante WHERE {where_str}", params)
        total = cur.fetchone()['total']
        offset = (page - 1) * per_page

        if sort_col == 'telephone_direct':
            order_clause = f"(telephone_direct IS NOT NULL AND telephone_direct != '') {sort_dir}, telephone_direct {sort_dir}"
        elif sort_col == 'date_creation':
            order_clause = f"(date_creation IS NULL OR date_creation = '') ASC, date_creation {sort_dir}"
        elif sort_col:
            order_clause = f"{sort_col} {sort_dir} NULLS LAST"
        else:
            order_clause = "id"

        cur.execute(f"SELECT * FROM sante WHERE {where_str} ORDER BY {order_clause} LIMIT %s OFFSET %s", params + [per_page, offset])
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
        if sort_col:
            reverse = sort_dir == 'DESC'
            data = sorted(data, key=lambda c: (c.get(sort_col) is None, c.get(sort_col) or ''), reverse=reverse)
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
        for k in ['statut', 'note', 'telephone_direct', 'nom', 'prenom']:
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
        for k in ['statut', 'note', 'telephone_direct', 'nom', 'prenom']:
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


@app.route('/api/artisans')
def api_artisans():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))
    search = request.args.get('search', '').lower()
    statut = request.args.get('statut', '')
    profession = request.args.get('profession', '')
    annee = request.args.get('annee', '')
    sort_col = request.args.get('sort_col', '')
    sort_dir = request.args.get('sort_dir', 'desc')

    ALLOWED_SORT = {'nom','profession','ville','telephone_direct','date_creation','statut'}
    if sort_col not in ALLOWED_SORT:
        sort_col = ''
    sort_dir = 'ASC' if sort_dir == 'asc' else 'DESC'

    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        where = ["1=1"]
        params = []
        if search:
            where.append("(LOWER(nom) LIKE %s OR LOWER(ville) LIKE %s)")
            params += [f'%{search}%', f'%{search}%']
        if statut:
            where.append("statut = %s")
            params.append(statut)
        if profession:
            where.append("profession = %s")
            params.append(profession)
        if annee == 'recent':
            where.append("date_creation IS NOT NULL AND date_creation != '' AND date_creation::date > (CURRENT_DATE - INTERVAL '1 year')")
        elif annee == 'recent3':
            where.append("date_creation IS NOT NULL AND date_creation != '' AND date_creation::date > (CURRENT_DATE - INTERVAL '3 years')")
        elif annee:
            where.append("date_creation LIKE %s")
            params.append(f'{annee}-%')
        where_str = " AND ".join(where)
        cur.execute(f"SELECT COUNT(*) as total FROM artisans WHERE {where_str}", params)
        total = cur.fetchone()['total']
        offset = (page - 1) * per_page

        if sort_col == 'telephone_direct':
            order_clause = f"(telephone_direct IS NOT NULL AND telephone_direct != '') {sort_dir}, telephone_direct {sort_dir}"
        elif sort_col == 'date_creation':
            order_clause = f"(date_creation IS NULL OR date_creation = '') ASC, date_creation {sort_dir}"
        elif sort_col:
            order_clause = f"{sort_col} {sort_dir} NULLS LAST"
        else:
            order_clause = "id"

        cur.execute(f"SELECT * FROM artisans WHERE {where_str} ORDER BY {order_clause} LIMIT %s OFFSET %s", params + [per_page, offset])
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return jsonify({'data': rows, 'total': total, 'page': page, 'pages': (total + per_page - 1) // per_page})
    else:
        data = load_json('artisans.json')
        if not data:
            return jsonify({'data': [], 'total': 0, 'page': 1, 'pages': 0})
        for i, c in enumerate(data):
            if 'id' not in c:
                c['id'] = i + 1
        if search:
            data = [c for c in data if search in (c.get('nom','') or '').lower() or search in (c.get('ville','') or '').lower()]
        if statut:
            data = [c for c in data if c.get('statut','') == statut]
        if profession:
            data = [c for c in data if c.get('profession','') == profession]
        if sort_col:
            reverse = sort_dir == 'DESC'
            data = sorted(data, key=lambda c: (c.get(sort_col) is None, c.get(sort_col) or ''), reverse=reverse)
        total = len(data)
        start = (page - 1) * per_page
        return jsonify({'data': data[start:start+per_page], 'total': total, 'page': page, 'pages': (total + per_page - 1) // per_page})

@app.route('/api/artisans/<int:id>', methods=['PATCH'])
def update_artisan(id):
    body = request.json
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        fields = []
        params = []
        for k in ['statut', 'note', 'telephone_direct', 'nom', 'prenom']:
            if k in body:
                fields.append(f"{k} = %s")
                params.append(body[k])
        if fields:
            cur.execute(f"UPDATE artisans SET {', '.join(fields)} WHERE id = %s", params + [id])
            conn.commit()
        conn.close()
    else:
        data = load_json('artisans.json')
        for i, c in enumerate(data):
            if c.get('id') == id or i + 1 == id:
                c.update(body)
                break
        save_json('artisans.json', data)
    return jsonify({'ok': True})



@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username', '').lower().strip()
    password = data.get('password', '')
    user = USERS.get(username)
    if not user:
        return jsonify({'error': 'Identifiants incorrects'}), 401
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    if pwd_hash != user['password_hash']:
        return jsonify({'error': 'Identifiants incorrects'}), 401
    import secrets as sec
    token = sec.token_hex(32)
    SESSIONS[token] = {'username': username, 'role': user['role'], 'nom': user['nom'], 'restricted': user.get('restricted', [])}
    resp = jsonify({'ok': True, 'token': token, 'nom': user['nom'], 'role': user['role'], 'restricted': user.get('restricted', [])})
    resp.set_cookie('auth_token', token, max_age=86400*7, httponly=True, samesite='Lax')
    return resp

@app.route('/api/logout', methods=['POST'])
def logout():
    token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
    if token and token in SESSIONS:
        del SESSIONS[token]
    resp = jsonify({'ok': True})
    resp.delete_cookie('auth_token')
    return resp

@app.route('/api/me')
def me():
    session = check_session(request)
    if not session:
        return jsonify({'error': 'Non autorise'}), 401
    user = USERS.get(session.get('username'), {})
    return jsonify({**session, 'restricted': user.get('restricted', [])})

@app.route('/api/users', methods=['GET'])
def get_users():
    session = check_session(request)
    if not session or session.get('role') != 'admin':
        return jsonify({'error': 'Non autorise'}), 401
    return jsonify([{'username': k, 'nom': v['nom'], 'role': v['role']} for k, v in USERS.items()])

@app.route('/api/users', methods=['POST'])
def add_user():
    session = check_session(request)
    if not session or session.get('role') != 'admin':
        return jsonify({'error': 'Non autorise'}), 401
    data = request.json or {}
    username = data.get('username', '').lower().strip()
    password = data.get('password', '')
    nom = data.get('nom', username)
    role = data.get('role', 'user')
    if not username or not password:
        return jsonify({'error': 'Username et mot de passe requis'}), 400
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    USERS[username] = {'password_hash': pwd_hash, 'role': role, 'nom': nom}
    return jsonify({'ok': True})



@app.route('/api/sante/<int:id>', methods=['GET'])
def get_sante_one(id):
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM sante WHERE id = %s", [id])
        row = cur.fetchone()
        conn.close()
        return jsonify(dict(row)) if row else jsonify({'error': 'Not found'}), 404
    else:
        data = load_json('professionnels_sante.json')
        for i,c in enumerate(data):
            if c.get('id') == id or i+1 == id:
                return jsonify(c)
        return jsonify({'error': 'Not found'}), 404

@app.route('/api/pharmacies/<int:id>', methods=['GET'])
def get_pharmacie_one(id):
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM pharmacies WHERE id = %s", [id])
        row = cur.fetchone()
        conn.close()
        return jsonify(dict(row)) if row else jsonify({'error': 'Not found'}), 404
    else:
        data = load_json('pharmacies.json')
        for i,c in enumerate(data):
            if c.get('id') == id or i+1 == id:
                return jsonify(c)
        return jsonify({'error': 'Not found'}), 404

@app.route('/api/artisans/<int:id>', methods=['GET'])
def get_artisan_one(id):
    if USE_DB:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM artisans WHERE id = %s", [id])
        row = cur.fetchone()
        conn.close()
        return jsonify(dict(row)) if row else jsonify({'error': 'Not found'}), 404
    else:
        data = load_json('artisans.json')
        for i,c in enumerate(data):
            if c.get('id') == id or i+1 == id:
                return jsonify(c)
        return jsonify({'error': 'Not found'}), 404



@app.route('/api/filtre-global')
def filtre_global():
    """Recherche un statut (rdv, nrp, ko) sur TOUTES les tables: sante, artisans, pharmacies"""
    statut = request.args.get('statut', '')
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))

    if not USE_DB:
        return jsonify({'data': [], 'total': 0, 'page': 1, 'pages': 0})

    conn = get_db()
    cur = conn.cursor()
    results = []

    # Mode "Nouveaux du jour" : filtre par date d'ajout (heure Paris) au lieu du statut
    nouveaux_mode = (statut == 'new_today')
    today_like = paris_today() + '%'

    # Le filtre NRP inclut aussi les 'À rappeler'
    statuts = ['nrp', 'rappeler'] if statut == 'nrp' else [statut]

    # Infirmiers / sante
    if nouveaux_mode:
        cur.execute("SELECT id, nom, prenom, specialite, telephone_direct, telephone, ville, cp, statut, note, date_creation FROM sante WHERE date_ajout LIKE %s", [today_like])
    else:
        cur.execute("SELECT id, nom, prenom, specialite, telephone_direct, telephone, ville, cp, statut, note, date_creation FROM sante WHERE statut = ANY(%s)", [statuts])
    for r in cur.fetchall():
        results.append({
            'source_table': 'sante', 'id': r['id'],
            'nom': f"{r['nom'] or ''} {r['prenom'] or ''}".strip(),
            'categorie': r['specialite'] or 'Professionnel de santé',
            'telephone_direct': r['telephone_direct'] or r['telephone'] or '',
            'ville': r['ville'] or '', 'cp': r['cp'] or '',
            'statut': r['statut'], 'note': r['note'] or '',
            'date_creation': r['date_creation'] or ''
        })

    # Artisans
    if nouveaux_mode:
        cur.execute("SELECT id, nom, profession, telephone_direct, ville, cp, statut, note, date_creation FROM artisans WHERE date_ajout LIKE %s", [today_like])
    else:
        cur.execute("SELECT id, nom, profession, telephone_direct, ville, cp, statut, note, date_creation FROM artisans WHERE statut = ANY(%s)", [statuts])
    for r in cur.fetchall():
        results.append({
            'source_table': 'artisans', 'id': r['id'],
            'nom': r['nom'] or '',
            'categorie': r['profession'] or 'Artisan',
            'telephone_direct': r['telephone_direct'] or '',
            'ville': r['ville'] or '', 'cp': r['cp'] or '',
            'statut': r['statut'], 'note': r['note'] or '',
            'date_creation': r['date_creation'] or ''
        })

    # Pharmacies (pas comptées dans les nouveaux du jour)
    if not nouveaux_mode:
        cur.execute("SELECT id, nom, dirigeant, telephone_direct, telephone, ville, cp, statut, note FROM pharmacies WHERE statut = ANY(%s)", [statuts])
        for r in cur.fetchall():
            results.append({
                'source_table': 'pharmacies', 'id': r['id'],
                'nom': r['dirigeant'] or r['nom'] or '',
                'categorie': 'Pharmacie',
                'telephone_direct': r['telephone_direct'] or r['telephone'] or '',
                'ville': r['ville'] or '', 'cp': r['cp'] or '',
                'statut': r['statut'], 'note': r['note'] or '',
                'date_creation': ''
            })

    conn.close()

    total = len(results)
    start = (page - 1) * per_page
    page_results = results[start:start + per_page]

    return jsonify({'data': page_results, 'total': total, 'page': page, 'pages': (total + per_page - 1) // per_page})



@app.route('/api/arbitrage-barriere', methods=['GET'])
def get_arbitrage_barriere():
    if not USE_DB:
        return jsonify([])
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM arbitrage_barriere ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/arbitrage-barriere/<int:id>', methods=['PATCH'])
def update_arbitrage_barriere(id):
    body = request.json or {}
    if not USE_DB:
        return jsonify({'ok': False})
    conn = get_db()
    cur = conn.cursor()
    fields = []
    params = []
    for k in ['nom', 'montant', 'note', 'commentaire', 'statut', 'checked']:
        if k in body:
            fields.append(f"{k} = %s")
            params.append(body[k])
    if fields:
        cur.execute(f"UPDATE arbitrage_barriere SET {', '.join(fields)} WHERE id = %s", params + [id])
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/arbitrage-optimum', methods=['GET'])
def get_arbitrage_optimum():
    if not USE_DB:
        return jsonify([])
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM arbitrage_optimum ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/arbitrage-optimum/<int:id>', methods=['PATCH'])
def update_arbitrage_optimum(id):
    body = request.json or {}
    if not USE_DB:
        return jsonify({'ok': False})
    conn = get_db()
    cur = conn.cursor()
    fields = []
    params = []
    for k in ['nom', 'date', 'versement', 'note', 'commentaire', 'statut', 'checked']:
        if k in body:
            fields.append(f"{k} = %s")
            params.append(body[k])
    if fields:
        cur.execute(f"UPDATE arbitrage_optimum SET {', '.join(fields)} WHERE id = %s", params + [id])
        conn.commit()
    conn.close()
    return jsonify({'ok': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8181))
    app.run(debug=True, host='0.0.0.0', port=port)
