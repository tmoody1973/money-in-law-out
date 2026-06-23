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
BY_STATE = "https://api.open.fec.gov/v1/schedules/schedule_a/by_state/by_candidate/"

def fetch_cycles(cid):
    qs = urllib.parse.urlencode({"api_key": KEY, "per_page": 100})
    url = BASE.format(cid=cid) + "?" + qs
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.load(r)
    # keep only real per-cycle rows (drop rolling-aggregate cycle=null rows)
    return [x for x in (data.get("results") or []) if x.get("cycle") is not None]

def fetch_by_state(cid, cycle, home_state):
    """Return (in_state_amount, out_of_state_amount) for a candidate's cycle."""
    qs = urllib.parse.urlencode({"api_key": KEY, "candidate_id": cid, "cycle": cycle, "per_page": 60})
    url = BY_STATE + "?" + qs
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.load(r)
    in_amt = out_amt = 0.0
    for row in (data.get("results") or []):
        amt = num(row.get("total"))
        if row.get("state") == home_state:
            in_amt += amt
        else:
            out_amt += amt
    return in_amt, out_amt

def num(v):
    return float(v) if v is not None else 0.0

def main():
    with open(SPINE) as f:
        senators = list(csv.DictReader(f))
    out = []
    for i, s in enumerate(senators, 1):
        cid = s["fec_id"]
        home = s["state"]
        peak = {}
        career = cash = 0.0
        peak_cycle = 0
        try:
            cycles = fetch_cycles(cid)
            if cycles:
                peak = max(cycles, key=lambda x: num(x.get("receipts")))
                peak_cycle = peak.get("cycle") or 0
                career = sum(num(x.get("receipts")) for x in cycles)
                latest = max(cycles, key=lambda x: x.get("cycle"))
                cash = num(latest.get("last_cash_on_hand_end_period"))
        except Exception as e:
            print(f"  WARN totals {cid}: {e}", file=sys.stderr)
        in_amt = out_amt = 0.0
        if peak_cycle:
            try:
                in_amt, out_amt = fetch_by_state(cid, peak_cycle, home)
            except Exception as e:
                print(f"  WARN by_state {cid}: {e}", file=sys.stderr)
        geo_total = in_amt + out_amt
        out.append({
            "fec_id": cid,
            "peak_cycle": peak_cycle,
            "receipts": num(peak.get("receipts")),
            "individual_itemized": num(peak.get("individual_itemized_contributions")),
            "individual_unitemized": num(peak.get("individual_unitemized_contributions")),
            "pac_contributions": num(peak.get("other_political_committee_contributions")),
            "career_receipts": round(career, 2),
            "cash_on_hand": cash,
            "in_state": round(in_amt, 2),
            "out_state": round(out_amt, 2),
            "out_state_pct": round(100.0 * out_amt / geo_total, 1) if geo_total > 0 else 0,
        })
        print(f"  [{i}/{len(senators)}] {cid} peak={peak_cycle} "
              f"receipts={out[-1]['receipts']:.0f} out_of_state={out[-1]['out_state_pct']}%", file=sys.stderr)
        time.sleep(0.25)
    with open(OUT, "w", newline="") as f:
        cols = ["fec_id","peak_cycle","receipts","individual_itemized","individual_unitemized",
                "pac_contributions","career_receipts","cash_on_hand",
                "in_state","out_state","out_state_pct"]
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(out)
    print(f"wrote {len(out)} -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
