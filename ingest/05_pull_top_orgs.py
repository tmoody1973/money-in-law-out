#!/usr/bin/env python3
"""Top organization donors per senator, via FEC by_employer aggregation.

Raw FEC 'employer' data is dominated by non-orgs (NOT EMPLOYED, RETIRED, SELF
EMPLOYED, …). We filter those out so real organizations (Microsoft, Amazon…)
surface, then keep the top 5 per senator.
"""
import csv, os, sys, time, urllib.request, urllib.parse, json

KEY = os.environ["FEC_API_KEY"]
SPINE = "data/members_spine.csv"
TOTALS = "data/fec_totals.csv"
OUT = "data/top_orgs.csv"
CMTE_URL = "https://api.open.fec.gov/v1/candidate/{cid}/committees/"
EMP_URL = "https://api.open.fec.gov/v1/schedules/schedule_a/by_employer/"

# employer strings that are not organizations
JUNK = {"NOT EMPLOYED","SELF EMPLOYED","SELF-EMPLOYED","RETIRED","NONE","NULL",
        "HOMEMAKER","NOT APPLICABLE","N/A","NA","INFORMATION REQUESTED","UNEMPLOYED",
        "NOT PROVIDED","REQUESTED","SELF","BEST EFFORTS","NOT REQUIRED","INDIVIDUAL"}

def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)

def principal_committee(cid):
    qs = urllib.parse.urlencode({"api_key": KEY, "designation": "P", "per_page": 1})
    res = get(CMTE_URL.format(cid=cid) + "?" + qs).get("results") or []
    return res[0]["committee_id"] if res else None

def top_orgs(cmte, cycle, n=5):
    qs = urllib.parse.urlencode({"api_key": KEY, "committee_id": cmte, "cycle": cycle,
                                 "per_page": 30, "sort": "-total"})
    rows = get(EMP_URL + "?" + qs).get("results") or []
    out = []
    for row in rows:
        emp = (row.get("employer") or "").strip()
        if not emp or emp.upper() in JUNK:
            continue
        out.append((emp.title(), float(row.get("total") or 0)))
        if len(out) >= n:
            break
    return out

def main():
    with open(SPINE) as f:
        spine = {r["fec_id"]: r["bioguide_id"] for r in csv.DictReader(f)}
    with open(TOTALS) as f:
        cyc = {r["fec_id"]: int(r["peak_cycle"] or 0) for r in csv.DictReader(f)}
    out = []
    items = list(spine.items())
    for i, (cid, bg) in enumerate(items, 1):
        cycle = cyc.get(cid) or 2024
        orgs = []
        try:
            cmte = principal_committee(cid)
            if cmte:
                orgs = top_orgs(cmte, cycle)
        except Exception as e:
            print(f"  WARN {cid}: {e}", file=sys.stderr)
        for rank, (org, total) in enumerate(orgs, 1):
            out.append({"bioguide_id": bg, "org": org, "total": round(total, 2), "rank": rank})
        print(f"  [{i}/{len(items)}] {bg} top_orgs={[o[0] for o in orgs][:3]}", file=sys.stderr)
        time.sleep(0.3)
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","org","total","rank"])
        w.writeheader(); w.writerows(out)
    print(f"wrote {len(out)} org rows -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
