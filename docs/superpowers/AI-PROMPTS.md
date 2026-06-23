# AI Prompts Used — "Money In, Law Out" (DiveMaxxing submission)

The prompts/instructions used to build the Dive, in order:

1. I want to compete in the MotherDuck DiveMaxxing hackathon. Here's a concept doc — a "money to law" idea joining FEC campaign finance to Congress.gov legislative activity. Go for the Most Creative category.
2. Scope it to the U.S. Senate first, with bills sponsored (119th Congress) as the Y axis.
3. Use a photo of each member of Congress instead of a dot on the scatter.
4. When someone clicks a senator, pop up a modal with more data — what's engaging and impactful to include?
5. Use MotherDuck's dark theme/styling for the whole Dive.
6. Are we pulling corporations, PACs, and top donors for each senator too?
7. As a political journalist, what would you want to know from this data to discover potential stories — and how should we display it?
8. Show the top 3–5 per story lead, not just the #1 — surface the pattern, not a single outlier.
9. Get the out-of-state donation details from the FEC — which states each senator's money comes from.
10. Add filters for party and state.
11. Add the Super PAC / "outside money" layer (FEC Schedule E independent expenditures) — who's spending for and against each senator.
12. Add beginner-friendly copy that explains how to read the visualization.
13. Add hyperlinks from each bill to its page on congress.gov.
14. Save the Dive to MotherDuck.

**Data sources:** FEC OpenFEC API (candidate totals, Schedule A by-state, Schedule E independent expenditures, by-employer), Congress.gov API (119th-Congress sponsored legislation), unitedstates/congress-legislators (bioguide↔FEC bridge, committees, photos), U.S. Census state populations.

**Build tooling:** DuckDB CLI + MotherDuck (data loaded to `my_db.main`), MotherDuck Dive (React + Recharts), built conversationally with an AI coding agent.

> Note: the list above covers the creative/feature prompts. There were also many smaller iteration prompts in between (debugging the scatter rendering, fixing dollar formatting, log-scale axis fixes, junk-employer filtering, rate-limit backfills, etc.).
