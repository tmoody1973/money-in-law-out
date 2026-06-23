#!/usr/bin/env python3
"""Pull 119th-Congress sponsored legislation counts + top titles per senator.

Congress.gov returns sponsored bills newest-first. We request the max page
(limit=250) and count items in the 119th Congress; the 5 most recent become
drilldown rows.
"""
import csv, os, sys, time, urllib.request, urllib.parse, urllib.error, json
from collections import Counter

KEY = os.environ["CONGRESS_API_KEY"]
CONGRESS = 119
SPINE = "data/members_spine.csv"
OUT_S = "data/sponsored.csv"
OUT_B = "data/bills.csv"
OUT_I = "data/issues.csv"
BASE = "https://api.congress.gov/v3/member/{bg}/sponsored-legislation"

# Congress.gov rejects the default Python-urllib User-Agent as a bot (403).
HEADERS = {"User-Agent": "Mozilla/5.0 (DiveMaxxing research)"}
PAGE = 250          # API max page size
MAX_PAGES = 6       # safety cap (covers even 1,000+ lifetime sponsors)

def _get(url, retries=3):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))   # back off on throttle
                continue
            raise

def fetch_all(bg):
    """Page through a member's full sponsored list so 119th counts aren't censored."""
    items = []
    for p in range(MAX_PAGES):
        qs = urllib.parse.urlencode({"api_key": KEY, "limit": PAGE, "offset": p * PAGE})
        data = _get(BASE.format(bg=bg) + "?" + qs)
        batch = data.get("sponsoredLegislation") or []
        items.extend(batch)
        if len(batch) < PAGE:       # exhausted this member's history
            break
        time.sleep(0.2)
    return items

def main():
    with open(SPINE) as f:
        senators = list(csv.DictReader(f))
    counts, bills, issues = [], [], []
    for i, s in enumerate(senators, 1):
        bg = s["bioguide_id"]
        items = []
        try:
            items = [x for x in fetch_all(bg) if x.get("congress") == CONGRESS]
        except Exception as e:
            print(f"  WARN {bg}: {e}", file=sys.stderr)
        counts.append({"bioguide_id": bg, "bills_sponsored": len(items)})
        # top policy areas (issues) this senator legislates on
        area_counts = Counter((x.get("policyArea") or {}).get("name") or "Uncategorized" for x in items)
        for area, n in area_counts.most_common():
            issues.append({"bioguide_id": bg, "policy_area": area, "n": n})
        # 5 most recent (by latest action) for the drilldown
        items.sort(key=lambda x: (x.get("latestAction") or {}).get("actionDate") or "", reverse=True)
        for x in items[:5]:
            la = x.get("latestAction") or {}
            bills.append({
                "bioguide_id": bg,
                "title": (x.get("title") or "").replace("\n", " ").strip()[:240],
                "latest_action": (la.get("text") or "").replace("\n", " ").strip()[:160],
                "action_date": la.get("actionDate") or "",
                "policy_area": (x.get("policyArea") or {}).get("name") or "",
            })
        print(f"  [{i}/{len(senators)}] {bg} sponsored119={len(items)} "
              f"top_issue={area_counts.most_common(1)[0][0] if area_counts else '-'}", file=sys.stderr)
        time.sleep(0.25)
    with open(OUT_S, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","bills_sponsored"]); w.writeheader(); w.writerows(counts)
    with open(OUT_B, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","title","latest_action","action_date","policy_area"]); w.writeheader(); w.writerows(bills)
    with open(OUT_I, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","policy_area","n"]); w.writeheader(); w.writerows(issues)
    print(f"wrote {len(counts)} counts, {len(bills)} bills, {len(issues)} issue-rows", file=sys.stderr)

if __name__ == "__main__":
    main()
