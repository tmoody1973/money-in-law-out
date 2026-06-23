#!/usr/bin/env python3
"""Super PAC / independent-expenditure money for and against each senator.

FEC Schedule E (by_candidate) reports UNCAPPED outside spending that supports
('S') or opposes ('O') a candidate, by committee. We aggregate support/oppose
totals and keep the top 5 spending committees per senator (their peak cycle).
"""
import csv, os, sys, time, urllib.request, urllib.parse, urllib.error, json

KEY = os.environ["FEC_API_KEY"]
SPINE = "data/members_spine.csv"
TOTALS = "data/fec_totals.csv"
OUT_AGG = "data/super_pac_totals.csv"
OUT_TOP = "data/super_pac.csv"
URL = "https://api.open.fec.gov/v1/schedules/schedule_e/by_candidate/"

def get(url, retries=5):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 403) and attempt < retries - 1:
                time.sleep(5 * (attempt + 1)); continue
            raise

def num(v): return float(v) if v is not None else 0.0

def main():
    with open(SPINE) as f:
        bg = {r["fec_id"]: r["bioguide_id"] for r in csv.DictReader(f)}
    with open(TOTALS) as f:
        cyc = {r["fec_id"]: int(r["peak_cycle"] or 0) for r in csv.DictReader(f)}
    agg, top = [], []
    for i, (cid, b) in enumerate(bg.items(), 1):
        cycle = cyc.get(cid) or 0
        support = oppose = 0.0
        rows = []
        if cycle:
            try:
                qs = urllib.parse.urlencode({"api_key": KEY, "candidate_id": cid, "cycle": cycle, "per_page": 100})
                rows = get(URL + "?" + qs).get("results") or []
            except Exception as e:
                print(f"  WARN {cid}: {e}", file=sys.stderr)
        for r in rows:
            t = num(r.get("total"))
            if r.get("support_oppose_indicator") == "S": support += t
            elif r.get("support_oppose_indicator") == "O": oppose += t
        agg.append({"bioguide_id": b, "support_total": round(support, 2), "oppose_total": round(oppose, 2)})
        ranked = sorted(rows, key=lambda r: num(r.get("total")), reverse=True)[:5]
        for rank, r in enumerate(ranked, 1):
            top.append({"bioguide_id": b, "committee": (r.get("committee_name") or "").title(),
                        "support_oppose": r.get("support_oppose_indicator") or "",
                        "total": round(num(r.get("total")), 2), "rank": rank})
        print(f"  [{i}/{len(bg)}] {b} support={support:.0f} oppose={oppose:.0f}", file=sys.stderr)
        time.sleep(0.3)
    with open(OUT_AGG, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","support_total","oppose_total"]); w.writeheader(); w.writerows(agg)
    with open(OUT_TOP, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","committee","support_oppose","total","rank"]); w.writeheader(); w.writerows(top)
    print(f"wrote {len(agg)} totals, {len(top)} committee rows", file=sys.stderr)

if __name__ == "__main__":
    main()
