#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ÉPURATION CRM CGP — Bryan
Nettoie les tables sante et artisans (les PHARMACIES ne sont JAMAIS touchées).

Critères de suppression :
  1. Aucun mobile 06/07 (ni dans telephone_direct ni dans telephone)
  2. Aucun nom (sante : nom ET prénom vides / artisans : nom vide)

Sécurité :
  - Sauvegarde CSV complète AVANT toute suppression
  - Affiche le détail de ce qui va partir (dry-run)
  - Ne supprime QUE si tu tapes OUI
"""
import csv, os, re, sys
from datetime import datetime

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("❌ Il manque psycopg2. Lance d'abord :")
    print("   pip3 install psycopg2-binary")
    sys.exit(1)

DB_URL = "postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@reseau.proxy.rlwy.net:38081/railway"

BACKUP_DIR = os.path.expanduser(
    f"~/Desktop/CRM BRYAN/_archives/backup_avant_epuration_{datetime.now().strftime('%Y%m%d_%H%M')}"
)

def est_mobile(num):
    """True si le numéro est un mobile français (06/07, avec ou sans +33)."""
    if not num:
        return False
    n = re.sub(r"[^0-9+]", "", str(num))       # vire espaces, points, tirets
    n = re.sub(r"^(\+33|0033)", "0", n)        # +33 6... -> 06...
    return n.startswith("06") or n.startswith("07")

def vide(txt):
    return not (txt or "").strip()

def backup_table(cur, table):
    cur.execute(f"SELECT * FROM {table}")
    rows = cur.fetchall()
    if not rows:
        print(f"   ⚠️ {table} : table vide, rien à sauvegarder")
        return 0
    path = os.path.join(BACKUP_DIR, f"{table}.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    print(f"   ✅ {table} : {len(rows)} lignes sauvegardées -> {path}")
    return len(rows)

def analyser(cur, table, avec_prenom):
    """Retourne les ids à supprimer + les compteurs par motif."""
    champs = "id, nom, prenom, telephone_direct, telephone" if avec_prenom \
        else "id, nom, telephone_direct"
    cur.execute(f"SELECT {champs} FROM {table}")
    ids, n_sans_mobile, n_sans_nom = [], 0, 0
    for r in cur.fetchall():
        sans_mobile = not (est_mobile(r["telephone_direct"]) or est_mobile(r.get("telephone")))
        if avec_prenom:
            sans_nom = vide(r["nom"]) and vide(r["prenom"])
        else:
            sans_nom = vide(r["nom"])
        if sans_mobile or sans_nom:
            ids.append(r["id"])
            if sans_mobile: n_sans_mobile += 1
            if sans_nom:    n_sans_nom += 1
    return ids, n_sans_mobile, n_sans_nom

def main():
    print("=" * 60)
    print("ÉPURATION CRM CGP  (pharmacies exclues 🔒)")
    print("=" * 60)

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ---------- 1. BACKUP ----------
    os.makedirs(BACKUP_DIR, exist_ok=True)
    print(f"\n📦 1/3 — Sauvegarde dans :\n   {BACKUP_DIR}")
    tot_sante = backup_table(cur, "sante")
    tot_art   = backup_table(cur, "artisans")

    # ---------- 2. ANALYSE (dry-run) ----------
    print("\n🔍 2/3 — Analyse (rien n'est encore supprimé)")
    ids_sante, sm_s, sn_s = analyser(cur, "sante", avec_prenom=True)
    ids_art,   sm_a, sn_a = analyser(cur, "artisans", avec_prenom=False)

    print(f"\n   SANTÉ    : {tot_sante} lignes au total")
    print(f"     - sans mobile 06/07 : {sm_s}")
    print(f"     - sans nom/prénom   : {sn_s}")
    print(f"     => À SUPPRIMER : {len(ids_sante)}  |  RESTERONT : {tot_sante - len(ids_sante)}")
    print(f"\n   ARTISANS : {tot_art} lignes au total")
    print(f"     - sans mobile 06/07 : {sm_a}")
    print(f"     - sans nom          : {sn_a}")
    print(f"     => À SUPPRIMER : {len(ids_art)}  |  RESTERONT : {tot_art - len(ids_art)}")

    if not ids_sante and not ids_art:
        print("\n✨ Rien à supprimer, la base est déjà propre !")
        return

    # ---------- 3. CONFIRMATION + SUPPRESSION ----------
    print("\n⚠️  3/3 — Confirmation")
    rep = input(f"Supprimer définitivement {len(ids_sante) + len(ids_art)} lignes ? Tape OUI : ").strip()
    if rep != "OUI":
        print("❌ Annulé, rien n'a été supprimé. (le backup reste dispo)")
        return

    if ids_sante:
        cur.execute("DELETE FROM sante WHERE id = ANY(%s)", (ids_sante,))
    if ids_art:
        cur.execute("DELETE FROM artisans WHERE id = ANY(%s)", (ids_art,))
    conn.commit()
    print(f"\n✅ Terminé ! {len(ids_sante)} santé + {len(ids_art)} artisans supprimés.")
    print(f"   Backup complet dispo dans : {BACKUP_DIR}")
    cur.close(); conn.close()

if __name__ == "__main__":
    main()
