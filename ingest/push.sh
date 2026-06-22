#!/usr/bin/env bash
# Load local ingest CSVs into my_db.main in MotherDuck and (re)build views.
# Re-runnable: every statement is CREATE OR REPLACE.
set -euo pipefail
cd "$(dirname "$0")/.."

duckdb md: <<'SQL'
-- Task 1: spine
CREATE OR REPLACE TABLE my_db.main.members_spine AS
  SELECT * FROM read_csv_auto('data/members_spine.csv', header=true);

-- Task 2: FEC money
CREATE OR REPLACE TABLE my_db.main.fec_totals AS
  SELECT * FROM read_csv_auto('data/fec_totals.csv', header=true);

CREATE OR REPLACE VIEW my_db.main.member_money AS
  SELECT m.bioguide_id, m.full_name, m.state, m.party,
         f.peak_cycle, f.receipts, f.pac_contributions, f.individual_itemized,
         f.career_receipts, f.cash_on_hand,
         f.receipts AS total_raised,
         CASE WHEN f.receipts > 0 THEN 100.0*f.pac_contributions/f.receipts ELSE 0 END AS pct_from_pacs,
         CASE WHEN f.receipts > 0 THEN 100.0*f.individual_itemized/f.receipts ELSE 0 END AS pct_from_individuals
  FROM my_db.main.members_spine m
  JOIN my_db.main.fec_totals f USING (fec_id);

SELECT 'members_spine' AS t, count(*) AS rows FROM my_db.main.members_spine
UNION ALL SELECT 'fec_totals', count(*) FROM my_db.main.fec_totals
UNION ALL SELECT 'member_money', count(*) FROM my_db.main.member_money;
SQL

echo "push: spine + FEC money loaded"
