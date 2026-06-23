# Money In, Law Out — DiveMaxxing Entry Design

**Date:** 2026-06-22
**Author:** Tarik Moody (+ Claude)
**Contest:** MotherDuck DiveMaxxing (closes tonight, midnight PT)
**Target category:** Most Creative (surprise / originality / ambition / execution)

---

## One-line concept

A single interactive MotherDuck Dive where **each U.S. Senator is their own face** plotted by
**campaign money raised (X)** against **bills they sponsored (Y)** — revealing whether money
buys legislating, or just buys campaigns.

## Why this can win Most Creative

- **Sharp, surprising question** — the money↔law relationship, made personal with faces.
- **Original within the format** — faces-as-scatter-points is novel; the FEC×Congress join is the idea.
- **Discovered finding** — the headline KPI is written *after* we see what the cloud of faces shows
  (e.g. "the 10 best-funded senators sponsored a median of N bills").
- Fits the Dive house style (Recharts, matter-of-fact, live SQL) rather than fighting it.

---

## Hard format constraints (verified against the official Dive guide)

These shaped every decision below. A Dive is:

- A **single React function component, default export**. ~**800×600px** canvas. **1–2 charts max.**
- Charts via **Recharts only** (Bar/Line/Pie/Scatter/Area). **No raw SVG spectacle, no Sankey, no maps,
  no force-directed networks.** Custom Recharts scatter `shape` IS allowed (that's how faces render).
- **Cannot fetch external APIs or images** (CSP = `*.motherduck.com` only). All data, **including photos**,
  must already live **inside MotherDuck**. Photos are embedded as inline base64 **data URIs** (CSP-safe).
- Data access via `useSQLQuery`; interactivity/URL-state via `useDiveState`.
- House style: party colors within palette (Dem `#0777b3`, Rep `#bc1200`, Ind gray), no card chrome,
  specific numbers, `N()` helper on all numeric values, fully-qualified `"my_db"."main"."table"` names.

---

## Scope (locked)

- **Senate first — 100 members.** Clean readable scatter, fast Congress.gov crawl, national story.
  House is a stretch only if time remains.
- **Y axis = bills sponsored** (current Congress). "Became law" is a stretch toggle.
- **Faces everywhere** — every senator is a ~30px circular photo with a party-colored ring;
  hovered/selected enlarges. Size encodes total receipts. Tune size/opacity in preview for legibility.

---

## Data pipeline (all sources verified reachable 2026-06-22)

The Dive cannot reach the web, so we load once into `my_db` via the local DuckDB CLI, then point the
Dive at the resulting tables. **Build locally → push to MotherDuck.** (MotherDuck cloud httpfs reads
timed out in testing, so we do NOT rely on the Dive/cloud fetching live URLs.)

### Sources
| Source | URL | Gives us | Verified |
|---|---|---|---|
| Legislators bridge | `raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml` (1.08 MB) | `bioguide` ↔ `fec` IDs + name/state/party/chamber — **the join key** | 200 ✅ |
| FEC money | OpenFEC `api.open.fec.gov/v1/candidates/totals/` | receipts, individual_itemized, PAC contributions, cash-on-hand | 200 ✅ (DEMO_KEY) |
| Congress law | Congress.gov `api.congress.gov/v3/member/{bioguide}/sponsored-legislation` | bills sponsored count + titles | host alive (needs key) ✅ |
| Photos | `unitedstates.github.io/images/congress/225x275/{bioguide}.jpg` (~49 KB) | member portrait | 200 ✅ |

### Tables (in `my_db.main`)
- `members(bioguide_id, fec_id, full_name, state, chamber, party, photo_uri)`
  - `photo_uri` = `data:image/jpeg;base64,...` of a **~32px** thumbnail (raw 49 KB → ~1–2 KB each;
    resize with macOS `sips -Z 36`; ~150–250 KB total across 100 senators).
- `fec_totals(fec_id, receipts, individual_itemized, pac_contributions, cash_on_hand)`
- `sponsored(bioguide_id, bills_sponsored)`
- `bills(bioguide_id, title, latest_action, action_date)` — top ~5 per member, for drilldown.
- **View** `member_money_law` — joins members + fec_totals + sponsored on the bridge, derives
  `pct_from_pacs`, `pct_from_individuals`, `total_raised`. The Dive queries only this view + `bills`.

### Join notes
- A member may have multiple `fec` IDs (House→Senate history); pick the one matching current office /
  most recent cycle.
- Congress = 119th (current). Bills sponsored counted within it.

---

## The Dive component

### Layout (top → bottom, within ~600px tall)
1. **Title + one-line framing.**
2. **Shock-number KPI row** (1–3 KPIs) — computed finding, written after we see the data.
3. **Hero scatter** (the only chart): X = money metric, Y = bills sponsored. Points = senator faces.
4. **Member detail panel** — appears on face click: big photo, money KPIs, last ~5 sponsored bills.

### Interactions
- **X-metric toggle** (`useDiveState`): Total raised · % from PACs · % from individuals.
- **Filters** (`useDiveState`, URL-persisted): party (D/R/I), optionally region.
- **Click a face** → set selected bioguide in `useDiveState` → detail panel re-queries `bills`
  (`{ enabled: !!selected }`).
- **Hover** → enlarge face + tooltip (name, state, the two plotted numbers).

### Queries (one per visual)
- `useSQLQuery` #1: KPI aggregates from `member_money_law`.
- `useSQLQuery` #2: full scatter rows (bioguide, x metric, bills_sponsored, party, receipts, photo_uri).
- `useSQLQuery` #3: selected member's bills (enabled on selection).

### Rendering faces
- Recharts `<ScatterChart>` with a custom `shape` component that renders a clipped circular
  `<image href={photo_uri}>` sized by receipts, with a party-colored `<circle>` ring.
- Progressive load: render scatter positions first; faces fill in (photo_uri can be a second query if needed).

---

## Build sequence — risk ladder (ambitious but always ships)

1. **Spine + FEC half** → working scatter (X = money, Y = receipts/cash). *Submittable on its own.*
2. **Add Congress sponsored counts** → real Y axis = the actual thesis.
3. **Add faces** (download → resize → base64 → store → custom shape).
4. **Add bill-title drilldown** → texture.
5. **Stretch** → "became law" toggle, House members, polish.

Ship after step 2 at the latest; everything after is upside.

## Prerequisites
- **FEC (api.data.gov) key** — ✅ in hand. Use as env var (`FEC_API_KEY`); never hard-code or commit.
- **Congress.gov key** — ✅ in hand. Use as env var (`CONGRESS_API_KEY`); never hard-code or commit.
- **`MOTHERDUCK_TOKEN`** in shell env (for the local `.dive-preview` Vite preview) — to confirm.

## Out of scope (YAGNI)
- Maps, network graphs, Sankey (format won't render them).
- House members in v1. "Became law" status crawl in v1. Committee-roster slicing.
- Historical cycles — current Congress / latest cycle only.

## Open risks
- **Face readability** at 100 points on 800×600 — mitigated by small size + hover-enlarge; fallback to
  faces-for-notable-only if mush.
- **Congress.gov rate limits** across 100 members — sequential pulls with light backoff; cache locally.
- **fec_id disambiguation** for members with multiple candidacies.

---

## Implemented enhancements (during build, beyond original spec)
- **Full dark theme** (bg `#0d1117`, Dem `#4aa3df`, Rep `#ff6b6b`) — dark themes are officially supported
  (theme gallery: Dark Canvas, etc.). Matches the "A Home Fit For You" modal aesthetic.
- **Rich click modal** (not just an inline panel): photo, hero stats, money-mix bar, out-of-state %,
  committees, top org donors, recent bills.
- **Extra data captured:** `out_state_pct` (FEC Schedule A by-state), small-dollar (`individual_unitemized`),
  `dollars_per_resident` (state pop table), committee assignments (unitedstates YAML), top org donors
  (FEC by_employer, junk-employer filtered), peak-campaign vs career money.
- **Pivot:** "top issues" via `policyArea` was dropped — CRS leaves it unpopulated for most current-Congress
  bills (verified: 18/20 EMPTY). Replaced with committee assignments (cleaner, complete).
- **X-metric is peak campaign** (max-receipts cycle), not current cycle (which is near-empty for most senators).

## v2 — Lobbying influence graph (deferred, post-hackathon)
Adds the influence industry as a third actor: **client/firm → lobbied bill → senator who sponsored it**.
- **Sources:** Senate LDA API (raw LD-1/LD-2/LD-203; note: site sunsets 2026-06-30 → LDA.gov) ·
  **LobbyView** bill-level dataset (the clean filing↔bill join) · OpenSecrets bulk (entity enrichment;
  no live API since 2025-04).
- **Join path:** lobbyist → registrant → client → filing → (issue code + bill #) → bill sponsor → senator → committee.
  Strongest public edge = "client lobbied a bill Senator Y sponsored" (not direct contact).
- **Why deferred:** unfamiliar multi-table ETL (fuzzy LDA bill-number matching, large LobbyView files),
  too risky against a same-day deadline with a working entry to protect.
- **Min schema:** `filings, clients, registrants, lobbyists, filing_issues, filing_bills, bills, senators,
  committees, senator_bill_edges, client_senator_influence_edges`.
- **In-Dive surface:** modal section "Lobbying pressure on their bills" — top clients/firms that lobbied
  the bills this senator sponsored, + filing counts by issue.

## v2 — Super PAC / outside money (deferred)
Named individual donors to the campaign committee are capped (~$6,600/cycle) so they all cluster at the
max — not differentiating, not worth showing. The real mega-donor story is **uncapped outside money**:
- **Source:** FEC independent expenditures + Super PAC (`/schedules/schedule_e/`, committee spending by
  support/oppose candidate). Uncapped, so single donors can move millions — genuinely differentiating.
- **In-Dive surface:** modal section "Outside money" — total Super PAC $ supporting vs. opposing each
  senator, and the top spending committees. Pairs with the campaign-committee money already shown.
- **Why deferred:** separate FEC dataset + entity resolution; same deadline-risk logic as lobbying.
