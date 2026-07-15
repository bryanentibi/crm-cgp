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
  "Faire le transfert + appeler",
  "Relancer le client",
  "Création de l'espace client",
  "Rappel pour documents",
  "Rappel pour signature de contrat",
  "Point annuel",
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
  .topbarm { display:none; }
  .scrim { display:none; }
  .crm h1,.crm h2,.crm h3 { font-family: Georgia, 'Times New Roman', serif; margin: 0; }
  .side { width: 232px; height: 100vh; position: sticky; top: 0; background: linear-gradient(180deg, ${NAVY} 0%, ${NAVY2} 100%); color:#fff; display:flex; flex-direction:column; flex-shrink:0; overflow-y:auto; -webkit-overflow-scrolling:touch; z-index: 30; }
  .brand { padding: 26px 20px 18px; border-bottom: 1px solid rgba(255,255,255,.12); }
  .brand b { font-family: Georgia, serif; font-size: 19px; letter-spacing: .5px; display:block; }
  .brand span { color:${GOLD}; font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; }
  .nav { padding: 14px 10px; display:flex; flex-direction:column; gap:4px; flex:1; }
  .nav button { text-align:left; background:none; border:none; color:rgba(255,255,255,.82); padding:11px 14px; border-radius:8px; cursor:pointer; font-size:14px; display:flex; gap:10px; align-items:center; transition: background .15s; }
  .nav button:hover { background: rgba(255,255,255,.08); }
  .nav button.on { background: rgba(201,162,75,.18); color:#fff; border-left: 3px solid ${GOLD}; }
  .side .who { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,.12); font-size: 13px; }
  .side .who b { color: ${GOLD}; }
  .main { flex:1; padding: 30px 34px; min-width: 0; }

  /* ===== MOBILE / TABLETTE ===== */
  @media (max-width: 900px) {
    /* Bandeau fixe : masque le contenu qui défile dessous, contient le burger */
    .topbarm { display:flex; position:fixed; top:0; left:0; right:0; z-index:70; align-items:center; gap:12px;
               height: calc(env(safe-area-inset-top, 0px) + 60px);
               padding: env(safe-area-inset-top, 0px) 14px 0;
               background: ${NAVY}; box-shadow: 0 3px 16px rgba(11,37,69,.35); }
    .topbarm .tt { color:#fff; font-family: Georgia, serif; font-size: 16px; letter-spacing: .5px; }
    .topbarm .tt span { color:${GOLD}; }
    .burger { display:flex; width:42px; height:42px; border-radius:11px; flex-shrink:0;
              background:rgba(255,255,255,.10); color:${GOLD}; border:1px solid rgba(201,162,75,.45); align-items:center; justify-content:center;
              font-size:20px; cursor:pointer; -webkit-tap-highlight-color:transparent;
              touch-action:manipulation; user-select:none; }
    .burger:active { transform:scale(.93); }
    .side { position:fixed; top:0; bottom:0; left:0; width: 268px; transform: translateX(-102%); transition: transform .28s ease;
            box-shadow: 6px 0 30px rgba(0,0,0,.35); padding-top: env(safe-area-inset-top); }
    .side { z-index: 75; }
    .side.open { transform:none; padding-top: calc(env(safe-area-inset-top, 0px) + 8px); }
    .scrim.show { display:block; position:fixed; inset:0; background:rgba(11,37,69,.5); z-index:25; }
    .main { padding: 14px 14px calc(env(safe-area-inset-bottom, 0px) + 30px); width:100%;
            margin-top: calc(env(safe-area-inset-top, 0px) + 64px); }
    /* Le tout premier titre de chaque page respire sous le bandeau */
    .main > div > .ph:first-child, .main .ph:first-of-type { padding-top: 4px; }
    .side button { padding: 14px 16px; font-size: 15px; }
    .ph h1 { font-size: 21px; }
    /* Tableaux : défilement horizontal propre au lieu d'un écrasement */
    .t { display:block; overflow-x:auto; white-space:nowrap; -webkit-overflow-scrolling:touch; }
    /* Arbitrage : le nom du client reste visible pendant le défilement horizontal */
    .t.arb th:nth-child(2), .t.arb td:nth-child(2) {
      position: sticky; left: 0; z-index: 3; background: #fff; min-width: 168px;
      box-shadow: 2px 0 6px rgba(11,37,69,.10);
    }
    .t.arb thead th:nth-child(2) { z-index: 5; background: ${NAVY}; }
    .t.arb tr.paye td:nth-child(2) { background:#e4f3e6; }
    .t.arb tr.annule td:nth-child(2) { background:#fbe4e2; }
    .t.arb tr.attente td:nth-child(2) { background:#fdf1dc; }
    .t.arb tr.rdvb td:nth-child(2) { background:#D9EAFB; }
    .t.arb td:first-child, .t.arb th:first-child { min-width: 118px; }
    /* Portefeuille : la colonne Nom reste visible au défilement */
    .t.pf th:nth-child(5), .t.pf td:nth-child(5) {
      position: sticky; left: 0; z-index: 3; box-shadow: 2px 0 6px rgba(11,37,69,.10); min-width: 160px;
    }
    .t.pf thead th:nth-child(5) { z-index: 5; background: ${NAVY}; }
    .t.pf tr.pf-on td:nth-child(5) { background:#EAF7EE; }
    .t.pf tr.pf-off td:nth-child(5) { background:#FBEAE8; }
    .card { padding: 16px; border-radius: 12px; }
    .modal { max-width: 100% !important; }
    .modal-bg { padding: 16px 10px; }
    .grid { grid-template-columns: 1fr !important; }
    /* Zones tactiles confortables */
    .btn { padding: 10px 14px; font-size: 13.5px; }
    input, select, textarea { font-size: 16px !important; } /* évite le zoom auto iOS */
  }
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
  table.t th { background:${NAVY}; color:#fff; padding: 10px 8px; text-align:center; font-weight:600; font-size:11px; letter-spacing:.7px;
               text-transform:uppercase; white-space: nowrap; border-right:1px solid rgba(255,255,255,.07); }
  table.t th:last-child { border-right:none; }
  table.t th:first-child { border-radius: 8px 0 0 0; } table.t th:last-child { border-radius: 0 8px 0 0; }
  table.t td { border-bottom:1px solid #eef2f7; padding: 5px 6px; text-align:center; }
  table.t tbody tr { transition: background .12s; }
  table.t input, table.t select { width:100%; border:1px solid transparent; background:transparent; padding: 6px 4px; font-size:13px; text-align:center; border-radius:6px; color:inherit; font-family:inherit; }
  table.t input:focus, table.t select:focus { background:#fff; border-color:${GOLD}; outline:none; box-shadow:0 0 0 3px rgba(201,162,75,.13); }
  /* Le nom du client en gras navy, comme une vraie fiche */
  table.t td.cnom input { font-weight:700; color:${NAVY}; text-align:left; letter-spacing:.2px; }
  table.t td.eur input { font-variant-numeric: tabular-nums; font-weight:600; }
  table.t td.rem input { font-variant-numeric: tabular-nums; font-weight:700; color:#7A5C17; }
  /* Statuts : En attente = blanc · Payé = vert · Annulé = rouge */
  tr.paye td { background:#EAF7EE; } tr.annule td { background:#FBEAE8; } tr.attente td { background:#fff; } tr.rdvb td { background:#D9EAFB; }
  tr.paye td:first-child { box-shadow: inset 3px 0 0 #16A34A; }
  tr.annule td:first-child { box-shadow: inset 3px 0 0 #DC2626; }
  tr.attente td:first-child { box-shadow: inset 3px 0 0 #E3E9F1; }
  table.t tbody tr:hover td { background:#F7F9FC; }
  tr.paye:hover td { background:#E0F2E6; } tr.annule:hover td { background:#F7DFDC; }
  tr.pf-on td { background:#EAF7EE; } tr.pf-off td { background:#FBEAE8; }
  .t.pf tbody tr:hover td { filter: brightness(.97); }
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
  .login { min-height:100vh; width:100%; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;
           background: linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 60%, #1d4066 100%); }
  .login::before { content:""; position:absolute; inset:0; background:url('/static/fond-portail.jpg') center/cover no-repeat; opacity:.95; }
  .login::after { content:""; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(11,37,69,.30) 0%, rgba(11,37,69,.72) 100%); }
  .loginbox { position:relative; z-index:2; background:rgba(255,255,255,.97); border:1px solid rgba(201,162,75,.35); border-radius: 18px; padding: 40px 38px 36px; width: 100%; max-width: 430px;
              box-shadow: 0 40px 100px rgba(0,0,0,.55); animation: lgin .5s ease-out; }
  @keyframes lgin { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:none; } }
  .loginbox .crest { display:block; width:78px; height:78px; margin: 0 auto 16px; }
  .loginbox h1 { font-size: 25px; text-align:center; letter-spacing: 1.5px; font-weight:400; }
  .loginbox .rule { width:64px; height:1px; background:${GOLD}; margin: 12px auto 10px; opacity:.65; }
  .loginbox .gold { color:${GOLD}; letter-spacing: 3.5px; font-size: 10px; text-transform: uppercase; text-align:center; display:block; margin-bottom: 24px; margin-top: 2px; }
  .loginfoot { position:absolute; bottom:20px; left:0; right:0; text-align:center; z-index:2; color:rgba(255,255,255,.5); font-size:11px; letter-spacing:1.5px; }
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
  const [menuOpen, setMenuOpen] = useState(false);
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
      /* Le compte Prospection connecté détermine le propriétaire de cette Gestion */
      let flaskUser = "bryanentibi";
      try { const rm = await fetch("/api/me"); if (rm.ok) { const jm = await rm.json(); flaskUser = jm.username || flaskUser; } } catch {}
      const defaults = flaskUser === "quentin"
        ? [{ id: "quentin", prenom: "Quentin", nom: "", bareme: "Manager", isManager: true, password: null }]
        : DEFAULT_USERS;
      let loadedUsers = u && u.length ? u : defaults;
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
          ELYON <span style={{ color: GOLD }}>&</span> ASSOCIÉS
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
    ["portefeuille", "💼 Portefeuille client"],
    ["rappels", "🔔 Rappels"],
    ["decom", "🔻 Décommissionnés"],
    ["arbitrage", "⚖️ Arbitrage clients"],
    ["messagerie", "✉️ Messagerie"],
    ...(me.isManager ? [["equipe", "🧑‍💼 Mon équipe"], ["corbeille", "🗑️ Corbeille"]] : []),
  ];

  return (
    <div className="crm">
      <style>{CSS}</style>
      <div className="topbarm">
        <button className="burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">{menuOpen ? "✕" : "☰"}</button>
        <div className="tt">ELYON <span>&</span> ASSOCIÉS</div>
      </div>
      <div className={"scrim" + (menuOpen ? " show" : "")} onClick={() => setMenuOpen(false)} />
      <aside className={"side" + (menuOpen ? " open" : "")}>
        <div className="brand">
          <b>ELYON <span style={{ color: GOLD }}>&</span> ASSOCIÉS</b>
          <span>Gestion de patrimoine</span>
        </div>
        <div style={{ display: "flex", gap: 4, margin: "0 10px 12px", background: "#13315C", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: 4 }}>
          <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 7, fontSize: 12, fontWeight: 700, background: "#C9A24B", color: "#0B2545", cursor: "default" }}>📁 Gestion</div>
          <div onClick={() => { window.location.href = "/?p=1"; }} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 7, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.6)", cursor: "pointer" }}>🎯 Prospection</div>
        </div>
        <nav className="nav">
          {NAV.map(([k, l]) => (
            <button key={k} className={page === k ? "on" : ""} onClick={() => { setPage(k); setOpenClient(null); setMenuOpen(false); }}>
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
        {page === "portefeuille" && <PortefeuillePage clients={clients} saveClients={saveClients} goClient={(id) => { setPage("clients"); setOpenClient(id); }} />}
        {page === "rappels" && <RappelsPage clients={clients} saveClients={saveClients} goClient={(id) => { setPage("clients"); setOpenClient(id); }} />}
        {page === "arbitrage" && <ArbitragePage clients={clients} saveClients={saveClients} sales={sales} saveSales={saveSales} me={me} />}
        {page === "messagerie" && <MessageriePage clients={clients} saveClients={saveClients} />}
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
        {page === "ventes" && <SalesPage sales={sales} saveSales={saveSales} users={users} objectifs={objectifs} saveObjectifs={saveObjectifs} me={me} clients={clients} saveClients={saveClients} />}
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
  const [bgPhoto, setBgPhoto] = useState(null);

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/portal-bg"); const j = await r.json(); if (j.image) setBgPhoto(j.image); } catch {}
  })(); }, []);

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
        {bgPhoto && <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${bgPhoto}')`, backgroundSize: "cover", backgroundPosition: "center", opacity: .9, zIndex: 0 }} />}
        <div className="loginbox">
          <img src="/static/logo-ea.svg" className="crest" alt="Elyon & Associés" />
          <h1>ELYON <span style={{ color: GOLD }}>&</span> ASSOCIÉS</h1>
          <div className="rule" />
          <span className="gold">Cabinet de gestion de patrimoine</span>
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
        <div className="loginfoot">ESPACE PROFESSIONNEL SÉCURISÉ</div>
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
      if (d === 0) alerts.push({ kind: "anniv", client: c, date: bd.toISOString().slice(0, 10), days: d, age: ageAt(c.dateNaissance, bd) });
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

      <VentesJour sales={sales} users={users} clients={clients} goClient={goClient} me={me} />
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
  const [sortBy, setSortBy] = useState("date");
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
    (search.trim() !== "" || monthTab === "all" || (c.contrats || []).some((k) => (k.dateSignature || "").slice(0, 7) === monthTab)) &&
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

      {monthTab === null && !search.trim() && <MonthTiles months={moisDispo} counts={moisCounts} onPick={setMonthTab} />}

      {(monthTab !== null || search.trim() !== "") && (<>
      <button className="btn ghost sm" style={{ marginBottom: 14 }} onClick={() => { setMonthTab(null); setSearch(""); }}>← Retour aux mois</button>
      <span style={{ marginLeft: 12, fontFamily: "Georgia, serif", fontSize: 17, color: "#0B2545", fontWeight: 700, textTransform: "capitalize" }}>{search.trim() ? "Résultats de recherche" : monthTab === "all" ? "Tous les clients" : monthLabel(monthTab)}</span>
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
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
  const [showEic, setShowEic] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [editAlert, setEditAlert] = useState(null);
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
        <EicSynthese client={client} onOpen={() => setShowEic(true)} onPdf={() => eicPdf(client)} onDelete={() => { if (confirm("Supprimer définitivement le questionnaire EIC de cette fiche ?")) update({ ...client, eic: null, eicDate: null }); }} />

        <div className="card">
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>Informations personnelles</h2>
          <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div onClick={() => update({ ...client, lastContact: todayISO() })}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, border: "1px solid #C9A24B", background: "#FBF6EA", color: "#7A5C17" }}
              title="Enregistre un contact aujourd'hui (démarre le suivi « prendre des nouvelles »)">
              📞 {client.lastContact ? "Dernier contact : " + fmtDate(client.lastContact) : "Noter un contact"}
            </div>
            <div onClick={() => update({ ...client, transfertsFaits: client.transfertsFaits === "oui" ? "non" : "oui" })}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, border: "1px solid",
                background: client.transfertsFaits === "oui" ? "#e4f3e6" : "#fff",
                borderColor: client.transfertsFaits === "oui" ? "#1B7A3D" : "#cdd6e2",
                color: client.transfertsFaits === "oui" ? "#1B7A3D" : "#8593a8" }}>
              {client.transfertsFaits === "oui" ? "✓ Transferts effectués" : "Transferts : non faits"}
            </div>
            <div onClick={() => update({ ...client, espaceClient: client.espaceClient === "oui" ? "non" : "oui" })}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, border: "1px solid",
                background: client.espaceClient === "oui" ? "#e4f3e6" : "#fff",
                borderColor: client.espaceClient === "oui" ? "#1B7A3D" : "#cdd6e2",
                color: client.espaceClient === "oui" ? "#1B7A3D" : "#8593a8" }}>
              {client.espaceClient === "oui" ? "✓ Espace client ouvert" : "Espace client : non ouvert"}
            </div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 2 }}>
            <div><b>Date de naissance :</b> {fmtDate(client.dateNaissance)}</div>
            <div><b>Téléphone :</b> {client.telephone || "—"}</div>
            <div><b>E-mail :</b> {client.email || "—"}</div>
            <div><b>Profession :</b> {client.profession || "—"}</div>
            <div><b>Revenus imposables :</b> {client.revenus ? fmtEUR(parseNum(client.revenus)) : "—"}</div>
            <div><b>Situation matrimoniale :</b> {client.situation || "—"}</div>
          </div>
        </div>

        {(client.mailLog || []).length > 0 && (
          <div className="card">
            <h2 style={{ fontSize: 17, marginBottom: 8 }}>📧 Mails envoyés (Messagerie)</h2>
            {(client.mailLog || []).map((m, i) => (
              <div key={i} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid #edf1f6" }}>
                <b>{fmtDate(m.date)}</b> — {m.objet}
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>📝 Notes & à faire</h2>
          <div style={{ fontSize: 11.5, color: "#8593a8", marginBottom: 8 }}>Astuce : commence une ligne par <b>!</b> pour créer un rappel à faire (visible dans l'onglet Rappels).</div>
          <textarea className="in" style={{ width: "100%", minHeight: 80, fontFamily: "inherit", lineHeight: 1.6 }}
            value={client.notes || ""} onChange={(e) => update({ ...client, notes: e.target.value })}
            placeholder={"Notes libres sur le client…\n! Lui envoyer la proposition PER"} />
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>🔔 Alertes</h2>
            <button className="btn sm gold" onClick={() => { setEditAlert(null); setShowAlert(true); }}>+ Créer un rappel</button>
          </div>
          {(client.alertes || []).length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Aucune alerte programmée.</div>}
          {(client.alertes || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((a) => (
            <div className={"alertline" + (!a.done && a.date <= todayISO() ? " today" : "")} key={a.id} style={a.done ? { opacity: 0.5 } : {}}>
              <div>
                <b>{a.type}</b>{a.note && <span style={{ color: "#5b6b82" }}> · {a.note}</span>}
                <div style={{ fontSize: 12, color: "#8593a8" }}>Rappel le {fmtDate(a.date)} {a.done && "· ✓ fait"}</div>
              </div>
              <div className="row">
                <button className="btn ghost sm" onClick={() => { setEditAlert(a); setShowAlert(true); }}>✏️ Modifier</button>
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
      {showEic && (
        <EicForm
          client={client}
          onClose={() => setShowEic(false)}
          onSave={(f) => { update({ ...client, eic: f, eicDate: todayISO() }); setShowEic(false); }}
        />
      )}

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
      {showAlert && (
        <AlertForm
          initial={editAlert}
          onClose={() => { setShowAlert(false); setEditAlert(null); }}
          onSave={(a) => {
            if (editAlert) update({ ...client, alertes: (client.alertes || []).map((x) => (x.id === editAlert.id ? { ...x, ...a } : x)) });
            else addAlert(a);
            setShowAlert(false); setEditAlert(null);
          }}
        />
      )}
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
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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

function AlertForm({ initial, onSave, onClose }) {
  const connu = initial && ALERT_TYPES.includes(initial.type);
  const [f, setF] = useState(initial
    ? { ...initial, type: connu ? initial.type : "Autre" }
    : { type: ALERT_TYPES[0], date: todayISO(), note: "" });
  const [libre, setLibre] = useState(initial && !connu ? initial.type : "");
  const valider = () => {
    const intitule = f.type === "Autre" ? libre.trim() : f.type;
    if (!intitule) { alert("Écris l'intitulé de ton rappel."); return; }
    if (!f.date) { alert("Choisis une date."); return; }
    onSave({ ...f, type: intitule });
  };
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <h2>{initial ? "Modifier le rappel" : "Créer un rappel"}</h2>
        <div className="grid">
          <Field label="Type de rappel">
            <select className="sel" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {ALERT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          {f.type === "Autre" && (
            <Field label="Intitulé du rappel">
              <input className="in" autoFocus value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="Écris ce que tu veux…" />
            </Field>
          )}
          <Field label="Date du rappel">
            <input className="in" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Note (optionnel)">
            <input className="in" value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="ex : relancer pour le RIB" />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn gold" onClick={valider}>{initial ? "Enregistrer" : "Programmer le rappel"}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= VENTES ÉQUIPE ================= */
function SalesPage({ sales, saveSales, users, objectifs, saveObjectifs, me, clients, saveClients }) {
  const [apporteurs, setApporteurs] = useState([]);
  useEffect(() => { (async () => {
    let a = await sGet("crm-apporteurs");
    if (!a || !a.length) {
      const vus = new Set();
      (sales || []).forEach((u) => (u.rows || []).forEach((r) => r.apporteur && vus.add(r.apporteur.trim())));
      (users || []).forEach((u) => vus.add(`${u.prenom} ${u.nom}`.trim()));
      a = [...vus].filter(Boolean).sort();
      await sSet("crm-apporteurs", a);
    }
    setApporteurs(a);
  })(); }, []);
  const ajouterApporteur = (userId, rowId) => {
    const nom = prompt("Nom de l'apporteur à ajouter à la liste :");
    if (!nom || !nom.trim()) return;
    const v = nom.trim();
    const maj = [...new Set([...apporteurs, v])].sort();
    setApporteurs(maj); sSet("crm-apporteurs", maj);
    updateCell(userId, rowId, "apporteur", v);
  };
  /* Ajouter le contrat de la ligne à la fiche déjà liée */
  const addContractToLinked = (userId, r) => {
    const cl = clients.find((x) => x.id === r.clientId);
    if (!cl) { alert("Fiche introuvable — utilise ✕ pour délier puis + Fiche."); return; }
    if (!confirm(`Ajouter ce contrat (${r.type || "?"} ${r.compagnie || ""}) à la fiche de ${cl.civilite || ""} ${cl.nom} ${cl.prenom || ""} ?`)) return;
    const contrat = {
      id: uid(), type: r.type || "PER", compagnie: r.compagnie || "", numero: "",
      montant: r.volume || "", frais: "",
      commentaire: [r.versement ? `Versement : ${r.versement} €/mois` : "", r.versementAnnuel ? `Versement annuel : ${r.versementAnnuel} €` : "", r.commentaire || ""].filter(Boolean).join(" · "),
      dateSignature: r.dateCreation || todayISO(), datePrelevement: "",
      transfertInterne: "non", fraisTransfert: "non", fichiers: [],
    };
    const alerteT = { id: uid(), type: `Faire le transfert + appeler (vente ${r.type || "?"})`, date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), done: false };
    saveClients(clients.map((x) => (x.id === cl.id ? { ...x, decom: false, contrats: [...(x.contrats || []), contrat], alertes: [...(x.alertes || []), alerteT] } : x)));
    alert("✅ Contrat ajouté à la fiche + rappel transfert à 1 mois !");
  };

  /* Créer (ou compléter) la fiche client depuis une ligne de vente */
  const addClientFromRow = (userId, r) => {
    const norm = (s) => (s || "").toUpperCase().replace(/^(MME|MR|M\.|MLLE)\s+/, "").replace(/[^A-ZÀ-Ü0-9\- ]/g, "").replace(/\s+/g, " ").trim();
    const nomComplet = norm(r.nom);
    if (!nomComplet) { alert("Renseigne d'abord le nom du client sur la ligne."); return; }
    const civ = /^MME/i.test(r.nom || "") ? "Mme" : (/^(MR|M\.)/i.test(r.nom || "") ? "M." : "");
    const contrat = {
      id: uid(), type: r.type || "PER", compagnie: r.compagnie || "", numero: "",
      montant: r.volume || "", frais: "",
      commentaire: [r.versement ? `Versement : ${r.versement} €/mois` : "", r.versementAnnuel ? `Versement annuel : ${r.versementAnnuel} €` : "", r.commentaire || ""].filter(Boolean).join(" · "),
      dateSignature: r.dateCreation || todayISO(), datePrelevement: "",
      transfertInterne: "non", fraisTransfert: "non", fichiers: [],
    };
    const alerteTransfert = { id: uid(), type: `Faire le transfert + appeler (vente ${r.type || "?"})`, date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), done: false };
    let existant = clients.find((c) => norm(c.nom + " " + (c.prenom || "")) === nomComplet || norm(c.nom) === nomComplet);
    if (!existant) {
      /* Fiches proches : le nom de famille saisi commence pareil qu'une fiche existante */
      const premierMot = nomComplet.split(" ")[0];
      const proche = premierMot.length >= 4 && clients.find((c) => norm(c.nom).split(" ")[0] === premierMot);
      if (proche && confirm(`Une fiche ressemble : ${proche.civilite || ""} ${proche.nom} ${proche.prenom || ""}.\n\nOK = ajouter le contrat à CETTE fiche\nAnnuler = créer une NOUVELLE fiche`)) existant = proche;
    }
    let cid;
    if (existant) {
      if (!confirm(`${existant.civilite || ""} ${existant.nom} existe déjà — ajouter ce contrat à sa fiche ?`)) return;
      cid = existant.id;
      saveClients(clients.map((c) => (c.id === existant.id ? { ...c, decom: false, contrats: [...(c.contrats || []), contrat], alertes: [...(c.alertes || []), alerteTransfert] } : c)));
    } else {
      cid = uid();
      saveClients([...clients, {
        id: cid, nom: nomComplet, prenom: "", civilite: civ, dateNaissance: "", telephone: "",
        email: "", profession: "", revenus: "", situation: "Célibataire",
        createdBy: me.id, createdAt: todayISO(), contrats: [contrat], alertes: [alerteTransfert],
      }]);
    }
    updateCell(userId, r.id, "clientId", cid);
    alert(existant ? "✅ Contrat ajouté à la fiche existante !" : "✅ Fiche client créée ! Retrouve-la dans l'onglet Clients.");
  };
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
        rows: md[userId].rows.map((r) => {
          if (r.id !== rowId) return r;
          let nr = recalcRow({ ...r, [field]: value }, field);
          /* Liaison auto : si le nom tapé correspond exactement à un client existant */
          if (field === "nom" && clients) {
            const nrm = (s) => (s || "").toUpperCase().replace(/^(MME|MR|M\.|MLLE)\s+/, "").replace(/[^A-ZÀ-Ü0-9\- ]/g, "").replace(/\s+/g, " ").trim();
            const t = nrm(value);
            const m = t && clients.find((cl) => nrm((cl.civilite ? cl.civilite + " " : "") + cl.nom + " " + (cl.prenom || "")) === t || nrm(cl.nom + " " + (cl.prenom || "")) === t || nrm(cl.nom) === t);
            nr = { ...nr, clientId: m ? m.id : undefined };
          }
          return nr;
        }),
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
  /* Les nouvelles lignes arrivent EN HAUT du tableau, prêtes à être remplies */
  const addRows = (userId, n = 1) => {
    const md = sales[month];
    saveSales({ ...sales, [month]: { ...md, [userId]: { ...md[userId], rows: [...Array.from({ length: n }, emptyRow), ...md[userId].rows] } } });
  };
  const addRowsAsk = (userId) => {
    const r = prompt("Combien de lignes ajouter ?", "5");
    const n = parseInt(r, 10);
    if (n > 0 && n <= 50) addRows(userId, n);
    else if (r !== null) alert("Entre un nombre entre 1 et 50.");
  };
  /* Supprimer une ligne (confirmation seulement si elle contient quelque chose) */
  const delRow = (userId, rowId) => {
    const md = sales[month];
    const r = (md[userId].rows || []).find((x) => x.id === rowId);
    const vide = !r || !(r.nom || r.type || r.compagnie || r.versement || r.versementAnnuel || r.volume || r.remuneration || r.ref);
    if (!vide && !confirm(`Supprimer la ligne « ${r.nom || "sans nom"} » ?`)) return;
    saveSales({ ...sales, [month]: { ...md, [userId]: { ...md[userId], rows: md[userId].rows.filter((x) => x.id !== rowId) } } });
  };
  /* Nettoyer toutes les lignes vides d'un coup */
  const purgeVides = (userId) => {
    const md = sales[month];
    const rows = md[userId].rows || [];
    const pleines = rows.filter((r) => r.nom || r.type || r.compagnie || r.versement || r.versementAnnuel || r.volume || r.remuneration || r.ref);
    const n = rows.length - pleines.length;
    if (!n) { alert("Aucune ligne vide à supprimer."); return; }
    if (!confirm(`Supprimer ${n} ligne(s) vide(s) ?`)) return;
    saveSales({ ...sales, [month]: { ...md, [userId]: { ...md[userId], rows: pleines } } });
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
              <div className="row" style={{ gap: 6 }}>
                <button className="btn gold sm" onClick={() => addRows(u.id, 1)}>+ 1 ligne</button>
                <button className="btn ghost sm" onClick={() => addRowsAsk(u.id)}>+ Plusieurs…</button>
                <button className="btn ghost sm" onClick={() => purgeVides(u.id)} title="Supprimer toutes les lignes vides de ce tableau">🧹 Lignes vides</button>
              </div>
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
                  <th style={{ width: "12%" }}>Apporteur</th>
                  <th>Versement/mois</th>
                  <th>Versement/an</th>
                  <th>Volume</th>
                  <th>Rémunération</th>
                  <th>Statut</th>
                  <th>Fiche</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className={r.statut === "Payé" ? "paye" : r.statut === "Annulé" ? "annule" : "attente"} style={r.mirrorOf ? { background: "#fdf9f0" } : undefined} title={r.mirrorOf ? "Ligne recopiée automatiquement depuis le tableau d'un commercial — saisissez votre rémunération" : undefined}>
                    <td><input type="date" value={r.dateCreation || ""} onChange={(e) => updateCell(u.id, r.id, "dateCreation", e.target.value)} style={{ fontSize: 12 }} /></td>
                    <td className="cnom"><input value={r.nom} onChange={(e) => updateCell(u.id, r.id, "nom", e.target.value)} placeholder="MME NOM PRÉNOM" style={{ textTransform: "uppercase" }} /></td>
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
                    <td>
                      <select value={r.apporteur || ""} onChange={(e) => {
                        if (e.target.value === "__new__") { ajouterApporteur(u.id, r.id); return; }
                        updateCell(u.id, r.id, "apporteur", e.target.value);
                      }}>
                        <option value=""></option>
                        {apporteurs.map((a) => <option key={a} value={a}>{a}</option>)}
                        {r.apporteur && !apporteurs.includes(r.apporteur) && <option value={r.apporteur}>{r.apporteur}</option>}
                        <option value="__new__">➕ Ajouter un nom…</option>
                      </select>
                    </td>
                    <td className="eur"><input value={r.versement || ""} onChange={(e) => updateCell(u.id, r.id, "versement", e.target.value)} placeholder="€/mois" /></td>
                    <td className="eur"><input value={r.versementAnnuel || ""} onChange={(e) => updateCell(u.id, r.id, "versementAnnuel", e.target.value)} placeholder="€/an" /></td>
                    <td className="eur"><input value={r.volume} onChange={(e) => updateCell(u.id, r.id, "volume", e.target.value)} placeholder="€" /></td>
                    <td className="rem"><input value={r.remuneration} onChange={(e) => updateCell(u.id, r.id, "remuneration", e.target.value)} placeholder="€"
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
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.clientId ? (
                        <>
                          <span className="badge b-green" title="Fiche client liée">✓</span>
                          <button className="btn ghost sm" style={{ padding: "3px 6px", fontSize: 10.5, marginLeft: 4 }} title="Ajouter ce contrat à la fiche liée" onClick={() => addContractToLinked(u.id, r)}>+ Contrat</button>
                          <button className="btn ghost sm" style={{ padding: "3px 6px", fontSize: 10.5, marginLeft: 3, color: "#B3261E" }} title="Délier cette vente de la fiche (la fiche n'est pas supprimée)" onClick={() => updateCell(u.id, r.id, "clientId", undefined)}>✕</button>
                        </>
                      ) : (
                        <button className="btn ghost sm" style={{ padding: "3px 8px", fontSize: 11 }} title="Créer la fiche client depuis cette vente" onClick={() => addClientFromRow(u.id, r)}>+ Fiche</button>
                      )}
                    </td>
                    <td style={{ width: 30 }}>
                      <button onClick={() => delRow(u.id, r.id)} title="Supprimer cette ligne"
                        style={{ background: "none", border: "none", color: "#B3261E", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>✕</button>
                    </td>
                  </tr>
                ))}
                <tr className="totrow">
                  <td colSpan={9} style={{ textAlign: "right" }}>TOTAL {monthLabel(month).toUpperCase()}</td>
                  <td>{fmtEUR(totVol)}</td>
                  <td>{fmtEUR(totRem)}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
                <tr className="nprow">
                  <td colSpan={2} style={{ textAlign: "right", paddingRight: 10 }}>AFFAIRES NON PAYÉES</td>
                  <td colSpan={10} style={{ fontSize: 13 }}>
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
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
  const [viewMode, setViewMode] = useState("mois"); // table | semaine | mois

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
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
function VentesJour({ sales, users, clients, goClient, me }) {
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
    /* 1. Liaison directe par identifiant si la vente est liée à une fiche */
    if (r.clientId) {
      const direct = clients.find((c) => c.id === r.clientId);
      if (direct) return goClient(direct);
    }
    /* 2. Sinon : correspondance exacte du nom complet (civilité retirée), jamais un simple morceau */
    const norm = (s) => (s || "").toUpperCase().replace(/^(MME|MR|M\.|MLLE)\s+/, "").replace(/[^A-ZÀ-Ü0-9\- ]/g, "").replace(/\s+/g, " ").trim();
    const target = norm(r.nom);
    let cl = clients.find((c) => norm((c.civilite ? c.civilite + " " : "") + c.nom + " " + (c.prenom || "")) === target)
          || clients.find((c) => norm(c.nom + " " + (c.prenom || "")) === target)
          || clients.find((c) => norm(c.nom) === target);
    if (cl && goClient) goClient(cl);
    else alert("Aucune fiche client ne correspond exactement à « " + r.nom + " ». Va dans l'onglet Ventes et clique + Fiche sur cette ligne pour la lier proprement.");
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
            {(r.commentaire || (me.isManager && u)) && (
              <div style={{ fontSize: 11, color: "#8593a8", marginTop: 4 }}>
                {me.isManager && u ? "Signé par " + u.prenom + (r.commentaire ? " · " : "") : ""}{r.commentaire || ""}
              </div>
            )}
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

/* ================= ARBITRAGE CLIENTS (par personne, style Gestion) ================= */
const ARB_STATUTS = ["", "RDV pris", "Signé", "KO", "À rappeler", "NRP"];
const ARB_OLD_MAP = { "": "", "rdv": "RDV pris", "signe": "Signé", "ko": "KO", "rappeler": "À rappeler", "nrp": "NRP" };
const arbRowCls = (s) => (s === "Signé" ? "paye" : s === "KO" ? "annule" : s === "RDV pris" ? "rdvb" : (s === "À rappeler" || s === "NRP") ? "attente" : "");

const arbNom = (s) => {
  let t = (s || "").trim().toUpperCase().replace(/\s+/g, " ");
  const m = /^(MME|MLLE|MELLE|MR|M\.|M)\s+/.exec(t);
  let civ = "", reste = t;
  if (m) { civ = /^(MME|MLLE|MELLE)/.test(m[1]) ? "MME" : "MR"; reste = t.slice(m[0].length); }
  return (civ ? civ + " " : "") + reste;
};

function ArbitragePage({ clients, saveClients, sales, saveSales, me }) {
  const [groups, setGroups] = useState(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    (async () => {
      let g = await sGet("crm-arbitrage");
      if (!g) {
        /* Migration unique depuis l'ancien Arbitrage de la Prospection */
        try {
          const r = await fetch("/api/arbitrage-export");
          const j = r.ok ? await r.json() : {};
          const conv = (rows) => (rows || []).map((x) => ({
            id: uid(), nom: x.nom || "", montant: String(x.montant ?? x.versement ?? ""),
            notes: x.notes || "", statut: ARB_OLD_MAP[x.statut || ""] || "À appeler",
          }));
          g = [
            { id: uid(), nom: "Bryan", rows: conv(j.liste1) },
            { id: uid(), nom: "Alexis", rows: conv(j.liste2) },
          ];
        } catch { g = [{ id: uid(), nom: "Bryan", rows: [] }, { id: uid(), nom: "Alexis", rows: [] }]; }
        await sSet("crm-arbitrage", g);
      }
      /* Import unique de la liste Théo (147 clients Optimum) */
      const theoFait = await sGet("crm-arb-theo-0907");
      if (!theoFait) {
        if (!g.find((x) => x.nom === "Théo")) g = [...g, { id: uid(), nom: "Théo", rows: THEO_IMPORT }];
        await sSet("crm-arbitrage", g);
        await sSet("crm-arb-theo-0907", true);
      }
      /* Uniformisation des noms (civilité + majuscules) — une seule fois */
      const uniOk = await sGet("crm-arb-uniform-1307");
      if (!uniOk) {
        g = g.map((gr) => ({ ...gr, rows: (gr.rows || []).map((r) => ({ ...r, nom: arbNom(r.nom) })) }));
        await sSet("crm-arbitrage", g);
        await sSet("crm-arb-uniform-1307", true);
      }
      setGroups(g);
    })();
  }, []);

  if (!groups) return <div style={{ color: "#8593a8" }}>Chargement…</div>;
  const save = (g) => { setGroups(g); sSet("crm-arbitrage", g); };
  const grp = groups[Math.min(tab, groups.length - 1)];
  const upRow = (rowId, field, value) => {
    save(groups.map((g, i) => i !== tab ? g : { ...g, rows: g.rows.map((r) => r.id === rowId ? { ...r, [field]: value } : r) }));
    if (field === "statut" && value === "Signé") {
      const r = grp.rows.find((x) => x.id === rowId);
      if (r && r.nom && confirm(`Créer la fiche client + la vente du mois pour ${r.nom} ?`)) signerArb({ ...r, statut: "Signé" });
    }
  };
  const signerArb = (r) => {
    const nrm = (s) => (s || "").toUpperCase().replace(/^(MME|MR|M\.|MLLE)\s+/, "").replace(/[^A-ZÀ-Ü0-9\- ]/g, "").replace(/\s+/g, " ").trim();
    const nomC = nrm(r.nom);
    let cid;
    const existant = clients.find((cl) => nrm(cl.nom) === nomC || nrm(cl.nom + " " + (cl.prenom || "")) === nomC);
    const contrat = { id: uid(), type: "PER", compagnie: "", numero: "", montant: "", frais: "", commentaire: `Arbitrage signé${r.montant ? " · " + r.montant + " €/mois" : ""}${r.notes ? " · " + r.notes : ""}`, dateSignature: todayISO(), datePrelevement: "", transfertInterne: "non", fraisTransfert: "non", fichiers: [] };
    if (existant) { cid = existant.id; saveClients(clients.map((cl) => cl.id === existant.id ? { ...cl, decom: false, contrats: [...(cl.contrats || []), contrat] } : cl)); }
    else { cid = uid(); saveClients([...clients, { id: cid, nom: nomC, prenom: "", civilite: /^MME/i.test(r.nom) ? "Mme" : /^(MR|M\.)/i.test(r.nom) ? "M." : "", dateNaissance: "", telephone: r.telephone || "", email: "", profession: "", revenus: "", situation: "Célibataire", createdBy: me.id, createdAt: todayISO(), contrats: [contrat], alertes: [] }]); }
    const mk = todayISO().slice(0, 7);
    const ns = { ...sales };
    if (!ns[mk]) ns[mk] = {};
    if (!ns[mk][me.id]) ns[mk][me.id] = { rows: [], nonPayes: "" };
    ns[mk][me.id] = { ...ns[mk][me.id], rows: [...ns[mk][me.id].rows, recalcRow({ ...emptyRow(), dateCreation: todayISO(), nom: r.nom.toUpperCase(), type: "PER", apporteur: "Arbitrage", versement: String(r.montant || ""), clientId: cid, commentaire: r.notes || "" }, "versement")] };
    saveSales(ns);
    alert("✅ Fiche client + vente du mois créées !");
  };
  const addRow = () => save(groups.map((g, i) => i !== tab ? g : { ...g, rows: [{ id: uid(), nom: "", telephone: "", montant: "", notes: "", statut: "" }, ...g.rows] }));
  const delRow = (rowId) => { if (confirm("Supprimer cette ligne ?")) save(groups.map((g, i) => i !== tab ? g : { ...g, rows: g.rows.filter((r) => r.id !== rowId) })); };
  const addGroup = () => { const nom = prompt("Nom du nouvel onglet (ex : Théo) :"); if (nom && nom.trim()) { save([...groups, { id: uid(), nom: nom.trim(), rows: [] }]); setTab(groups.length); } };
  const renameGroup = () => { const nom = prompt("Renommer cet onglet :", grp.nom); if (nom && nom.trim()) save(groups.map((g, i) => i === tab ? { ...g, nom: nom.trim() } : g)); };
  const delGroup = (i) => {
    const g = groups[i];
    if (groups.length <= 1) { alert("Impossible de supprimer le dernier onglet."); return; }
    if (!confirm(`Supprimer l'onglet « ${g.nom} » et ses ${g.rows.length} client(s) ?\n\nCette action est définitive.`)) return;
    save(groups.filter((_, k) => k !== i));
    setTab(0);
  };

  return (
    <div>
      <div className="ph">
        <div><h1>⚖️ Arbitrage clients</h1><div className="sub">Clients à arbitrer, par apporteur — double-clic sur l'onglet pour le renommer</div></div>
        <button className="btn gold" onClick={addRow}>+ Ajouter un client</button>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {groups.map((g, i) => (
          <div key={g.id} onClick={() => setTab(i)} onDoubleClick={() => i === tab && renameGroup()}
            style={{ padding: "9px 20px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "Georgia, serif", background: i === tab ? "#0B2545" : "#fff", color: i === tab ? "#C9A24B" : "#44536B", border: "1px solid " + (i === tab ? "#0B2545" : "#CDD6E2") }}>
            {g.nom} <span style={{ fontWeight: 400, fontSize: 11.5, opacity: .75 }}>· {g.rows.length}</span>
            {i === tab && <span onClick={(e) => { e.stopPropagation(); delGroup(i); }} title="Supprimer cet onglet" style={{ marginLeft: 8, color: "#E8B4B0", fontWeight: 400, fontSize: 13 }}>✕</span>}
          </div>
        ))}
        <div onClick={addGroup} style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, cursor: "pointer", color: "#8593a8", border: "1px dashed #CDD6E2" }}>+ Onglet</div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="t arb" style={{ width: "100%" }}>
          <thead><tr><th>Statut</th><th style={{ textAlign: "left" }}>Client</th><th>Téléphone</th><th>Montant €/mois</th><th style={{ textAlign: "left" }}>Notes</th><th></th></tr></thead>
          <tbody>
            {grp.rows.map((r) => (
              <tr key={r.id} className={arbRowCls(r.statut)}>
                <td style={{ width: 130 }}>
                  <select value={r.statut || ""} onChange={(e) => upRow(r.id, "statut", e.target.value)}>
                    {ARB_STATUTS.map((s) => <option key={s} value={s}>{s === "" ? "—" : s}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: "left" }}><input style={{ fontWeight: 700, color: "#0B2545", textTransform: "uppercase" }} value={r.nom} onChange={(e) => upRow(r.id, "nom", e.target.value)} onBlur={(e) => upRow(r.id, "nom", arbNom(e.target.value))} placeholder="MME NOM PRÉNOM" /></td>
                <td style={{ width: 115 }}><input value={r.telephone || ""} onChange={(e) => upRow(r.id, "telephone", e.target.value)} placeholder="06…" /></td>
                <td style={{ width: 110 }}><input value={r.montant} onChange={(e) => upRow(r.id, "montant", e.target.value)} placeholder="€" /></td>
                <td style={{ textAlign: "left" }}><input value={r.notes} onChange={(e) => upRow(r.id, "notes", e.target.value)} placeholder="Notes…" /></td>
                <td style={{ width: 36 }}><button onClick={() => delRow(r.id)} style={{ background: "none", border: "none", color: "#B3261E", cursor: "pointer" }}>✕</button></td>
              </tr>
            ))}
            {grp.rows.length === 0 && <tr><td colSpan={5} style={{ color: "#8593a8", padding: 20 }}>Aucun client dans cet onglet. Clique sur + Ajouter un client.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= MESSAGERIE (mails clients Gestion) ================= */
const MAIL_SENDERS = ["bryan.entibi@elyon-associes.fr", "bryan.entibi@vauban-associes.fr", "bryan.entibi@evka-conseil.fr"];
const MAIL_TEMPLATES = [
  {
    "nom": "PER professionnels de santé",
    "objet": "Optimisez votre retraite — Plan Épargne Retraite dédié aux professionnels de santé",
    "corps": "Bonjour,\n\nJe me permets de vous contacter en tant que conseiller en gestion de patrimoine spécialisé dans l'accompagnement des professionnels de santé libéraux.\n\nEn tant que [profession], vous êtes confronté(e) à une réalité souvent méconnue : votre pension de retraite sera significativement inférieure à votre revenu actuel d'activité. Le Plan Épargne Retraite (PER) est aujourd'hui la solution la plus efficace pour combler cet écart tout en réduisant votre pression fiscale dès maintenant.\n\n✅ Avantages concrets :\n• Déduction fiscale immédiate de vos versements (jusqu'à 10% de votre revenu professionnel)\n• Capital disponible à la retraite ou rente viagère\n• Transmission optimisée en cas de décès\n\nJe vous propose un bilan retraite personnalisé et gratuit, sans engagement, pour évaluer précisément votre situation.\n\nSeriez-vous disponible pour un échange de 20 minutes cette semaine ?\n\nCordialement,\nBryan Entibi\nConseiller en Gestion de Patrimoine\n"
  },
  {
    "nom": "Prévoyance TNS",
    "objet": "Protégez vos revenus en cas d’arrêt maladie — Prévoyance TNS",
    "corps": "Bonjour,\n\nJe me permets de vous adresser ce message en tant que conseiller spécialisé dans la protection des professionnels de santé indépendants.\n\nEn tant que libéral(e), un arrêt maladie ou une invalidité peut avoir des conséquences financières dramatiques sur votre activité et votre famille. Les indemnités journalières de la CARMF/CARPIMKO sont souvent insuffisantes pour maintenir votre niveau de vie.\n\n🛡️ Une prévoyance adaptée vous protège :\n• Maintien de revenus dès le 1er jour d'arrêt\n• Couverture invalidité totale ou partielle\n• Protection de votre cabinet et de vos charges fixes\n\nJe vous propose une analyse gratuite de votre couverture actuelle et un comparatif des meilleures solutions du marché.\n\nDisponible pour un échange cette semaine ?\n\nCordialement,\nBryan Entibi\nConseiller en Gestion de Patrimoine\n"
  },
  {
    "nom": "Audit patrimonial",
    "objet": "Bilan patrimonial offert — Optimisez votre fiscalité 2025",
    "corps": "Bonjour,\n\nJe me permets de prendre contact avec vous pour vous proposer un audit patrimonial complet et gratuit, sans engagement.\n\nEn tant que professionnel(le) libéral(e), vous avez probablement des opportunités d'optimisation fiscale et patrimoniale qui méritent d'être explorées :\n\n📊 Points abordés lors du bilan :\n• Optimisation de votre imposition (PER, PERP, Madelin...)\n• Analyse de votre protection sociale\n• Stratégie d'épargne et de placement\n• Transmission et protection de votre patrimoine\n\nCe bilan de 45 minutes est offert et sans aucun engagement de votre part.\n\nJe reste à votre disposition pour convenir d'un rendez-vous selon vos disponibilités.\n\nCordialement,\nBryan Entibi\nConseiller en Gestion de Patrimoine — Evka Conseil\n"
  },
  {
    "nom": "Relance",
    "objet": "Bilan annuel de votre contrat — Optimisations disponibles",
    "corps": "Bonjour,\n\nJe reviens vers vous dans le cadre du suivi annuel de votre contrat.\n\nL'année écoulée a vu d'importantes évolutions réglementaires et fiscales qui peuvent impacter positivement votre situation. Je souhaite vous proposer un point de 20 minutes pour :\n\n🔄 Points à aborder :\n• Bilan de performance de votre contrat\n• Optimisations possibles suite aux évolutions fiscales 2025\n• Arbitrages éventuels pour améliorer votre rendement\n• Nouvelles opportunités adaptées à votre profil\n\nSeriez-vous disponible prochainement pour cet échange ?\n\nDans l'attente de vous lire,\n\nCordialement,\nBryan Entibi\nConseiller en Gestion de Patrimoine\n"
  },
  {
    "nom": "Arbitrage",
    "objet": "Proposition d’arbitrage — Améliorez les performances de votre épargne",
    "corps": "Bonjour,\n\nSuite à notre dernier échange, je reviens vers vous concernant votre contrat en cours.\n\nAprès analyse, je suis en mesure de vous proposer une solution plus avantageuse permettant d'améliorer significativement les performances de votre épargne retraite tout en maintenant le même niveau de protection.\n\n⚖️ Ce que nous pouvons faire ensemble :\n• Arbitrage vers des supports plus performants\n• Révision des conditions contractuelles\n• Optimisation de la fiscalité à la sortie\n• Meilleure adéquation avec vos objectifs actuels\n\nPourriez-vous me confirmer vos disponibilités pour un rendez-vous téléphonique de 15 minutes ?\n\nCordialement,\nBryan Entibi\nConseiller en Gestion de Patrimoine — Evka Conseil / Vauban Associés\n"
  }
];

const MAIL_TEMPLATES_EXTRA = [
  { nom: "Point transferts PER", objet: "Vos anciens contrats retraite : faisons le point ensemble",
    corps: "Bonjour,\n\nDans le cadre du suivi de votre Plan d'Épargne Retraite, je souhaiterais que nous fassions un point ensemble sur vos anciens contrats retraite (PERP, Madelin, article 83, PER d'anciens employeurs...).\n\nRegrouper ces contrats sur votre PER actuel présente plusieurs avantages : une vision claire et centralisée de votre épargne retraite, une gestion simplifiée, et souvent de meilleures conditions de frais et de performance.\n\nJe vous propose un entretien téléphonique d'une quinzaine de minutes pour identifier ensemble les contrats concernés et étudier l'intérêt d'un regroupement dans votre situation.\n\nQuelles sont vos disponibilités dans les prochains jours ?\n\nBien cordialement,\nBryan Entibi\nConseiller en gestion de patrimoine" },
  { nom: "Point annuel dossiers", objet: "Votre point annuel : vérification de vos contrats et de votre situation",
    corps: "Bonjour,\n\nComme chaque année, je vous propose de réaliser ensemble le point annuel sur vos contrats et votre situation patrimoniale.\n\nCet entretien est important : il permet de vérifier que vos garanties sont toujours adaptées à votre situation (évolution professionnelle, familiale, projets...), de contrôler la bonne exécution de vos versements et, le cas échéant, d'optimiser vos dispositifs au regard des évolutions fiscales récentes.\n\nComptez une vingtaine de minutes, par téléphone ou en visio, selon votre préférence.\n\nJe vous laisse me proposer un créneau qui vous convient — je m'adapterai.\n\nBien cordialement,\nBryan Entibi\nConseiller en gestion de patrimoine" },
];

function MessageriePage({ clients, saveClients }) {
  const [relance, setRelance] = useState(false);
  const [sender, setSender] = useState(MAIL_SENDERS[0]);
  const [to, setTo] = useState("");
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [customTpls, setCustomTpls] = useState([]);
  const [picker, setPicker] = useState(false);
  const [pickSearch, setPickSearch] = useState("");
  const [picked, setPicked] = useState({});
  const avecEmail = clients.filter((c) => !c.decom && (c.email || "").includes("@"));

  useEffect(() => { (async () => { const t = await sGet("crm-mail-templates"); if (t) setCustomTpls(t); })(); }, []);
  const saveCustom = (t) => { setCustomTpls(t); sSet("crm-mail-templates", t); };
  const addTpl = () => {
    if (!objet.trim() && !corps.trim()) { alert("Écris d'abord l'objet et le message, puis clique + Modèle pour l'enregistrer."); return; }
    const nom = prompt("Nom de ce modèle :");
    if (nom && nom.trim()) saveCustom([...customTpls, { nom: nom.trim(), objet, corps }]);
  };
  const delTpl = (i) => { if (confirm("Supprimer ce modèle ?")) saveCustom(customTpls.filter((_, k) => k !== i)); };

  const addPicked = () => {
    const emails = Object.keys(picked).filter((id) => picked[id]).map((id) => (clients.find((c) => c.id === id) || {}).email).filter(Boolean);
    if (!emails.length) { alert("Coche au moins un client."); return; }
    const existants = to.split(/[,;\n]/).map((e) => e.trim()).filter(Boolean);
    setTo([...new Set([...existants, ...emails])].join(", "));
    setPicker(false); setPicked({});
  };
  const toutSelectionner = () => { const p = {}; avecEmail.forEach((c) => p[c.id] = true); setPicked(p); };

  const envoyer = () => {
    const emails = to.split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes("@"));
    if (!emails.length) { alert("Ajoute des destinataires (bouton Choisir des clients, ou à la main)."); return; }
    if (!objet.trim()) { alert("Ajoute un objet."); return; }
    const batch = emails.slice(0, 100), reste = emails.slice(100);
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(sender)}&bcc=${encodeURIComponent(batch.join(","))}&su=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
    try { navigator.clipboard.writeText(url); } catch {}
    window.open(url, "_blank");
    /* Journal d'envoi sur chaque fiche + rappel de relance optionnel */
    const dans1Mois = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const batchSet = new Set(batch.map((e2) => e2.toLowerCase()));
    saveClients(clients.map((cl) => {
      if (!cl.email || !batchSet.has(cl.email.toLowerCase())) return cl;
      const log = [{ date: todayISO(), objet: objet.slice(0, 60) }, ...(cl.mailLog || [])].slice(0, 5);
      const alertes = relance
        ? [...(cl.alertes || []), { id: uid(), type: "Relancer suite mail : " + objet.slice(0, 40), date: dans1Mois, done: false }]
        : cl.alertes;
      return { ...cl, mailLog: log, alertes };
    }));
    if (reste.length) setTo(reste.join(", "));
    alert(`✉️ ${batch.length} destinataires en Cci.\n\nSi Gmail s'ouvre sur le MAUVAIS compte : le lien est copié, colle-le (Cmd+V) dans la barre d'adresse du Chrome connecté à ${sender}.${reste.length ? "\n\nReste " + reste.length + " destinataires — reclique sur Envoyer." : ""}`);
  };

  const pickList = clients.filter((c) => !c.decom && ((c.nom + " " + (c.prenom || "")).toLowerCase().includes(pickSearch.toLowerCase()))).sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <div>
      <div className="ph"><div><h1>✉️ Messagerie</h1><div className="sub">{avecEmail.length} client(s) avec une adresse email · envoi groupé en Cci (invisibles entre eux)</div></div></div>
      <div className="card" style={{ maxWidth: 880 }}>
        <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#44536B", marginBottom: 4 }}>EXPÉDITEUR</div>
            <select className="sel" style={{ width: "100%" }} value={sender} onChange={(e) => setSender(e.target.value)}>
              {MAIL_SENDERS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn" onClick={() => setPicker(true)}>👥 Choisir des clients</button>
          <button className="btn" onClick={() => { setTo(""); setObjet(""); setCorps(""); }} style={{ color: "#B3261E", borderColor: "#B3261E" }}>🗑 Tout effacer</button>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#44536B", marginBottom: 4 }}>DESTINATAIRES (Cci) — modifiables à la main</div>
        <textarea className="in" style={{ width: "100%", minHeight: 64, marginBottom: 12, fontFamily: "inherit" }} value={to} onChange={(e) => setTo(e.target.value)} placeholder="email1@..., email2@... (tape librement ou utilise Choisir des clients)" />
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#44536B", marginBottom: 4 }}>MODÈLES</div>
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[...MAIL_TEMPLATES, ...MAIL_TEMPLATES_EXTRA].map((t) => (
            <button key={t.nom} className="btn" onClick={() => { setObjet(t.objet); setCorps(t.corps); }}>{t.nom}</button>
          ))}
          {customTpls.map((t, i) => (
            <span key={"c" + i} style={{ display: "inline-flex", alignItems: "center" }}>
              <button className="btn" style={{ borderColor: "#C9A24B" }} onClick={() => { setObjet(t.objet); setCorps(t.corps); }}>{t.nom}</button>
              <span onClick={() => delTpl(i)} style={{ cursor: "pointer", color: "#B3261E", marginLeft: 3, fontSize: 12 }}>✕</span>
            </span>
          ))}
          <button className="btn gold" onClick={addTpl}>+ Modèle</button>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#44536B", marginBottom: 4 }}>OBJET</div>
        <input className="in" style={{ width: "100%", marginBottom: 12 }} value={objet} onChange={(e) => setObjet(e.target.value)} />
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#44536B", marginBottom: 4 }}>MESSAGE</div>
        <textarea className="in" style={{ width: "100%", minHeight: 200, marginBottom: 14, fontFamily: "inherit", lineHeight: 1.6 }} value={corps} onChange={(e) => setCorps(e.target.value)} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={relance} onChange={(e) => setRelance(e.target.checked)} />
          Créer un rappel de relance à 1 mois pour chaque destinataire (visible dans 🔔 Rappels)
        </label>
        <button className="btn gold" style={{ width: "100%", padding: 13, fontSize: 15 }} onClick={envoyer}>✉️ Préparer l'envoi dans Gmail</button>
      </div>

      {picker && (
        <div className="overlay" onMouseDown={(e) => e.target.classList && e.target.classList.contains("overlay") && setPicker(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 560, maxWidth: "92vw", maxHeight: "82vh", display: "flex", flexDirection: "column" }}>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>👥 Choisir les destinataires</h2>
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <input className="in" style={{ flex: 1 }} placeholder="Rechercher un client…" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} />
              <button className="btn" onClick={toutSelectionner}>✓ Tous les clients ({avecEmail.length})</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, border: "1px solid #E3E9F1", borderRadius: 10, padding: 6 }}>
              {pickList.map((c) => {
                const has = (c.email || "").includes("@");
                return (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderBottom: "1px solid #edf1f6", cursor: has ? "pointer" : "default", opacity: has ? 1 : .45 }}>
                    <input type="checkbox" disabled={!has} checked={!!picked[c.id]} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.checked })} />
                    <b style={{ fontSize: 13 }}>{c.civilite ? c.civilite + " " : ""}{c.nom} {c.prenom}</b>
                    <span style={{ fontSize: 12, color: "#8593a8", marginLeft: "auto" }}>{has ? c.email : "pas d'email dans la fiche"}</span>
                  </label>
                );
              })}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn gold" style={{ flex: 1 }} onClick={addPicked}>Ajouter la sélection ({Object.values(picked).filter(Boolean).length})</button>
              <button className="btn" onClick={() => setPicker(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= QUESTIONNAIRE EIC / AUDIT PATRIMONIAL ================= */
const EIC_FIN_ROWS = ["Comptes Courants","Livret A / B, LDD","LEP","PEL, CEL","CSL","Livret Jeune","Comptes Titres","PEA","PEE / PEG disponible","Assurance Vie 1","Assurance Vie 2","Assurance Vie 3","PERP, Madelin, PERIN, PERCO","Trésorerie Entreprise","Autres"];
const EIC_OBJECTIFS = ["Protéger vos proches et vous-même","Valoriser votre patrimoine","Préparer l'avenir de vos enfants","Compléter votre retraite","Protéger son conjoint survivant","Organiser votre transmission · DMTG","Financer vos projets personnels (ex. RP)","Optimiser votre fiscalité · IRPP, IFI","Développer votre entreprise","Prévoyance / Dépendance"];
const EIC_CRITERES = ["Disponible à 100%","À 50%","À 20%","Souple en effort d'épargne","Fiscalement avantageux","Prudent","Simple en gestion"];
const eicEmpty = () => ({ biens: [{},{},{}], chargesImmo: [{},{}], autresCharges: [{},{}], fin: {}, objectifs: {}, criteres: {}, rdvs: [{},{},{}] });
const eicN = (v) => parseNum(v) || 0;

/* Liste Théo fournie par Bryan le 09/07/2026 — importée une seule fois */
const THEO_IMPORT = [{"id": "theo0", "nom": "MR. HADAD ENZO", "telephone": "0681381132", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo1", "nom": "MME LARCHER LINDA", "telephone": "0781974480", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo2", "nom": "MR PHILIPPON THOMAS", "telephone": "0690291101", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo3", "nom": "MR SIMOES PAREDES", "telephone": "0628374661", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo4", "nom": "MME NGUYEN CLEMENCE", "telephone": "0686546823", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo5", "nom": "MME MAROLLEAU JULIE", "telephone": "0772316379", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo6", "nom": "MME POURCIN ELODIE", "telephone": "0686436859", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo7", "nom": "MME HOUARD SANDIE", "telephone": "0661671263", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo8", "nom": "MME CARRERE DELPHINE", "telephone": "0667660154", "montant": "540", "notes": "", "statut": "À appeler"}, {"id": "theo9", "nom": "MME CARIOU FANNY", "telephone": "0680548608", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo10", "nom": "MR COTAYA VINCENT", "telephone": "0769580736", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo11", "nom": "MR ZEDOUARD THIERRY", "telephone": "0690997940", "montant": "650", "notes": "", "statut": "À appeler"}, {"id": "theo12", "nom": "MME GRATADOUR LOUISE", "telephone": "0665089297", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo13", "nom": "MME BENEDETTI NATHALIE", "telephone": "0684153384", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo14", "nom": "MME GABOURD EMMANUELLE", "telephone": "0776634429", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo15", "nom": "MR DURILLON ROMAIN", "telephone": "0652235621", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo16", "nom": "MR ESSID AMAD", "telephone": "0681274160", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo17", "nom": "MME FRIOB MARINE", "telephone": "0693008960", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo18", "nom": "MME OUTREQUIN MARION", "telephone": "0614903754", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo19", "nom": "MR COLOMBO CEDRIC", "telephone": "0690420130", "montant": "2000", "notes": "", "statut": "À appeler"}, {"id": "theo20", "nom": "MME PANNIER MARION", "telephone": "0631962960", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo21", "nom": "MME SCHIRATO CHRISTELLE", "telephone": "0622347354", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo22", "nom": "MME LEDARATH CATHY", "telephone": "0634185647", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo23", "nom": "MME HUMBERT SANDRINE", "telephone": "0671576042", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo24", "nom": "MME SOLDE NELLY", "telephone": "0662726643", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo25", "nom": "MME MANCEAU MARJORIE", "telephone": "0679394170", "montant": "150", "notes": "MMA", "statut": "À appeler"}, {"id": "theo26", "nom": "MME NAUDET MAHINC JENNIFER", "telephone": "0645403984", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo27", "nom": "MME WEISS LOUANA", "telephone": "0611310161", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo28", "nom": "MME PADOU LAURINE", "telephone": "0611753297", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo29", "nom": "MME LATRONCHE LAETITIA", "telephone": "0767956364", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo30", "nom": "MME DRUAIS LESLIE", "telephone": "0635536238", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo31", "nom": "MME MAUNIER FREDERIQUE", "telephone": "0686273121", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo32", "nom": "MME LA ROCCA ELSA", "telephone": "0685687512", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo33", "nom": "MME POLETTI LUCIE", "telephone": "0631249010", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo34", "nom": "MME MEUROU MORGANE", "telephone": "0760420626", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo35", "nom": "MME COMBARET FLORENCE", "telephone": "0661128847", "montant": "400", "notes": "", "statut": "À appeler"}, {"id": "theo36", "nom": "MME PIGANEAU FLORENCE", "telephone": "0680521612", "montant": "400", "notes": "", "statut": "À appeler"}, {"id": "theo37", "nom": "MME TRAN GABRIELLE", "telephone": "0695292818", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo38", "nom": "MME VIDAL MELANIE", "telephone": "0670340610", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo39", "nom": "MME JOMIN PAULINE", "telephone": "0617066488", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo40", "nom": "MME CAMPTON ANNE", "telephone": "0690524470", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo41", "nom": "MME NOIROT CAROLE", "telephone": "0766791377", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo42", "nom": "MME MAGNE JOSEPHINE", "telephone": "0783423752", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo43", "nom": "MME HUGUENOT JULIETTE", "telephone": "0660530402", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo44", "nom": "MME CAMPAGNE JUSTINE", "telephone": "0601449682", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo45", "nom": "MME PRUVOST FABIENNE", "telephone": "0670055018", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo46", "nom": "MME BURGOT EMILIE", "telephone": "0650087292", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo47", "nom": "MME TRAN CHAU STEPHANIE", "telephone": "0662658737", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo48", "nom": "MME KERAD IBITSEM", "telephone": "0781417206", "montant": "272", "notes": "", "statut": "À appeler"}, {"id": "theo49", "nom": "MME DYON LAURE HELENE", "telephone": "0745156334", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo50", "nom": "MR NICOLO AXEL", "telephone": "0690989615", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo51", "nom": "MME OLIER FANNY", "telephone": "0679312903", "montant": "350", "notes": "", "statut": "À appeler"}, {"id": "theo52", "nom": "MME MELECK SANDRINE", "telephone": "0613136289", "montant": "350", "notes": "", "statut": "À appeler"}, {"id": "theo53", "nom": "MME LAUGAUDIN SANDRINE", "telephone": "0681146243", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo54", "nom": "MME DEVIN ANNE LAURE", "telephone": "0783054696", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo55", "nom": "MME DERIGON EMILIE", "telephone": "0693557082", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo56", "nom": "MR RENAUX JEREMY", "telephone": "0627123549", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo57", "nom": "MME CABANNE EMILIE", "telephone": "0601986967", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo58", "nom": "MME MEYER AUDREY", "telephone": "0650810495", "montant": "350", "notes": "", "statut": "À appeler"}, {"id": "theo59", "nom": "MR THOMAS IDRISS", "telephone": "0692571214", "montant": "400", "notes": "", "statut": "À appeler"}, {"id": "theo60", "nom": "MR MELSE DARYL", "telephone": "0690416861", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo61", "nom": "MME MENARD ISABELLE", "telephone": "0614760625", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo62", "nom": "MME FERNADES MARIE", "telephone": "0626068889", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo63", "nom": "MME ALVES LOUANA", "telephone": "0695982367", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo64", "nom": "MME TROTIGNON LAURE", "telephone": "0686036751", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo65", "nom": "MME NOTIN CLEMENTINE", "telephone": "0628523641", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo66", "nom": "MME SALIM JOHANNA", "telephone": "0671812779", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo67", "nom": "MME THOBERT LEA", "telephone": "0629190274", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo68", "nom": "MME TOMASSETTI FLORENCE", "telephone": "0686965645", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo69", "nom": "MR DECODTS FLORENTS", "telephone": "0644315529", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo70", "nom": "MR CHARVOZ FRANCK", "telephone": "0783672819", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo71", "nom": "MME DELBREL LEA", "telephone": "0624300135", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo72", "nom": "MME BOSSU ANNE CELINE", "telephone": "0695909075", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo73", "nom": "MME CATTEAUX LAURIE", "telephone": "0693932963", "montant": "400", "notes": "", "statut": "À appeler"}, {"id": "theo74", "nom": "MME LOPEZ LAURA", "telephone": "0780972112", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo75", "nom": "MME PROISSY AUDE", "telephone": "0658710895", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo76", "nom": "MME BOURGUES JULIE", "telephone": "0687102747", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo77", "nom": "MR DESAGNAT THEO", "telephone": "0674281665", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo78", "nom": "MME RIBOT MATHILDE", "telephone": "0673847941", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo79", "nom": "MME COURTIN CINDY", "telephone": "0682684502", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo80", "nom": "MME BEAUVAIS LISA", "telephone": "0675110430", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo81", "nom": "MME GREGOIRE GAETANE", "telephone": "0686368855", "montant": "600", "notes": "", "statut": "À appeler"}, {"id": "theo82", "nom": "MR LATASSA EDDY", "telephone": "0622393297", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo83", "nom": "MME ROUSSEL VALERIE", "telephone": "0683682001", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo84", "nom": "MR GRAVELAIS SYLVAIN", "telephone": "0646454010", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo85", "nom": "MME TRAVERSA JUSTINE", "telephone": "0770107415", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo86", "nom": "MR DE LA CRUZ NICOLAS", "telephone": "0650436834", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo87", "nom": "MME ROICHOMME AURELIE", "telephone": "0659610784", "montant": "350", "notes": "", "statut": "À appeler"}, {"id": "theo88", "nom": "MME ESTOPPEY PAULINE", "telephone": "0686409046", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo89", "nom": "MME JUCLA VERONIQUE", "telephone": "0670599803", "montant": "1000", "notes": "", "statut": "À appeler"}, {"id": "theo90", "nom": "MME SIMONNET PASCALE", "telephone": "0622271017", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo91", "nom": "MME MOULIN CHRISTELLE", "telephone": "0696840820", "montant": "700", "notes": "", "statut": "À appeler"}, {"id": "theo92", "nom": "MME RICHARD FLORIANE", "telephone": "0627684827", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo93", "nom": "MME FRACHISSE ELIZABETH", "telephone": "0763419597", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo94", "nom": "MME SEIGNE EVA", "telephone": "0627516226", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo95", "nom": "MME PUTNOKI CHANTALE", "telephone": "0694413942", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo96", "nom": "MME LASSAGNE EMMANUELLE", "telephone": "0603211948", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo97", "nom": "MME PENNEQUIN ISOLDE", "telephone": "0699487011", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo98", "nom": "MME SEITH NATALIA", "telephone": "0620112908", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo99", "nom": "MME LIOGER SANDRINE", "telephone": "0671933302", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo100", "nom": "MR MAHIEU PIERRE JEAN", "telephone": "0761602694", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo101", "nom": "MME RIMLINGER CELINE", "telephone": "0682854414", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo102", "nom": "MR DUGUE CEDRIC", "telephone": "0782942588", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo103", "nom": "MME LISANT MARIE", "telephone": "0673867066", "montant": "800", "notes": "", "statut": "À appeler"}, {"id": "theo104", "nom": "MME JABET MICHET DE VARINE MAILYS", "telephone": "0680475067", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo105", "nom": "MME PESHEUX SOPHIE", "telephone": "0666390904", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo106", "nom": "MME RICHARD JULIA", "telephone": "0608366502", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo107", "nom": "MME MAGNAUDET JENNIFER", "telephone": "0674209608", "montant": "350", "notes": "", "statut": "À appeler"}, {"id": "theo108", "nom": "MME LAVALEE YOLAINE", "telephone": "0687862796", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo109", "nom": "MME LE DU OPHELIE", "telephone": "0780988095", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo110", "nom": "MME PASQUET CONSTANCE", "telephone": "0648536568", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo111", "nom": "MR VARANATH WILSON", "telephone": "068716729", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo112", "nom": "MME BONNEAU AUDREY", "telephone": "0646890242", "montant": "400", "notes": "", "statut": "À appeler"}, {"id": "theo113", "nom": "MME TRAVENTHAL SYLVIE", "telephone": "0690564064", "montant": "700", "notes": "", "statut": "À appeler"}, {"id": "theo114", "nom": "MR JAMMET JEROME", "telephone": "0680959671", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo115", "nom": "MME MERIAU LAURIE", "telephone": "0648687661", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo116", "nom": "MR SAIVE OLIVIER", "telephone": "0694126231", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo117", "nom": "MME MALVY MORGANE", "telephone": "0789065764", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo118", "nom": "MME PAGNIER LEA-ALAIS", "telephone": "0761700058", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo119", "nom": "MME LASSAIGNE NINA", "telephone": "0643477133", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo120", "nom": "MME ESPINAR LAURE", "telephone": "0646429289", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo121", "nom": "MME LLENAS JULIET", "telephone": "0612686981", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo122", "nom": "MR AMEYE PAUL", "telephone": "0769443789", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo123", "nom": "MMR BIDET MELISSA", "telephone": "0765724208", "montant": "400", "notes": "", "statut": "À appeler"}, {"id": "theo124", "nom": "MME SLINKMAN CORINNE", "telephone": "0632748023", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo125", "nom": "MR GIVODAN ADRIEN", "telephone": "0757184195", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo126", "nom": "MME COURILLAUD ALEXANE", "telephone": "0673980487", "montant": "400", "notes": "", "statut": "À appeler"}, {"id": "theo127", "nom": "MR SOUSSI RAMI", "telephone": "0612090435", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo128", "nom": "MME MAZINGUE EVE", "telephone": "0679901441", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo129", "nom": "MR DUCHEMIN LEO", "telephone": "0692252756", "montant": "600", "notes": "", "statut": "À appeler"}, {"id": "theo130", "nom": "MME BILLA CORALIE", "telephone": "0617535649", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo131", "nom": "MME LOUIS ALEXANDRE COLINE", "telephone": "0696012413", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo132", "nom": "MME BUOSI LINA", "telephone": "0649262316", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo133", "nom": "MME MASSIAS CONDURSI LISE", "telephone": "0698929778", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo134", "nom": "MME PIGHETTI CLEMENTINE", "telephone": "0695182837", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo135", "nom": "MME LALANNE DELPHINE", "telephone": "0744505822", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo136", "nom": "MME DEVERSON ADRIANE", "telephone": "0670538447", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo137", "nom": "MR DUPONT JOLAN", "telephone": "0693878278", "montant": "800", "notes": "", "statut": "À appeler"}, {"id": "theo138", "nom": "MR BAULES PAUL", "telephone": "0765777381", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo139", "nom": "MME CHEREL ELONA", "telephone": "0783570738", "montant": "200", "notes": "", "statut": "À appeler"}, {"id": "theo140", "nom": "MME PRUNIER CLAIRE", "telephone": "0677466562", "montant": "500", "notes": "", "statut": "À appeler"}, {"id": "theo141", "nom": "MME AURIN PATRICIA", "telephone": "0621229234", "montant": "150", "notes": "", "statut": "À appeler"}, {"id": "theo142", "nom": "MR LOPEZ DIDIER", "telephone": "0619557592", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo143", "nom": "MME VILLAROYA EMMA", "telephone": "0626665557", "montant": "300", "notes": "", "statut": "À appeler"}, {"id": "theo144", "nom": "MME SERTILLANGES NADEGE", "telephone": "0677618971", "montant": "100", "notes": "", "statut": "À appeler"}, {"id": "theo145", "nom": "MME NASCOULERGUE MELINE", "telephone": "0608693732", "montant": "250", "notes": "", "statut": "À appeler"}, {"id": "theo146", "nom": "MME DE ROUET MELANIE", "telephone": "0638894929", "montant": "100", "notes": "", "statut": "À appeler"}];

function EicField({ label, value, onChange, type = "text", options, wide }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#5b6b82", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 3 }}>{label}</div>
      {type === "select" ? (
        <select className="sel" style={{ width: "100%" }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea className="in" style={{ width: "100%", minHeight: 60, fontFamily: "inherit" }} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="in" style={{ width: "100%" }} type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function EicSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ background: "#0B2545", color: "#fff", padding: "8px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", borderRadius: "8px 8px 0 0", borderRight: "4px solid #C9A24B" }}>{title}</div>
      <div style={{ border: "1px solid #E3E9F1", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 16, background: "#fff" }}>{children}</div>
    </div>
  );
}

function EicPersonne({ titre, p, set }) {
  return (
    <div style={{ flex: 1, minWidth: 300 }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 700, color: "#0B2545", marginBottom: 10, textAlign: "center", letterSpacing: "2px" }}>{titre}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <EicField label="Nom, Prénom" value={p.nom} onChange={(v) => set("nom", v)} wide />
        <EicField label="Date de naissance" type="date" value={p.naissance} onChange={(v) => set("naissance", v)} />
        <EicField label="ADA" type="select" options={["Oui", "Non"]} value={p.ada} onChange={(v) => set("ada", v)} />
        <EicField label="Tél fixe / Port" value={p.tel} onChange={(v) => set("tel", v)} />
        <EicField label="E-mail" value={p.email} onChange={(v) => set("email", v)} />
        <EicField label="Nationalité" value={p.nationalite} onChange={(v) => set("nationalite", v)} />
        <EicField label="Nbre de frères et sœurs" value={p.freres} onChange={(v) => set("freres", v)} />
        <EicField label="Patrimoine des parents (K€)" value={p.patParents} onChange={(v) => set("patParents", v)} />
        <EicField label="Âge des parents" value={p.ageParents} onChange={(v) => set("ageParents", v)} />
      </div>
    </div>
  );
}

function EicRevenus({ titre, p, set }) {
  return (
    <div style={{ flex: 1, minWidth: 300 }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700, color: "#0B2545", marginBottom: 10, textAlign: "center", letterSpacing: "2px" }}>{titre}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <EicField label="Profession" value={p.profession} onChange={(v) => set("profession", v)} />
        <EicField label="Statut (salarié / BIC / BNC)" type="select" options={["Salarié", "BIC", "BNC", "TNS", "Autre"]} value={p.statut} onChange={(v) => set("statut", v)} />
        <EicField label="Nom de la société" value={p.societe} onChange={(v) => set("societe", v)} />
        <EicField label="Date d'entrée" type="date" value={p.dateEntree} onChange={(v) => set("dateEntree", v)} />
        <EicField label="Total PEE ou PEG (€)" value={p.pee} onChange={(v) => set("pee", v)} />
        <EicField label="Revenus annuels nets (€)" value={p.revenus} onChange={(v) => set("revenus", v)} />
        <EicField label="Revenu foncier / BIC (€)" value={p.foncier} onChange={(v) => set("foncier", v)} />
        <EicField label="Micro / Réel" type="select" options={["Micro", "Réel"]} value={p.microReel} onChange={(v) => set("microReel", v)} />
        <EicField label="Autres revenus annuels (€)" value={p.autres} onChange={(v) => set("autres", v)} />
        <EicField label="Évolutions prévisibles N+1, N+2" value={p.evolutions} onChange={(v) => set("evolutions", v)} />
      </div>
    </div>
  );
}

function EicTable({ cols, rows, onChange, onAdd }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="t" style={{ width: "100%" }}>
        <thead><tr>{cols.map((col) => <th key={col.k}>{col.l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((col) => <td key={col.k}><input value={r[col.k] || ""} onChange={(e) => onChange(i, col.k, e.target.value)} /></td>)}</tr>
          ))}
        </tbody>
      </table>
      {onAdd && <button className="btn sm" style={{ marginTop: 8 }} onClick={onAdd}>+ Ligne</button>}
    </div>
  );
}

function EicForm({ client, onSave, onClose }) {
  const [f, setF] = useState(() => ({ ...eicEmpty(), m: {}, mme: {}, revM: {}, revMme: {}, ...(client.eic || {}) }));
  const s = (k, v) => setF({ ...f, [k]: v });
  const sp = (grp, k, v) => setF({ ...f, [grp]: { ...(f[grp] || {}), [k]: v } });
  const sRow = (arrKey) => (i, k, v) => { const a = [...(f[arrKey] || [])]; a[i] = { ...a[i], [k]: v }; setF({ ...f, [arrKey]: a }); };
  const addRow = (arrKey) => () => setF({ ...f, [arrKey]: [...(f[arrKey] || []), {}] });
  const sFin = (row, k, v) => setF({ ...f, fin: { ...f.fin, [row]: { ...(f.fin[row] || {}), [k]: v } } });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,37,69,.55)", zIndex: 998, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 12px" }}>
      <div style={{ background: "#F5F7FA", borderRadius: 16, padding: 26, width: 980, maxWidth: "96vw" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>Audit Patrimonial — EIC</h1>
            <div className="sub">{client.civilite} {client.nom} {client.prenom} · toutes les questions du questionnaire officiel</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn gold" onClick={() => { onSave(f); }}>💾 Sauvegarder</button>
            <button className="btn" style={{ color: "#B3261E", borderColor: "#B3261E" }} onClick={() => { if (confirm("Vider tout le questionnaire ? (rien n'est enregistré tant que tu ne sauvegardes pas)")) setF({ ...eicEmpty(), m: {}, mme: {}, revM: {}, revMme: {} }); }}>🗑 Vider</button>
            <button className="btn" onClick={onClose}>Fermer</button>
          </div>
        </div>

        <EicSection title="État civil et situation familiale">
          <div className="row" style={{ gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <EicPersonne titre="MONSIEUR" p={f.m || {}} set={(k, v) => sp("m", k, v)} />
            <EicPersonne titre="MADAME" p={f.mme || {}} set={(k, v) => sp("mme", k, v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginTop: 16 }}>
            <EicField label="Adresse" value={f.adresse} onChange={(v) => s("adresse", v)} />
            <EicField label="Code postal" value={f.cp} onChange={(v) => s("cp", v)} />
            <EicField label="Ville" value={f.ville} onChange={(v) => s("ville", v)} />
            <EicField label="Situation familiale" type="select" options={["Marié", "Divorcé", "Pacs", "Concubin", "Veuf", "Célibataire"]} value={f.situation} onChange={(v) => s("situation", v)} />
            <EicField label="Date de mariage" type="date" value={f.dateMariage} onChange={(v) => s("dateMariage", v)} />
            <EicField label="Régime matrimonial" type="select" options={["SB", "CBRA", "CU", "PA"]} value={f.regime} onChange={(v) => s("regime", v)} />
            <EicField label="Convention Mat." type="select" options={["Oui", "Non"]} value={f.convention} onChange={(v) => s("convention", v)} />
            <EicField label="DDV" type="select" options={["Oui", "Non"]} value={f.ddv} onChange={(v) => s("ddv", v)} />
            <EicField label="Notaire" value={f.notaire} onChange={(v) => s("notaire", v)} />
            <EicField label="Nbre d'enfants à N, N+1, N+2" value={f.enfants} onChange={(v) => s("enfants", v)} />
            <EicField label="Nbre de petits-enfants" value={f.petitsEnfants} onChange={(v) => s("petitsEnfants", v)} />
            <EicField label="Donation" type="select" options={["Aucune", "Donation simple", "Donation partage", "Les deux"]} value={f.donation} onChange={(v) => s("donation", v)} />
            <EicField label="Succession à venir (K€)" value={f.succession} onChange={(v) => s("succession", v)} />
            <EicField label="Nombre de parts fiscales (N / N+1 / N+3)" value={f.partsFiscales} onChange={(v) => s("partsFiscales", v)} />
          </div>
        </EicSection>

        <EicSection title="Revenus">
          <div className="row" style={{ gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <EicRevenus titre="MONSIEUR" p={f.revM || {}} set={(k, v) => sp("revM", k, v)} />
            <EicRevenus titre="MADAME" p={f.revMme || {}} set={(k, v) => sp("revMme", k, v)} />
          </div>
        </EicSection>

        <EicSection title="Prévoyance">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <EicField label="Compagnie" value={f.prevCompagnie} onChange={(v) => s("prevCompagnie", v)} />
            <EicField label="Garanties" value={f.prevGaranties} onChange={(v) => s("prevGaranties", v)} />
            <EicField label="Mensualité (€)" value={f.prevMensualite} onChange={(v) => s("prevMensualite", v)} />
          </div>
        </EicSection>

        <EicSection title="Imposition">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <EicField label="Monsieur — Déduction" type="select" options={["Déduction 10%", "Frais réels", "CGA"]} value={f.dedM} onChange={(v) => s("dedM", v)} />
            <EicField label="Madame — Déduction" type="select" options={["Déduction 10%", "Frais réels", "CGA"]} value={f.dedMme} onChange={(v) => s("dedMme", v)} />
            <EicField label="Revenu Brut Global (€)" value={f.rbg} onChange={(v) => s("rbg", v)} />
            <EicField label="Résultat foncier (€)" value={f.resFoncier} onChange={(v) => s("resFoncier", v)} />
            <EicField label="Déductions (€)" value={f.deductions} onChange={(v) => s("deductions", v)} />
            <EicField label="Revenu imposable (€)" value={f.revImposable} onChange={(v) => s("revImposable", v)} />
            <EicField label="TMI (%)" type="select" options={["0", "11", "30", "41", "45"]} value={f.tmi} onChange={(v) => s("tmi", v)} />
            <EicField label="Revenus fonciers positifs (€)" value={f.rfPositifs} onChange={(v) => s("rfPositifs", v)} />
            <EicField label="Déficit (€)" value={f.deficit} onChange={(v) => s("deficit", v)} />
            <EicField label="Impôt brut (€)" value={f.impotBrut} onChange={(v) => s("impotBrut", v)} />
            <EicField label="Réductions ou crédit d'impôt (€)" value={f.reductions} onChange={(v) => s("reductions", v)} />
            <EicField label="Impôt net à payer (€)" value={f.impotNet} onChange={(v) => s("impotNet", v)} />
            <EicField label="IFI (€)" value={f.ifi} onChange={(v) => s("ifi", v)} />
            <EicField label="A cherché à agir sur sa fiscalité ?" type="select" options={["Oui", "Non"]} value={f.agiFisc} onChange={(v) => s("agiFisc", v)} />
            <EicField label="Si oui, de quelle manière ?" value={f.agiComment} onChange={(v) => s("agiComment", v)} />
          </div>
        </EicSection>

        <EicSection title="Patrimoine immobilier">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <EicField label="Résidence principale" type="select" options={["Propriétaire", "Locataire", "Hébergé à titre gracieux"]} value={f.rpStatut} onChange={(v) => s("rpStatut", v)} />
            <EicField label="Loyer mensuel (€)" value={f.loyer} onChange={(v) => s("loyer", v)} />
          </div>
          <EicTable cols={[{k:"nature",l:"Nature (RP, RS, Locatif)"},{k:"dateAcq",l:"Date d'acquisition"},{k:"valAcq",l:"Valeur d'acquisition"},{k:"valActuelle",l:"Valeur actuelle"},{k:"detention",l:"PP / NP / US"},{k:"revLocatifs",l:"Revenus locatifs"},{k:"sci",l:"SCI IS / IR"}]}
            rows={f.biens || []} onChange={sRow("biens")} onAdd={addRow("biens")} />
          <div style={{ marginTop: 12 }}><EicField label="Projet immobilier à venir ?" type="textarea" value={f.projetImmo} onChange={(v) => s("projetImmo", v)} /></div>
        </EicSection>

        <EicSection title="Charges immobilières">
          <EicTable cols={[{k:"nature",l:"Nature (amortissable/in fine)"},{k:"etab",l:"Établissement"},{k:"montant",l:"Montant initial"},{k:"debut",l:"Date début"},{k:"fin",l:"Date fin"},{k:"crd",l:"CRD · Taux %"},{k:"mens",l:"Charges mensuelles"}]}
            rows={f.chargesImmo || []} onChange={sRow("chargesImmo")} onAdd={addRow("chargesImmo")} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <EicField label="Délégation assurance" type="select" options={["Oui", "Non"]} value={f.delegAssurance} onChange={(v) => s("delegAssurance", v)} />
            <EicField label="Taux d'endettement (%)" value={f.tauxEndettement} onChange={(v) => s("tauxEndettement", v)} />
          </div>
        </EicSection>

        <EicSection title="Autres charges · Crédit conso · Leasing">
          <EicTable cols={[{k:"nature",l:"Nature"},{k:"etab",l:"Établissement"},{k:"montant",l:"Montant initial"},{k:"debut",l:"Date début"},{k:"fin",l:"Date fin"},{k:"mens",l:"Charges mensuelles"}]}
            rows={f.autresCharges || []} onChange={sRow("autresCharges")} onAdd={addRow("autresCharges")} />
        </EicSection>

        <EicSection title="Patrimoine financier">
          <div style={{ overflowX: "auto" }}>
            <table className="t" style={{ width: "100%" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Support</th><th>Monsieur (€)</th><th>Madame (€)</th><th>Versement mensuel (€)</th><th>Date ouverture / versements</th><th>Établissement (% € / % UC)</th><th>Objectifs / Clause bénéf.</th></tr></thead>
              <tbody>
                {EIC_FIN_ROWS.map((row) => {
                  const r = f.fin[row] || {};
                  return (
                    <tr key={row}>
                      <td style={{ textAlign: "left", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{row}</td>
                      {["m","f","vers","dates","etab","obj"].map((k) => <td key={k}><input value={r[k] || ""} onChange={(e) => sFin(row, k, e.target.value)} /></td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}><EicField label="Patrimoine en attente (cap. décès · héritages)" value={f.patAttente} onChange={(v) => s("patAttente", v)} /></div>
        </EicSection>

        <EicSection title="Objectifs (par niveau de priorité 1, 2, 3)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {EIC_OBJECTIFS.map((o) => (
              <div key={o} className="row" style={{ gap: 8, alignItems: "center" }}>
                <select className="sel" style={{ width: 64 }} value={f.objectifs[o] || ""} onChange={(e) => setF({ ...f, objectifs: { ...f.objectifs, [o]: e.target.value } })}>
                  <option value="">—</option><option>1</option><option>2</option><option>3</option>
                </select>
                <span style={{ fontSize: 13 }}>{o}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}><EicField label="Horizon de temps" value={f.horizon} onChange={(v) => s("horizon", v)} /></div>
        </EicSection>

        <EicSection title="Moyens et critères de solution idéale">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            <EicField label="Moyens en épargne (€/mois)" value={f.moyensEpargne} onChange={(v) => s("moyensEpargne", v)} />
            <EicField label="Dont partie souple (€)" value={f.partieSouple} onChange={(v) => s("partieSouple", v)} />
            <EicField label="% du revenu en épargne" type="select" options={["10%", "15%", "20%"]} value={f.pctEpargne} onChange={(v) => s("pctEpargne", v)} />
            <EicField label="Moyens en capital (€)" value={f.moyensCapital} onChange={(v) => s("moyensCapital", v)} />
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {EIC_CRITERES.map((cr) => (
              <label key={cr} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!!f.criteres[cr]} onChange={(e) => setF({ ...f, criteres: { ...f.criteres, [cr]: e.target.checked } })} /> {cr}
              </label>
            ))}
          </div>
        </EicSection>

        <EicSection title="Profil investisseur">
          <EicField label="Stratégie (sur tout le patrimoine financier, SCPI comprises)" type="select"
            options={["Prudente (max 40% risqué · 60% SRRI 1 à 3)", "Équilibrée (max 70% risqué · 30% SRRI 1 à 3)", "Dynamique (max 100% risqué · 0% SRRI 1 à 3)"]}
            value={f.profil} onChange={(v) => s("profil", v)} />
        </EicSection>

        <EicSection title="Chronologie des rendez-vous">
          <EicTable cols={[{k:"theme",l:"Thème"},{k:"objectif",l:"Objectifs"},{k:"date",l:"Date"}]} rows={f.rdvs || []} onChange={sRow("rdvs")} onAdd={addRow("rdvs")} />
        </EicSection>

        <EicSection title="Synthèse de rendez-vous et notes">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <EicField label="Objectifs (synthèse)" value={f.synObjectifs} onChange={(v) => s("synObjectifs", v)} wide />
            <EicField label="Critères de solution (synthèse)" value={f.synCriteres} onChange={(v) => s("synCriteres", v)} wide />
            <EicField label="Notes" type="textarea" value={f.notes} onChange={(v) => s("notes", v)} wide />
          </div>
        </EicSection>

        <div className="row" style={{ gap: 8, position: "sticky", bottom: 0, background: "#F5F7FA", padding: "12px 0" }}>
          <button className="btn gold" style={{ flex: 1, padding: 13, fontSize: 15 }} onClick={() => { onSave(f); }}>💾 Sauvegarder le questionnaire</button>
          <button className="btn" onClick={onClose}>Fermer sans sauvegarder</button>
        </div>
      </div>
    </div>
  );
}

/* ===== Synthèse intelligente affichée sur la fiche ===== */
function EicSynthese({ client, onOpen, onPdf, onDelete }) {
  const f = client.eic;
  if (!f || !Object.keys(f).length) return (
    <div className="card" style={{ borderLeft: "4px solid #C9A24B", marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><b>📋 Questionnaire EIC / Audit patrimonial</b><div style={{ fontSize: 12.5, color: "#8593a8" }}>Pas encore rempli pour ce client — obligatoire.</div></div>
        <button className="btn gold" onClick={onOpen}>Remplir l'EIC</button>
      </div>
    </div>
  );
  const finTotal = EIC_FIN_ROWS.reduce((t, r) => t + eicN((f.fin[r] || {}).m) + eicN((f.fin[r] || {}).f), 0);
  const revTotal = eicN((f.revM || {}).revenus) + eicN((f.revMme || {}).revenus) + eicN((f.revM || {}).autres) + eicN((f.revMme || {}).autres);
  const immoTotal = (f.biens || []).reduce((t, b) => t + eicN(b.valActuelle), 0);
  const nbBiens = (f.biens || []).filter((b) => b.nature || b.valActuelle).length;
  const objPrio = EIC_OBJECTIFS.filter((o) => f.objectifs && f.objectifs[o] === "1");
  const livrets = ["Livret A / B, LDD", "LEP", "CSL", "Livret Jeune"].reduce((t, r) => t + eicN((f.fin[r] || {}).m) + eicN((f.fin[r] || {}).f), 0);
  const K = ({ v, l }) => <div style={{ textAlign: "center", padding: "8px 4px" }}><div style={{ fontFamily: "Georgia, serif", fontSize: 19, fontWeight: 700, color: "#0B2545" }}>{v}</div><div style={{ fontSize: 10, color: "#8593a8", textTransform: "uppercase", letterSpacing: ".4px" }}>{l}</div></div>;
  return (
    <div className="card" style={{ borderLeft: "4px solid #C9A24B", marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <b>📋 Synthèse patrimoniale (EIC{f && client.eicDate ? " · " + fmtDate(client.eicDate) : ""})</b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onOpen}>✏️ Modifier</button>
          <button className="btn gold sm" onClick={onPdf}>📄 Générer le PDF</button>
          <button className="btn sm" style={{ color: "#B3261E", borderColor: "#B3261E" }} onClick={onDelete} title="Supprimer le questionnaire de cette fiche">🗑</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 4, borderTop: "1px solid #edf1f6", paddingTop: 8 }}>
        <K v={fmtEUR(revTotal)} l="Revenus annuels" />
        <K v={(f.tmi || "—") + (f.tmi ? " %" : "")} l="TMI" />
        <K v={f.impotNet ? fmtEUR(eicN(f.impotNet)) : "—"} l="Impôt net" />
        <K v={fmtEUR(finTotal)} l="Patrimoine financier" />
        <K v={fmtEUR(livrets)} l="Dont livrets" />
        <K v={nbBiens ? nbBiens + " bien(s) · " + fmtEUR(immoTotal) : "—"} l="Immobilier" />
        <K v={f.moyensEpargne ? f.moyensEpargne + " €/mois" : "—"} l="Capacité d'épargne" />
        <K v={f.moyensCapital ? fmtEUR(eicN(f.moyensCapital)) : "—"} l="Capital disponible" />
      </div>
      {(objPrio.length > 0 || f.profil) && (
        <div style={{ fontSize: 12.5, color: "#44536B", borderTop: "1px solid #edf1f6", marginTop: 8, paddingTop: 8 }}>
          {objPrio.length > 0 && <><b>Priorité 1 :</b> {objPrio.join(" · ")}<br /></>}
          {f.profil && <><b>Profil :</b> {f.profil}</>}
          {f.horizon && <> · <b>Horizon :</b> {f.horizon}</>}
        </div>
      )}
    </div>
  );
}

/* ===== PDF OFFICIEL Elyon rempli (généré côté serveur) ===== */
async function eicPdf(client) {
  try {
    const r = await fetch("/api/eic-pdf", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: { civilite: client.civilite, nom: client.nom, prenom: client.prenom }, eic: client.eic || {} }),
    });
    if (!r.ok) { let msg = ""; try { msg = (await r.json()).error || (await r.text()); } catch {} alert("Erreur lors de la génération du PDF." + (msg ? "\n\nDétail : " + msg : "\n\n(Si ça persiste : le serveur vient peut-être de redémarrer, réessaie dans 2 min)")); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Audit_Patrimonial_" + (client.nom || "client").replace(/\s+/g, "_") + ".pdf";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { console.error(e); alert("Erreur réseau pendant la génération du PDF."); }
}

/* ================= CENTRE DE RAPPELS INTELLIGENT ================= */
function parseNaissance(s) {
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return { y: +m[3], mo: +m[2], d: +m[1] };
  return null;
}
function lastContactOf(c) {
  /* Uniquement les vrais contacts tracés : appel noté, mail envoyé. Un contrat signé n'est pas un contact. */
  const dates = [c.lastContact, ...((c.mailLog || []).map((m) => m.date))].filter(Boolean);
  return dates.sort().pop() || null;
}
function moisDepuis(iso) {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (30.44 * 24 * 3600 * 1000));
}

function RappelsPage({ clients, saveClients, goClient }) {
  const [tab, setTab] = useState("anniv");
  const [seuil, setSeuil] = useState(4);
  const actifs = clients.filter((c) => !c.decom);
  const now = new Date();
  const annee = now.getFullYear();

  /* --- Anniversaires dans les 30 prochains jours --- */
  const annivs = actifs.map((c) => {
    const p = parseNaissance(c.dateNaissance);
    if (!p) return null;
    let next = new Date(annee, p.mo - 1, p.d);
    const today0 = new Date(annee, now.getMonth(), now.getDate());
    if (next < today0) next = new Date(annee + 1, p.mo - 1, p.d);
    const days = Math.round((next - today0) / 86400000);
    if (days !== 0) return null;
    if (c.bdayWished === next.getFullYear() + "") return null;
    return { c, days, date: next, age: next.getFullYear() - p.y };
  }).filter(Boolean).sort((a, b) => a.days - b.days);

  /* --- Prendre des nouvelles (aucun contact depuis X mois) --- */
  /* Seuls les clients avec un contact DÉJÀ tracé : sinon 800 fiches remonteraient d'un coup */
  const nouvelles = actifs.map((c) => ({ c, last: lastContactOf(c) }))
    .filter((x) => x.last)
    .map((x) => ({ ...x, mois: moisDepuis(x.last) }))
    .filter((x) => x.mois >= seuil)
    .sort((a, b) => b.mois - a.mois);

  /* --- À faire : alertes programmées + lignes "!" des notes --- */
  const afaire = [];
  actifs.forEach((c) => {
    (c.alertes || []).filter((a) => !a.done).forEach((a) => afaire.push({ kind: "alerte", c, a, date: a.date }));
    (c.notes || "").split("\n").forEach((ligne, i) => {
      const t = ligne.trim();
      if (t.startsWith("!") && t.length > 1) afaire.push({ kind: "note", c, texte: t.slice(1).trim(), ligne: i, date: "" });
    });
  });
  afaire.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  const marquerSouhaite = (x) => saveClients(clients.map((cl) => cl.id === x.c.id ? { ...cl, bdayWished: x.date.getFullYear() + "" } : cl));
  const marquerContacte = (x) => saveClients(clients.map((cl) => cl.id === x.c.id ? { ...cl, lastContact: todayISO() } : cl));
  const faitAlerte = (item) => saveClients(clients.map((cl) => cl.id === item.c.id ? { ...cl, alertes: cl.alertes.map((a) => a.id === item.a.id ? { ...a, done: true } : a) } : cl));
  /* Modifier l'intitulé ou la date d'un rappel directement depuis cette page */
  const editAlerte = (item) => {
    const t = prompt("Intitulé du rappel :", item.a.type);
    if (t === null) return;
    const d = prompt("Date du rappel (JJ/MM/AAAA) :", fmtDate(item.a.date));
    if (d === null) return;
    let iso = item.a.date;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((d || "").trim());
    if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test((d || "").trim())) iso = d.trim();
    else if (d.trim()) { alert("Date non comprise — format attendu : 15/08/2026"); return; }
    saveClients(clients.map((cl) => cl.id !== item.c.id ? cl : { ...cl, alertes: cl.alertes.map((a) => a.id === item.a.id ? { ...a, type: t.trim() || a.type, date: iso } : a) }));
  };
  const delAlerte = (item) => {
    if (!confirm("Supprimer ce rappel ?")) return;
    saveClients(clients.map((cl) => cl.id !== item.c.id ? cl : { ...cl, alertes: cl.alertes.filter((a) => a.id !== item.a.id) }));
  };
  const faitNote = (item) => saveClients(clients.map((cl) => {
    if (cl.id !== item.c.id) return cl;
    const lignes = (cl.notes || "").split("\n");
    lignes[item.ligne] = "✓ " + lignes[item.ligne].trim().slice(1).trim();
    return { ...cl, notes: lignes.join("\n") };
  }));

  const TabBtn = ({ k, label, count }) => (
    <div onClick={() => setTab(k)} style={{ padding: "9px 18px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "Georgia, serif", background: tab === k ? "#0B2545" : "#fff", color: tab === k ? "#C9A24B" : "#44536B", border: "1px solid " + (tab === k ? "#0B2545" : "#CDD6E2") }}>
      {label} {count > 0 && <span style={{ background: tab === k ? "#C9A24B" : "#DC2626", color: tab === k ? "#0B2545" : "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 11, marginLeft: 4 }}>{count}</span>}
    </div>
  );
  const Ligne = ({ children, boutons }) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "9px 12px", borderBottom: "1px solid #edf1f6", alignItems: "center" }}>
      <div style={{ fontSize: 13.5 }}>{children}</div>
      <div className="row" style={{ gap: 6 }}>{boutons}</div>
    </div>
  );

  return (
    <div>
      <div className="ph"><div><h1>🔔 Rappels</h1><div className="sub">Le CRM veille pour toi : anniversaires, clients à recontacter, choses à faire</div></div></div>
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <TabBtn k="anniv" label="🎂 Anniversaires" count={annivs.length} />
        <TabBtn k="nouvelles" label="📞 Prendre des nouvelles" count={nouvelles.length} />
        <TabBtn k="afaire" label="📝 À faire" count={afaire.length} />
      </div>

      {tab === "anniv" && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Anniversaires du jour 🎉</h2>
          {annivs.length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Aucun anniversaire aujourd'hui.</div>}
          {annivs.map((x) => (
            <Ligne key={x.c.id} boutons={<>
              <button className="btn sm" onClick={() => goClient(x.c.id)}>Voir la fiche</button>
              <button className="btn ghost sm" onClick={() => marquerSouhaite(x)}>✓ Souhaité</button>
            </>}>
              <b>{x.c.civilite ? x.c.civilite + " " : ""}{x.c.nom} {x.c.prenom}</b> fêtera ses <b>{x.age} ans</b> le {x.date.toLocaleDateString("fr-FR")}
              {x.days === 0 ? <span className="badge b-green" style={{ marginLeft: 8 }}>AUJOURD'HUI 🎉</span> : <span style={{ color: "#8593a8" }}> (dans {x.days} j)</span>}
              {x.c.telephone && <span style={{ color: "#8593a8" }}> · {x.c.telephone}</span>}
            </Ligne>
          ))}
        </div>
      )}

      {tab === "nouvelles" && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16 }}>Sans contact depuis…</h2>
            <select className="sel" style={{ width: 140 }} value={seuil} onChange={(e) => setSeuil(+e.target.value)}>
              <option value={3}>3 mois</option><option value={4}>4 mois</option><option value={6}>6 mois</option><option value={12}>12 mois</option>
            </select>
          </div>
          {nouvelles.length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Personne à recontacter pour l'instant. 👌<br /><span style={{ fontSize: 12 }}>Cette liste se remplit au fil de l'eau : dès que tu notes un contact (bouton « ✓ Contacté aujourd'hui » sur cette page) ou que tu envoies un mail via la Messagerie, le compteur démarre pour ce client.</span></div>}
          {nouvelles.slice(0, 100).map((x) => (
            <Ligne key={x.c.id} boutons={<>
              <button className="btn sm" onClick={() => goClient(x.c.id)}>Voir la fiche</button>
              <button className="btn ghost sm" onClick={() => marquerContacte(x)}>✓ Contacté aujourd'hui</button>
            </>}>
              <b>{x.c.civilite ? x.c.civilite + " " : ""}{x.c.nom} {x.c.prenom}</b>
              <span className={"badge " + (x.mois >= 12 ? "b-red" : x.mois >= 6 ? "b-orange" : "b-gold")} style={{ marginLeft: 8 }}>{x.mois} mois</span>
              <span style={{ color: "#8593a8" }}> · dernier contact : {x.last ? fmtDate(x.last) : "inconnu"}{x.c.telephone ? " · " + x.c.telephone : ""}</span>
            </Ligne>
          ))}
          {nouvelles.length > 100 && <div style={{ color: "#8593a8", fontSize: 12, marginTop: 8 }}>… et {nouvelles.length - 100} autres (les plus anciens d'abord).</div>}
        </div>
      )}

      {tab === "afaire" && <TodoLists clients={clients} goClient={goClient} afaire={afaire} faitAlerte={faitAlerte} faitNote={faitNote} editAlerte={editAlerte} delAlerte={delAlerte} />}
    </div>
  );
}

/* ================= PORTEFEUILLE CLIENT ================= */
/* Colonnes calquées sur FICHIER_SUIVI_COMMISSIONS :
   PER 1 = Optimum · PER 2 = MMA · Assurance vie = MMA ≥ 10k (annuel) · Protection juridique = IAG/SPP · Prévoyance = PREV/April
   Les montants affichés sont les VERSEMENTS MENSUELS (annuel pour l'assurance vie). Les décommissionnés sont barrés. */
function PortefeuillePage({ clients, saveClients, goClient }) {
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState("tous");
  const [tri, setTri] = useState("adhesion");

  const estDecom = (k) => /décom|decom|annul/i.test(k.statut || "");
  const mensuel = (k) => {
    const m = parseNum(k.versement) || 0;
    if (m) return m;
    const vol = parseNum(k.montant) || 0;   /* volume annuel saisi dans la fiche */
    return vol ? Math.round(vol / 12) : 0;
  };
  const annuel = (k) => parseNum(k.montant) || (parseNum(k.versement) || 0) * 12;
  const cieOf = (k) => (k.compagnie || "").toUpperCase();

  /* Répartition d'un contrat dans la bonne colonne, selon la compagnie */
  const colonne = (k) => {
    const cie = cieOf(k), t = (k.type || "").toLowerCase();
    if (/optimum|swiss|abeille|malakoff/i.test(cie)) return "per1";
    if (/mma/i.test(cie)) {
      if (t.includes("assurance vie") || annuel(k) >= 10000) return "av";
      return "per2";
    }
    if (/afi|esca/i.test(cie)) return "av";
    if (/iag|spp/i.test(cie)) return "pj";
    if (/prev|april/i.test(cie) || t.includes("prévoyance")) return "prev";
    if (t.includes("assurance vie")) return "av";
    if (t.includes("protection")) return "pj";
    if (t.includes("prévoyance")) return "prev";
    if (t === "per") return "per1";
    return "autre";
  };

  const lignes = useMemo(() => clients.map((cl) => {
    const cols = { per1: [], per2: [], prev: [], pj: [], av: [], autre: [] };
    (cl.contrats || []).forEach((k) => cols[colonne(k)].push(k));
    const dates = (cl.contrats || []).map((k) => k.dateSignature).filter(Boolean).sort();
    const vivants = (cl.contrats || []).filter((k) => !estDecom(k));
    return {
      cl, cols,
      adhesion: dates[0] || cl.createdAt || "",
      actif: !cl.decom && vivants.length > 0,
      nbContrats: (cl.contrats || []).length,
      mensuelTotal: vivants.filter((k) => colonne(k) !== "av").reduce((t, k) => t + mensuel(k), 0),
    };
  }), [clients]);

  const kpi = useMemo(() => {
    const t = { clients: lignes.length, actifs: 0, inactifs: 0, per: 0, prev: 0, pj: 0, av: 0, mens: 0 };
    lignes.forEach((l) => {
      l.actif ? t.actifs++ : t.inactifs++;
      t.mens += l.mensuelTotal;
      ["per1", "per2"].forEach((k) => (t.per += l.cols[k].filter((x) => !estDecom(x)).length));
      t.prev += l.cols.prev.filter((x) => !estDecom(x)).length;
      t.pj += l.cols.pj.filter((x) => !estDecom(x)).length;
      t.av += l.cols.av.filter((x) => !estDecom(x)).length;
    });
    return t;
  }, [lignes]);

  const vues = useMemo(() => {
    let v = lignes.filter((l) => filtre === "tous" || (filtre === "actifs" ? l.actif : !l.actif));
    const q = search.trim().toLowerCase();
    if (q) v = v.filter((l) => (l.cl.nom + " " + (l.cl.prenom || "") + " " + (l.cl.telephone || "") + " " + (l.cl.email || "") +
      " " + (l.cl.contrats || []).map((k) => k.compagnie + " " + k.type).join(" ")).toLowerCase().includes(q));
    const cmp = {
      adhesion: (a, b) => (a.adhesion || "9999").localeCompare(b.adhesion || "9999"),
      adhesionRecent: (a, b) => (b.adhesion || "").localeCompare(a.adhesion || ""),
      alpha: (a, b) => a.cl.nom.localeCompare(b.cl.nom),
      montant: (a, b) => b.mensuelTotal - a.mensuelTotal,
    }[tri];
    return [...v].sort(cmp);
  }, [lignes, filtre, search, tri]);

  const toggleActif = (id) => saveClients(clients.map((c2) => (c2.id === id ? { ...c2, decom: !c2.decom } : c2)));

  /* Cellule produit : montant mensuel (ou annuel pour l'AV), décommissionné = barré rouge */
  const Cell = ({ ks, isAv }) => {
    if (!ks.length) return <td></td>;
    return (
      <td style={{ fontSize: 12 }}>
        {ks.map((k, i) => {
          const d = estDecom(k);
          const v = isAv ? annuel(k) : mensuel(k);
          return (
            <div key={i} title={(k.compagnie || "") + " · " + (k.type || "") + (d ? " · DÉCOMMISSIONNÉ" : "") + (k.dateSignature ? " · " + fmtDate(k.dateSignature) : "")}
              style={{ textDecoration: d ? "line-through" : "none", color: d ? "#B3261E" : "#0B2545", opacity: d ? .65 : 1, whiteSpace: "nowrap" }}>
              <b>{v ? fmtEUR(v) : "—"}</b>{isAv ? "" : "/m"} <span style={{ color: "#8593a8", fontSize: 10.5 }}>{k.compagnie}</span>
            </div>
          );
        })}
      </td>
    );
  };

  const exportCSV = () => {
    const head = ["Adhésion", "Statut", "Téléphone", "E-mail", "Nom Prénom", "PER 1 (Optimum) €/mois", "PER 2 (MMA) €/mois", "Prévoyance €/mois", "Protection juridique €/mois", "Assurance vie €/an", "Total €/mois"];
    const val = (ks, isAv) => ks.map((k) => (estDecom(k) ? "(décom) " : "") + ((isAv ? annuel(k) : mensuel(k)) || "") + " " + (k.compagnie || "")).join(" + ");
    const rows = vues.map((l) => [fmtDate(l.adhesion), l.actif ? "ACTIF" : "INACTIF", l.cl.telephone || "", l.cl.email || "",
      (l.cl.civilite ? l.cl.civilite.toUpperCase() + " " : "") + l.cl.nom + " " + (l.cl.prenom || ""),
      val(l.cols.per1), val(l.cols.per2), val(l.cols.prev), val(l.cols.pj), val(l.cols.av, true), l.mensuelTotal]);
    const csv = [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `Portefeuille_client_${todayISO()}.csv`; a.click();
  };

  const K = ({ v, l, color, dot }) => (
    <div className="card" style={{ padding: "13px 17px", borderLeft: "4px solid " + (color || "#C9A24B"), minWidth: 120 }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 700, color: color || "#0B2545" }}>{v}</div>
      <div style={{ fontSize: 10.5, color: "#8593a8", textTransform: "uppercase", letterSpacing: ".5px", display: "flex", alignItems: "center", gap: 5 }}>
        {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />}{l}
      </div>
    </div>
  );
  const Fbtn = ({ k, l, color }) => (
    <div onClick={() => setFiltre(k)} style={{ padding: "7px 15px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
      background: filtre === k ? "#0B2545" : "#fff", color: filtre === k ? "#fff" : "#44536B", border: "1px solid " + (filtre === k ? "#0B2545" : "#CDD6E2"), display: "flex", alignItems: "center", gap: 6 }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />}{l}
    </div>
  );

  return (
    <div>
      <div className="ph">
        <div><h1>💼 Portefeuille client</h1><div className="sub">{vues.length} client(s) · versements mensuels · décommissionnés barrés</div></div>
        <button className="btn" onClick={exportCSV}>📊 Export Excel</button>
      </div>

      <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <K v={kpi.clients} l="Clients" />
        <K v={kpi.actifs} l="Actifs" color="#16A34A" dot />
        <K v={kpi.inactifs} l="Inactifs" color="#DC2626" dot />
        <K v={kpi.per} l="PER" />
        <K v={kpi.prev} l="Prévoyance" />
        <K v={kpi.pj} l="Protection juridique" />
        <K v={kpi.av} l="Assurance vie" />
        <K v={fmtEUR(kpi.mens)} l="Total €/mois" color="#C9A24B" />
      </div>

      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input className="in" style={{ flex: 1, minWidth: 240 }} placeholder="🔍 Rechercher (nom, compagnie, téléphone, email…)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="sel" style={{ width: 230 }} value={tri} onChange={(e) => setTri(e.target.value)}>
          <option value="adhesion">Trier : date d'adhésion (anciens)</option>
          <option value="adhesionRecent">Trier : date d'adhésion (récents)</option>
          <option value="alpha">Trier : nom (A → Z)</option>
          <option value="montant">Trier : montant mensuel</option>
        </select>
        <div className="row" style={{ gap: 6 }}>
          <Fbtn k="tous" l="Tous" />
          <Fbtn k="actifs" l="Actifs" color="#16A34A" />
          <Fbtn k="inactifs" l="Inactifs" color="#DC2626" />
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto", padding: 0 }}>
        <table className="t pf" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ minWidth: 100 }}>Adhésion</th>
              <th style={{ minWidth: 92 }}>Statut</th>
              <th style={{ minWidth: 110 }}>Téléphone</th>
              <th style={{ minWidth: 170, textAlign: "left" }}>E-mail</th>
              <th style={{ minWidth: 185, textAlign: "left" }}>Nom Prénom</th>
              <th style={{ minWidth: 130 }}>PER 1 <span style={{ fontWeight: 400, opacity: .6 }}>Optimum</span></th>
              <th style={{ minWidth: 118 }}>PER 2 <span style={{ fontWeight: 400, opacity: .6 }}>MMA</span></th>
              <th style={{ minWidth: 118 }}>Prévoyance</th>
              <th style={{ minWidth: 130 }}>Protection jur. <span style={{ fontWeight: 400, opacity: .6 }}>IAG/SPP</span></th>
              <th style={{ minWidth: 125 }}>Assurance vie <span style={{ fontWeight: 400, opacity: .6 }}>€/an</span></th>
              <th style={{ minWidth: 92 }}>Total €/mois</th>
            </tr>
          </thead>
          <tbody>
            {vues.map((l) => (
              <tr key={l.cl.id} className={l.actif ? "pf-on" : "pf-off"}>
                <td style={{ fontSize: 12 }}>{fmtDate(l.adhesion)}</td>
                <td>
                  <span onClick={() => toggleActif(l.cl.id)} title="Cliquer pour basculer actif / inactif"
                    style={{ cursor: "pointer", fontWeight: 700, fontSize: 11.5, letterSpacing: ".5px", color: l.actif ? "#16A34A" : "#DC2626" }}>
                    {l.actif ? "ACTIF" : "INACTIF"}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>{l.cl.telephone || ""}</td>
                <td style={{ fontSize: 11.5, textAlign: "left", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>{l.cl.email || ""}</td>
                <td style={{ textAlign: "left" }}>
                  <b onClick={() => goClient(l.cl.id)} style={{ cursor: "pointer", fontSize: 12.5, color: "#0B2545" }}>
                    {l.cl.civilite ? l.cl.civilite.toUpperCase() + " " : ""}{l.cl.nom} {l.cl.prenom || ""}
                  </b>
                </td>
                <Cell ks={l.cols.per1} />
                <Cell ks={l.cols.per2} />
                <Cell ks={l.cols.prev} />
                <Cell ks={l.cols.pj} />
                <Cell ks={l.cols.av} isAv />
                <td style={{ fontSize: 12.5, fontWeight: 700, color: "#7A5C17" }}>{l.mensuelTotal ? fmtEUR(l.mensuelTotal) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {vues.length === 0 && <div style={{ padding: 24, color: "#8593a8", fontSize: 13.5 }}>Aucun client ne correspond à cette recherche.</div>}
      </div>
    </div>
  );
}

/* ================= LISTES DE RAPPELS (façon iPhone) ================= */
const TODO_COLORS = ["#C9A24B", "#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#EA580C", "#0891B2"];

function TodoLists({ clients, goClient, afaire, faitAlerte, faitNote, editAlerte, delAlerte }) {
  const [lists, setLists] = useState(null);
  const [sel, setSel] = useState("crm");
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState("");

  useEffect(() => { (async () => {
    let l = await sGet("crm-todo-lists");
    if (!l) { l = [{ id: uid(), nom: "Personnel", color: TODO_COLORS[0], items: [] }]; await sSet("crm-todo-lists", l); }
    setLists(l);
  })(); }, []);
  if (!lists) return <div style={{ color: "#8593a8" }}>Chargement…</div>;
  const save = (l) => { setLists(l); sSet("crm-todo-lists", l); };
  const cur = lists.find((x) => x.id === sel);

  const addItem = () => {
    if (!draft.trim() || !cur) return;
    save(lists.map((l) => l.id !== sel ? l : { ...l, items: [{ id: uid(), texte: draft.trim(), date: draftDate, done: false, createdAt: todayISO() }, ...l.items] }));
    setDraft(""); setDraftDate("");
  };
  const toggle = (itemId) => save(lists.map((l) => l.id !== sel ? l : { ...l, items: l.items.map((it) => it.id === itemId ? { ...it, done: !it.done } : it) }));
  const delItem = (itemId) => save(lists.map((l) => l.id !== sel ? l : { ...l, items: l.items.filter((it) => it.id !== itemId) }));
  const editItem = (it) => { const t = prompt("Modifier le rappel :", it.texte); if (t && t.trim()) save(lists.map((l) => l.id !== sel ? l : { ...l, items: l.items.map((x) => x.id === it.id ? { ...x, texte: t.trim() } : x) })); };
  const addList = () => { const nom = prompt("Nom de la nouvelle liste :"); if (nom && nom.trim()) { const nl = { id: uid(), nom: nom.trim(), color: TODO_COLORS[lists.length % TODO_COLORS.length], items: [] }; save([...lists, nl]); setSel(nl.id); } };
  const renameList = () => { if (!cur) return; const nom = prompt("Renommer la liste :", cur.nom); if (nom && nom.trim()) save(lists.map((l) => l.id === sel ? { ...l, nom: nom.trim() } : l)); };
  const delList = () => { if (!cur) return; if (!confirm(`Supprimer la liste « ${cur.nom} » et ses ${cur.items.length} rappel(s) ?`)) return; const rest = lists.filter((l) => l.id !== sel); save(rest.length ? rest : [{ id: uid(), nom: "Personnel", color: TODO_COLORS[0], items: [] }]); setSel("crm"); };
  const clearDone = () => { if (!cur) return; save(lists.map((l) => l.id !== sel ? l : { ...l, items: l.items.filter((it) => !it.done) })); };

  const enRetard = (d) => d && d < todayISO();
  const Item = ({ done, children, onToggle, onEdit, onDel, color }) => (
    <div className="row" style={{ gap: 12, alignItems: "flex-start", padding: "10px 4px", borderBottom: "1px solid #edf1f6" }}>
      <div onClick={onToggle} style={{ width: 19, height: 19, borderRadius: "50%", border: "2px solid " + (done ? color : "#cdd6e2"), background: done ? color : "#fff", cursor: "pointer", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{done ? "✓" : ""}</div>
      <div style={{ flex: 1, fontSize: 13.5, opacity: done ? .45 : 1, textDecoration: done ? "line-through" : "none" }}>{children}</div>
      <div className="row" style={{ gap: 8, flexShrink: 0 }}>
        {onEdit && <span onClick={onEdit} style={{ cursor: "pointer", color: "#8593a8", fontSize: 12 }}>✏️</span>}
        {onDel && <span onClick={onDel} style={{ cursor: "pointer", color: "#B3261E", fontSize: 12 }}>✕</span>}
      </div>
    </div>
  );

  return (
    <div className="row" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Colonne des listes */}
      <div className="card" style={{ width: 230, flexShrink: 0 }}>
        <div onClick={() => setSel("crm")} style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: sel === "crm" ? "#0B2545" : "transparent", color: sel === "crm" ? "#C9A24B" : "#0B2545", fontWeight: 700, fontSize: 13.5, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
          <span>⚡ Générés par le CRM</span><span>{afaire.length}</span>
        </div>
        <div style={{ borderTop: "1px solid #edf1f6", margin: "8px 0" }} />
        {lists.map((l) => (
          <div key={l.id} onClick={() => setSel(l.id)} onDoubleClick={() => l.id === sel && renameList()}
            style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: sel === l.id ? "#F0F3F8" : "transparent", fontSize: 13.5, fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{l.nom}</span>
            <span style={{ color: "#8593a8", fontSize: 12 }}>{l.items.filter((i) => !i.done).length}</span>
          </div>
        ))}
        <button className="btn sm" style={{ width: "100%", marginTop: 10 }} onClick={addList}>+ Nouvelle liste</button>
      </div>

      {/* Contenu */}
      <div className="card" style={{ flex: 1, minWidth: 340 }}>
        {sel === "crm" ? (
          <>
            <h2 style={{ fontSize: 17, marginBottom: 4 }}>⚡ Générés par le CRM</h2>
            <div style={{ fontSize: 11.5, color: "#8593a8", marginBottom: 12 }}>Rappels de transfert, relances après mail, alertes des fiches, et lignes commençant par <b>!</b> dans les notes clients.</div>
            {afaire.length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Rien à faire — tout est carré. 🧘</div>}
            {afaire.map((item, i) => (
              <Item key={i} done={false} color="#C9A24B"
                onToggle={() => item.kind === "alerte" ? faitAlerte(item) : faitNote(item)}
                onEdit={item.kind === "alerte" ? () => editAlerte(item) : undefined}
                onDel={item.kind === "alerte" ? () => delAlerte(item) : undefined}>
                <b>{item.kind === "alerte" ? item.a.type : item.texte}</b>
                <span style={{ color: "#5b6b82" }}> — <span onClick={() => goClient(item.c.id)} style={{ cursor: "pointer", textDecoration: "underline" }}>{item.c.civilite ? item.c.civilite + " " : ""}{item.c.nom} {item.c.prenom}</span></span>
                {item.date && <span className={"badge " + (enRetard(item.date) ? "b-red" : "b-gold")} style={{ marginLeft: 8 }}>{enRetard(item.date) ? "En retard · " : ""}{fmtDate(item.date)}</span>}
                {item.kind === "note" && <span className="badge b-gold" style={{ marginLeft: 8 }}>note</span>}
              </Item>
            ))}
          </>
        ) : cur ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, color: cur.color }}>{cur.nom}</h2>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sm" onClick={renameList}>✏️ Renommer</button>
                <button className="btn sm" onClick={clearDone}>🧹 Vider les terminés</button>
                <button className="btn sm" style={{ color: "#B3261E", borderColor: "#B3261E" }} onClick={delList}>🗑</button>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              <input className="in" style={{ flex: 1 }} placeholder="Nouveau rappel…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
              <input className="in" type="date" style={{ width: 150 }} value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
              <button className="btn gold" onClick={addItem}>+ Ajouter</button>
            </div>
            {cur.items.length === 0 && <div style={{ color: "#8593a8", fontSize: 13.5 }}>Liste vide. Ajoute ton premier rappel ci-dessus.</div>}
            {[...cur.items].sort((a, b) => (a.done - b.done) || (a.date || "9999").localeCompare(b.date || "9999")).map((it) => (
              <Item key={it.id} done={it.done} color={cur.color} onToggle={() => toggle(it.id)} onEdit={() => editItem(it)} onDel={() => delItem(it.id)}>
                {it.texte}
                {it.date && <span className={"badge " + (enRetard(it.date) && !it.done ? "b-red" : "b-gold")} style={{ marginLeft: 8 }}>{fmtDate(it.date)}</span>}
              </Item>
            ))}
          </>
        ) : null}
      </div>
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
