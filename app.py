from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json, os
from datetime import datetime, date, timedelta
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
        "role": "manager",
        "nom": "Quentin",
        "restricted": ["arbitrage", "ro", "gestion", "mailing"]
    }
}

SESSIONS = {}

def check_session(request):
    token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
    if not token:
        return None
    s = SESSIONS.get(token)
    if s:
        return s
    # Session persistée en base (survit aux redéploiements Railway)
    try:
        conn, cur = kv_conn()
        cur.execute("SELECT v FROM kv_store WHERE k = %s", ['__session::' + token])
        row = cur.fetchone()
        cur.close(); conn.close()
        if row:
            s = json.loads(row['v'])
            SESSIONS[token] = s
            return s
    except Exception:
        pass
    return None


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
    s = check_session(request)
    if s and 'gestion' not in s.get('restricted', []) and request.args.get('p') is None:
        return send_from_directory('static', 'gestion.html')
    return send_from_directory('static', 'index.html')

# ================= CRM GESTION (base Elyon) =================
@app.route('/gestion')
def gestion_page():
    s = check_session(request)
    if not s or 'gestion' in s.get('restricted', []):
        return send_from_directory('static', 'index.html')  # pas connecté ou pas autorisé
    return send_from_directory('static', 'gestion.html')

# ============ COMPTES COMMERCIAUX (créés par Quentin ou Bryan) ============
RESTRICT_COMMERCIAL = ["arbitrage", "ro", "gestion", "mailing", "acces"]

def db_get_user(username):
    try:
        conn, cur = kv_conn()
        cur.execute("SELECT v FROM kv_store WHERE k = %s", ['__user::' + username])
        row = cur.fetchone()
        cur.close(); conn.close()
        return json.loads(row['v']) if row else None
    except Exception:
        return None

@app.route('/api/users', methods=['GET', 'POST'])
def api_users():
    s = check_session(request)
    if not s or (s.get('role') not in ('admin', 'manager')):
        return jsonify({'error': 'unauthorized'}), 401
    conn, cur = kv_conn()
    try:
        if request.method == 'GET':
            cur.execute("SELECT k, v FROM kv_store WHERE k LIKE %s", ['__user::%'])
            users = []
            for r in cur.fetchall():
                u = json.loads(r['v'])
                users.append({'username': r['k'][8:], 'nom': u.get('nom', '')})
            return jsonify({'users': users})
        data = request.json or {}
        username = (data.get('username') or '').lower().strip()
        nom = (data.get('nom') or '').strip()
        password = data.get('password') or ''
        if not username or not password or not nom:
            return jsonify({'error': 'Nom, identifiant et mot de passe obligatoires'}), 400
        if username in USERS or db_get_user(username):
            return jsonify({'error': 'Cet identifiant existe déjà'}), 400
        u = {'password_hash': hashlib.sha256(password.encode()).hexdigest(),
             'role': 'user', 'nom': nom, 'restricted': RESTRICT_COMMERCIAL,
             'created_by': s.get('username')}
        cur.execute("INSERT INTO kv_store (k, v) VALUES (%s, %s)", ['__user::' + username, json.dumps(u)])
        conn.commit()
        return jsonify({'ok': True, 'username': username})
    finally:
        cur.close(); conn.close()

@app.route('/api/users/<username>', methods=['DELETE'])
def api_users_delete(username):
    s = check_session(request)
    if not s or (s.get('role') not in ('admin', 'manager')):
        return jsonify({'error': 'unauthorized'}), 401
    conn, cur = kv_conn()
    cur.execute("DELETE FROM kv_store WHERE k = %s", ['__user::' + username.lower()])
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})

# ============ SYNCHRO RDV : agenda Gestion de Bryan + CRM Elyon de Quentin ============
@app.route('/api/sync-rdv', methods=['POST'])
def sync_rdv():
    s = check_session(request)
    if not s:
        return jsonify({'error': 'unauthorized'}), 401
    entry = (request.json or {}).get('entry')
    if not entry:
        return jsonify({'error': 'entry manquante'}), 400
    entry['prisPar'] = s.get('nom', '')
    # 1) Toujours dans l'agenda Gestion de Bryan
    conn, cur = kv_conn()
    try:
        cur.execute("SELECT v FROM kv_store WHERE k = %s", ['bryanentibi::crm-prospection'])
        row = cur.fetchone()
        liste = []
        if row:
            inner = json.loads(row['v'])
            if isinstance(inner, str):
                inner = json.loads(inner)
            if isinstance(inner, list):
                liste = inner
        liste.insert(0, entry)
        cur.execute("INSERT INTO kv_store (k, v) VALUES (%s, %s) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
                    ['bryanentibi::crm-prospection', json.dumps(json.dumps(liste))])
        conn.commit()
    finally:
        cur.close(); conn.close()
    # 2) Si le RDV vient de l'équipe de Quentin : aussi vers son CRM Elyon
    forwarded = False
    if s.get('username') != 'bryanentibi':
        q_url = os.environ.get('QUENTIN_CRM_URL', '')
        q_code = os.environ.get('QUENTIN_CRM_CODE', '')
        if q_url and q_code:
            try:
                import urllib.request, base64
                auth = base64.b64encode(f'elyon:{q_code}'.encode()).decode()
                req = urllib.request.Request(q_url.rstrip('/') + '/api/storage/crm-prospection',
                                             headers={'Authorization': 'Basic ' + auth})
                try:
                    with urllib.request.urlopen(req, timeout=8) as r:
                        cur_val = json.loads(r.read().decode()).get('value')
                except Exception:
                    cur_val = None
                if isinstance(cur_val, str):
                    try:
                        cur_val = json.loads(cur_val)
                    except Exception:
                        cur_val = None
                q_liste = cur_val if isinstance(cur_val, list) else []
                q_liste.insert(0, entry)
                body = json.dumps({'value': json.dumps(q_liste)}).encode()
                req2 = urllib.request.Request(q_url.rstrip('/') + '/api/storage/crm-prospection',
                                              data=body, method='PUT',
                                              headers={'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json'})
                urllib.request.urlopen(req2, timeout=8)
                forwarded = True
            except Exception as e:
                print('sync quentin CRM:', e)
    return jsonify({'ok': True, 'forwarded': forwarded})


# ============ GÉNÉRATION DU PDF OFFICIEL EIC / AUDIT PATRIMONIAL ============
@app.route('/api/eic-pdf', methods=['POST'])
def eic_pdf_officiel():
    s = check_session(request)
    if not s:
        return jsonify({'error': 'unauthorized'}), 401
    import io, textwrap
    from reportlab.pdfgen import canvas as rl_canvas
    from pypdf import PdfReader, PdfWriter
    data = request.json or {}
    cl = data.get('client', {})
    f = data.get('eic', {})
    with open(os.path.join('static', 'eic_coords.json')) as fh:
        C = json.load(fh)
    FIELDS, CHECKS, TABLES = C['fields'], C['checks'], C['tables']

    def frdate(v):
        if v and re.match(r'^\d{4}-\d{2}-\d{2}$', str(v)):
            y, m, d = v.split('-'); return f"{d}/{m}/{y}"
        return v or ''

    NAVY = (11/255, 37/255, 69/255)
    pages_buf = {}
    def cv(pi):
        if pi not in pages_buf:
            buf = io.BytesIO()
            cc = rl_canvas.Canvas(buf, pagesize=(596, 843))
            cc.setFillColorRGB(*NAVY)
            pages_buf[pi] = (buf, cc)
        return pages_buf[pi][1]

    def draw(key, value, size=None):
        if not value or key not in FIELDS: return
        pi, x, y, sz = FIELDS[key]
        c2 = cv(pi)
        c2.setFont('Helvetica', size or sz)
        c2.drawString(x, y, str(value)[:70])

    def check_mark(pi, label_part, mark='X', which=0):
        found = [ch for ch in CHECKS.get(str(pi), []) if label_part in ch['label']]
        if len(found) > which:
            ch = found[which]
            c2 = cv(pi)
            c2.setFont('Helvetica-Bold', 8)
            c2.drawString(ch['x'], ch['y'], mark)

    def table_cell(tid, row, col, value, size=7):
        if not value: return
        t = TABLES.get(tid)
        if not t or row >= len(t['cells']): return
        cell = t['cells'][row][col] if col < len(t['cells'][row]) else None
        if not cell: return
        pi = int(tid.split('_')[0])
        c2 = cv(pi)
        c2.setFont('Helvetica', size)
        maxc = max(4, int(cell[2] / (size * 0.55)))
        c2.drawString(cell[0] + 2, cell[1] + 3, str(value)[:maxc])

    # ---------- PAGE 1 ----------
    from datetime import date as _date
    draw('dateR2', _date.today().strftime('%d/%m/%Y')); draw('cgp', 'Bryan Entibi')
    m, mme, rev_m, rev_f = f.get('m', {}), f.get('mme', {}), f.get('revM', {}), f.get('revMme', {})
    for col, p in (('m', m), ('mme', mme)):
        draw(f'{col}.nom', p.get('nom')); draw(f'{col}.naissance', frdate(p.get('naissance')))
        draw(f'{col}.tel', p.get('tel')); draw(f'{col}.email', p.get('email'))
        draw(f'{col}.nationalite', p.get('nationalite')); draw(f'{col}.freres', p.get('freres'))
        draw(f'{col}.patParents', p.get('patParents')); draw(f'{col}.ageParents', p.get('ageParents'))
        if p.get('ada') == 'Oui':
            check_mark(0, 'ADA', which=0 if col == 'm' else 1)
    for k in ('adresse', 'cp', 'ville', 'situation', 'regime', 'notaire', 'enfants', 'petitsEnfants', 'succession'):
        draw(k, f.get(k))
    draw('dateMariage', frdate(f.get('dateMariage')))
    if 'simple' in (f.get('donation') or '').lower() or 'deux' in (f.get('donation') or '').lower():
        check_mark(0, 'DONATION SIMPLE')
    if 'partage' in (f.get('donation') or '').lower() or 'deux' in (f.get('donation') or '').lower():
        check_mark(0, 'DONATION PARTAGE')
    if f.get('convention') == 'Oui': check_mark(0, 'CONVENTION')
    if f.get('ddv') == 'Oui': check_mark(0, 'DDV')
    table_cell('0_1', 1, 0, ('   ' * 4) + str(f.get('partsFiscales') or ''), 9)
    # Revenus : colonne Madame décalée du même écart que l'état civil
    delta = FIELDS.get('mme.nom', [0, 300])[1] - FIELDS.get('m.nom', [0, 60])[1]
    REVK = [('profession', 'rev.profession'), ('statut', 'rev.statut'), ('societe', 'rev.societe'),
            ('dateEntree', 'rev.dateEntree'), ('pee', 'rev.pee'), ('revenus', 'rev.revenus'),
            ('foncier', 'rev.foncier'), ('microReel', 'rev.microReel'), ('autres', 'rev.autres'),
            ('evolutions', 'rev.evolutions')]
    for src, key in REVK:
        draw(key, rev_m.get(src))
        if rev_f.get(src) and key in FIELDS:
            pi, x, y, sz = FIELDS[key]
            c2 = cv(pi); c2.setFont('Helvetica', sz)
            c2.drawString(x + delta * 0.72, y, str(rev_f.get(src))[:40])
    for k in ('prevCompagnie', 'prevGaranties', 'prevMensualite', 'rbg', 'resFoncier', 'deductions',
              'revImposable', 'rfPositifs', 'deficit', 'impotBrut', 'reductions', 'impotNet', 'ifi', 'agiComment'):
        draw(k, f.get(k))
    draw('tmi', (str(f.get('tmi')) + ' %') if f.get('tmi') else '')
    for col, ded in (('M', f.get('dedM') or ''), ('MME', f.get('dedMme') or '')):
        w = 0 if col == 'M' else 1
        if '10%' in ded: check_mark(0, '10%', which=w)
        elif 'réel' in ded.lower() or 'reel' in ded.lower(): check_mark(0, 'FRAIS', which=w)
        elif 'CGA' in ded: check_mark(0, 'CGA', which=w)
    if f.get('agiFisc') == 'Oui': check_mark(0, 'OUI')
    elif f.get('agiFisc') == 'Non': check_mark(0, 'NON')

    # ---------- PAGE 2 ----------
    rp = f.get('rpStatut') or ''
    if 'Propri' in rp: check_mark(1, 'PROPRIÉTAIRE')
    elif 'Locat' in rp: check_mark(1, 'LOCATAIRE')
    elif 'berg' in rp: check_mark(1, 'HÉBERGÉ')
    draw('loyer', f.get('loyer')); draw('tauxEndettement', (str(f.get('tauxEndettement')) + ' %') if f.get('tauxEndettement') else '')
    draw('patAttente', f.get('patAttente')); draw('projetImmo', (f.get('projetImmo') or '')[:110])
    if f.get('delegAssurance') == 'Oui': check_mark(1, 'DÉLÉGATION')
    for i, b in enumerate((f.get('biens') or [])[:4]):
        for j, k in enumerate(('nature', 'dateAcq', 'valAcq', 'valActuelle', 'detention', 'revLocatifs', 'sci')):
            table_cell('1_1', i + 1, j, b.get(k))
    for i, b in enumerate((f.get('chargesImmo') or [])[:5]):
        for j, k in enumerate(('nature', 'etab', 'montant', 'debut', 'fin', 'crd', 'mens')):
            table_cell('1_2', i + 1, j, b.get(k))
    for i, b in enumerate((f.get('autresCharges') or [])[:3]):
        for j, k in enumerate(('nature', 'etab', 'montant', 'debut', 'fin', 'mens')):
            table_cell('1_3', i + 1, j, b.get(k))
    FIN_ROWS = ["Comptes Courants", "Livret A / B, LDD", "LEP", "PEL, CEL", "CSL", "Livret Jeune", "Comptes Titres", "PEA",
                "PEE / PEG disponible", "Assurance Vie 1", "Assurance Vie 2", "Assurance Vie 3",
                "PERP, Madelin, PERIN, PERCO", "Trésorerie Entreprise", "Autres"]
    fin = f.get('fin') or {}
    for i, rowname in enumerate(FIN_ROWS):
        r = fin.get(rowname) or {}
        for j, k in enumerate(('m', 'f', 'vers', 'dates', 'etab', 'obj')):
            table_cell('1_4', i + 1, j + 1, r.get(k))

    # ---------- PAGE 3 ----------
    OBJ_LABELS = [('Protéger vos proches et vous-même', 'PROTÉGER VOS PROCHES'), ('Valoriser votre patrimoine', 'VALORISER VOTRE'),
        ("Préparer l'avenir de vos enfants", "PRÉPARER L'AVENIR"), ('Compléter votre retraite', 'COMPLÉTER VOTRE RETRAITE'),
        ('Protéger son conjoint survivant', 'PROTÉGER SON CONJOINT'), ('Organiser votre transmission · DMTG', 'ORGANISER VOTRE TRANSMISSION'),
        ('Financer vos projets personnels (ex. RP)', 'FINANCER VOS PROJETS'), ('Optimiser votre fiscalité · IRPP, IFI', 'OPTIMISER VOTRE FISCALITÉ'),
        ('Développer votre entreprise', 'DÉVELOPPER VOTRE ENTREPRISE'), ('Prévoyance / Dépendance', 'PRÉVOYANCE / DÉPENDANCE')]
    objs = f.get('objectifs') or {}
    for full, lbl in OBJ_LABELS:
        if objs.get(full):
            check_mark(2, lbl, mark=str(objs[full]))
    draw('horizon', f.get('horizon')); draw('moyensEpargne', (str(f.get('moyensEpargne')) + ' €') if f.get('moyensEpargne') else '')
    draw('partieSouple', f.get('partieSouple')); draw('moyensCapital', (str(f.get('moyensCapital')) + ' €') if f.get('moyensCapital') else '')
    pct = f.get('pctEpargne') or ''
    if pct.startswith('10'): check_mark(2, '10%')
    elif pct.startswith('15'): check_mark(2, '15%OU')
    elif pct.startswith('20'): check_mark(2, '20%', which=0)
    CRIT_LABELS = [('Disponible à 100%', 'DISPONIBLE À 100%'), ('À 50%', 'À 50%'), ('À 20%', 'À 20%'),
        ("Souple en effort d'épargne", 'SOUPLE EN EFFORT'), ('Fiscalement avantageux', 'FISCALEMENT'),
        ('Prudent', 'PRUDENT'), ('Simple en gestion', 'SIMPLE EN GESTION')]
    crits = f.get('criteres') or {}
    for full, lbl in CRIT_LABELS:
        if crits.get(full): check_mark(2, lbl)
    profil = f.get('profil') or ''
    if profil.startswith('Prudente'): check_mark(2, '60% SRRI')
    elif profil.startswith('Équilibrée') or profil.startswith('Equilibrée'): check_mark(2, '30% SRRI')
    elif profil.startswith('Dynamique'): check_mark(2, '0% SRRI')
    for i, r in enumerate((f.get('rdvs') or [])[:4]):
        table_cell('2_10', i + 1, 0, r.get('theme')); table_cell('2_10', i + 1, 1, r.get('objectif')); table_cell('2_10', i + 1, 2, r.get('date'))
    draw('synObjectifs', f.get('synObjectifs')); draw('synEpargne', f.get('moyensEpargne'))
    draw('synCapital', f.get('moyensCapital')); draw('synCriteres', f.get('synCriteres'))
    if f.get('notes') and '_notesStart' in FIELDS:
        pi, x, y, sz = FIELDS['_notesStart']
        c2 = cv(pi); c2.setFont('Helvetica', 8)
        for li, line in enumerate(textwrap.wrap(f['notes'].replace('\n', ' '), 108)[:11]):
            c2.drawString(x, y - li * 13.4, line)

    # ---------- Fusion overlay + modèle officiel ----------
    for pi, (buf, c2) in pages_buf.items():
        c2.save()
    template = PdfReader(os.path.join('static', 'eic_template.pdf'))
    writer = PdfWriter()
    for pi, page in enumerate(template.pages):
        if pi in pages_buf:
            pages_buf[pi][0].seek(0)
            overlay = PdfReader(pages_buf[pi][0])
            page.merge_page(overlay.pages[0])
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    nom_fichier = f"Audit_Patrimonial_{(cl.get('nom') or 'client').replace(' ', '_')}.pdf"
    from flask import send_file
    return send_file(out, mimetype='application/pdf', as_attachment=True, download_name=nom_fichier)



# ============ SAUVEGARDES AUTOMATIQUES (30 jours glissants) ============
@app.route('/api/backups', methods=['GET', 'POST'])
def backups():
    """GET = liste des sauvegardes · POST = en créer une (auto ou manuelle)"""
    s = check_session(request)
    if not s:
        return jsonify({'error': 'unauthorized'}), 401
    ns = kv_namespace()
    conn, cur = kv_conn()
    try:
        if request.method == 'GET':
            cur.execute("SELECT k, v FROM kv_store WHERE k LIKE %s ORDER BY k DESC", [ns + '__backup::%'])
            out = []
            for row in cur.fetchall():
                try:
                    meta = json.loads(row['v'])
                    payload = json.loads(meta) if isinstance(meta, str) else meta
                except Exception:
                    continue
                out.append({
                    'id': row['k'].split('__backup::')[1],
                    'date': payload.get('_date', ''),
                    'auto': payload.get('_auto', False),
                    'clients': payload.get('_nbClients', 0),
                    'ventes': payload.get('_nbVentes', 0),
                    'taille': len(row['v']),
                })
            return jsonify({'backups': out})

        data = request.json or {}
        contenu = data.get('data')
        if not contenu:
            return jsonify({'error': 'aucune donnée'}), 400
        bid = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        key = ns + '__backup::' + bid
        cur.execute("INSERT INTO kv_store (k, v) VALUES (%s, %s) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
                    [key, json.dumps(contenu)])
        # Purge : on ne garde que les 30 derniers jours
        limite = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        cur.execute("SELECT k FROM kv_store WHERE k LIKE %s", [ns + '__backup::%'])
        for row in cur.fetchall():
            jour = row['k'].split('__backup::')[1][:10]
            if jour < limite:
                cur.execute("DELETE FROM kv_store WHERE k = %s", [row['k']])
        conn.commit()
        return jsonify({'ok': True, 'id': bid})
    finally:
        cur.close(); conn.close()


@app.route('/api/backups/<bid>', methods=['GET', 'DELETE'])
def backup_one(bid):
    s = check_session(request)
    if not s:
        return jsonify({'error': 'unauthorized'}), 401
    ns = kv_namespace()
    conn, cur = kv_conn()
    try:
        key = ns + '__backup::' + bid
        if request.method == 'DELETE':
            cur.execute("DELETE FROM kv_store WHERE k = %s", [key])
            conn.commit()
            return jsonify({'ok': True})
        cur.execute("SELECT v FROM kv_store WHERE k = %s", [key])
        row = cur.fetchone()
        if not row:
            return jsonify({'error': 'introuvable'}), 404
        return jsonify({'data': json.loads(row['v'])})
    finally:
        cur.close(); conn.close()

# ============ FOND DU PORTAIL DE CONNEXION (photo personnalisable) ============
@app.route('/api/portal-bg', methods=['GET', 'POST', 'DELETE'])
def portal_bg():
    """GET public (l'écran de connexion doit pouvoir l'afficher) · POST/DELETE réservés"""
    conn, cur = kv_conn()
    try:
        if request.method == 'GET':
            cur.execute("SELECT v FROM kv_store WHERE k = %s", ['__portal::bg'])
            row = cur.fetchone()
            if not row:
                return jsonify({'image': None})
            return jsonify({'image': json.loads(row['v'])})
        s = check_session(request)
        if not s or s.get('role') not in ('admin', 'manager'):
            return jsonify({'error': 'unauthorized'}), 401
        if request.method == 'DELETE':
            cur.execute("DELETE FROM kv_store WHERE k = %s", ['__portal::bg'])
            conn.commit()
            return jsonify({'ok': True})
        data = request.json or {}
        img = data.get('image') or ''
        if not img.startswith('data:image/'):
            return jsonify({'error': "Format d'image non reconnu"}), 400
        if len(img) > 6_000_000:
            return jsonify({'error': 'Image trop lourde (max ~4 Mo)'}), 400
        cur.execute("INSERT INTO kv_store (k, v) VALUES (%s, %s) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
                    ['__portal::bg', json.dumps(img)])
        conn.commit()
        return jsonify({'ok': True})
    finally:
        cur.close(); conn.close()

# ============ EXPORT ARBITRAGE (migration vers Gestion) ============
@app.route('/api/arbitrage-export')
def arbitrage_export():
    s = check_session(request)
    if not s or s.get('role') != 'admin':
        return jsonify({'error': 'unauthorized'}), 401
    conn = get_db()
    cur = conn.cursor()
    out = {}
    for table, key in [('arbitrage_barriere', 'liste1'), ('arbitrage_optimum', 'liste2')]:
        try:
            cur.execute(f"SELECT * FROM {table} ORDER BY id")
            out[key] = [dict(r) for r in cur.fetchall()]
        except Exception:
            conn.rollback()
            out[key] = []
    cur.close(); conn.close()
    return jsonify(out)

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
    user = USERS.get(username) or db_get_user(username)
    if not user:
        return jsonify({'error': 'Identifiants incorrects'}), 401
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    if pwd_hash != user['password_hash']:
        return jsonify({'error': 'Identifiants incorrects'}), 401
    import secrets as sec
    token = sec.token_hex(32)
    sess = {'username': username, 'role': user['role'], 'nom': user['nom'], 'restricted': user.get('restricted', [])}
    SESSIONS[token] = sess
    try:
        conn, cur = kv_conn()
        cur.execute("INSERT INTO kv_store (k, v) VALUES (%s, %s) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
                    ['__session::' + token, json.dumps(sess)])
        conn.commit(); cur.close(); conn.close()
    except Exception:
        pass
    resp = jsonify({'ok': True, 'token': token, 'username': username, 'nom': user['nom'], 'role': user['role'], 'restricted': user.get('restricted', [])})
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
