#!/usr/bin/env python3
"""Pull FEC totals for each senator and derive a meaningful money metric.

The /candidate/{id}/totals/ endpoint returns one row per election cycle (plus
some rolling-aggregate rows with cycle=null, which we drop). We keep only real
per-cycle rows and derive:
  - peak campaign: the cycle with the MOST receipts (their biggest real race),
    plus that cycle's PAC + individual money (for the % toggles)
  - career_receipts: sum of receipts across all real cycles
  - cash_on_hand: from the most recent cycle row
"""
import csv, os, sys, time, urllib.request, urllib.parse, json

KEY = os.environ["FEC_API_KEY"]
SPINE = "data/members_spine.csv"
OUT = "data/fec_totals.csv"
BASE = "https://api.open.fec.gov/v1/candidate/{cid}/totals/"

def fetch_cycles(cid):
    qs = urllib.parse.urlencode({"api_key": KEY, "per_page": 100})
    url = BASE.format(cid=cid) + "?" + qs
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.load(r)
    # keep only real per-cycle rows (drop rolling-aggregate cycle=null rows)
    return [x for x in (data.get("results") or []) if x.get("cycle") is not None]

def num(v):
    return float(v) if v is not None else 0.0

def main():
    with open(SPINE) as f:
        senators = list(csv.DictReader(f))
    out = []
    for i, s in enumerate(senators, 1):
        cid = s["fec_id"]
        peak = {}
        career = 0.0
        cash = 0.0
        try:
            cycles = fetch_cycles(cid)
            if cycles:
                peak = max(cycles, key=lambda x: num(x.get("receipts")))
                career = sum(num(x.get("receipts")) for x in cycles)
                latest = max(cycles, key=lambda x: x.get("cycle"))
                cash = num(latest.get("last_cash_on_hand_end_period"))
        except Exception as e:
            print(f"  WARN {cid}: {e}", file=sys.stderr)
        out.append({
            "fec_id": cid,
            "peak_cycle": peak.get("cycle") or 0,
            "receipts": num(peak.get("receipts")),
            "individual_itemized": num(peak.get("individual_itemized_contributions")),
            "pac_contributions": num(peak.get("other_political_committee_contributions")),
            "career_receipts": round(career, 2),
            "cash_on_hand": cash,
        })
        print(f"  [{i}/{len(senators)}] {cid} peak={out[-1]['peak_cycle']} "
              f"receipts={out[-1]['receipts']:.0f}", file=sys.stderr)
        time.sleep(0.25)
    with open(OUT, "w", newline="") as f:
        cols = ["fec_id","peak_cycle","receipts","individual_itemized",
                "pac_contributions","career_receipts","cash_on_hand"]
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(out)
    print(f"wrote {len(out)} -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
