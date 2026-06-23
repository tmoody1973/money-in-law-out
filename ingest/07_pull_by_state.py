#!/usr/bin/env python3
"""Per-senator: which OTHER states their campaign money came from (top 5).

Uses FEC schedule_a/by_state/by_candidate for each senator's peak cycle, drops
their home state, and keeps the top 5 out-of-state source states by dollars.
"""
import csv, os, sys, time, urllib.request, urllib.parse, urllib.error, json

KEY = os.environ["FEC_API_KEY"]
SPINE = "data/members_spine.csv"
TOTALS = "data/fec_totals.csv"
OUT = "data/out_of_state.csv"
URL = "https://api.open.fec.gov/v1/schedules/schedule_a/by_state/by_candidate/"

def get(url, retries=5):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 403) and attempt < retries - 1:
                time.sleep(5 * (attempt + 1)); continue
            raise

def main():
    with open(SPINE) as f:
        rows = list(csv.DictReader(f))
        home = {r["fec_id"]: r["state"] for r in rows}
        bg = {r["fec_id"]: r["bioguide_id"] for r in rows}
    with open(TOTALS) as f:
        cyc = {r["fec_id"]: int(r["peak_cycle"] or 0) for r in csv.DictReader(f)}
    out = []
    for i, (cid, st) in enumerate(home.items(), 1):
        cycle = cyc.get(cid) or 0
        top = []
        if cycle:
            try:
                qs = urllib.parse.urlencode({"api_key": KEY, "candidate_id": cid, "cycle": cycle, "per_page": 60})
                res = get(URL + "?" + qs).get("results") or []
                others = [(r.get("state"), float(r.get("total") or 0)) for r in res if r.get("state") and r.get("state") != st]
                others.sort(key=lambda x: x[1], reverse=True)
                top = others[:5]
            except Exception as e:
                print(f"  WARN {cid}: {e}", file=sys.stderr)
        for rank, (state, amt) in enumerate(top, 1):
            out.append({"bioguide_id": bg[cid], "from_state": state, "amount": round(amt, 2), "rank": rank})
        print(f"  [{i}/{len(home)}] {bg[cid]} top_states={[s for s,_ in top][:3]}", file=sys.stderr)
        time.sleep(0.3)
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","from_state","amount","rank"])
        w.writeheader(); w.writerows(out)
    print(f"wrote {len(out)} state rows -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
