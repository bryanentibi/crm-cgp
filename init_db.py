import psycopg2, json, os

DATABASE_URL = "postgresql://postgres:XzmBpiqQqlMxiHrCofIjEWbYQazYmIlK@postgres.railway.internal:5432/railway"

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Créer tables
cur.execute("""
CREATE TABLE IF NOT EXISTS sante (
  id SERIAL PRIMARY KEY,
  nom TEXT, prenom TEXT, specialite TEXT,
  telephone TEXT, telephone_direct TEXT,
  email TEXT, adresse TEXT, ville TEXT, cp TEXT,
  rpps TEXT, mode_exercice TEXT,
  date_debut TEXT, date_ajout TEXT,
  statut TEXT DEFAULT 'nouveau', note TEXT
);
CREATE TABLE IF NOT EXISTS pharmacies (
  id SERIAL PRIMARY KEY,
  nom TEXT, dirigeant TEXT, telephone TEXT,
  telephone_direct TEXT, email TEXT,
  adresse TEXT, ville TEXT, cp TEXT,
  siret TEXT, ca INTEGER, effectif_min INTEGER,
  effectif_max INTEGER, forme_juridique TEXT,
  statut TEXT DEFAULT 'nouveau', note TEXT
);
""")

conn.commit()
print("Tables créées!")
cur.close()
conn.close()
