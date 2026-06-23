#!/usr/bin/env python3
"""Map each senator to their (top-level) committee assignments.

Sources (unitedstates/congress-legislators, same project as the spine):
  committees-current.yaml         -> code -> committee name
  committee-membership-current.yaml -> code -> [members with bioguide, title]
Subcommittee codes (not in the name map) are skipped, so we keep top-level seats.
"""
import csv, sys, urllib.request, yaml

UA = {"User-Agent": "Mozilla/5.0 (DiveMaxxing research)"}
BASE = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/"
OUT = "data/committees.csv"

def load(name):
    req = urllib.request.Request(BASE + name, headers=UA)
    return yaml.safe_load(urllib.request.urlopen(req, timeout=60).read())

def main():
    committees = load("committees-current.yaml")
    membership = load("committee-membership-current.yaml")
    name_by_code = {c["thomas_id"]: c["name"] for c in committees if c.get("thomas_id")}
    rows = []
    for code, members in membership.items():
        cname = name_by_code.get(code)
        if not cname:            # subcommittee or unknown -> skip
            continue
        for m in members:
            bg = m.get("bioguide")
            if not bg:
                continue
            rows.append({
                "bioguide_id": bg,
                "committee": cname,
                "title": m.get("title") or "Member",
                "rank": m.get("rank") or 99,
            })
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","committee","title","rank"])
        w.writeheader(); w.writerows(rows)
    print(f"wrote {len(rows)} committee memberships -> {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
