#!/usr/bin/env bash
# Load local ingest CSVs into my_db.main in MotherDuck and (re)build views.
# Re-runnable: every statement is CREATE OR REPLACE. Run after the pulls finish.
set -euo pipefail
cd "$(dirname "$0")/.."

duckdb md: <<'SQL'
-- raw tables ---------------------------------------------------------------
CREATE OR REPLACE TABLE my_db.main.members_spine AS
  SELECT * FROM read_csv_auto('data/members_spine.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.fec_totals AS
  SELECT * FROM read_csv_auto('data/fec_totals.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.sponsored AS
  SELECT * FROM read_csv_auto('data/sponsored.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.bills AS
  SELECT * FROM read_csv_auto('data/bills.csv', header=true, quote='"', all_varchar=true);
CREATE OR REPLACE TABLE my_db.main.committees AS
  SELECT * FROM read_csv_auto('data/committees.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.top_orgs AS
  SELECT * FROM read_csv_auto('data/top_orgs.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.state_pop AS
  SELECT * FROM read_csv_auto('ingest/state_pop.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.photos AS
  SELECT * FROM read_csv_auto('data/photos.csv', header=true, quote='"', all_varchar=true);
CREATE OR REPLACE TABLE my_db.main.out_of_state AS
  SELECT * FROM read_csv_auto('data/out_of_state.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.super_pac_totals AS
  SELECT * FROM read_csv_auto('data/super_pac_totals.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.super_pac AS
  SELECT * FROM read_csv_auto('data/super_pac.csv', header=true);

-- main analytic view (drives the scatter + modal headline numbers) ----------
CREATE OR REPLACE VIEW my_db.main.member_money_law AS
  SELECT m.bioguide_id, m.full_name, m.state, m.party,
         f.peak_cycle, f.receipts AS total_raised, f.career_receipts, f.cash_on_hand,
         f.pac_contributions, f.individual_itemized, f.individual_unitemized,
         f.out_state_pct,
         COALESCE(sp.bills_sponsored, 0) AS bills_sponsored,
         CASE WHEN f.receipts>0 THEN 100.0*f.pac_contributions/f.receipts ELSE 0 END AS pct_from_pacs,
         CASE WHEN f.receipts>0 THEN 100.0*f.individual_itemized/f.receipts ELSE 0 END AS pct_from_individuals,
         CASE WHEN f.receipts>0 THEN 100.0*f.individual_unitemized/f.receipts ELSE 0 END AS pct_small_dollar,
         CASE WHEN pop.population>0 THEN f.receipts/pop.population ELSE 0 END AS dollars_per_resident,
         ph.photo_uri
  FROM my_db.main.members_spine m
  JOIN my_db.main.fec_totals f USING (fec_id)
  LEFT JOIN my_db.main.sponsored sp USING (bioguide_id)
  LEFT JOIN my_db.main.state_pop pop ON pop.state = m.state
  LEFT JOIN my_db.main.photos ph USING (bioguide_id);

SELECT 'member_money_law' AS t, count(*) AS rows,
       count(photo_uri) AS with_photo,
       round(avg(out_state_pct),1) AS avg_out_of_state_pct
FROM my_db.main.member_money_law;
SQL

echo "push: all tables + view loaded"
