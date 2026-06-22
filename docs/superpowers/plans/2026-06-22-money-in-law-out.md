# Money In, Law Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a MotherDuck "Dive" for the DiveMaxxing contest (closes tonight, midnight PT): an interactive scatter where each U.S. Senator is their own photo, plotted by campaign money raised (X) vs. bills sponsored (Y), with click-to-drill member detail.

**Architecture:** Ingest three public sources **locally** with the `duckdb` CLI + Python, join them on a bioguide↔FEC bridge, and push clean tables to `my_db.main` in MotherDuck. The Dive is a single React component that runs `useSQLQuery` against those tables only (it cannot reach the web). Build in a `.dive-preview/` Vite app for live iteration, then `save_dive`.

**Tech Stack:** DuckDB CLI v1.5, Python 3.14 (`pyyaml`, `requests`), `sips` (image resize), MotherDuck Dives (React 18 + `@motherduck/react-sql-query` + Recharts + Tailwind via CDN), Vite preview.

**Testing note (TDD adaptation):** The Dive component runs only inside MotherDuck's wasm sandbox + a browser, so classic unit tests don't fit. Each task instead ends with a **concrete verification gate**: a `duckdb` query with expected output (for data tasks) or a specific visual/behavioral check in the running preview (for component tasks). Treat the verification gate as the test — do not proceed until it passes.

## Global Constraints

- **Dive shape:** ONE React function component, `export default function`. No IIFE, no class, no named-only export.
- **Canvas:** ~800×600px. Max 1–2 charts. Total height target 500–700px.
- **Charts:** Recharts only (Bar/Line/Pie/Scatter/Area). No raw SVG charts, no Sankey, no maps. Custom Recharts scatter `shape` IS allowed (faces).
- **No external fetch/images at runtime** (CSP = `*.motherduck.com`). Photos embedded as inline base64 **data URIs** in the data.
- **SQL:** fully-qualified, double-quoted `"my_db"."main"."table"` in every `useSQLQuery`. Read-only. Format dates with `strftime()` in SQL.
- **Numbers:** define `const N = (v) => (v != null ? Number(v) : 0)` and wrap every numeric value from query results.
- **`data` is the row array directly** — guard with `const rows = Array.isArray(data) ? data : []`. No `data.rows`.
- **Palette:** Primary `#0777b3`, Negative `#bc1200`, Positive `#2d7a00`, Background `#f8f8f8`, Text `#231f20`, Muted `#6a6a6a`. Party: Dem `#0777b3`, Rep `#bc1200`, Ind `#6a6a6a`.
- **No arbitrary Tailwind brackets** (`bg-[#...]`). Use `style={{}}` for custom colors/sizes. No card chrome (`bg-white`/`border`/`rounded-lg` on KPIs).
- **State:** `useDiveState(key, default)` for URL-persisted filters/selection; `useState` for ephemeral UI.
- **Scope:** U.S. Senate only (~100). Y = bills sponsored in the 119th Congress. Faces everywhere. Most-recent FEC totals per candidate.
- **Secrets:** `FEC_API_KEY` and `CONGRESS_API_KEY` live in a gitignored `.env`. NEVER hard-code or commit them. MotherDuck token for the preview is pulled via `PRAGMA PRINT_MD_TOKEN` — never printed to chat or committed.
- **MotherDuck workspace mode:** do NOT `ATTACH 'md:' AS alias`. Connect with `duckdb md:` and use `my_db.main.<table>`.

---

## File Structure

```
motherduck/
  .env                       # gitignored: FEC_API_KEY=..., CONGRESS_API_KEY=...
  .gitignore
  ingest/
    01_build_spine.py        # legislators YAML -> data/members_spine.csv
    02_pull_fec.py           # OpenFEC totals    -> data/fec_totals.csv
    03_pull_congress.py      # Congress.gov      -> data/sponsored.csv, data/bills.csv
    04_build_photos.sh       # photos -> resize -> base64 -> data/photos.csv
    push.sh                  # load all CSVs into my_db.main + build the view
  data/                      # gitignored CSV/JPG intermediates
  .dive-preview/             # Vite live-preview app (scaffolded from Dive guide)
    src/dive.tsx             # THE dive component (the deliverable)
  docs/superpowers/specs/2026-06-22-money-in-law-out-design.md
  docs/superpowers/plans/2026-06-22-money-in-law-out.md
```

---

### Task 0: Repo, secrets, and live preview

**Files:**
- Create: `.gitignore`, `.env` (user fills keys), `.dive-preview/*` (per Dive guide), `ingest/`, `data/`

**Interfaces:**
- Produces: a running Vite preview at `http://localhost:5173` connected to MotherDuck; `.env` with `FEC_API_KEY`/`CONGRESS_API_KEY` loadable via `set -a; . ./.env; set +a`.

- [ ] **Step 1: Init repo + gitignore**

```bash
cd /Users/tarikmoody/Documents/Projects/motherduck
git init
cat > .gitignore <<'EOF'
.env
.DS_Store
data/
node_modules/
.dive-preview/node_modules/
.dive-preview/.env
EOF
mkdir -p ingest data
git add .gitignore docs/ && git commit -m "chore: init money-in-law-out project"
```

- [ ] **Step 2: Create `.env` (USER action — keys not in chat)**

Create `/Users/tarikmoody/Documents/Projects/motherduck/.env` with:
```
FEC_API_KEY=<your api.data.gov key>
CONGRESS_API_KEY=<your api.congress.gov key>
```
Verify both load WITHOUT printing values:
```bash
set -a; . ./.env; set +a
[ -n "$FEC_API_KEY" ] && [ -n "$CONGRESS_API_KEY" ] && echo "keys loaded" || echo "MISSING KEYS"
```
Expected: `keys loaded`

- [ ] **Step 3: Scaffold `.dive-preview/`**

Create the eight files exactly as in the MotherDuck Dive guide "Local Preview Setup" (`.gitignore`, `.env`, `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/md-sdk.tsx`). Then populate the token from DuckDB (no secret in chat):
```bash
cd /Users/tarikmoody/Documents/Projects/motherduck/.dive-preview
TOK=$(duckdb md: -noheader -list -c "PRAGMA PRINT_MD_TOKEN;" | tr -d '[:space:]')
printf 'VITE_MOTHERDUCK_TOKEN=%s\n' "$TOK" > .env
grep -q VITE_MOTHERDUCK_TOKEN .env && echo "token written" || echo "TOKEN FAILED"
npm install
```
Expected: `token written`, then npm install completes.

- [ ] **Step 4: Hello-dive + start preview**

Create `.dive-preview/src/dive.tsx`:
```tsx
import { useSQLQuery } from "@motherduck/react-sql-query";
const N = (v: unknown): number => (v != null ? Number(v) : 0);
export default function Dive() {
  const q = useSQLQuery(`SELECT count(*) AS n FROM "sample_data"."nyc"."taxi"`);
  const rows = Array.isArray(q.data) ? q.data : [];
  return (
    <div className="p-6" style={{ background: "#f8f8f8", color: "#231f20" }}>
      <h1 className="text-2xl font-semibold">Preview online</h1>
      <p className="text-sm" style={{ color: "#6a6a6a" }}>
        {q.isLoading ? "querying…" : `sample taxi rows: ${N(rows[0]?.n).toLocaleString()}`}
      </p>
    </div>
  );
}
```
```bash
cd /Users/tarikmoody/Documents/Projects/motherduck/.dive-preview && npm run dev
```

- [ ] **Step 5: VERIFICATION GATE**

Open `http://localhost:5173`. Expected: "Preview online" + a non-zero taxi row count (proves MotherDuck connection + live query work). Commit scaffold (token/.env are gitignored):
```bash
cd /Users/tarikmoody/Documents/Projects/motherduck
git add .dive-preview ingest && git commit -m "chore: dive preview scaffold + hello dive"
```

---

### Task 1: Spine — the members bridge table

**Files:**
- Create: `ingest/01_build_spine.py`, `ingest/push.sh`
- Produces in MotherDuck: `my_db.main.members_spine(bioguide_id VARCHAR, fec_id VARCHAR, full_name VARCHAR, state VARCHAR, party VARCHAR)`

**Interfaces:**
- Produces: `members_spine`, ~100 rows (current senators), keyed by `bioguide_id`, each with one chosen `fec_id`.

- [ ] **Step 1: Write `ingest/01_build_spine.py`**

```python
#!/usr/bin/env python3
"""Build the Senate spine from the unitedstates legislators YAML."""
import csv, sys, urllib.request, yaml

URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml"
OUT = "data/members_spine.csv"

def main():
    raw = urllib.request.urlopen(URL, timeout=60).read()
    people = yaml.safe_load(raw)
    rows = []
    for p in people:
        term = p["terms"][-1]              # most recent term
        if term["type"] != "sen":          # Senate only
            continue
        ids = p.get("id", {})
        fec_list = ids.get("fec", [])
        if not fec_list:
            continue                       # need an FEC id to join money
        name = p["name"]
        full = name.get("official_full") or f'{name.get("first","")} {name.get("last","")}'.strip()
        rows.append({
            "bioguide_id": ids.get("bioguide", ""),
            "fec_id": fec_list[-1],        # most recent candidacy
            "full_name": full,
            "state": term.get("state", ""),
            "party": term.get("party", ""),
        })
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","fec_id","full_name","state","party"])
        w.writeheader(); w.writerows(rows)
    print(f"wrote {len(rows)} senators -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

```bash
cd /Users/tarikmoody/Documents/Projects/motherduck && python3 ingest/01_build_spine.py
```
Expected: `wrote 9x senators -> data/members_spine.csv` (90–100; some may lack FEC ids).

- [ ] **Step 3: Write `ingest/push.sh` (initial — spine only)**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
duckdb md: <<'SQL'
CREATE OR REPLACE TABLE my_db.main.members_spine AS
  SELECT * FROM read_csv_auto('data/members_spine.csv', header=true);
SELECT 'members_spine' AS t, count(*) AS rows FROM my_db.main.members_spine;
SQL
```
```bash
chmod +x ingest/push.sh && ./ingest/push.sh
```
Expected: a row `members_spine | 9x`.

- [ ] **Step 4: VERIFICATION GATE**

```bash
duckdb md: -c "SELECT party, count(*) FROM my_db.main.members_spine GROUP BY 1 ORDER BY 2 DESC;"
```
Expected: a sensible party split (Republican / Democrat / Independent rows summing to the total). Commit:
```bash
git add ingest/01_build_spine.py ingest/push.sh && git commit -m "feat: senate spine table (bioguide<->fec bridge)"
```

---

### Task 2: FEC money + first working scatter — **SHIP GATE 1**

**Files:**
- Create: `ingest/02_pull_fec.py`; Modify: `ingest/push.sh`, `.dive-preview/src/dive.tsx`
- Produces: `my_db.main.fec_totals(fec_id, receipts, individual_itemized, pac_contributions, cash_on_hand)` and view `my_db.main.member_money`

**Interfaces:**
- Consumes: `members_spine.fec_id`
- Produces: view `member_money(bioguide_id, full_name, state, party, receipts, pac_contributions, individual_itemized, cash_on_hand, total_raised, pct_from_pacs, pct_from_individuals)`

- [ ] **Step 1: Write `ingest/02_pull_fec.py`**

```python
#!/usr/bin/env python3
"""Pull most-recent FEC totals for each senator fec_id."""
import csv, os, sys, time, urllib.request, urllib.parse, json

KEY = os.environ["FEC_API_KEY"]
SPINE = "data/members_spine.csv"
OUT = "data/fec_totals.csv"
BASE = "https://api.open.fec.gov/v1/candidate/{cid}/totals/"

def fetch(cid):
    qs = urllib.parse.urlencode({"api_key": KEY, "per_page": 1, "sort": "-cycle"})
    url = BASE.format(cid=cid) + "?" + qs
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.load(r)
    res = data.get("results") or []
    return res[0] if res else {}

def main():
    with open(SPINE) as f:
        senators = list(csv.DictReader(f))
    out = []
    for i, s in enumerate(senators, 1):
        cid = s["fec_id"]
        try:
            t = fetch(cid)
        except Exception as e:
            print(f"  WARN {cid}: {e}", file=sys.stderr); t = {}
        out.append({
            "fec_id": cid,
            "receipts": t.get("receipts") or 0,
            "individual_itemized": t.get("individual_itemized_contributions") or 0,
            "pac_contributions": t.get("other_political_committee_contributions") or 0,
            "cash_on_hand": t.get("last_cash_on_hand_end_period") or 0,
        })
        print(f"  [{i}/{len(senators)}] {cid} receipts={out[-1]['receipts']}", file=sys.stderr)
        time.sleep(0.4)  # be polite to api.data.gov
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["fec_id","receipts","individual_itemized","pac_contributions","cash_on_hand"])
        w.writeheader(); w.writerows(out)
    print(f"wrote {len(out)} -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it (load keys first)**

```bash
cd /Users/tarikmoody/Documents/Projects/motherduck
set -a; . ./.env; set +a
python3 ingest/02_pull_fec.py
```
Expected: ~100 lines of progress, final `wrote ~100 -> data/fec_totals.csv`, most with non-zero receipts.

- [ ] **Step 3: Extend `ingest/push.sh` to load FEC + build the money view**

Append before the final `SQL` heredoc terminator (or replace the file body with):
```bash
duckdb md: <<'SQL'
CREATE OR REPLACE TABLE my_db.main.members_spine AS
  SELECT * FROM read_csv_auto('data/members_spine.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.fec_totals AS
  SELECT * FROM read_csv_auto('data/fec_totals.csv', header=true);
CREATE OR REPLACE VIEW my_db.main.member_money AS
  SELECT m.bioguide_id, m.full_name, m.state, m.party,
         f.receipts, f.pac_contributions, f.individual_itemized, f.cash_on_hand,
         f.receipts AS total_raised,
         CASE WHEN f.receipts > 0 THEN 100.0*f.pac_contributions/f.receipts ELSE 0 END AS pct_from_pacs,
         CASE WHEN f.receipts > 0 THEN 100.0*f.individual_itemized/f.receipts ELSE 0 END AS pct_from_individuals
  FROM my_db.main.members_spine m
  JOIN my_db.main.fec_totals f USING (fec_id);
SELECT 'member_money' AS t, count(*) AS rows FROM my_db.main.member_money;
SQL
```
```bash
./ingest/push.sh
```
Expected: `member_money | ~100`.

- [ ] **Step 4: Replace `.dive-preview/src/dive.tsx` with the v1 scatter**

```tsx
import { useSQLQuery, useDiveState } from "@motherduck/react-sql-query";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const N = (v: unknown): number => (v != null ? Number(v) : 0);
const PARTY = (p: string) => (p === "Democrat" ? "#0777b3" : p === "Republican" ? "#bc1200" : "#6a6a6a");
type XMetric = "total_raised" | "pct_from_pacs" | "pct_from_individuals";
const X_LABEL: Record<XMetric, string> = {
  total_raised: "Total raised ($)",
  pct_from_pacs: "% of money from PACs",
  pct_from_individuals: "% from individuals",
};

export default function Dive() {
  const [xMetric, setXMetric] = useDiveState<XMetric>("x", "pct_from_pacs");
  const q = useSQLQuery(`
    SELECT bioguide_id, full_name, state, party,
           ${"" /* metric chosen below to keep SQL static */}
           total_raised, pct_from_pacs, pct_from_individuals, cash_on_hand, receipts
    FROM "my_db"."main"."member_money"
  `);
  const rows = (Array.isArray(q.data) ? q.data : []).map((r) => ({
    name: r.full_name as string, state: r.state as string, party: r.party as string,
    x: N(r[xMetric]), y: N(r.cash_on_hand), z: N(r.receipts),
    fill: PARTY(r.party as string),
  }));

  return (
    <div className="p-6" style={{ background: "#f8f8f8", color: "#231f20" }}>
      <h1 className="text-2xl font-semibold">Money In, Law Out</h1>
      <p className="text-sm mb-4" style={{ color: "#6a6a6a" }}>U.S. Senate · campaign money (interim Y: cash on hand)</p>
      <div className="flex gap-2 mb-3">
        {(["total_raised","pct_from_pacs","pct_from_individuals"] as XMetric[]).map((m) => (
          <button key={m} onClick={() => setXMetric(m)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: xMetric===m ? "#0777b3" : "#e5e5e5", color: xMetric===m ? "#fff" : "#231f20" }}>
            {X_LABEL[m]}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <div className="bg-gray-100 animate-pulse rounded" style={{ height: 360 }} />
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid stroke="#eee" />
            <XAxis type="number" dataKey="x" name={X_LABEL[xMetric]} fontSize={11}
              tickFormatter={(v) => xMetric==="total_raised" ? `$${(v/1e6).toFixed(0)}M` : `${v.toFixed(0)}%`} />
            <YAxis type="number" dataKey="y" name="Cash on hand" fontSize={11}
              tickFormatter={(v) => `$${(v/1e6).toFixed(0)}M`} />
            <ZAxis type="number" dataKey="z" range={[40, 400]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }}
              formatter={(val: number, key: string) => key==="x" ? [X_LABEL[xMetric], ""] : [val, key]}
              content={({ payload }) => {
                const p = payload?.[0]?.payload; if (!p) return null;
                return <div className="text-xs p-2" style={{ background:"#fff", border:"1px solid #ddd" }}>
                  <strong>{p.name}</strong> ({p.state}, {p.party})</div>;
              }} />
            <Scatter data={rows} fillOpacity={0.8}
              shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={Math.sqrt(props.payload.z)/120+4} fill={props.payload.fill} fillOpacity={0.75} />} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 5: SHIP-GATE 1 VERIFICATION**

In the preview: a scatter of ~100 colored dots renders; the three X-metric buttons re-plot the cloud and the choice survives a page refresh (URL `#state=`). Tooltip shows name/state/party. Commit:
```bash
git add ingest/02_pull_fec.py ingest/push.sh .dive-preview/src/dive.tsx
git commit -m "feat: FEC money half + working scatter (ship gate 1)"
```
*This is a submittable Dive on its own. Everything after is upside.*

---

### Task 3: Congress sponsored bills — the real Y axis — **SHIP GATE 2**

**Files:**
- Create: `ingest/03_pull_congress.py`; Modify: `ingest/push.sh`, `.dive-preview/src/dive.tsx`
- Produces: `my_db.main.sponsored(bioguide_id, bills_sponsored)`, `my_db.main.bills(bioguide_id, title, latest_action, action_date)`, and view `member_money_law`

**Interfaces:**
- Consumes: `members_spine.bioguide_id`
- Produces: view `member_money_law` = `member_money` columns + `bills_sponsored INT`

- [ ] **Step 1: Write `ingest/03_pull_congress.py`**

```python
#!/usr/bin/env python3
"""Pull 119th-Congress sponsored legislation counts + top titles per senator."""
import csv, os, sys, time, urllib.request, urllib.parse, json

KEY = os.environ["CONGRESS_API_KEY"]
CONGRESS = 119
SPINE = "data/members_spine.csv"
OUT_S = "data/sponsored.csv"
OUT_B = "data/bills.csv"
BASE = "https://api.congress.gov/v3/member/{bg}/sponsored-legislation"

def fetch(bg):
    qs = urllib.parse.urlencode({"api_key": KEY, "limit": 250})
    url = BASE.format(bg=bg) + "?" + qs
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)

def main():
    with open(SPINE) as f:
        senators = list(csv.DictReader(f))
    counts, bills = [], []
    for i, s in enumerate(senators, 1):
        bg = s["bioguide_id"]
        try:
            data = fetch(bg)
        except Exception as e:
            print(f"  WARN {bg}: {e}", file=sys.stderr); data = {}
        items = [x for x in (data.get("sponsoredLegislation") or []) if x.get("congress") == CONGRESS]
        counts.append({"bioguide_id": bg, "bills_sponsored": len(items)})
        for x in items[:5]:
            la = x.get("latestAction") or {}
            bills.append({
                "bioguide_id": bg,
                "title": (x.get("title") or "").replace("\n", " ")[:240],
                "latest_action": (la.get("text") or "").replace("\n", " ")[:160],
                "action_date": la.get("actionDate") or "",
            })
        print(f"  [{i}/{len(senators)}] {bg} sponsored119={len(items)}", file=sys.stderr)
        time.sleep(0.4)
    with open(OUT_S, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","bills_sponsored"]); w.writeheader(); w.writerows(counts)
    with open(OUT_B, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","title","latest_action","action_date"]); w.writeheader(); w.writerows(bills)
    print(f"wrote {len(counts)} counts, {len(bills)} bills", file=sys.stderr)

if __name__ == "__main__":
    main()
```
> Caveat: counts 119th-Congress items within the first 250 sponsored (covers virtually all senators). Note in submission if any senator exceeds it.

- [ ] **Step 2: Run it**

```bash
cd /Users/tarikmoody/Documents/Projects/motherduck
set -a; . ./.env; set +a
python3 ingest/03_pull_congress.py
```
Expected: ~100 progress lines, `wrote ~100 counts, NNN bills`.

- [ ] **Step 3: Extend `ingest/push.sh`**

Add these statements to the heredoc (after the fec_totals table, before/after the view — replace the `member_money` view with `member_money_law`):
```sql
CREATE OR REPLACE TABLE my_db.main.sponsored AS
  SELECT * FROM read_csv_auto('data/sponsored.csv', header=true);
CREATE OR REPLACE TABLE my_db.main.bills AS
  SELECT * FROM read_csv_auto('data/bills.csv', header=true);
CREATE OR REPLACE VIEW my_db.main.member_money_law AS
  SELECT mm.*, COALESCE(sp.bills_sponsored, 0) AS bills_sponsored
  FROM my_db.main.member_money mm
  LEFT JOIN my_db.main.sponsored sp USING (bioguide_id);
SELECT 'member_money_law' AS t, count(*) AS rows, sum(bills_sponsored) AS total_bills
FROM my_db.main.member_money_law;
```
```bash
./ingest/push.sh
```
Expected: `member_money_law | ~100 | <non-zero total_bills>`.

- [ ] **Step 4: Update `dive.tsx` — real Y axis + shock KPI**

Change the query source to `member_money_law`, select `bills_sponsored`, and set `y: N(r.bills_sponsored)`. Update the YAxis to `name="Bills sponsored (119th)"` with `tickFormatter={(v)=>String(v)}` and remove the `$M` formatter on Y. Update subtitle to `U.S. Senate · campaign money vs. bills sponsored, 119th Congress`. Add a KPI row above the chart driven by a second query:
```tsx
const kpi = useSQLQuery(`
  WITH r AS (
    SELECT bills_sponsored, receipts,
           ntile(10) OVER (ORDER BY receipts DESC) AS receipt_decile
    FROM "my_db"."main"."member_money_law"
  )
  SELECT median(bills_sponsored) FILTER (WHERE receipt_decile = 1) AS top_funded_median_bills,
         median(bills_sponsored) AS overall_median_bills,
         count(*) AS n
  FROM r
`);
const k = (Array.isArray(kpi.data) ? kpi.data : [])[0] ?? {};
```
Render (above the buttons):
```tsx
<div className="grid grid-cols-3 gap-8 mb-6">
  <div><p className="text-5xl font-bold">{N(k.top_funded_median_bills)}</p>
       <p className="text-sm mt-1" style={{color:"#6a6a6a"}}>median bills — top-funded 10%</p></div>
  <div><p className="text-5xl font-bold">{N(k.overall_median_bills)}</p>
       <p className="text-sm mt-1" style={{color:"#6a6a6a"}}>median bills — all senators</p></div>
  <div><p className="text-5xl font-bold">{N(k.n)}</p>
       <p className="text-sm mt-1" style={{color:"#6a6a6a"}}>senators</p></div>
</div>
```

- [ ] **Step 5: SHIP-GATE 2 VERIFICATION**

Preview shows: KPI row with real medians, scatter Y now = bills sponsored, X toggle still works. Read the two medians — that contrast is the story. Commit:
```bash
git add ingest/03_pull_congress.py ingest/push.sh .dive-preview/src/dive.tsx
git commit -m "feat: congress sponsored-bill Y axis + shock KPI (ship gate 2)"
```

---

### Task 4: Faces everywhere

**Files:**
- Create: `ingest/04_build_photos.sh`; Modify: `ingest/push.sh`, `.dive-preview/src/dive.tsx`
- Produces: `my_db.main.photos(bioguide_id, photo_uri)`; `photo_uri` added to `member_money_law`

**Interfaces:**
- Produces: `member_money_law.photo_uri` = `data:image/jpeg;base64,...` (~32px thumb) or NULL.

- [ ] **Step 1: Write `ingest/04_build_photos.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/img
HOST="https://unitedstates.github.io/images/congress/225x275"
# bioguide list from the spine
duckdb md: -noheader -list -c "SELECT bioguide_id FROM my_db.main.members_spine" > data/_bg.txt
: > data/photos.csv
echo "bioguide_id,photo_uri" >> data/photos.csv
while read -r BG; do
  [ -z "$BG" ] && continue
  if curl -fsS --max-time 30 "$HOST/$BG.jpg" -o "data/img/$BG.src.jpg"; then
    sips -Z 36 "data/img/$BG.src.jpg" --out "data/img/$BG.jpg" >/dev/null 2>&1 || cp "data/img/$BG.src.jpg" "data/img/$BG.jpg"
    URI=$(duckdb -noheader -list -c "SELECT 'data:image/jpeg;base64,' || base64(content) FROM read_blob('data/img/$BG.jpg')")
    printf '%s,"%s"\n' "$BG" "$URI" >> data/photos.csv
    echo "  ok $BG ${#URI} chars" >&2
  else
    echo "  MISS $BG" >&2
  fi
done < data/_bg.txt
echo "photos written" >&2
```
```bash
chmod +x ingest/04_build_photos.sh && ./ingest/04_build_photos.sh
```
Expected: ~100 `ok <bg> ~1500-2500 chars` lines.

- [ ] **Step 2: Load photos + add to view in `ingest/push.sh`**

Add:
```sql
CREATE OR REPLACE TABLE my_db.main.photos AS
  SELECT * FROM read_csv_auto('data/photos.csv', header=true, quote='"');
```
And change the `member_money_law` view to add `ph.photo_uri`:
```sql
CREATE OR REPLACE VIEW my_db.main.member_money_law AS
  SELECT mm.*, COALESCE(sp.bills_sponsored, 0) AS bills_sponsored, ph.photo_uri
  FROM my_db.main.member_money mm
  LEFT JOIN my_db.main.sponsored sp USING (bioguide_id)
  LEFT JOIN my_db.main.photos ph USING (bioguide_id);
```
```bash
./ingest/push.sh
duckdb md: -c "SELECT count(*) AS with_photo FROM my_db.main.member_money_law WHERE photo_uri IS NOT NULL;"
```
Expected: `with_photo` ≈ 95–100.

- [ ] **Step 3: Render faces — custom Recharts scatter `shape`**

Add `photo_uri` to the row mapping (`uri: r.photo_uri as string`). Replace the `<Scatter ... shape={circle}>` with a face shape. Add this component above `Dive`:
```tsx
function FaceDot(props: any) {
  const { cx, cy, payload } = props;
  const r = Math.sqrt(payload.z) / 140 + 9;      // size by receipts
  const id = "clip-" + payload.bioguide;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <defs><clipPath id={id}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
      {payload.uri
        ? <image href={payload.uri} x={cx - r} y={cy - r} width={r*2} height={r*2}
            clipPath={`url(#${id})`} preserveAspectRatio="xMidYMid slice" />
        : <circle cx={cx} cy={cy} r={r} fill={payload.fill} fillOpacity={0.7} />}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={payload.fill} strokeWidth={2} />
    </g>
  );
}
```
Add `bioguide: r.bioguide_id` and `uri` to the row objects, and set `<Scatter data={rows} shape={<FaceDot />} isAnimationActive={false} />`.

- [ ] **Step 4: VERIFICATION GATE**

Preview: ~100 circular senator photos with blue/red rings positioned by money×bills. Confirm it reads as a constellation, not mush — if too dense, drop base radius (`+9`→`+7`) and/or set `fillOpacity`. Commit:
```bash
git add ingest/04_build_photos.sh ingest/push.sh .dive-preview/src/dive.tsx
git commit -m "feat: faces everywhere (base64 photo scatter points)"
```

---

### Task 5: Click-to-drill member detail panel

**Files:** Modify `.dive-preview/src/dive.tsx`

**Interfaces:**
- Consumes: `member_money_law`, `bills`
- Produces: selection state `useDiveState("sel", "")` holding a bioguide_id; detail panel.

- [ ] **Step 1: Add selection + detail query**

```tsx
const [sel, setSel] = useDiveState<string>("sel", "");
const detail = useSQLQuery(
  `SELECT full_name, state, party, receipts, pac_contributions, cash_on_hand, bills_sponsored, photo_uri
   FROM "my_db"."main"."member_money_law" WHERE bioguide_id = '${sel.replace(/'/g, "")}'`,
  { enabled: !!sel }
);
const bills = useSQLQuery(
  `SELECT title, latest_action, action_date FROM "my_db"."main"."bills"
   WHERE bioguide_id = '${sel.replace(/'/g, "")}' ORDER BY action_date DESC LIMIT 5`,
  { enabled: !!sel }
);
const d = (Array.isArray(detail.data) ? detail.data : [])[0];
const billRows = Array.isArray(bills.data) ? bills.data : [];
```

- [ ] **Step 2: Make faces clickable**

On the `<Scatter>` add `onClick={(p:any)=> setSel(p?.bioguide || "")}` (payload carries `bioguide`). Add a cursor hint in `FaceDot` via `style={{cursor:"pointer"}}` on the `<g>`.

- [ ] **Step 3: Render the detail panel (below the chart)**

```tsx
{sel && d && (
  <div className="mt-4 flex gap-4 items-start" style={{ borderTop: "1px solid #ddd", paddingTop: 12 }}>
    {d.photo_uri && <img src={d.photo_uri as string} alt="" width={64} height={64} style={{ borderRadius: 999, border: `3px solid ${PARTY(d.party as string)}` }} />}
    <div className="flex-1">
      <div className="flex justify-between">
        <strong>{d.full_name as string} <span style={{color:"#6a6a6a"}}>({d.state}, {d.party})</span></strong>
        <button className="text-xs" style={{color:"#6a6a6a"}} onClick={()=>setSel("")}>close ✕</button>
      </div>
      <div className="grid grid-cols-3 gap-4 my-2 text-sm">
        <div><div className="font-bold">${(N(d.receipts)/1e6).toFixed(1)}M</div><div style={{color:"#6a6a6a"}}>raised</div></div>
        <div><div className="font-bold">${(N(d.pac_contributions)/1e6).toFixed(1)}M</div><div style={{color:"#6a6a6a"}}>from PACs</div></div>
        <div><div className="font-bold">{N(d.bills_sponsored)}</div><div style={{color:"#6a6a6a"}}>bills sponsored</div></div>
      </div>
      <ul className="text-xs" style={{color:"#231f20"}}>
        {billRows.map((b,i)=>(<li key={i} className="mb-1">• {b.title as string} <span style={{color:"#6a6a6a"}}>— {b.latest_action as string}</span></li>))}
        {billRows.length===0 && <li style={{color:"#6a6a6a"}}>No 119th-Congress bills found.</li>}
      </ul>
    </div>
  </div>
)}
```

- [ ] **Step 4: VERIFICATION GATE**

Preview: click a face → panel shows that senator's photo, money KPIs, and up to 5 real bill titles; close works; selection persists in URL on refresh. Commit:
```bash
git add .dive-preview/src/dive.tsx && git commit -m "feat: click-to-drill member detail panel"
```

---

### Task 6: Polish, filters, and submit

**Files:** Modify `.dive-preview/src/dive.tsx`

- [ ] **Step 1: Party filter (URL-persisted)**

Add `const [party, setParty] = useDiveState<string>("party", "all")` and a small button group ("All / Dem / Rep / Ind"). Filter `rows` client-side: `.filter(r => party==="all" || r.party===PARTY_NAME[party])`. (Keep the SQL static; filter the mapped array.)

- [ ] **Step 2: Quadrant cue + final copy**

Add a one-line interpretive caption under the title stating the finding in specific numbers (write it from the verified KPI values, matter-of-fact, e.g. "Top-funded senators raised $X M and sponsored a median of N bills"). Add faint axis-corner labels via Recharts `<text>`/reference or a positioned `<div>` ("more money →", "↑ more bills").

- [ ] **Step 3: Pre-Save Checklist (from the Dive guide)**

Verify: default export ✅; all hooks imported (`useSQLQuery`, `useDiveState`) ✅; no IIFE ✅; hooks inside component ✅; only allowed libraries ✅; `N()` wraps all numerics ✅; dates via `strftime`/string only ✅; no export buttons unless requested ✅; fully-qualified double-quoted tables ✅.

- [ ] **Step 4: Save the Dive (USER approval required)**

Show the final `dive.tsx` to the user. On approval, save via MCP:
```
save_dive(title="Money In, Law Out", content=<contents of .dive-preview/src/dive.tsx>)
```
(Or the duckdb fast path from the guide if preferred.)

- [ ] **Step 5: Submit + commit**

Publish the Dive to the DiveMaxxing Gallery, category **Most Creative**. Final commit:
```bash
git add .dive-preview/src/dive.tsx && git commit -m "feat: filters, finding copy, polish — submission ready"
```

---

## Stretch (only if time remains, in order)
1. **"Became law" Y toggle** — enrich `03_pull_congress.py` to fetch each bill's `latestAction`/`laws`; add `became_law` count column; toggle Y between sponsored/became-law via `useDiveState`.
2. **House members** — drop the `type != "sen"` filter in `01_build_spine.py`; expect a denser 535-point view (revisit face size).
3. **Animated entrance** — `isAnimationActive` on Scatter (only if it doesn't hurt readability).

---

## Self-Review

**Spec coverage:** concept (Task 2–5) ✅ · faces-everywhere (Task 4) ✅ · Senate/100 + Y=bills sponsored (Tasks 1,3) ✅ · 4 sources + bridge join (Tasks 1–4) ✅ · table model + `member_money_law` view (Tasks 2–4) ✅ · X-metric toggle + filters + drilldown (Tasks 2,5,6) ✅ · shock KPI (Task 3) ✅ · risk ladder / ship gates (Tasks 2,3) ✅ · secure keys + MD token (Task 0) ✅ · format constraints (Global Constraints) ✅. No uncovered spec requirement.

**Placeholder scan:** No TBD/TODO. The "finding caption" (Task 6 Step 2) and shock-KPI text are intentionally written from verified data at build time, not invented — that's a deliberate discover-then-name step, with concrete SQL provided.

**Type consistency:** `member_money` (Task 2) → extended to `member_money_law` (Task 3, adds `bills_sponsored`; Task 4, adds `photo_uri`). Row object keys (`x,y,z,fill,party,state,name,bioguide,uri`) are consistent across `FaceDot`/Scatter/Tooltip. `N()` defined once, used throughout. `PARTY()` maps party→hex consistently; `PARTY_NAME` (Task 6) maps filter key→party string. CSV column names match the `read_csv_auto` loads and the view selects.
