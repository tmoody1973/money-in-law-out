#!/usr/bin/env python3
"""Re-pull each senator's 5 most recent 119th bills WITH bill type+number, so the
dive can hyperlink them to congress.gov. Light pull (one page per senator)."""
import csv, os, sys, time, urllib.request, urllib.parse, urllib.error, json

KEY = os.environ["CONGRESS_API_KEY"]
CONGRESS = 119
SPINE = "data/members_spine.csv"
OUT = "data/bills.csv"
BASE = "https://api.congress.gov/v3/member/{bg}/sponsored-legislation"
HEADERS = {"User-Agent": "Mozilla/5.0 (DiveMaxxing research)"}

# bill type -> congress.gov url slug
SLUG = {"S": "senate-bill", "SRES": "senate-resolution", "SJRES": "senate-joint-resolution",
        "SCONRES": "senate-concurrent-resolution", "HR": "house-bill", "HRES": "house-resolution",
        "HJRES": "house-joint-resolution", "HCONRES": "house-concurrent-resolution"}

def get(url, retries=4):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and attempt < retries - 1:
                time.sleep(3 * (attempt + 1)); continue
            raise

def main():
    with open(SPINE) as f:
        senators = list(csv.DictReader(f))
    out, laws_out = [], []
    for i, s in enumerate(senators, 1):
        bg = s["bioguide_id"]
        try:
            qs = urllib.parse.urlencode({"api_key": KEY, "limit": 250})
            items = [x for x in (get(BASE.format(bg=bg) + "?" + qs).get("sponsoredLegislation") or [])
                     if x.get("congress") == CONGRESS]
        except Exception as e:
            print(f"  WARN {bg}: {e}", file=sys.stderr); items = []
        # count this senator's 119th bills that became law (enacted under their own number)
        laws = sum(1 for x in items
                   if "became public law" in ((x.get("latestAction") or {}).get("text") or "").lower())
        laws_out.append({"bioguide_id": bg, "laws_passed": laws})
        items.sort(key=lambda x: (x.get("latestAction") or {}).get("actionDate") or "", reverse=True)
        for x in items[:5]:
            la = x.get("latestAction") or {}
            t = (x.get("type") or "").upper()
            num = x.get("number") or ""
            url = (f"https://www.congress.gov/bill/{CONGRESS}th-congress/{SLUG.get(t, 'senate-bill')}/{num}"
                   if num else "")
            out.append({
                "bioguide_id": bg,
                "title": (x.get("title") or "").replace("\n", " ").strip()[:240],
                "latest_action": (la.get("text") or "").replace("\n", " ").strip()[:160],
                "action_date": la.get("actionDate") or "",
                "url": url,
            })
        print(f"  [{i}/{len(senators)}] {bg} {len(items[:5])} bills, laws={laws}", file=sys.stderr)
        time.sleep(0.25)
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","title","latest_action","action_date","url"])
        w.writeheader(); w.writerows(out)
    with open("data/laws.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["bioguide_id","laws_passed"]); w.writeheader(); w.writerows(laws_out)
    print(f"wrote {len(out)} linked bills, {len(laws_out)} law counts", file=sys.stderr)

if __name__ == "__main__":
    main()
