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
        # FEC ids are office-prefixed (S=Senate, H=House, P=Pres). For a Senate
        # money story, prefer the Senate committee id; fall back to last available.
        s_ids = [x for x in fec_list if x.startswith("S")]
        fec_id = s_ids[0] if s_ids else fec_list[-1]
        name = p["name"]
        full = name.get("official_full") or f'{name.get("first","")} {name.get("last","")}'.strip()
        rows.append({
            "bioguide_id": ids.get("bioguide", ""),
            "fec_id": fec_id,              # prefer Senate (S-prefixed) candidacy
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
