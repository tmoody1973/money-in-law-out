#!/usr/bin/env bash
# Load local ingest CSVs into my_db.main in MotherDuck and (re)build the view.
# Re-runnable: every statement is CREATE OR REPLACE. Only loads CSVs that exist.
set -euo pipefail
cd "$(dirname "$0")/.."

duckdb md: <<'SQL'
-- Task 1: spine (always present)
CREATE OR REPLACE TABLE my_db.main.members_spine AS
  SELECT * FROM read_csv_auto('data/members_spine.csv', header=true);
SELECT 'members_spine' AS t, count(*) AS rows FROM my_db.main.members_spine;
SQL

echo "push: spine loaded"
