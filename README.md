# Money In, Law Out

An interactive [MotherDuck Dive](https://app.motherduck.com/dives/money-in-law-out-2bec88d7-098f-4ae5-9289-df4c2fe4f543) for the [DiveMaxxing](https://motherduck.com/divemaxxing/) data-viz contest.

**Every U.S. Senator is plotted as their own face** — campaign money raised (X) against bills sponsored in the 119th Congress (Y). Click any senator to open a dossier: who funds them (PACs / individuals / small-dollar), which states the money comes from, uncapped Super PAC money *for and against* them, top organization donors, committee seats, and recent bills (linked to congress.gov).

### The finding
The best-funded senators aren't slackers — the top-funded 10% sponsor *more* bills than average. Yet **35 of 99 raise ≥70% of their money out-of-state**, and **70 of 99 have enacted zero laws** this Congress.

## How it's built
Data is pulled from public APIs, cleaned locally with the **DuckDB CLI**, and pushed to **MotherDuck** (`my_db.main`). The Dive is a single React + Recharts component that runs live SQL against those tables.

```
ingest/01_build_spine.py     legislators YAML → bioguide↔FEC bridge (the join key)
ingest/02_pull_fec.py        FEC: peak/career receipts, PAC/individual/small-dollar, out-of-state %
ingest/03_pull_congress.py   Congress.gov: 119th-Congress sponsored-bill counts
ingest/04_committees.py      committee assignments (with chair/ranking titles)
ingest/05_pull_top_orgs.py   FEC by-employer top org donors (junk-filtered)
ingest/06_build_photos.sh    senator photos → 40px thumb → base64 data URI
ingest/07_pull_by_state.py   FEC Schedule A: out-of-state money by source state
ingest/08_pull_super_pac.py  FEC Schedule E: Super PAC support/oppose (uncapped)
ingest/09_pull_bill_links.py recent bills + congress.gov links + "became law" counts
ingest/push.sh               load all CSVs into my_db.main + build the analytic view
.dive-preview/src/dive.tsx   the Dive component (React + Recharts)
docs/superpowers/            design spec, implementation plan, AI prompts, v2 ideas
```

## Data sources
- **FEC OpenFEC API** — candidate totals, Schedule A (by-state), Schedule E (independent expenditures), by-employer
- **Congress.gov API** — 119th-Congress sponsored legislation
- **[unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)** — bioguide↔FEC bridge, committees, photos
- **U.S. Census** — state populations (for $ raised per resident)

## Run it yourself
Needs free API keys (`FEC_API_KEY` from api.data.gov, `CONGRESS_API_KEY` from api.congress.gov) in `.env.local`, plus the DuckDB CLI authenticated to MotherDuck.

```bash
set -a; . ./.env.local; set +a
python3 ingest/01_build_spine.py
python3 ingest/02_pull_fec.py
python3 ingest/03_pull_congress.py
python3 ingest/04_committees.py
python3 ingest/05_pull_top_orgs.py
./ingest/06_build_photos.sh
python3 ingest/07_pull_by_state.py
python3 ingest/08_pull_super_pac.py
python3 ingest/09_pull_bill_links.py
./ingest/push.sh
```

Built with an AI coding agent (see `docs/superpowers/AI-PROMPTS.md`).
