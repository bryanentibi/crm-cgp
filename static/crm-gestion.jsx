/* CRM Gestion — Bryan CGP (base Elyon) · exécuté via Babel navigateur, pas de build */
const { useState, useEffect, useMemo, useRef } = React;
const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = Recharts;

/* ================= CONSTANTES ================= */
const NAVY = "#0B2545";
const NAVY2 = "#13315C";
const GOLD = "#C9A24B";
const LIGHT = "#F5F7FA";

const COMPANIES = {
  "PER": ["Optimum Vie", "MMA", "Swiss Life", "Abeille", "Malakoff Humanis", "Generali"],
  "Assurance vie": ["AFI ESCA", "MMA", "Swiss Life", "Generali"],
  "Prévoyance": ["April", "Abeille", "Swiss Life", "MMA"],
  "Protection juridique": ["IAG Santé", "SPP"],
  "Mutuelle": ["April", "Abeille", "Generali", "MMA", "Malakoff Humanis", "Swiss Life"],
  "Transfert": ["Optimum Vie", "MMA", "AFI ESCA", "Abeille", "Malakoff Humanis", "Swiss Life", "Generali", "IAG Santé"],
};
const CONTRACT_TYPES = Object.keys(COMPANIES);
const SITUATIONS = ["Célibataire", "Marié(e)", "Pacsé(e)", "Concubinage"];
const ALERT_TYPES = [
  "Création de l'espace client",
  "Rappel pour documents",
  "Rappel pour signature de contrat",
  "Autre",
];
const BAREMES = ["Manager", "Commercial"];
const STATUTS = ["En attente", "Payé", "Annulé"];

/* ---- Prospection ---- */
const PROSPECTION_STATUTS = [
  "Pas de réponse", "À rappeler", "Refus", "RDV pris", "RDV honoré",
  "RDV annulé", "RDV reporté", "Proposition envoyée", "Signé", "Perdu",
];
const PROSPECTION_COLORS = {
  "Pas de réponse": "#8593a8", "À rappeler": "#b58900", "Refus": "#B3261E",
  "RDV pris": "#13315C", "RDV honoré": "#0B2545", "RDV annulé": "#B3261E",
  "RDV reporté": "#b58900", "Proposition envoyée": "#7a5c17", "Signé": "#1b7a3d", "Perdu": "#B3261E",
};
const PROFESSIONS_SANTE = [
  "Infirmier(ère) libéral(e)", "Kinésithérapeute", "Dentiste", "Médecin généraliste",
  "Médecin spécialiste", "Sage-femme", "Ostéopathe", "Podologue", "Orthophoniste",
  "Pharmacien(ne)", "Vétérinaire", "Autre profession libérale", "Autre",
];
const NOTES_5 = ["1", "2", "3", "4", "5"];
const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const DEFAULT_USERS = [
  { id: "bryan", prenom: "Bryan", nom: "Entibi", bareme: "Manager", isManager: true, password: null },
];

/* ================= HELPERS ================= */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key) => {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
};
const defaultMonths = () => {
  const out = [];
  const start = new Date(2025, 8, 1); // septembre 2025
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  let d = start;
  while (d <= end) {
    out.push(monthKey(d));
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return out;
};
const nextMonthKey = (key) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m, 1); // mois suivant
  return monthKey(d);
};

const parseNum = (v) => {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};
const fmtEUR = (n) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €";
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* Rappel automatique tous les 4 mois à partir de la date de signature */
const nextFollowUp = (signatureISO) => {
  if (!signatureISO) return null;
  const sig = new Date(signatureISO + "T00:00:00");
  if (isNaN(sig)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let d = new Date(sig);
  do { d = new Date(d.getFullYear(), d.getMonth() + 4, d.getDate()); } while (d < now);
  return d;
};
const daysUntil = (date) => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((date - now) / 86400000);
};

/* Prochain anniversaire d'un client (à partir de sa date de naissance) */
const nextBirthday = (dateNaissanceISO) => {
  if (!dateNaissanceISO) return null;
  const [, m, d] = dateNaissanceISO.split("-").map(Number);
  if (!m || !d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let bd = new Date(now.getFullYear(), m - 1, d);
  if (bd < now) bd = new Date(now.getFullYear() + 1, m - 1, d);
  return bd;
};
const ageAt = (dateNaissanceISO, at) => {
  const [y] = dateNaissanceISO.split("-").map(Number);
  return at.getFullYear() - y;
};

/* Export CSV compatible Excel FR (séparateur ; + BOM UTF-8) */
const downloadCSV = (filename, headers, rows) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

/* ================= STOCKAGE ================= */
async function sGet(key) {
  try {
    const r = await window.storage.get(key, true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function sSet(key, val) {
  try { await window.storage.set(key, JSON.stringify(val), true); }
  catch (e) { console.error("Erreur de sauvegarde", key, e); }
}
async function sDel(key) {
  try { await window.storage.delete(key, true); } catch {}
}

/* Fichiers (base64) — limite ~3,5 Mo par fichier */
const MAX_FILE = 3.5 * 1024 * 1024;
function readFileB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Lecture impossible"));
    r.readAsDataURL(file);
  });
}
async function storeFile(file) {
  if (file.size > MAX_FILE) throw new Error(`« ${file.name} » dépasse 3,5 Mo. Compressez le fichier avant de l'importer.`);
  const data = await readFileB64(file);
  const id = uid();
  await sSet(`crm-file-${id}`, { name: file.name, type: file.type || "application/octet-stream", data });
  return { id, name: file.name, size: file.size, date: todayISO() };
}
async function downloadFile(fileId, fallbackName) {
  const f = await sGet(`crm-file-${fileId}`);
  if (!f) { alert("Fichier introuvable."); return; }
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: f.type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = f.name || fallbackName || "document";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const emptyRow = () => ({
  id: uid(), dateCreation: "", nom: "", type: "", compagnie: "", frais: "", ref: "",
  commentaire: "", apporteur: "", versement: "", versementAnnuel: "", volume: "", remuneration: "", statut: "En attente",
});

/* ===== Taux de commission par défaut (médians calculés sur ton historique) ===== */
const RATE_COMP = { "Optimum Vie": 0.20, "AFI ESCA": 0.125, "MMA": 0.15, "IAG Santé": 0.25, "SPP": 0.35, "Swiss Life": 0.10, "April": 0.20 };
const RATE_TYPE = { "PER": 0.20, "Assurance vie": 0.15, "Prévoyance": 0.10, "Protection juridique": 0.25, "Mutuelle": 0.20, "Transfert": 0.10 };
const rateFor = (r) => {
  const t = parseFloat(r.taux);
  if (!isNaN(t) && t > 0) return t;
  return RATE_COMP[r.compagnie] ?? RATE_TYPE[r.type] ?? 0.10;
};
/* Volume = (mensuel + annuel) × 12 · Commission = volume × taux */
function recalcRow(r, field) {
  if (["versement", "versementAnnuel", "type", "compagnie", "volume", "taux"].includes(field)) {
    const m = parseNum(r.versement), a = parseNum(r.versementAnnuel);
    if (field !== "volume" && (m || a)) r = { ...r, volume: String(Math.round((m + a) * 12)) };
    const vol = parseNum(r.volume);
    if (vol) r = { ...r, remuneration: String(Math.round(vol * rateFor(r) * 100) / 100) };
  }
  return r;
}
const emptyMonthData = (users) => {
  const out = {};
  users.forEach((u) => { out[u.id] = { rows: Array.from({ length: 20 }, emptyRow), nonPayes: "" }; });
  return out;
};

/* ================= STYLES ================= */
const CSS = `
  .crm * { box-sizing: border-box; }
  .crm { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: ${NAVY}; min-height: 100vh; background: ${LIGHT}; display:flex; }
  .crm h1,.crm h2,.crm h3 { font-family: Georgia, 'Times New Roman', serif; margin: 0; }
  .side { width: 232px; min-height: 100vh; background: linear-gradient(180deg, ${NAVY} 0%, ${NAVY2} 100%); color:#fff; display:flex; flex-direction:column; flex-shrink:0; }
  .brand { padding: 26px 20px 18px; border-bottom: 1px solid rgba(255,255,255,.12); }
  .brand b { font-family: Georgia, serif; font-size: 19px; letter-spacing: .5px; display:block; }
  .brand span { color:${GOLD}; font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; }
  .nav { padding: 14px 10px; display:flex; flex-direction:column; gap:4px; flex:1; }
  .nav button { text-align:left; background:none; border:none; color:rgba(255,255,255,.82); padding:11px 14px; border-radius:8px; cursor:pointer; font-size:14px; display:flex; gap:10px; align-items:center; transition: background .15s; }
  .nav button:hover { background: rgba(255,255,255,.08); }
  .nav button.on { background: rgba(201,162,75,.18); color:#fff; border-left: 3px solid ${GOLD}; }
  .side .who { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,.12); font-size: 13px; }
  .side .who b { color: ${GOLD}; }
  .main { flex:1; padding: 30px 34px; overflow:auto; min-width: 0; }
  .ph { display:flex; align-items:flex-end; justify-content:space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
  .ph h1 { font-size: 26px; }
  .ph .sub { color:#5b6b82; font-size: 13px; margin-top: 4px; }
  .card { background:#fff; border:1px solid #e3e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(11,37,69,.05); }
  .grid { display:grid; gap: 14px; }
  .kpis { display:grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .kpi { background:#fff; border:1px solid #e3e8f0; border-left: 4px solid ${GOLD}; border-radius: 10px; padding: 14px 16px; }
  .kpi .n { font-size: 26px; font-weight: 700; font-family: Georgia, serif; }
  .kpi .l { font-size: 12px; color:#5b6b82; text-transform: uppercase; letter-spacing: .8px; margin-top:2px; }
  .btn { background:${NAVY}; color:#fff; border:none; border-radius:8px; padding: 9px 16px; cursor:pointer; font-size: 14px; }
  .btn:hover { background:${NAVY2}; }
  .btn.gold { background:${GOLD}; color:${NAVY}; font-weight:600; }
  .btn.ghost { background:#fff; color:${NAVY}; border:1px solid #cdd6e2; }
  .btn.sm { padding: 5px 10px; font-size: 12.5px; border-radius:6px; }
  .btn.danger { background:#fff; color:#B3261E; border:1px solid #e6c9c7; }
  .in, .sel, .ta { width:100%; border:1px solid #cdd6e2; border-radius:8px; padding: 8px 10px; font-size:14px; color:${NAVY}; background:#fff; }
  .in:focus,.sel:focus,.ta:focus { outline: 2px solid ${GOLD}55; border-color:${GOLD}; }
  .lbl { font-size: 12px; font-weight: 600; color:#41506a; display:block; margin-bottom:4px; letter-spacing:.3px; }
  .fgrid { display:grid; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); gap: 12px; }
  table.t { width:100%; border-collapse: collapse; font-size: 13px; }
  table.t th { background:${NAVY}; color:#fff; padding: 9px 8px; text-align:center; font-weight:600; font-size:12px; letter-spacing:.4px; white-space: nowrap; }
  table.t th:first-child { border-radius: 8px 0 0 0; } table.t th:last-child { border-radius: 0 8px 0 0; }
  table.t td { border-bottom:1px solid #edf1f6; padding: 4px 6px; text-align:center; }
  table.t input, table.t select { width:100%; border:1px solid transparent; background:transparent; padding: 6px 4px; font-size:13px; text-align:center; border-radius:6px; color:inherit; }
  table.t input:focus, table.t select:focus { background:#fff; border-color:${GOLD}; outline:none; }
  tr.paye td { background:#e4f3e6; } tr.annule td { background:#fbe4e2; } tr.attente td { background:#fdf1dc; }
  .totrow td { background:${NAVY}; color:#fff; font-weight:700; padding: 10px 8px; }
  .nprow td { background:#fdf6e7; font-weight:600; }
  .modal-bg { position:fixed; inset:0; background:rgba(11,37,69,.55); display:flex; align-items:flex-start; justify-content:center; padding: 40px 16px; z-index:50; overflow:auto; }
  .modal { background:#fff; border-radius: 14px; padding: 26px; width: 100%; max-width: 760px; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
  .modal h2 { font-size: 20px; margin-bottom: 16px; }
  .badge { display:inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11.5px; font-weight:600; }
  .b-navy { background:${NAVY}; color:#fff; } .b-gold { background:${GOLD}22; color:#8a6a1f; border:1px solid ${GOLD}66; }
  .b-green { background:#e4f3e6; color:#1d6b2a; } .b-red { background:#fbe4e2; color:#a33028; } .b-grey { background:#eef1f5; color:#41506a; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .clientcard { display:flex; justify-content:space-between; align-items:center; padding: 14px 18px; background:#fff; border:1px solid #e3e8f0; border-radius:10px; cursor:pointer; transition: border-color .15s; }
  .clientcard:hover { border-color:${GOLD}; }
  .filelink { display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; background:${LIGHT}; border:1px solid #e3e8f0; border-radius:8px; font-size:13px; margin-bottom:6px; }
  .alertline { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; border:1px solid #e3e8f0; background:#fff; margin-bottom:8px; }
  .alertline.today { border-color:${GOLD}; background:#fdf6e7; }
  .tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 16px; }
  .tabs button { border:1px solid #cdd6e2; background:#fff; border-radius:20px; padding: 7px 16px; cursor:pointer; font-size:13px; color:${NAVY}; }
  .tabs button.on { background:${NAVY}; color:#fff; border-color:${NAVY}; }
  .login { min-height:100vh; width:100%; display:flex; align-items:center; justify-content:center; background: linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 60%, #1d4066 100%); }
  .loginbox { background:#fff; border-radius: 16px; padding: 38px 36px; width: 100%; max-width: 420px; box-shadow: 0 30px 80px rgba(0,0,0,.4); }
  .loginbox h1 { font-size: 24px; text-align:center; }
  .loginbox .gold { color:${GOLD}; letter-spacing: 3px; font-size: 11px; text-transform: uppercase; text-align:center; display:block; margin-bottom: 26px; margin-top: 4px; }
  .userbtn { display:flex; justify-content:space-between; align-items:center; width:100%; padding: 13px 16px; border:1px solid #cdd6e2; border-radius:10px; background:#fff; cursor:pointer; font-size: 15px; margin-bottom: 10px; }
  .userbtn:hover { border-color:${GOLD}; background:#fdf9f0; }
  @media (max-width: 860px) { .crm { flex-direction: column; } .side { width:100%; min-height:0; } .main { padding: 18px 14px; } }
`;

/* ================= COMPOSANTS GÉNÉRIQUES ================= */
function Field({ label, children }) {
  return (
    <div>
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

function FilePicker({ label, multiple, onFiles, busyText = "Import en cours…" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <input
        type="file" multiple={multiple} ref={ref} style={{ display: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          setBusy(true);
          try {
            const stored = [];
            for (const f of files) stored.push(await storeFile(f));
            await onFiles(stored);
          } catch (err) { alert(err.message); }
          setBusy(false);
          if (ref.current) ref.current.value = "";
        }}
      />
      <button className="btn ghost sm" onClick={() => ref.current && ref.current.click()} disabled={busy}>
        {busy ? busyText : label}
      </button>
    </span>
  );
}

function FileList({ files, onDelete }) {
  if (!files || !files.length) return <div style={{ fontSize: 13, color: "#8593a8" }}>Aucun document importé.</div>;
  return (
    <div>
      {files.map((f) => (
        <div className="filelink" key={f.id}>
          <span>📄 {f.name} <span style={{ color: "#8593a8" }}>· {fmtDate(f.date)}</span></span>
          <span className="row">
            <button className="btn sm" onClick={() => downloadFile(f.id, f.name)}>Télécharger</button>
            {onDelete && <button className="btn danger sm" onClick={() => onDelete(f)}>Suppr.</button>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ================= APPLICATION ================= */
function App() {
  const [clientTypeFilter, setClientTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [clients, setClients] = useState([]);
  const [sales, setSales] = useState({});          // { "2025-09": { userId: {rows, nonPayes} } }
  const [docs, setDocs] = useState([]);            // dossiers partagés
  const [bordereaux, setBordereaux] = useState({}); // { userId: { "2025-09": [files] } }

  const [me, setMe] = useState(null);       // utilisateur connecté
  const [viewAs, setViewAs] = useState(null); // espace consulté (Quentin peut voir les autres)
  const [page, setPage] = useState("dash");
  const [openClient, setOpenClient] = useState(null);
  const [prospection, setProspection] = useState([]);   // fiches d'appels / RDV prospection
  const [objectifs, setObjectifs] = useState({});       // { "2026-07": { userId: { contrats, volume } } }
  const [trash, setTrash] = useState([]);               // corbeille (fiches supprimées, 30 jours)

  /* ---- Chargement initial ---- */
  useEffect(() => {
    (async () => {
      const [u, c, s, d, b, p, o, t] = await Promise.all([
        sGet("crm-users"), sGet("crm-clients"), sGet("crm-sales"), sGet("crm-docs"), sGet("crm-bordereaux"),
        sGet("crm-prospection"), sGet("crm-objectifs"), sGet("crm-trash"),
      ]);
      let loadedUsers = u && u.length ? u : DEFAULT_USERS;
      /* Réinitialisation des mots de passe demandée le 07/07/2026 (une seule fois) */
      const pwdResetDone = await sGet("crm-pwd-reset-0707");
      if (!pwdResetDone) {
        loadedUsers = loadedUsers.map((x) => ({ ...x, password: "1425" }));
        await sSet("crm-users", loadedUsers);
        await sSet("crm-pwd-reset-0707", true);
      }
      setUsers(loadedUsers);
      if (!u) await sSet("crm-users", loadedUsers);
      /* Reconnexion automatique si déjà connecté sur ce navigateur */
      try {
        const savedId = localStorage.getItem("crm-me");
        const saved = savedId && loadedUsers.find((x) => x.id === savedId);
        if (saved) { setMe(saved); setViewAs(saved); }
      } catch {}
      setClients(c || []);
      let salesData = s || {};
      let changed = false;
      defaultMonths().forEach((mk) => {
        if (!salesData[mk]) { salesData[mk] = emptyMonthData(loadedUsers); changed = true; }
      });
      setSales(salesData);
      if (!s || changed) await sSet("crm-sales", salesData);
      setDocs(d || []);
      setBordereaux(b || {});
      setProspection(p || []);
      setObjectifs(o || {});
      /* Purge automatique de la corbeille après 30 jours */
      const freshTrash = (t || []).filter((x) => Date.now() - new Date(x.deletedAt).getTime() < 30 * 86400000);
      setTrash(freshTrash);
      if ((t || []).length !== freshTrash.length) await sSet("crm-trash", freshTrash);
      setLoading(false);
    })();
  }, []);

  const saveUsers = (v) => { setUsers(v); sSet("crm-users", v); };
  const saveClients = (v) => { setClients(v); sSet("crm-clients", v); };
  const saveSales = (v) => { setSales(v); sSet("crm-sales", v); };
  const saveDocs = (v) => { setDocs(v); sSet("crm-docs", v); };
  const saveBordereaux = (v) => { setBordereaux(v); sSet("crm-bordereaux", v); };
  const saveProspection = (v) => { setProspection(v); sSet("crm-prospection", v); };
  const saveObjectifs = (v) => { setObjectifs(v); sSet("crm-objectifs", v); };
  const saveTrash = (v) => { setTrash(v); sSet("crm-trash", v); };
  const toTrash = (kind, data) => saveTrash([...trash, { id: uid(), kind, data, deletedAt: new Date().toISOString(), deletedBy: me ? me.id : "?" }]);

  if (loading) {
    return (
      <div className="crm" style={{ alignItems: "center", justifyContent: "center", background: NAVY }}>
        <style>{CSS}</style>
        <div style={{ color: "#fff", fontFamily: "Georgia, serif", fontSize: 20 }}>
          BRYAN <span style={{ color: GOLD }}>CGP</span> — chargement…
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <Login
        users={users}
        onLogin={(u) => { setMe(u); setViewAs(u); setPage("dash"); try { localStorage.setItem("crm-me", u.id); } catch {} }}
        onSetPassword={(userId, pwd) => {
          saveUsers(users.map((u) => (u.id === userId ? { ...u, password: pwd } : u)));
        }}
      />
    );
  }

  const view = viewAs || me;
  const NAV = [
    ["dash", "📊 Tableau de bord"],
    ["clients", "👥 Clients"],
    ["prospection", "🎯 Prospection"],
    ["ventes", "📈 Ventes"],
    ["paye", "💶 Ma rémunération"],
    ["docs", "📁 Documents"],
    ["decom", "🔻 Décommissionnés"],
    ...(me.isManager ? [["equipe", "🧑‍💼 Mon équipe"], ["corbeille", "🗑️ Corbeille"]] : []),
  ];

  return (
    <div className="crm">
      <style>{CSS}</style>
      <aside className="side">
        <div className="brand">
          <b>BRYAN <span style={{ color: GOLD }}>·</span> CGP</b>
          <span>Gestion de patrimoine</span>
        </div>
        <div style={{ display: "flex", gap: 4, margin: "0 10px 12px", background: "#13315C", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: 4 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 7, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.6)", cursor: "pointer" }}>🎯 Prospection</div>
          <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 7, fontSize: 12, fontWeight: 700, background: "#C9A24B", color: "#0B2545", cursor: "default" }}>📁 Gestion</div>
        </div>
        <nav className="nav">
          {NAV.map(([k, l]) => (
            <button key={k} className={page === k ? "on" : ""} onClick={() => { setPage(k); setOpenClient(null); }}>
              {l}
            </button>
          ))}
        </nav>
        <GlobalSearch
          clients={clients} prospection={prospection} me={me} users={users}
          goClient={(id) => { setPage("clients"); setOpenClient(id); }}
          goProspection={() => { setPage("prospection"); setOpenClient(null); }}
        />
        <div className="who">
          Connecté : <b>{me.prenom} {me.nom}</b>
          <div style={{ fontSize: 11.5, opacity: 0.75 }}>Barème {me.bareme}</div>
          {me.isManager && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.7 }}>Espace consulté</span>
              <select
                className="sel" style={{ marginTop: 4, background: "rgba(255,255,255,.1)", color: "#fff", borderColor: "rgba(255,255,255,.3)" }}
                value={view.id}
                onChange={(e) => setViewAs(users.find((u) => u.id === e.target.value))}
              >
                {users.map((u) => <option key={u.id} value={u.id} style={{ color: NAVY }}>{u.prenom} {u.nom}</option>)}
              </select>
            </div>
          )}
          {me.isManager && (
            <div style={{ marginTop: 10 }}>
              <button
                className="btn ghost sm" style={{ width: "100%", marginBottom: 6 }}
                onClick={() => {
                  const payload = { version: 4, date: todayISO(), users, clients, sales, docs, bordereaux, prospection, objectifs, trash };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `ELYON_CRM_sauvegarde_${todayISO()}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                💾 Exporter les données
              </button>
              <button
                className="btn ghost sm" style={{ width: "100%" }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "application/json";
                  input.onchange = (ev) => {
                    const file = ev.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const p = JSON.parse(reader.result);
                        if (!p.clients && !p.users) { alert("Fichier invalide."); return; }
                        if (!confirm("Importer cette sauvegarde ? Les données actuelles seront remplacées.")) return;
                        if (p.users) saveUsers(p.users);
                        if (p.clients) saveClients(p.clients);
                        if (p.sales) saveSales(p.sales);
                        if (p.docs) saveDocs(p.docs);
                        if (p.bordereaux) saveBordereaux(p.bordereaux);
                        if (p.prospection) saveProspection(p.prospection);
                        if (p.objectifs) saveObjectifs(p.objectifs);
                        alert("Import terminé ✓");
                      } catch { alert("Impossible de lire ce fichier."); }
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}
              >
                📥 Importer une sauvegarde
              </button>
            </div>
          )}
          <button className="btn ghost sm" style={{ marginTop: 12, width: "100%" }} onClick={() => { setMe(null); setViewAs(null); try { localStorage.removeItem("crm-me"); } catch {} }}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="main">
        {page === "decom" && <DecomPage clients={clients} saveClients={saveClients} goClient={(id) => { setPage("clients"); setOpenClient(id); }} />}
        {page === "dash" && <Dashboard clients={clients} users={users} view={view} me={me} sales={sales} saveClients={saveClients} goClient={(c) => { setOpenClient(c.id); setPage("clients"); }} goClients={(t) => { setClientTypeFilter(t || ""); setOpenClient(null); setPage("clients"); }} />}
        {page === "prospection" && (
          <ProspectionPage
            prospection={prospection} saveProspection={saveProspection} me={me} users={users} toTrash={toTrash}
            clients={clients} saveClients={saveClients}
            goClient={(id) => { setPage("clients"); setOpenClient(id); }}
          />
        )}
        {page === "clients" && !openClient && (
          <ClientsPage clients={clients} saveClients={saveClients} me={me} users={users} openClient={(id) => setOpenClient(id)} typeFilter={clientTypeFilter} clearTypeFilter={() => setClientTypeFilter("")} />
        )}
        {page === "clients" && openClient && (
          <ClientDetail
            client={clients.find((c) => c.id === openClient)}
            me={me}
            users={users}
            back={() => setOpenClient(null)}
            update={(next) => saveClients(clients.map((c) => (c.id === next.id ? next : c)))}
            remove={() => { if (confirm("Mettre cette fiche client à la corbeille ? (restaurable pendant 30 jours)")) { toTrash("client", clients.find((c) => c.id === openClient)); saveClients(clients.filter((c) => c.id !== openClient)); setOpenClient(null); } }}
          />
        )}
        {page === "ventes" && <SalesPage sales={sales} saveSales={saveSales} users={users} objectifs={objectifs} saveObjectifs={saveObjectifs} me={me} />}
        {page === "paye" && <PayePage view={view} sales={sales} bordereaux={bordereaux} saveBordereaux={saveBordereaux} />}
        {page === "docs" && <DocsPage docs={docs} saveDocs={saveDocs} />}
        {page === "equipe" && me.isManager && <TeamPage users={users} saveUsers={saveUsers} sales={sales} saveSales={saveSales} me={me} />}
        {page === "corbeille" && me.isManager && (
          <TrashPage
            trash={trash} saveTrash={saveTrash} users={users}
            restoreClient={(item) => { saveClients([...clients, item.data]); saveTrash(trash.filter((x) => x.id !== item.id)); }}
            restoreProspect={(item) => { saveProspection([...prospection, item.data]); saveTrash(trash.filter((x) => x.id !== item.id)); }}
          />
        )}
      </main>
    </div>
  );
}

/* ================= CONNEXION ================= */
function Login({ users, onLogin, onSetPassword }) {
  const [selected, setSelected] = useState(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [err, setErr] = useState("");

  const needsPassword = !!selected;
  const firstTime = selected && !selected.password;

  const submit = () => {
    setErr("");
    if (firstTime) {
      if (pwd.length < 4) { setErr("Choisissez un mot de passe d'au moins 4 caractères."); return; }
      if (pwd !== pwd2) { setErr("Les deux mots de passe ne correspondent pas."); return; }
      onSetPassword(selected.id, pwd);
      onLogin({ ...selected, password: pwd });
    } else if (needsPassword) {
      if (pwd === selected.password) onLogin(selected);
      else setErr("Mot de passe incorrect.");
    }
  };

  return (
    <div className="crm">
      <style>{CSS}</style>
      <div className="login">
        <div className="loginbox">
          <h1>BRYAN <span style={{ color: GOLD }}>·</span> CGP</h1>
          <span className="gold">CRM · Gestion de patrimoine</span>
          {!selected && (
            <>
              <p style={{ fontSize: 13.5, color: "#5b6b82", marginBottom: 14 }}>Sélectionnez votre espace :</p>
              {users.map((u) => (
                <button key={u.id} className="userbtn" onClick={() => { setSelected(u); setPwd(""); setPwd2(""); setErr(""); }}>
                  <span>{u.prenom} {u.nom}</span>
                  <span className={"badge " + (u.isManager ? "b-gold" : "b-grey")}>{u.bareme} 🔒</span>
                </button>
              ))}
            </>
          )}
          {selected && needsPassword && (
            <>
              <p style={{ fontSize: 14, marginBottom: 12 }}>
                Espace de <b>{selected.prenom} {selected.nom}</b>
                {firstTime && <span style={{ color: "#5b6b82" }}> — première connexion, créez votre mot de passe.</span>}
              </p>
              <Field label={firstTime ? "Nouveau mot de passe" : "Mot de passe"}>
                <input className="in" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
              </Field>
              {firstTime && (
                <div style={{ marginTop: 10 }}>
                  <Field label="Confirmez le mot de passe">
                    <input className="in" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
                  </Field>
                </div>
              )}
              {err && <div style={{ color: "#B3261E", fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={submit}
                  style={{ display: "block", width: "100%", background: GOLD, color: NAVY, border: "none", borderRadius: 8, padding: "13px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3 }}
                >
                  {firstTime ? "Créer mon mot de passe et me connecter" : "Se connecter"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  style={{ display: "block", width: "100%", marginTop: 8, background: "#fff", color: NAVY, border: "1px solid #cdd6e2", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
                >
                  ← Retour
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= TABLEAU DE BORD ================= */
function Dashboard({ clients: allClients, users, view, me, sales, saveClients, goClient, goClients }) {
  /* Cloisonnement : un commercial ne voit que ses clients.
     Le manager voit tout depuis son espace, ou le portefeuille du conseiller consulté. */
  const clients = useMemo(() => {
    if (!me.isManager) return allClients.filter((c) => (c.createdBy || "quentin") === me.id);
    if (view.id !== me.id) return allClients.filter((c) => (c.createdBy || "quentin") === view.id);
    return allClients;
  }, [allClients, me, view]);

  const stats = useMemo(() => {
    const s = { clients: clients.length, contrats: 0, PER: 0, "Assurance vie": 0, "Prévoyance": 0, "Protection juridique": 0, "Mutuelle": 0, "Transfert": 0 };
    clients.forEach((c) => (c.contrats || []).forEach((k) => { s.contrats++; if (s[k.type] !== undefined) s[k.type]++; }));
    return s;
  }, [clients]);

  /* Alertes du jour / en retard + rappels 4 mois */
  const today = todayISO();
  const alerts = [];
  clients.forEach((c) => {
    (c.alertes || []).filter((a) => !a.done).forEach((a) => {
      if (a.date <= today) alerts.push({ kind: "alerte", client: c, alerte: a, date: a.date });
    });
    /* Rappels 4 mois automatiques désactivés — utiliser les alertes manuelles */
    /* 🎂 Anniversaire client dans les 7 prochains jours */
    const bd = nextBirthday(c.dateNaissance);
    if (bd) {
      const d = daysUntil(bd);
      if (d >= 0 && d <= 7) alerts.push({ kind: "anniv", client: c, date: bd.toISOString().slice(0, 10), days: d, age: ageAt(c.dateNaissance, bd) });
    }
  });
  alerts.sort((a, b) => a.date.localeCompare(b.date));

  const markDone = (client, alerte) => {
    const next = { ...client, alertes: client.alertes.map((a) => (a.id === alerte.id ? { ...a, done: true } : a)) };
    saveClients(clientsReplace(client, next));
  };
  const clientsReplace = (oldC, newC) => clients.map((c) => (c.id === oldC.id ? newC : c));

  return (
    <div>
      <div className="ph">
        <div>
          <h1>Tableau de bord</h1>
          <div className="sub">Vue d'ensemble du cabinet · espace de {view.prenom} {view.nom}</div>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("")}><div className="n">{stats.clients}</div><div className="l">Clients actifs</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("")}><div className="n">{stats.contrats}</div><div className="l">Contrats</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("PER")}><div className="n">{stats.PER}</div><div className="l">PER</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("Assurance vie")}><div className="n">{stats["Assurance vie"]}</div><div className="l">Assurances vie</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("Prévoyance")}><div className="n">{stats["Prévoyance"]}</div><div className="l">Prévoyances</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("Protection juridique")}><div className="n">{stats["Protection juridique"]}</div><div className="l">Protections juridiques</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("Mutuelle")}><div className="n">{stats["Mutuelle"]}</div><div className="l">Mutuelles</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => goClients("Transfert")}><div className="n">{stats["Transfert"]}</div><div className="l">Transferts</div></div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, marginBottom: 14 }}>🔔 Alertes & rappels du jour</h2>
        {alerts.length === 0 && <div style={{ color: "#8593a8", fontSize: 14 }}>Aucune alerte aujourd'hui. Tout est à jour.</div>}
        {alerts.map((a, i) => (
          <div className={"alertline" + (a.date <= today ? " today" : "")} key={i}>
            <div>
              {a.kind === "alerte" ? (
                <>
                  <b>{a.alerte.type}</b> — {a.client.prenom} {a.client.nom}
                  {a.alerte.note && <span style={{ color: "#5b6b82" }}> · {a.alerte.note}</span>}
                  <div style={{ fontSize: 12, color: "#8593a8" }}>Prévu le {fmtDate(a.date)}{a.date < today ? " (en retard)" : ""}</div>
                </>
              ) : a.kind === "anniv" ? (
                <>
                  <b>🎂 Anniversaire</b> — {a.client.prenom} {a.client.nom} fêtera ses {a.age} ans
                  <div style={{ fontSize: 12, color: "#8593a8" }}>
                    Le {fmtDate(a.date)}{a.days === 0 ? " (aujourd'hui ! 🎉)" : ` (dans ${a.days} j)`} — une bonne occasion de prendre des nouvelles.
                  </div>
                </>
              ) : (
                <>
                  <b>Rappel client (4 mois)</b> — {a.client.prenom} {a.client.nom}
                  <div style={{ fontSize: 12, color: "#8593a8" }}>
                    Contrat {a.contrat.type} {a.contrat.compagnie} signé le {fmtDate(a.contrat.dateSignature)} · à rappeler le {fmtDate(a.date)}
                    {a.days === 0 ? " (aujourd'hui)" : a.days > 0 ? ` (dans ${a.days} j)` : ""}
                  </div>
                </>
              )}
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => goClient(a.client)}>Voir la fiche</button>
              {a.kind === "alerte" && <button className="btn ghost sm" onClick={() => markDone(a.client, a.alerte)}>✓ Fait</button>}
            </div>
          </div>
        ))}
      </div>

      <VentesJour sales={sales} users={users} clients={clients} goClient={goClient} />
    </div>
  );
}

/* ================= CLASSEMENT ÉQUIPE ================= */
function Leaderboard({ sales, users }) {
  const months = Object.keys(sales).sort();
  const [month, setMonth] = useState(months[months.length - 1]);
  const md = sales[month] || {};

  const ranking = users
    .map((u) => {
      const rows = ((md[u.id] || {}).rows || []).filter((r) => (r.nom || "").trim() && r.statut !== "Annulé");
      return {
        user: u,
        contrats: rows.length,
        volume: rows.reduce((s, r) => s + parseNum(r.volume), 0),
        remuneration: rows.reduce((s, r) => s + parseNum(r.remuneration), 0),
      };
    })
    .sort((a, b) => b.volume - a.volume || b.contrats - a.contrats);

  const medals = ["🥇", "🥈", "🥉"];
  const maxVol = Math.max(1, ...ranking.map((r) => r.volume));

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: 18 }}>🏆 Classement de l'équipe</h2>
        <select className="sel" style={{ width: 180 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      {ranking.every((r) => r.contrats === 0) && (
        <div style={{ color: "#8593a8", fontSize: 13.5 }}>Aucun contrat saisi sur {monthLabel(month)} pour l'instant.</div>
      )}
      {ranking.map((r, i) => (
        <div key={r.user.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: i < ranking.length - 1 ? "1px solid #eef1f6" : "none" }}>
          <span style={{ fontSize: 22, width: 30 }}>{medals[i] || `${i + 1}.`}</span>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 14.5 }}>{r.user.prenom} {r.user.nom}</b>
            <div style={{ fontSize: 12, color: "#5b6b82" }}>{r.contrats} contrat(s) · volume {fmtEUR(r.volume)}</div>
            <div style={{ height: 7, background: "#eef1f6", borderRadius: 4, marginTop: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((r.volume / maxVol) * 100)}%`, background: i === 0 ? GOLD : NAVY2, borderRadius: 4, transition: "width .4s" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= CLIENTS ================= */
function ClientsPage({ clients, saveClients, me, users, openClient, typeFilter, clearTypeFilter }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("alpha");
  const [monthTab, setMonthTab] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState("all");

  /* Cloisonnement : un commercial ne voit QUE son portefeuille. Le manager voit tout. */
  const ownerOf = (c) => c.createdBy || "quentin";
  const myPortfolio = me.isManager ? clients : clients.filter((c) => ownerOf(c) === me.id);
  const scoped = me.isManager && ownerFilter !== "all"
    ? myPortfolio.filter((c) => ownerOf(c) === ownerFilter)
    : myPortfolio;
  const filtered = scoped.filter((c) =>
    !c.decom &&
    (monthTab === "all" || (c.contrats || []).some((k) => (k.dateSignature || "").slice(0, 7) === monthTab)) &&
    (!typeFilter || (c.contrats || []).some((k) => k.type === typeFilter)) &&
    (c.nom + " " + c.prenom + " " + (c.profession || "")).toLowerCase().includes(search.toLowerCase())
  );
  const actifs = scoped.filter((c) => !c.decom);
  const moisDispo = clientMonths(actifs);
  const moisCounts = { all: actifs.length };
  moisDispo.forEach((m) => { moisCounts[m] = actifs.filter((c) => (c.contrats || []).some((k) => (k.dateSignature || "").slice(0, 7) === m)).length; });
  const lastSig = (c) => (c.contrats || []).reduce((m, k) => (k.dateSignature > m ? k.dateSignature : m), "");
  const totMontant = (c) => (c.contrats || []).reduce((s, k) => s + parseNum(k.montant), 0);
  const firstType = (c) => ((c.contrats || [])[0]?.type) || "";
  const firstComp = (c) => ((c.contrats || [])[0]?.compagnie) || "";
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "date") return lastSig(b).localeCompare(lastSig(a));
    if (sortBy === "montant") return totMontant(b) - totMontant(a);
    if (sortBy === "type") return firstType(a).localeCompare(firstType(b)) || a.nom.localeCompare(b.nom);
    if (sortBy === "compagnie") return firstComp(a).localeCompare(firstComp(b)) || a.nom.localeCompare(b.nom);
    return a.nom.localeCompare(b.nom);
  });
  const ownerName = (c) => {
    const u = users.find((x) => x.id === ownerOf(c));
    return u ? `${u.prenom} ${u.nom}` : "—";
  };

  return (
    <div>
      <div className="ph">
        <div>
          <h1>Clients</h1>
          <div className="sub">
            {me.isManager
              ? `${scoped.length} fiche(s) — vue manager : tous les portefeuilles`
              : `${myPortfolio.length} fiche(s) — votre portefeuille personnel`}
          </div>
        </div>
        <div className="row">
          {me.isManager && (
            <select className="sel" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="all">Tous les conseillers</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
            </select>
          )}
          {typeFilter && (
            <span className="badge b-gold" style={{ cursor: "pointer", fontSize: 13, padding: "7px 12px" }} onClick={clearTypeFilter} title="Cliquer pour retirer le filtre">
              Filtre : {typeFilter} ✕
            </span>
          )}
          <select className="sel" style={{ width: 190 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="alpha">Tri : A → Z</option>
            <option value="date">Tri : date de signature</option>
            <option value="montant">Tri : montant signé</option>
            <option value="type">Tri : type de contrat</option>
            <option value="compagnie">Tri : compagnie</option>
          </select>
          <input className="in" style={{ width: 220 }} placeholder="Rechercher un client…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn gold" onClick={() => setShowForm(true)}>+ Nouvelle fiche client</button>
        </div>
      </div>

      {monthTab === null && <MonthTiles months={moisDispo} counts={moisCounts} onPick={setMonthTab} />}

      {monthTab !== null && (<>
      <button className="btn ghost sm" style={{ marginBottom: 14 }} onClick={() => setMonthTab(null)}>← Retour aux mois</button>
      <span style={{ marginLeft: 12, fontFamily: "Georgia, serif", fontSize: 17, color: "#0B2545", fontWeight: 700, textTransform: "capitalize" }}>{monthTab === "all" ? "Tous les clients" : monthLabel(monthTab)}</span>
      <div className="grid" style={{ marginTop: 14 }}>
        {sorted.map((c) => (
          <div className="clientcard" key={c.id} onClick={() => openClient(c.id)}>
            <div>
              <b style={{ fontSize: 15 }}>{c.civilite ? c.civilite + " " : ""}{c.nom.toUpperCase()} {c.prenom}</b>
              <div style={{ fontSize: 12.5, color: "#5b6b82" }}>
                {c.profession || "Profession non renseignée"} · {c.telephone || "—"} · {c.email || "—"}
              </div>
            </div>
            <div className="row">
              {me.isManager && <span className="badge b-grey">👤 {ownerName(c)}</span>}
              {(c.contrats || []).length > 0 && <span className="badge b-navy">{c.contrats.length} contrat(s)</span>}
              {(c.alertes || []).some((a) => !a.done && a.date <= todayISO()) && <span className="badge b-gold">🔔 alerte</span>}
              <span style={{ color: GOLD, fontSize: 18 }}>›</span>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <div className="card" style={{ color: "#8593a8" }}>Aucun client sur cette période.</div>}
      </div>
      </>)}

      {showForm && (
        <ClientForm
          onClose={() => setShowForm(false)}
          onSave={(c) => { saveClients([...clients, { ...c, id: uid(), createdBy: me.id, createdAt: todayISO(), contrats: [], alertes: [] }]); setShowForm(false); }}
        />
      )}
    </div>
  );
}

function ClientForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    nom: "", prenom: "", dateNaissance: "", telephone: "", email: "",
    profession: "", revenus: "", situation: "Célibataire",
  });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{initial ? "Modifier la fiche client" : "Nouvelle fiche client"}</h2>
        <div className="fgrid">
          <Field label="Nom *"><input className="in" value={f.nom} onChange={(e) => set("nom", e.target.value)} /></Field>
          <Field label="Prénom *"><input className="in" value={f.prenom} onChange={(e) => set("prenom", e.target.value)} /></Field>
          <Field label="Date de naissance"><input className="in" type="date" value={f.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} /></Field>
          <Field label="Téléphone"><input className="in" value={f.telephone} onChange={(e) => set("telephone", e.target.value)} /></Field>
          <Field label="E-mail"><input className="in" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Profession"><input className="in" value={f.profession} onChange={(e) => set("profession", e.target.value)} /></Field>
          <Field label="Revenus imposables (€)"><input className="in" value={f.revenus} onChange={(e) => set("revenus", e.target.value)} placeholder="ex : 48 000" /></Field>
          <Field label="Situation matrimoniale">
            <select className="sel" value={f.situation} onChange={(e) => set("situation", e.target.value)}>
              {SITUATIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn gold" onClick={() => { if (!f.nom || !f.prenom) { alert("Nom et prénom obligatoires."); return; } onSave(f); }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function ClientDetail({ client, me, users, back, update, remove }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [editContract, setEditContract] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  if (!client) return null;

  const addAlert = (a) => update({ ...client, alertes: [...(client.alertes || []), { ...a, id: uid(), done: false }] });
  const toggleAlert = (id) => update({ ...client, alertes: client.alertes.map((a) => (a.id === id ? { ...a, done: !a.done } : a)) });
  const delAlert = (id) => update({ ...client, alertes: client.alertes.filter((a) => a.id !== id) });

  return (
    <div>
      <div className="ph">
        <div>
          <button className="btn ghost sm" onClick={back}>← Retour aux clients</button>
          <h1 style={{ marginTop: 10 }}>{client.civilite ? client.civilite + " " : ""}{client.nom.toUpperCase()} {client.prenom}</h1>
          <div className="sub">
            Fiche créée le {fmtDate(client.createdAt)}
            {" · Conseiller : "}
            {me && me.isManager ? (
              <select
                className="sel"
                style={{ fontSize: 12.5, padding: "2px 6px", marginLeft: 4 }}
                value={client.createdBy || "quentin"}
                onChange={(e) => update({ ...client, createdBy: e.target.value })}
              >
                {(users || []).map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
            ) : (
              <b>{((users || []).find((u) => u.id === (client.createdBy || "quentin")) || {}).prenom || "—"} {((users || []).find((u) => u.id === (client.createdBy || "quentin")) || {}).nom || ""}</b>
            )}
          </div>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setShowEdit(true)}>✏️ Modifier</button>
          <button className="btn danger" onClick={remove}>Supprimer</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <div className="card">
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>Informations personnelles</h2>
          <div style={{ fontSize: 14, lineHeight: 2 }}>
            <div><b>Date de naissance :</b> {fmtDate(client.dateNaissance)}</div>
            <div><b>Téléphone :</b> {client.telephone || "—"}</div>
            <div><b>E-mail :</b> {client.email || "—"}</div>
            <div><b>Profession :</b> {client.profession || "—"}</div>
            <div><b>Revenus imposables :</b> {client.revenus ? fmtEUR(parseNum(client.revenus)) : "—"}</div>
            <div><b>Situation matrimoniale :</b> {client.situation || "—"}</div>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>🔔 Alertes</h2>
            <button className="btn sm gold" onClick={() => setShowAlert(true)}>+ Créer une alerte</button>
          </div>
          {(client.alertes || []).length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Aucune alerte programmée.</div>}
          {(client.alertes || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((a) => (
            <div className={"alertline" + (!a.done && a.date <= todayISO() ? " today" : "")} key={a.id} style={a.done ? { opacity: 0.5 } : {}}>
              <div>
                <b>{a.type}</b>{a.note && <span style={{ color: "#5b6b82" }}> · {a.note}</span>}
                <div style={{ fontSize: 12, color: "#8593a8" }}>Rappel le {fmtDate(a.date)} {a.done && "· ✓ fait"}</div>
              </div>
              <div className="row">
                <button className="btn ghost sm" onClick={() => toggleAlert(a.id)}>{a.done ? "Réactiver" : "✓ Fait"}</button>
                <button className="btn danger sm" onClick={() => delAlert(a.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 17 }}>Contrats ({(client.contrats || []).length})</h2>
          <button className="btn gold" onClick={() => { setEditContract(null); setShowContract(true); }}>+ Ajouter un contrat</button>
        </div>
        {(client.contrats || []).map((k) => (
          <ContractCard
            key={k.id} contract={k}
            onEdit={() => { setEditContract(k); setShowContract(true); }}
            onDelete={() => { if (confirm("Supprimer ce contrat ?")) update({ ...client, contrats: client.contrats.filter((x) => x.id !== k.id) }); }}
            onFiles={(files) => update({ ...client, contrats: client.contrats.map((x) => (x.id === k.id ? { ...x, fichiers: [...(x.fichiers || []), ...files] } : x)) })}
            onFileDelete={(f) => { sDel(`crm-file-${f.id}`); update({ ...client, contrats: client.contrats.map((x) => (x.id === k.id ? { ...x, fichiers: x.fichiers.filter((y) => y.id !== f.id) } : x)) }); }}
          />
        ))}
        {(client.contrats || []).length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Aucun contrat. Ajoutez le premier contrat de ce client.</div>}
      </div>

      <HistoriqueCard client={client} update={update} me={me} users={users} />

      {showEdit && <ClientForm initial={client} onClose={() => setShowEdit(false)} onSave={(f) => { update({ ...client, ...f }); setShowEdit(false); }} />}
      {showContract && (
        <ContractForm
          initial={editContract}
          onClose={() => setShowContract(false)}
          onSave={(k) => {
            if (editContract) update({ ...client, contrats: client.contrats.map((x) => (x.id === editContract.id ? { ...x, ...k } : x)) });
            else update({ ...client, contrats: [...(client.contrats || []), { ...k, id: uid(), fichiers: [] }] });
            setShowContract(false);
          }}
        />
      )}
      {showAlert && <AlertForm onClose={() => setShowAlert(false)} onSave={(a) => { addAlert(a); setShowAlert(false); }} />}
    </div>
  );
}

function ContractCard({ contract: k, onEdit, onDelete, onFiles, onFileDelete }) {
  const nf = nextFollowUp(k.dateSignature);
  return (
    <div style={{ border: "1px solid #e3e8f0", borderRadius: 10, padding: 16, marginBottom: 12, borderLeft: `4px solid ${GOLD}` }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <b style={{ fontSize: 15 }}>{k.type} — {k.compagnie}</b>
          <span className="badge b-grey" style={{ marginLeft: 8 }}>N° {k.numero || "—"}</span>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={onEdit}>Modifier</button>
          <button className="btn danger sm" onClick={onDelete}>Supprimer</button>
        </div>
      </div>
      <div style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.9, color: "#33415c" }}>
        <b>Montant :</b> {k.montant ? fmtEUR(parseNum(k.montant)) : "—"} · <b>Frais :</b> {k.frais !== "" && k.frais !== undefined ? k.frais + " %" : "—"} ·{" "}
        <b>Signature :</b> {fmtDate(k.dateSignature)} · <b>1er prélèvement :</b> {fmtDate(k.datePrelevement)}
        {k.type === "PER" && (
          <> · <b>Transfert interne :</b> {k.transfertInterne === "oui" ? `Oui${k.fraisTransfert === "oui" ? " (avec frais)" : " (sans frais)"}` : "Non"}</>
        )}

        {k.commentaire && <div style={{ marginTop: 4, fontStyle: "italic" }}>💬 {k.commentaire}</div>}
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="lbl" style={{ margin: 0 }}>Contrat & pièces justificatives {k.type === "Transfert" && "(y compris fiche de transfert signée)"}</span>
          <FilePicker label="+ Importer des documents" multiple onFiles={onFiles} />
        </div>
        <FileList files={k.fichiers} onDelete={onFileDelete} />
      </div>
    </div>
  );
}

function ContractForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    type: "PER", compagnie: COMPANIES["PER"][0], numero: "", montant: "", frais: "",
    commentaire: "", dateSignature: todayISO(), datePrelevement: "", transfertInterne: "non", fraisTransfert: "non",
  });
  const set = (k, v) => setF({ ...f, [k]: v });
  const setType = (t) => setF({ ...f, type: t, compagnie: COMPANIES[t][0] });
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{initial ? "Modifier le contrat" : "Ajouter un contrat"}</h2>
        <div className="fgrid">
          <Field label="Type de contrat">
            <select className="sel" value={f.type} onChange={(e) => setType(e.target.value)}>
              {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Compagnie">
            <select className="sel" value={f.compagnie} onChange={(e) => set("compagnie", e.target.value)}>
              {COMPANIES[f.type].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Numéro de contrat"><input className="in" value={f.numero} onChange={(e) => set("numero", e.target.value)} /></Field>
          <Field label="Montant du contrat (€)"><input className="in" value={f.montant} onChange={(e) => set("montant", e.target.value)} placeholder="ex : 15 000" /></Field>
          <Field label="Frais (0 à 5 %)">
            <input className="in" type="number" min="0" max="5" step="0.1" value={f.frais}
              onChange={(e) => { const v = e.target.value; if (v === "" || (parseFloat(v) >= 0 && parseFloat(v) <= 5)) set("frais", v); }} />
          </Field>
          <Field label="Date de signature"><input className="in" type="date" value={f.dateSignature} onChange={(e) => set("dateSignature", e.target.value)} /></Field>
          <Field label="Date du 1er prélèvement"><input className="in" type="date" value={f.datePrelevement} onChange={(e) => set("datePrelevement", e.target.value)} /></Field>
          {f.type === "PER" && (
            <>
              <Field label="Transfert interne à effectuer ?">
                <select className="sel" value={f.transfertInterne} onChange={(e) => set("transfertInterne", e.target.value)}>
                  <option value="non">Non</option><option value="oui">Oui</option>
                </select>
              </Field>
              {f.transfertInterne === "oui" && (
                <Field label="Frais appliqués au transfert ?">
                  <select className="sel" value={f.fraisTransfert} onChange={(e) => set("fraisTransfert", e.target.value)}>
                    <option value="non">Non</option><option value="oui">Oui</option>
                  </select>
                </Field>
              )}
            </>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Commentaire">
            <textarea className="ta" rows={3} value={f.commentaire} onChange={(e) => set("commentaire", e.target.value)} />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn gold" onClick={() => onSave(f)}>Enregistrer le contrat</button>
        </div>
      </div>
    </div>
  );
}

function AlertForm({ onSave, onClose }) {
  const [f, setF] = useState({ type: ALERT_TYPES[0], date: todayISO(), note: "" });
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <h2>Créer une alerte</h2>
        <div className="grid">
          <Field label="Type d'alerte">
            <select className="sel" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {ALERT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Date du rappel">
            <input className="in" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Note (optionnel)">
            <input className="in" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="ex : relancer pour le RIB" />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn gold" onClick={() => onSave(f)}>Programmer l'alerte</button>
        </div>
      </div>
    </div>
  );
}

/* ================= VENTES ÉQUIPE ================= */
function SalesPage({ sales, saveSales, users, objectifs, saveObjectifs, me }) {
  const months = Object.keys(sales).sort();
  const [month, setMonth] = useState(months[months.length - 1]);
  const [showObj, setShowObj] = useState(false);

  const addMonth = () => {
    const last = months[months.length - 1];
    const nm = nextMonthKey(last);
    const next = { ...sales, [nm]: emptyMonthData(users) };
    saveSales(next);
    setMonth(nm);
  };

  const exportCSV = () => {
    const md0 = sales[month] || {};
    const rows = [];
    users.forEach((u) => {
      (((md0[u.id] || {}).rows) || []).forEach((r) => {
        if (!(r.nom || "").trim()) return;
        rows.push([`${u.prenom} ${u.nom}`, fmtDate(r.dateCreation), r.nom, r.type, r.compagnie, r.frais, r.ref, r.commentaire, r.apporteur, r.versement || "", r.versementAnnuel || "", r.volume, r.remuneration, r.statut]);
      });
    });
    downloadCSV(
      `ELYON_ventes_${month}.csv`,
      ["Commercial", "Date de création", "Client", "Type de contrat", "Compagnie", "Frais", "Réf. contrat", "Commentaires", "Apporteur", "Versement mensuel", "Versement annuel", "Volume", "Rémunération", "Statut"],
      rows
    );
  };

  const updateCell = (userId, rowId, field, value) => {
    const md = sales[month];
    let monthData = {
      ...md,
      [userId]: {
        ...md[userId],
        rows: md[userId].rows.map((r) => (r.id === rowId ? recalcRow({ ...r, [field]: value }, field) : r)),
      },
    };

    /* ---- Recopie automatique vers le tableau du manager ----
       Quand un commercial saisit/modifie une ligne, elle est dupliquée
       dans le tableau du manager, rémunération laissée VIDE (barème différent). */
    const manager = users.find((u) => u.isManager);
    if (manager && userId !== manager.id) {
      const src = monthData[userId].rows.find((r) => r.id === rowId);
      if (src && (src.nom || "").trim()) {
        const commercial = users.find((u) => u.id === userId);
        const mirrored = {
          dateCreation: src.dateCreation || "", nom: src.nom, type: src.type,
          compagnie: src.compagnie, frais: src.frais, ref: src.ref,
          commentaire: src.commentaire,
          apporteur: (src.apporteur || "").trim() || (commercial ? `${commercial.prenom} ${commercial.nom}` : ""),
          volume: src.volume, statut: src.statut,
        };
        const mgrData = monthData[manager.id] || { rows: [], nonPayes: "" };
        let rows = [...mgrData.rows];
        const idx = rows.findIndex((r) => r.mirrorOf === rowId);
        if (idx === -1) {
          /* première recopie : on prend la première ligne vide, sinon on en ajoute une */
          const freeIdx = rows.findIndex((r) => !(r.nom || "").trim() && !r.mirrorOf);
          const newRow = { ...emptyRow(), ...mirrored, mirrorOf: rowId, remuneration: "" };
          if (freeIdx === -1) rows.push(newRow); else rows[freeIdx] = newRow;
        } else {
          /* mise à jour : tout est resynchronisé SAUF la rémunération saisie par le manager */
          rows[idx] = { ...rows[idx], ...mirrored };
        }
        monthData = { ...monthData, [manager.id]: { ...mgrData, rows } };
      }
    }

    saveSales({ ...sales, [month]: monthData });
  };
  const addRows = (userId) => {
    const md = sales[month];
    saveSales({ ...sales, [month]: { ...md, [userId]: { ...md[userId], rows: [...md[userId].rows, ...Array.from({ length: 5 }, emptyRow)] } } });
  };

  const md = sales[month] || {};

  return (
    <div>
      <div className="ph">
        <div>
          <h1>Ventes de l'équipe</h1>
          <div className="sub">Vue d'ensemble mois par mois — un tableau par commercial · volume et rémunération saisis à la main</div>
        </div>
        <div className="row">
          <select className="sel" style={{ width: 200 }} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="btn ghost" onClick={exportCSV}>⬇️ Exporter (Excel)</button>
          {me.isManager && <button className="btn ghost" onClick={() => setShowObj(true)}>🎯 Définir les objectifs</button>}
          <button className="btn gold" onClick={addMonth}>+ Ajouter le mois suivant</button>
        </div>
      </div>

      {/* ---- Objectifs du mois ---- */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>🎯 Objectifs — {monthLabel(month)}</h2>
        {!objectifs[month] && <div style={{ color: "#8593a8", fontSize: 13 }}>Aucun objectif défini pour ce mois{me.isManager ? " — cliquez sur « Définir les objectifs »." : "."}</div>}
        {objectifs[month] && (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(users.length, 3)}, 1fr)` }}>
            {users.map((u) => {
              const obj = (objectifs[month] || {})[u.id] || {};
              const objC = parseNum(obj.contrats), objV = parseNum(obj.volume);
              if (!objC && !objV) return null;
              const rows = (((sales[month] || {})[u.id] || {}).rows || []).filter((r) => (r.nom || "").trim() && r.statut !== "Annulé");
              const gotC = rows.length;
              const gotV = rows.reduce((s, r) => s + parseNum(r.volume), 0);
              const pctC = objC ? Math.min(100, Math.round((gotC / objC) * 100)) : null;
              const pctV = objV ? Math.min(100, Math.round((gotV / objV) * 100)) : null;
              return (
                <div key={u.id} style={{ padding: "4px 2px" }}>
                  <b style={{ fontSize: 14 }}>{u.prenom} {u.nom}</b>
                  {pctC !== null && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, color: "#5b6b82" }}>Contrats : {gotC} / {objC} {pctC >= 100 && "✅"}</div>
                      <div style={{ height: 7, background: "#eef1f6", borderRadius: 4, marginTop: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctC}%`, background: pctC >= 100 ? "#1b7a3d" : GOLD, borderRadius: 4 }} />
                      </div>
                    </div>
                  )}
                  {pctV !== null && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, color: "#5b6b82" }}>Volume : {fmtEUR(gotV)} / {fmtEUR(objV)} {pctV >= 100 && "✅"}</div>
                      <div style={{ height: 7, background: "#eef1f6", borderRadius: 4, marginTop: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctV}%`, background: pctV >= 100 ? "#1b7a3d" : NAVY2, borderRadius: 4 }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showObj && (
        <ObjectifsForm
          users={users} month={month}
          initial={objectifs[month] || {}}
          onClose={() => setShowObj(false)}
          onSave={(v) => { saveObjectifs({ ...objectifs, [month]: v }); setShowObj(false); }}
        />
      )}

      <div className="row" style={{ marginBottom: 14, fontSize: 12.5, color: "#5b6b82" }}>
        <span className="badge b-green">Payé</span>
        <span className="badge b-red">Annulé</span>
        <span className="badge b-grey">En attente (blanc)</span>
        <span>— le statut colore automatiquement la ligne lorsque vous comparez avec vos bordereaux.</span>
      </div>

      {users.map((u) => {
        const data = md[u.id] || { rows: [], nonPayes: "" };
        const totVol = data.rows.reduce((s, r) => s + parseNum(r.volume), 0);
        const totRem = data.rows.reduce((s, r) => s + parseNum(r.remuneration), 0);
        return (
          <div className="card" key={u.id} style={{ marginBottom: 22, overflowX: "auto" }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 17 }}>
                {u.prenom} {u.nom} <span className="badge b-gold" style={{ marginLeft: 6 }}>Barème {u.bareme}</span>
              </h2>
              <button className="btn ghost sm" onClick={() => addRows(u.id)}>+ 5 lignes</button>
            </div>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: "9%" }}>Date création</th>
                  <th style={{ width: "13%" }}>Nom / Prénom client</th>
                  <th>Type de contrat</th>
                  <th>Compagnie</th>
                  <th style={{ width: "5%" }}>Frais</th>
                  <th>Réf. contrat</th>
                  <th style={{ width: "14%" }}>Commentaires</th>
                  <th>Apporteur</th>
                  <th>Versement/mois</th>
                  <th>Versement/an</th>
                  <th>Volume</th>
                  <th>Rémunération</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className={r.statut === "Payé" ? "paye" : r.statut === "Annulé" ? "annule" : "attente"} style={r.mirrorOf ? { background: "#fdf9f0" } : undefined} title={r.mirrorOf ? "Ligne recopiée automatiquement depuis le tableau d'un commercial — saisissez votre rémunération" : undefined}>
                    <td><input type="date" value={r.dateCreation || ""} onChange={(e) => updateCell(u.id, r.id, "dateCreation", e.target.value)} style={{ fontSize: 12 }} /></td>
                    <td><input value={r.nom} onChange={(e) => updateCell(u.id, r.id, "nom", e.target.value)} /></td>
                    <td>
                      <select value={r.type} onChange={(e) => updateCell(u.id, r.id, "type", e.target.value)}>
                        <option value=""></option>
                        {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={r.compagnie} onChange={(e) => updateCell(u.id, r.id, "compagnie", e.target.value)}>
                        <option value=""></option>
                        {(r.type && COMPANIES[r.type] ? COMPANIES[r.type] : COMPANIES["Transfert"]).map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td><input value={r.frais} onChange={(e) => updateCell(u.id, r.id, "frais", e.target.value)} placeholder="%" /></td>
                    <td><input value={r.ref} onChange={(e) => updateCell(u.id, r.id, "ref", e.target.value)} /></td>
                    <td><input value={r.commentaire} onChange={(e) => updateCell(u.id, r.id, "commentaire", e.target.value)} /></td>
                    <td><input value={r.apporteur} onChange={(e) => updateCell(u.id, r.id, "apporteur", e.target.value)} /></td>
                    <td><input value={r.versement || ""} onChange={(e) => updateCell(u.id, r.id, "versement", e.target.value)} placeholder="€/mois" /></td>
                    <td><input value={r.versementAnnuel || ""} onChange={(e) => updateCell(u.id, r.id, "versementAnnuel", e.target.value)} placeholder="€/an" /></td>
                    <td><input value={r.volume} onChange={(e) => updateCell(u.id, r.id, "volume", e.target.value)} placeholder="€" /></td>
                    <td><input value={r.remuneration} onChange={(e) => updateCell(u.id, r.id, "remuneration", e.target.value)} placeholder="€"
                      title={"Taux appliqué : " + (rateFor(r) * 100).toFixed(1) + "% · Double-clic pour le changer"}
                      onDoubleClick={() => {
                        const cur = (rateFor(r) * 100).toFixed(2).replace(".", ",");
                        const p = prompt("Taux de commission en % (ex : 2,5 pour 2,5% · 0,25 pour 0,25%) :", cur);
                        if (p === null) return;
                        const v = parseFloat(p.replace(",", "."));
                        if (!isNaN(v) && v > 0) updateCell(u.id, r.id, "taux", String(v / 100));
                      }} /></td>
                    <td>
                      <select value={r.statut} onChange={(e) => updateCell(u.id, r.id, "statut", e.target.value)}>
                        {STATUTS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                <tr className="totrow">
                  <td colSpan={8} style={{ textAlign: "right" }}>TOTAL {monthLabel(month).toUpperCase()}</td>
                  <td>{fmtEUR(totVol)}</td>
                  <td>{fmtEUR(totRem)}</td>
                  <td></td>
                </tr>
                <tr className="nprow">
                  <td colSpan={2} style={{ textAlign: "right", paddingRight: 10 }}>AFFAIRES NON PAYÉES</td>
                  <td colSpan={9} style={{ fontSize: 13 }}>
                    {(() => {
                      const enAttente = data.rows.filter((r) => (r.nom || "").trim() && r.statut === "En attente");
                      if (enAttente.length === 0) return <span style={{ color: "#8593a8" }}>0 — tout est payé ou annulé ✓</span>;
                      const totalAttente = enAttente.reduce((s, r) => s + parseNum(r.remuneration), 0);
                      return (
                        <span>
                          <b>{enAttente.length}</b> affaire(s) en attente
                          {totalAttente > 0 && <> · <b>{fmtEUR(totalAttente)}</b> de rémunération</>}
                          {" — "}
                          <span style={{ color: "#5b6b82" }}>{enAttente.map((r) => r.nom).join(", ")}</span>
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ================= RÉMUNÉRATION & BORDEREAUX ================= */
function PayePage({ view, sales, bordereaux, saveBordereaux }) {
  const [selMonth, setSelMonth] = useState(null);
  const months = Object.keys(sales).sort();
  const data = months.map((m) => ({
    mois: monthLabel(m).replace(" 20", " '"),
    key: m,
    paye: (sales[m][view.id]?.rows || []).reduce((s, r) => s + parseNum(r.remuneration), 0),
  }));
  const total = data.reduce((s, d) => s + d.paye, 0);
  const userB = bordereaux[view.id] || {};

  const addBordereau = (mk, files) => {
    const next = { ...bordereaux, [view.id]: { ...userB, [mk]: [...(userB[mk] || []), ...files] } };
    saveBordereaux(next);
  };
  const delBordereau = (mk, f) => {
    sDel(`crm-file-${f.id}`);
    const next = { ...bordereaux, [view.id]: { ...userB, [mk]: (userB[mk] || []).filter((x) => x.id !== f.id) } };
    saveBordereaux(next);
  };

  return (
    <div>
      <div className="ph">
        <div>
          <h1>Rémunération — {view.prenom} {view.nom}</h1>
          <div className="sub">Évolution des payes mois par mois depuis septembre 2025 (calculée depuis le tableau des ventes)</div>
        </div>
        <div className="kpi" style={{ minWidth: 200 }}>
          <div className="n">{fmtEUR(total)}</div>
          <div className="l">Total cumulé</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 17, marginBottom: 14 }}>📈 Évolution des payes</h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8f0" />
              <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "#5b6b82" }} />
              <YAxis tick={{ fontSize: 11, fill: "#5b6b82" }} tickFormatter={(v) => v.toLocaleString("fr-FR")} />
              <Tooltip formatter={(v) => [fmtEUR(v), "Rémunération"]} />
              <Bar dataKey="paye" fill={NAVY} radius={[6, 6, 0, 0]} cursor="pointer"
                onClick={(d) => { const k = (d && (d.key || (d.payload && d.payload.key))) || null; setSelMonth(k === selMonth ? null : k); }}>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {selMonth && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid #C9A24B" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>📋 Contrats de {monthLabel(selMonth)}</h2>
            <button className="btn ghost sm" onClick={() => setSelMonth(null)}>✕ Fermer</button>
          </div>
          <table className="t">
            <thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Compagnie</th><th>Versement/mois</th><th>Volume</th><th>Rémunération</th><th>Statut</th></tr></thead>
            <tbody>
              {((sales[selMonth] || {})[view.id]?.rows || []).filter((r) => (r.nom || "").trim()).map((r) => (
                <tr key={r.id} className={r.statut === "Payé" ? "paye" : r.statut === "Annulé" ? "annule" : ""}>
                  <td>{fmtDate(r.dateCreation)}</td><td><b>{r.nom}</b></td><td>{r.type}</td><td>{r.compagnie}</td>
                  <td>{r.versement ? r.versement + " €" : "—"}</td>
                  <td>{r.volume ? fmtEUR(parseNum(r.volume)) : "—"}</td>
                  <td style={{ fontWeight: 700, color: "#7A5C17" }}>{r.remuneration ? fmtEUR(parseNum(r.remuneration)) : "—"}</td>
                  <td><span className={"badge " + (r.statut === "Payé" ? "b-green" : r.statut === "Annulé" ? "b-red" : "b-gold")}>{r.statut}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: 17, marginBottom: 14 }}>🧾 Bordereaux de paiement</h2>
        <div className="grid">
          {months.slice().reverse().map((mk) => (
            <div key={mk} style={{ border: "1px solid #e3e8f0", borderRadius: 10, padding: 14 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <b>{monthLabel(mk)}</b>
                <FilePicker label="+ Importer un bordereau" multiple onFiles={(files) => addBordereau(mk, files)} />
              </div>
              <FileList files={userB[mk]} onDelete={(f) => delBordereau(mk, f)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= DOCUMENTS ================= */
function DocsPage({ docs, saveDocs }) {
  const [newName, setNewName] = useState("");
  const addFolder = () => {
    if (!newName.trim()) { alert("Tape d'abord un nom de dossier dans le champ à gauche du bouton (ex : Modèles MMA), puis clique sur + Créer un dossier."); return; }
    saveDocs([...docs, { id: uid(), name: newName.trim(), files: [] }]);
    setNewName("");
  };
  return (
    <div>
      <div className="ph">
        <div>
          <h1>Documents partagés</h1>
          <div className="sub">Modèles de lettres, documents compagnies (MMA, Abeille, Swiss Life, Malakoff Humanis, Generali…) — téléchargeables par toute l'équipe</div>
        </div>
        <div className="row">
          <input className="in" style={{ width: 220 }} placeholder="Nom du dossier (ex : Modèles MMA)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFolder()} />
          <button className="btn gold" onClick={addFolder}>+ Créer un dossier</button>
        </div>
      </div>
      <div className="grid">
        {docs.map((d) => (
          <div className="card" key={d.id}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16 }}>📁 {d.name} <span style={{ color: "#8593a8", fontSize: 13, fontWeight: 400 }}>· {d.files.length} fichier(s)</span></h2>
              <div className="row">
                <FilePicker label="+ Importer des fichiers" multiple onFiles={(files) => saveDocs(docs.map((x) => (x.id === d.id ? { ...x, files: [...x.files, ...files] } : x)))} />
                <button className="btn danger sm" onClick={() => { if (confirm("Supprimer ce dossier et tous ses fichiers ?")) { d.files.forEach((f) => sDel(`crm-file-${f.id}`)); saveDocs(docs.filter((x) => x.id !== d.id)); } }}>Supprimer</button>
              </div>
            </div>
            <FileList
              files={d.files}
              onDelete={(f) => { sDel(`crm-file-${f.id}`); saveDocs(docs.map((x) => (x.id === d.id ? { ...x, files: x.files.filter((y) => y.id !== f.id) } : x))); }}
            />
          </div>
        ))}
        {docs.length === 0 && <div className="card" style={{ color: "#8593a8" }}>Aucun dossier. Créez par exemple « Modèles de lettres », « Documents MMA », « Documents Swiss Life »…</div>}
      </div>
    </div>
  );
}

/* ================= ÉQUIPE (Quentin uniquement) ================= */
function TeamPage({ users, saveUsers, sales, saveSales, me }) {
  const [f, setF] = useState({ prenom: "", nom: "", bareme: "Commercial" });
  const addUser = () => {
    if (!f.prenom.trim() || !f.nom.trim()) { alert("Renseignez le prénom et le nom."); return; }
    const nu = { id: uid(), prenom: f.prenom.trim(), nom: f.nom.trim(), bareme: f.bareme, isManager: f.bareme === "Manager" };
    const nextUsers = [...users, nu];
    saveUsers(nextUsers);
    // Créer son tableau dans tous les mois existants
    const nextSales = { ...sales };
    Object.keys(nextSales).forEach((mk) => {
      nextSales[mk] = { ...nextSales[mk], [nu.id]: { rows: Array.from({ length: 20 }, emptyRow), nonPayes: "" } };
    });
    saveSales(nextSales);
    setF({ prenom: "", nom: "", bareme: "Commercial" });
  };
  const removeUser = (u) => {
    if (u.id === me.id) { alert("Vous ne pouvez pas supprimer votre propre espace."); return; }
    if (!confirm(`Supprimer l'espace de ${u.prenom} ${u.nom} ? Ses tableaux de ventes seront conservés dans l'historique.`)) return;
    saveUsers(users.filter((x) => x.id !== u.id));
  };
  return (
    <div>
      <div className="ph">
        <div>
          <h1>Mon équipe</h1>
          <div className="sub">Créez un espace pour chaque nouveau commercial — son tableau de ventes est généré automatiquement</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>+ Nouveau commercial</h2>
        <div className="fgrid">
          <Field label="Prénom"><input className="in" value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} /></Field>
          <Field label="Nom"><input className="in" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
          <Field label="Barème">
            <select className="sel" value={f.bareme} onChange={(e) => setF({ ...f, bareme: e.target.value })}>
              {BAREMES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn gold" onClick={addUser}>Créer l'espace</button>
          </div>
        </div>
      </div>
      <div className="grid">
        {users.map((u) => (
          <div className="clientcard" key={u.id} style={{ cursor: "default" }}>
            <div>
              <b>{u.prenom} {u.nom}</b>
              <div style={{ fontSize: 12.5, color: "#5b6b82" }}>{u.isManager ? "Manager · accès à tous les espaces · protégé par mot de passe" : "Commercial"}</div>
            </div>
            <div className="row">
              <span className={"badge " + (u.isManager ? "b-gold" : "b-grey")}>Barème {u.bareme}</span>
              {!u.isManager && (
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    if (confirm(`Réinitialiser le mot de passe de ${u.prenom} ? Il/elle en créera un nouveau à sa prochaine connexion.`)) {
                      saveUsers(users.map((x) => (x.id === u.id ? { ...x, password: null } : x)));
                    }
                  }}
                >
                  🔑 Réinitialiser mdp
                </button>
              )}
              {!u.isManager && <button className="btn danger sm" onClick={() => removeUser(u)}>Supprimer</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= OBJECTIFS (formulaire manager) ================= */
function ObjectifsForm({ users, month, initial, onSave, onClose }) {
  const [f, setF] = useState(() => {
    const base = {};
    users.forEach((u) => { base[u.id] = { contrats: (initial[u.id] || {}).contrats || "", volume: (initial[u.id] || {}).volume || "" }; });
    return base;
  });
  const set = (uid2, k, v) => setF({ ...f, [uid2]: { ...f[uid2], [k]: v } });
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2>🎯 Objectifs — {monthLabel(month)}</h2>
        <p style={{ fontSize: 13, color: "#5b6b82", marginBottom: 14 }}>
          Laissez vide pour ne pas fixer d'objectif. Les jauges se remplissent automatiquement avec les contrats saisis dans le tableau des ventes.
        </p>
        {users.map((u) => (
          <div key={u.id} className="row" style={{ marginBottom: 12, alignItems: "flex-end" }}>
            <div style={{ width: 150, fontSize: 14, fontWeight: 600, paddingBottom: 8 }}>{u.prenom} {u.nom}</div>
            <Field label="Contrats">
              <input className="in" style={{ width: 110 }} value={f[u.id].contrats} onChange={(e) => set(u.id, "contrats", e.target.value)} placeholder="ex : 8" />
            </Field>
            <Field label="Volume (€)">
              <input className="in" style={{ width: 140 }} value={f[u.id].volume} onChange={(e) => set(u.id, "volume", e.target.value)} placeholder="ex : 50 000" />
            </Field>
          </div>
        ))}
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn gold" onClick={() => onSave(f)}>Enregistrer les objectifs</button>
        </div>
      </div>
    </div>
  );
}

/* ================= PROSPECTION ================= */
const emptyProspect = (ownerId) => ({
  id: uid(), ownerId,
  nom: "", prenom: "", profession: "", telephone: "", ville: "",
  dateAppel: todayISO(), repondu: "Oui",
  statut: "RDV pris",
  dateRdv: "", heureRdv: "",
  qualitePrise: "", noteRdv: "",
  commentaire: "",
  createdAt: todayISO(),
});

function Stars({ value }) {
  const n = parseInt(value, 10);
  if (!n) return <span style={{ color: "#c3ccd8" }}>—</span>;
  return <span style={{ color: GOLD, letterSpacing: 1 }}>{"★".repeat(n)}<span style={{ color: "#dfe4ec" }}>{"★".repeat(5 - n)}</span></span>;
}

function ProspectionPage({ prospection, saveProspection, me, users, toTrash, clients, saveClients, goClient }) {
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statutFilter, setStatutFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [viewMode, setViewMode] = useState("table"); // table | semaine | mois

  /* Cloisonnement identique aux clients */
  const mine = me.isManager ? prospection : prospection.filter((p) => p.ownerId === me.id);

  const monthsAvailable = [...new Set(mine.map((p) => (p.dateAppel || "").slice(0, 7)).filter(Boolean))].sort().reverse();

  const scoped = mine.filter((p) => {
    if (me.isManager && ownerFilter !== "all" && p.ownerId !== ownerFilter) return false;
    if (statutFilter !== "all" && p.statut !== statutFilter) return false;
    if (monthFilter !== "all" && (p.dateAppel || "").slice(0, 7) !== monthFilter) return false;
    if (search && !(`${p.nom} ${p.prenom} ${p.profession} ${p.telephone} ${p.ville} ${p.commentaire}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => (b.dateAppel || "").localeCompare(a.dateAppel || ""));

  /* ---- Statistiques détaillées ---- */
  const stat = (list) => {
    const appels = list.length;
    const repondus = list.filter((p) => p.repondu === "Oui").length;
    const rdvPris = list.filter((p) => ["RDV pris", "RDV honoré", "RDV reporté", "Proposition envoyée", "Signé"].includes(p.statut)).length;
    const rdvHonores = list.filter((p) => ["RDV honoré", "Proposition envoyée", "Signé"].includes(p.statut)).length;
    const signes = list.filter((p) => p.statut === "Signé").length;
    const qualites = list.map((p) => parseInt(p.qualitePrise, 10)).filter((n) => n >= 1);
    const notes = list.map((p) => parseInt(p.noteRdv, 10)).filter((n) => n >= 1);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    return {
      appels, repondus, rdvPris, rdvHonores, signes,
      txReponse: pct(repondus, appels),
      txPrise: pct(rdvPris, repondus),
      txHonore: pct(rdvHonores, rdvPris),
      txTransfo: pct(signes, rdvPris),
      txGlobal: pct(signes, appels),
      qualiteMoy: qualites.length ? (qualites.reduce((s, n) => s + n, 0) / qualites.length).toFixed(1) : "—",
      noteMoy: notes.length ? (notes.reduce((s, n) => s + n, 0) / notes.length).toFixed(1) : "—",
    };
  };
  const S = stat(scoped);

  /* Répartition par profession */
  const parProfession = {};
  scoped.forEach((p) => { const k = p.profession || "Non renseignée"; parProfession[k] = (parProfession[k] || 0) + 1; });
  const professionsTri = Object.entries(parProfession).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const ownerName = (p) => {
    const u = users.find((x) => x.id === p.ownerId);
    return u ? u.prenom : "—";
  };

  const save = (entry) => {
    if (editEntry) saveProspection(prospection.map((p) => (p.id === entry.id ? entry : p)));
    else saveProspection([...prospection, entry]);
    setShowForm(false); setEditEntry(null);
  };
  const remove = (entry) => {
    if (confirm("Mettre cette fiche de prospection à la corbeille ? (restaurable pendant 30 jours)")) {
      toTrash("prospect", entry);
      saveProspection(prospection.filter((p) => p.id !== entry.id));
      setShowForm(false); setEditEntry(null);
    }
  };

  /* Conversion d'un prospect en fiche client (pré-remplie, attribuée au bon commercial) */
  const convert = (entry) => {
    const norm = (s) => (s || "").trim().toLowerCase();
    const doublon = clients.find((c) => norm(c.nom) === norm(entry.nom) && norm(c.prenom) === norm(entry.prenom));
    if (doublon && !confirm(`Un client « ${doublon.nom.toUpperCase()} ${doublon.prenom} » existe déjà. Créer quand même une nouvelle fiche ?`)) return;
    const newClient = {
      id: uid(),
      nom: entry.nom || "", prenom: entry.prenom || "",
      profession: entry.profession || "", telephone: entry.telephone || "",
      email: "", dateNaissance: "", revenus: "", situation: "Célibataire",
      createdBy: entry.ownerId || me.id, createdAt: todayISO(),
      contrats: [], alertes: [],
      historique: [{
        id: uid(), type: "📝 Note interne", date: todayISO(),
        byId: me.id, createdAt: new Date().toISOString(),
        note: `Converti depuis la prospection (statut : ${entry.statut}).`
          + (entry.ville ? ` Ville : ${entry.ville}.` : "")
          + (entry.dateRdv ? ` RDV du ${fmtDate(entry.dateRdv)}${entry.heureRdv ? " à " + entry.heureRdv : ""}.` : "")
          + (entry.commentaire ? ` Commentaire prospection : ${entry.commentaire}` : ""),
      }],
    };
    saveClients([...clients, newClient]);
    saveProspection(prospection.map((p) => (p.id === entry.id ? { ...p, convertedClientId: newClient.id } : p)));
    setShowForm(false); setEditEntry(null);
    if (confirm("Fiche client créée ✓ Voulez-vous l'ouvrir maintenant ?")) goClient(newClient.id);
  };

  const exportCSV = () => {
    downloadCSV(
      `ELYON_prospection_${todayISO()}.csv`,
      ["Commercial", "Nom", "Prénom", "Profession", "Téléphone", "Ville", "Date de l'appel", "Répondu", "Statut", "Date du RDV", "Heure", "Qualité prise de RDV (/5)", "Note du RDV (/5)", "Commentaire"],
      scoped.map((p) => [ownerName(p), p.nom, p.prenom, p.profession, p.telephone, p.ville, fmtDate(p.dateAppel), p.repondu, p.statut, fmtDate(p.dateRdv), p.heureRdv, p.qualitePrise, p.noteRdv, p.commentaire])
    );
  };

  return (
    <div>
      <div className="ph">
        <div>
          <h1>🎯 Prospection</h1>
          <div className="sub">
            {me.isManager ? "Vue manager : toute l'équipe" : "Votre espace de prospection personnel"} — {scoped.length} fiche(s) affichée(s)
          </div>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={exportCSV}>⬇️ Exporter (Excel)</button>
          <button className="btn gold" onClick={() => { setEditEntry(null); setShowForm(true); }}>+ Nouvel appel / RDV</button>
        </div>
      </div>

      {/* ---- KPI ---- */}
      <div className="kpis" style={{ marginBottom: 14 }}>
        <div className="kpi"><div className="n">{S.appels}</div><div className="l">Appels enregistrés</div></div>
        <div className="kpi"><div className="n">{S.txReponse}%</div><div className="l">Taux de réponse ({S.repondus}/{S.appels})</div></div>
        <div className="kpi"><div className="n">{S.rdvPris}</div><div className="l">RDV pris</div></div>
        <div className="kpi"><div className="n">{S.txPrise}%</div><div className="l">Taux de prise de RDV*</div></div>
        <div className="kpi"><div className="n">{S.txHonore}%</div><div className="l">RDV honorés ({S.rdvHonores}/{S.rdvPris})</div></div>
        <div className="kpi"><div className="n">{S.signes}</div><div className="l">Signés</div></div>
        <div className="kpi"><div className="n">{S.txTransfo}%</div><div className="l">Transformation RDV → signé</div></div>
        <div className="kpi"><div className="n">{S.txGlobal}%</div><div className="l">Transformation globale</div></div>
      </div>
      <div className="row" style={{ marginBottom: 14, fontSize: 12, color: "#8593a8" }}>
        <span>* RDV pris / appels répondus</span>
        <span>· Qualité moyenne de prise de RDV : <b style={{ color: NAVY }}>{S.qualiteMoy}/5</b></span>
        <span>· Note moyenne des RDV : <b style={{ color: NAVY }}>{S.noteMoy}/5</b></span>
      </div>

      {/* ---- Répartition par profession ---- */}
      {professionsTri.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>Répartition par profession</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {professionsTri.map(([prof, n]) => (
              <span key={prof} className="badge b-navy" style={{ fontSize: 12.5 }}>{prof} · {n}</span>
            ))}
          </div>
        </div>
      )}

      {/* ---- Choix de la vue ---- */}
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 0, border: "1px solid #cdd6e2", borderRadius: 8, overflow: "hidden" }}>
          {[["table", "📋 Tableau"], ["semaine", "📅 Semaine"], ["mois", "🗓️ Mois"]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setViewMode(k)}
              style={{ border: "none", padding: "8px 14px", fontSize: 13, cursor: "pointer", background: viewMode === k ? NAVY : "#fff", color: viewMode === k ? "#fff" : NAVY, fontFamily: "inherit" }}
            >
              {l}
            </button>
          ))}
        </div>
        {me.isManager && (
          <select className="sel" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="all">Tous les commerciaux</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
          </select>
        )}
        {viewMode === "table" && (
          <>
            <select className="sel" value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              {PROSPECTION_STATUTS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="sel" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
              <option value="all">Tous les mois</option>
              {monthsAvailable.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </>
        )}
        <input className="in" style={{ width: 240 }} placeholder="Rechercher (nom, profession, ville…)" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {viewMode !== "table" && (
        <RdvCalendar
          entries={scoped.filter((p) => p.dateRdv)}
          mode={viewMode}
          users={users} me={me}
          onOpen={(p) => { setEditEntry(p); setShowForm(true); }}
        />
      )}

      {viewMode === "table" && (
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="t">
          <thead>
            <tr>
              {me.isManager && <th>Commercial</th>}
              <th>Prospect</th>
              <th>Profession</th>
              <th>Téléphone</th>
              <th>Appel le</th>
              <th>Répondu</th>
              <th>Statut</th>
              <th>RDV le</th>
              <th>Qualité prise</th>
              <th>Note RDV</th>
              <th style={{ width: "16%" }}>Commentaire</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scoped.map((p) => (
              <tr key={p.id}>
                {me.isManager && <td style={{ fontSize: 12.5 }}>{ownerName(p)}</td>}
                <td><b>{(p.nom || "").toUpperCase()} {p.prenom}</b>
                  {p.ville && <div style={{ fontSize: 11.5, color: "#8593a8" }}>{p.ville}</div>}
                  {p.convertedClientId && (
                    <div>
                      <span className="badge b-gold" style={{ fontSize: 10.5, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); goClient(p.convertedClientId); }}>👥 Client ✓</span>
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 12.5 }}>{p.profession || "—"}</td>
                <td style={{ fontSize: 12.5 }}>{p.telephone || "—"}</td>
                <td style={{ fontSize: 12.5 }}>{fmtDate(p.dateAppel)}</td>
                <td>{p.repondu === "Oui" ? "✅" : "❌"}</td>
                <td><span className="badge" style={{ background: "#fff", border: `1px solid ${PROSPECTION_COLORS[p.statut] || "#8593a8"}`, color: PROSPECTION_COLORS[p.statut] || "#8593a8" }}>{p.statut}</span></td>
                <td style={{ fontSize: 12.5 }}>{p.dateRdv ? <>{fmtDate(p.dateRdv)}{p.heureRdv && <div style={{ fontSize: 11, color: "#8593a8" }}>{p.heureRdv}</div>}</> : "—"}</td>
                <td><Stars value={p.qualitePrise} /></td>
                <td><Stars value={p.noteRdv} /></td>
                <td style={{ fontSize: 12, color: "#5b6b82" }}>{p.commentaire || "—"}</td>
                <td><button className="btn ghost sm" onClick={() => { setEditEntry(p); setShowForm(true); }}>✏️</button></td>
              </tr>
            ))}
            {scoped.length === 0 && (
              <tr><td colSpan={me.isManager ? 12 : 11} style={{ color: "#8593a8", fontSize: 13.5, padding: 18 }}>Aucune fiche. Cliquez sur « + Nouvel appel / RDV » pour enregistrer votre premier appel.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {showForm && (
        <ProspectForm
          initial={editEntry}
          me={me} users={users}
          onClose={() => { setShowForm(false); setEditEntry(null); }}
          onSave={save}
          onDelete={editEntry ? () => remove(editEntry) : null}
          onConvert={editEntry && !editEntry.convertedClientId ? () => convert(editEntry) : null}
        />
      )}
    </div>
  );
}

function ProspectForm({ initial, me, users, onSave, onClose, onDelete, onConvert }) {
  const [f, setF] = useState(initial || emptyProspect(me.id));
  const set = (k, v) => setF({ ...f, [k]: v });
  const showRdvFields = ["RDV pris", "RDV honoré", "RDV annulé", "RDV reporté", "Proposition envoyée", "Signé", "Perdu"].includes(f.statut);
  const showNoteRdv = ["RDV honoré", "Proposition envoyée", "Signé", "Perdu"].includes(f.statut);
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <h2>{initial ? "Modifier la fiche prospection" : "Nouvel appel / RDV"}</h2>
        <div className="fgrid">
          <Field label="Nom *"><input className="in" value={f.nom} onChange={(e) => set("nom", e.target.value)} /></Field>
          <Field label="Prénom"><input className="in" value={f.prenom} onChange={(e) => set("prenom", e.target.value)} /></Field>
          <Field label="Profession">
            <input className="in" list="professions-sante" value={f.profession} onChange={(e) => set("profession", e.target.value)} placeholder="ex : Infirmier(ère) libéral(e)" />
            <datalist id="professions-sante">
              {PROFESSIONS_SANTE.map((p) => <option key={p} value={p} />)}
            </datalist>
          </Field>
          <Field label="Téléphone"><input className="in" value={f.telephone} onChange={(e) => set("telephone", e.target.value)} /></Field>
          <Field label="Ville"><input className="in" value={f.ville} onChange={(e) => set("ville", e.target.value)} /></Field>
          {me.isManager && (
            <Field label="Commercial">
              <select className="sel" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
            </Field>
          )}
          <Field label="Date de l'appel (prise de RDV)"><input className="in" type="date" value={f.dateAppel} onChange={(e) => set("dateAppel", e.target.value)} /></Field>
          <Field label="Appel répondu ?">
            <select className="sel" value={f.repondu} onChange={(e) => set("repondu", e.target.value)}>
              <option>Oui</option><option>Non</option>
            </select>
          </Field>
          <Field label="Statut">
            <select className="sel" value={f.statut} onChange={(e) => set("statut", e.target.value)}>
              {PROSPECTION_STATUTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          {showRdvFields && (
            <>
              <Field label="Date du RDV"><input className="in" type="date" value={f.dateRdv} onChange={(e) => set("dateRdv", e.target.value)} /></Field>
              <Field label="Heure du RDV"><input className="in" type="time" value={f.heureRdv} onChange={(e) => set("heureRdv", e.target.value)} /></Field>
              <Field label="Qualité de la prise de RDV (/5)">
                <select className="sel" value={f.qualitePrise} onChange={(e) => set("qualitePrise", e.target.value)}>
                  <option value="">—</option>
                  {NOTES_5.map((n) => <option key={n} value={n}>{"★".repeat(parseInt(n, 10))} ({n}/5)</option>)}
                </select>
              </Field>
            </>
          )}
          {showNoteRdv && (
            <Field label="Note du rendez-vous (/5)">
              <select className="sel" value={f.noteRdv} onChange={(e) => set("noteRdv", e.target.value)}>
                <option value="">—</option>
                {NOTES_5.map((n) => <option key={n} value={n}>{"★".repeat(parseInt(n, 10))} ({n}/5)</option>)}
              </select>
            </Field>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Commentaire">
            <textarea className="ta" rows={3} value={f.commentaire} onChange={(e) => set("commentaire", e.target.value)} placeholder="ex : très intéressé par un PER, rappeler après ses congés…" />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "space-between" }}>
          <div className="row">
            {onDelete && <button className="btn danger" onClick={onDelete}>Supprimer</button>}
            {onConvert && <button className="btn ghost" style={{ borderColor: GOLD, color: "#7a5c17" }} onClick={onConvert}>👥 Convertir en client</button>}
            {initial && initial.convertedClientId && <span className="badge b-gold" style={{ alignSelf: "center" }}>✓ Déjà converti en client</span>}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn gold" onClick={() => { if (!f.nom.trim()) { alert("Le nom du prospect est obligatoire."); return; } onSave(f); }}>Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= RECHERCHE GLOBALE ================= */
function GlobalSearch({ clients, prospection, me, users, goClient, goProspection }) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return null;
    const out = [];
    const visibleClients = me.isManager ? clients : clients.filter((c) => (c.createdBy || "quentin") === me.id);
    visibleClients.forEach((c) => {
      const hay = `${c.nom} ${c.prenom} ${c.profession || ""} ${c.telephone || ""} ${c.email || ""}`.toLowerCase();
      const contractHit = (c.contrats || []).some((k) => `${k.type || ""} ${k.compagnie || ""} ${k.ref || ""}`.toLowerCase().includes(query));
      if (hay.includes(query) || contractHit) out.push({ kind: "client", label: `${c.nom.toUpperCase()} ${c.prenom}`, sub: c.profession || "Client", id: c.id });
    });
    const visibleProspects = me.isManager ? prospection : prospection.filter((p) => p.ownerId === me.id);
    visibleProspects.forEach((p) => {
      const hay = `${p.nom} ${p.prenom} ${p.profession || ""} ${p.telephone || ""} ${p.ville || ""}`.toLowerCase();
      if (hay.includes(query)) out.push({ kind: "prospect", label: `${(p.nom || "").toUpperCase()} ${p.prenom || ""}`, sub: `Prospection · ${p.statut}`, id: p.id });
    });
    return out.slice(0, 8);
  }, [q, clients, prospection, me]);

  return (
    <div style={{ padding: "0 14px 10px", position: "relative" }}>
      <input
        className="in"
        style={{ width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontSize: 13 }}
        placeholder="🔍 Recherche globale…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {results && (
        <div style={{ position: "absolute", top: "100%", left: 14, right: 14, background: "#fff", borderRadius: 10, boxShadow: "0 14px 40px rgba(0,0,0,.35)", zIndex: 60, overflow: "hidden" }}>
          {results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: "#8593a8" }}>Aucun résultat.</div>}
          {results.map((r) => (
            <div
              key={r.kind + r.id}
              onClick={() => { setQ(""); r.kind === "client" ? goClient(r.id) : goProspection(); }}
              style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid #f0f2f6" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fdf9f0")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              <b style={{ fontSize: 13.5, color: NAVY }}>{r.kind === "client" ? "👥" : "🎯"} {r.label}</b>
              <div style={{ fontSize: 11.5, color: "#8593a8" }}>{r.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= HISTORIQUE DES INTERACTIONS ================= */
const INTERACTION_TYPES = ["📞 Appel", "🤝 Rendez-vous", "✉️ E-mail", "🔁 Relance", "📮 Courrier", "📝 Note interne"];

function HistoriqueCard({ client, update, me, users }) {
  const [showAdd, setShowAdd] = useState(false);
  const [f, setF] = useState({ type: INTERACTION_TYPES[0], date: todayISO(), note: "" });

  const historique = (client.historique || []).slice().sort((a, b) =>
    (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || ""))
  );

  const authorName = (byId) => {
    const u = (users || []).find((x) => x.id === byId);
    return u ? `${u.prenom} ${u.nom}` : "—";
  };

  const add = () => {
    if (!f.note.trim()) { alert("Écrivez une note avant d'enregistrer."); return; }
    const entry = { ...f, id: uid(), byId: me.id, createdAt: new Date().toISOString() };
    update({ ...client, historique: [...(client.historique || []), entry] });
    setF({ type: INTERACTION_TYPES[0], date: todayISO(), note: "" });
    setShowAdd(false);
  };
  const remove = (id) => {
    if (confirm("Supprimer cette entrée de l'historique ?")) {
      update({ ...client, historique: (client.historique || []).filter((h) => h.id !== id) });
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: 17 }}>🕐 Historique des interactions ({historique.length})</h2>
        <button className="btn gold sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? "Fermer" : "+ Ajouter une interaction"}</button>
      </div>

      {showAdd && (
        <div style={{ background: "#f8f9fc", border: "1px solid #e3e8f0", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Type">
              <select className="sel" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {INTERACTION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input className="in" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="Note">
              <textarea
                className="ta" rows={2} value={f.note}
                onChange={(e) => setF({ ...f, note: e.target.value })}
                placeholder="ex : appel de suivi, souhaite augmenter son VP à 300 €/mois, rappeler en septembre…"
                autoFocus
              />
            </Field>
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <button className="btn gold sm" onClick={add}>Enregistrer</button>
          </div>
        </div>
      )}

      {historique.length === 0 && !showAdd && (
        <div style={{ color: "#8593a8", fontSize: 13.5 }}>
          Aucune interaction enregistrée. Notez ici chaque appel, RDV ou relance pour garder le fil du dossier.
        </div>
      )}

      <div style={{ position: "relative" }}>
        {historique.map((h, i) => (
          <div key={h.id} style={{ display: "flex", gap: 12, paddingBottom: i < historique.length - 1 ? 14 : 0, position: "relative" }}>
            {/* ligne de temps */}
            {i < historique.length - 1 && (
              <div style={{ position: "absolute", left: 9, top: 22, bottom: -2, width: 2, background: "#e3e8f0" }} />
            )}
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", border: `2px solid ${GOLD}`, flexShrink: 0, zIndex: 1, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <b style={{ fontSize: 13.5 }}>{h.type}</b>
                  <span style={{ fontSize: 12, color: "#8593a8", marginLeft: 8 }}>
                    {fmtDate(h.date)} · par {authorName(h.byId)}
                  </span>
                </div>
                {(me.isManager || h.byId === me.id) && (
                  <button className="btn danger sm" style={{ padding: "2px 8px" }} onClick={() => remove(h.id)}>✕</button>
                )}
              </div>
              <div style={{ fontSize: 13.5, color: "#33415c", marginTop: 3, whiteSpace: "pre-wrap" }}>{h.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= CALENDRIER DES RDV PROSPECTION ================= */
function RdvCalendar({ entries, mode, users, me, onOpen }) {
  const [ref, setRef] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
  const today = isoOf(new Date());
  const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const byDate = {};
  entries.forEach((p) => { (byDate[p.dateRdv] = byDate[p.dateRdv] || []).push(p); });
  Object.values(byDate).forEach((list) => list.sort((a, b) => (a.heureRdv || "").localeCompare(b.heureRdv || "")));

  const initials = (p) => {
    const u = users.find((x) => x.id === p.ownerId);
    return u ? u.prenom[0] + (u.nom ? u.nom[0] : "") : "?";
  };

  const nav = (dir) => {
    const d = new Date(ref);
    if (mode === "semaine") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setRef(d);
  };

  const EventPill = ({ p }) => (
    <div
      onClick={() => onOpen(p)}
      title={`${p.nom} ${p.prenom || ""} · ${p.statut}${p.commentaire ? " · " + p.commentaire : ""}`}
      style={{
        fontSize: 11.5, padding: "3px 6px", borderRadius: 6, marginBottom: 3, cursor: "pointer",
        background: "#f2f5fa", borderLeft: `3px solid ${PROSPECTION_COLORS[p.statut] || NAVY2}`,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}
    >
      {p.heureRdv && <b style={{ color: NAVY }}>{p.heureRdv}</b>} {(p.nom || "").toUpperCase()} {p.prenom || ""}
      {me.isManager && <span style={{ color: "#8593a8" }}> · {initials(p)}</span>}
    </div>
  );

  /* ---- En-tête de navigation ---- */
  let label;
  if (mode === "semaine") {
    const s = startOfWeek(ref); const e = new Date(s); e.setDate(e.getDate() + 6);
    label = `Semaine du ${fmtDate(isoOf(s))} au ${fmtDate(isoOf(e))}`;
  } else {
    label = monthLabel(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: 16 }}>📅 {label}</h2>
        <div className="row">
          <button className="btn ghost sm" onClick={() => nav(-1)}>◀</button>
          <button className="btn ghost sm" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setRef(d); }}>Aujourd'hui</button>
          <button className="btn ghost sm" onClick={() => nav(1)}>▶</button>
        </div>
      </div>

      {mode === "semaine" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = startOfWeek(ref); d.setDate(d.getDate() + i);
            const dIso = isoOf(d);
            const list = byDate[dIso] || [];
            return (
              <div key={i} style={{ border: "1px solid #e3e8f0", borderRadius: 10, minHeight: 140, padding: 8, background: dIso === today ? "#fdf9f0" : "#fff", borderColor: dIso === today ? GOLD : "#e3e8f0" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: dIso === today ? "#7a5c17" : NAVY, marginBottom: 6 }}>
                  {DAYS[i]} {d.getDate()}
                </div>
                {list.map((p) => <EventPill key={p.id} p={p} />)}
                {list.length === 0 && <div style={{ fontSize: 11, color: "#c3ccd8" }}>—</div>}
              </div>
            );
          })}
        </div>
      )}

      {mode === "mois" && (() => {
        const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const offset = (first.getDay() + 6) % 7;
        const start = new Date(first); start.setDate(start.getDate() - offset);
        const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
        return (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
              {DAYS.map((d) => <div key={d} style={{ fontSize: 11.5, fontWeight: 700, color: "#8593a8", textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {cells.map((d, i) => {
                const dIso = isoOf(d);
                const inMonth = d.getMonth() === ref.getMonth();
                const list = byDate[dIso] || [];
                return (
                  <div key={i} style={{
                    border: "1px solid #e3e8f0", borderRadius: 8, minHeight: 84, padding: 6,
                    background: dIso === today ? "#fdf9f0" : inMonth ? "#fff" : "#f7f8fb",
                    borderColor: dIso === today ? GOLD : "#e3e8f0", opacity: inMonth ? 1 : 0.55,
                  }}>
                    <div style={{ fontSize: 11.5, fontWeight: dIso === today ? 800 : 600, color: dIso === today ? "#7a5c17" : "#5b6b82", marginBottom: 4 }}>{d.getDate()}</div>
                    {list.slice(0, 3).map((p) => <EventPill key={p.id} p={p} />)}
                    {list.length > 3 && <div style={{ fontSize: 10.5, color: "#8593a8" }}>+ {list.length - 3} autre(s)</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {entries.length === 0 && (
        <div style={{ color: "#8593a8", fontSize: 13.5, marginTop: 10 }}>
          Aucun RDV planifié : renseignez la « date du RDV » sur vos fiches de prospection pour les voir apparaître ici.
        </div>
      )}
    </div>
  );
}

/* ================= CORBEILLE (manager) ================= */
function TrashPage({ trash, saveTrash, users, restoreClient, restoreProspect }) {
  const items = trash.slice().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const who = (id) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.prenom} ${u.nom}` : "—";
  };
  const daysLeft = (deletedAt) => Math.max(0, 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000));

  const purgeItem = (item) => {
    if (!confirm("Supprimer DÉFINITIVEMENT ? Cette action est irréversible.")) return;
    if (item.kind === "client") {
      (item.data.contrats || []).forEach((k) => (k.fichiers || []).forEach((f) => sDel(`crm-file-${f.id}`)));
    }
    saveTrash(trash.filter((x) => x.id !== item.id));
  };

  return (
    <div>
      <div className="ph">
        <div>
          <h1>🗑️ Corbeille</h1>
          <div className="sub">{items.length} élément(s) — suppression automatique et définitive après 30 jours</div>
        </div>
        {items.length > 0 && (
          <button className="btn danger" onClick={() => { if (confirm("Vider toute la corbeille définitivement ?")) { items.forEach((it) => { if (it.kind === "client") (it.data.contrats || []).forEach((k) => (k.fichiers || []).forEach((f) => sDel(`crm-file-${f.id}`))); }); saveTrash([]); } }}>
            Vider la corbeille
          </button>
        )}
      </div>

      {items.length === 0 && <div className="card" style={{ color: "#8593a8" }}>La corbeille est vide. Les fiches clients et fiches de prospection supprimées arriveront ici.</div>}

      <div className="grid">
        {items.map((item) => (
          <div className="clientcard" key={item.id} style={{ cursor: "default" }}>
            <div>
              <b style={{ fontSize: 14.5 }}>
                {item.kind === "client" ? "👥" : "🎯"} {(item.data.nom || "").toUpperCase()} {item.data.prenom || ""}
              </b>
              <div style={{ fontSize: 12, color: "#5b6b82" }}>
                {item.kind === "client" ? `Fiche client · ${(item.data.contrats || []).length} contrat(s)` : `Prospection · ${item.data.statut}`}
                {" — supprimé le "}{fmtDate(item.deletedAt.slice(0, 10))} par {who(item.deletedBy)}
              </div>
              <div style={{ fontSize: 11.5, color: daysLeft(item.deletedAt) <= 7 ? "#B3261E" : "#8593a8" }}>
                ⏳ {daysLeft(item.deletedAt)} jour(s) avant suppression définitive
              </div>
            </div>
            <div className="row">
              <button className="btn gold sm" onClick={() => (item.kind === "client" ? restoreClient(item) : restoreProspect(item))}>↩️ Restaurer</button>
              <button className="btn danger sm" onClick={() => purgeItem(item)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ================= GROSSES TUILES PAR MOIS ================= */
function MonthTiles({ months, counts, onPick, accent = "#C9A24B" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
      <div onClick={() => onPick("all")} style={{ background: "#0B2545", border: "1px solid #0B2545", borderRadius: 14, padding: "26px 20px", cursor: "pointer", textAlign: "center", boxShadow: "0 2px 6px rgba(11,37,69,.15)" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 21, fontWeight: 700, color: "#C9A24B" }}>Tous</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", marginTop: 6 }}>{counts.all} client(s)</div>
      </div>
      {months.map((m) => (
        <div key={m} onClick={() => onPick(m)} style={{ background: "#fff", border: "1px solid #E3E9F1", borderLeft: "4px solid " + accent, borderRadius: 14, padding: "26px 20px", cursor: "pointer", textAlign: "center", boxShadow: "0 1px 3px rgba(11,37,69,.05)", transition: "transform .15s" }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={(e) => e.currentTarget.style.transform = ""}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 19, fontWeight: 700, color: "#0B2545", textTransform: "capitalize" }}>{monthLabel(m)}</div>
          <div style={{ fontSize: 12.5, color: "#8593a8", marginTop: 6 }}>{counts[m] || 0} client(s)</div>
        </div>
      ))}
    </div>
  );
}

/* ================= ONGLETS PAR MOIS ================= */
function MonthTabs({ months, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
      <div onClick={() => onChange("all")} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: value === "all" ? "#0B2545" : "#fff", color: value === "all" ? "#C9A24B" : "#44536B", border: "1px solid " + (value === "all" ? "#0B2545" : "#CDD6E2") }}>Tous</div>
      {months.map((m) => (
        <div key={m} onClick={() => onChange(m)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: value === m ? "#0B2545" : "#fff", color: value === m ? "#C9A24B" : "#44536B", border: "1px solid " + (value === m ? "#0B2545" : "#CDD6E2") }}>{monthLabel(m)}</div>
      ))}
    </div>
  );
}
const clientMonths = (list) => {
  const set = new Set();
  list.forEach((c) => (c.contrats || []).forEach((k) => { if (k.dateSignature) set.add(k.dateSignature.slice(0, 7)); }));
  return [...set].sort().reverse();
};

/* ================= VENTES AUJOURD'HUI (dashboard) ================= */
function VentesJour({ sales, users, clients, goClient }) {
  const today = todayISO();
  const mk = today.slice(0, 7);
  const items = [];
  Object.entries(sales[mk] || {}).forEach(([uidK, data]) => {
    const u = users.find((x) => x.id === uidK);
    (data.rows || []).forEach((r) => {
      if ((r.nom || "").trim() && r.dateCreation === today) items.push({ r, u });
    });
  });
  const openFiche = (r) => {
    const cl = clients.find((c) => (r.nom || "").toUpperCase().includes((c.nom || "").toUpperCase()) && c.nom);
    if (cl && goClient) goClient(cl);
  };
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 18, marginBottom: 14 }}>💰 Ventes aujourd'hui <span style={{ color: "#8593a8", fontSize: 13, fontWeight: 400 }}>· {items.length} contrat(s) signé(s)</span></h2>
      {items.length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Aucun contrat signé aujourd'hui pour l'instant. Au travail ! 💪</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {items.map(({ r, u }, i) => (
          <div key={i} onClick={() => openFiche(r)} style={{ background: "#fff", border: "1px solid #E3E9F1", borderLeft: "4px solid #C9A24B", borderRadius: 10, padding: "13px 15px", cursor: "pointer", boxShadow: "0 1px 3px rgba(11,37,69,.05)" }}>
            <b style={{ fontSize: 14 }}>{r.nom}</b>
            <div style={{ fontSize: 12.5, color: "#44536B", marginTop: 3 }}>{r.type}{r.compagnie ? " · " + r.compagnie : ""}</div>
            <div style={{ fontSize: 12.5, color: "#44536B" }}>
              {r.versement ? `${r.versement} €/mois · ` : ""}Volume : {r.volume ? fmtEUR(parseNum(r.volume)) : "—"}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>
              <span style={{ color: "#7A5C17", fontWeight: 700 }}>Commission : {r.remuneration ? fmtEUR(parseNum(r.remuneration)) : "—"}</span>
              <span className={"badge " + (r.statut === "Payé" ? "b-green" : r.statut === "Annulé" ? "b-red" : "b-gold")} style={{ marginLeft: 8 }}>{r.statut}</span>
            </div>
            <div style={{ fontSize: 11, color: "#8593a8", marginTop: 4 }}>Signé par {u ? u.prenom : "?"} · {r.commentaire || ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= PAGE DÉCOMMISSIONNÉS ================= */
function DecomPage({ clients, saveClients, goClient }) {
  const [search, setSearch] = useState("");
  const [monthTab, setMonthTab] = useState(null);
  const allDecoms = clients.filter((c) => c.decom);
  const moisDispo = clientMonths(allDecoms);
  const moisCounts = { all: allDecoms.length };
  moisDispo.forEach((m) => { moisCounts[m] = allDecoms.filter((c) => (c.contrats || []).some((k) => (k.dateSignature || "").slice(0, 7) === m)).length; });
  const decoms = allDecoms
    .filter((c) => monthTab === "all" || (c.contrats || []).some((k) => (k.dateSignature || "").slice(0, 7) === monthTab))
    .filter((c) => (c.nom + " " + c.prenom).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const rebasculer = (c) => {
    if (!confirm(`Rebasculer ${c.civilite || ""} ${c.nom} en client actif ?`)) return;
    saveClients(clients.map((x) => (x.id === c.id ? { ...x, decom: false } : x)));
  };

  return (
    <div>
      <div className="ph">
        <div>
          <h1>🔻 Décommissionnés</h1>
          <div className="sub">{decoms.length} client(s) dont tous les contrats ont été décommissionnés — à rappeler pour les reconquérir</div>
        </div>
        <input className="in" style={{ width: 220 }} placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {monthTab === null && <MonthTiles months={moisDispo} counts={moisCounts} onPick={setMonthTab} accent="#B3261E" />}
      {monthTab !== null && (<>
      <button className="btn ghost sm" style={{ marginBottom: 14 }} onClick={() => setMonthTab(null)}>← Retour aux mois</button>
      <div className="grid" style={{ marginTop: 8 }}>
        {decoms.map((c) => (
          <div className="clientcard" key={c.id} style={{ borderLeft: "4px solid #B3261E" }}>
            <div style={{ cursor: "pointer" }} onClick={() => goClient(c.id)}>
              <b style={{ fontSize: 15 }}>{c.civilite ? c.civilite + " " : ""}{c.nom.toUpperCase()} {c.prenom}</b>
              <div style={{ fontSize: 12.5, color: "#5b6b82" }}>
                {(c.contrats || []).length} contrat(s) décommissionné(s) · {c.telephone || "téléphone à renseigner"}
              </div>
            </div>
            <div className="row">
              <span className="badge b-red">Décommissionné</span>
              <button className="btn gold sm" onClick={() => rebasculer(c)}>♻️ Rebasculer en client</button>
            </div>
          </div>
        ))}
        {decoms.length === 0 && <div className="card" style={{ color: "#8593a8" }}>Aucun client décommissionné sur cette période. 👌</div>}
      </div>
      </>)}
    </div>
  );
}

/* ================= ADAPTATEUR STORAGE (API Flask/PostgreSQL) ================= */
window.storage = {
  async get(key) {
    const r = await fetch(`/api/storage/${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error("key not found: " + key);
    return await r.json();
  },
  async set(key, value) {
    const r = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    return await r.json();
  },
  async delete(key) {
    const r = await fetch(`/api/storage/${encodeURIComponent(key)}`, { method: "DELETE" });
    return await r.json();
  },
  async list(prefix) {
    const r = await fetch(`/api/storage?prefix=${encodeURIComponent(prefix || "")}`);
    return await r.json();
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
