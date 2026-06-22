A strong idea is to treat this as a **money-to-law pipeline**: show how campaign money clusters around lawmakers, then connect those lawmakers to the bills they sponsor, cosponsor, or move through Congress. That direction fits DiveMaxxing because the judges are explicitly looking for narrative, design, interactivity, clarity, and surprise rather than a generic dashboard.[[motherduck](https://motherduck.com/divemaxxing-full/)]

## Best concept

**Build “From Donors to Decisions.”** Use FEC data to surface fundraising patterns by member or committee, then use Congress.gov data to show the legislative footprint around the same people, since Congress.gov exposes bills, members, committee reports, nominations, treaties, and other congressional collections through its API.[[documenter.getpostman](https://documenter.getpostman.com/view/6803158/VV56LCkZ)]

Why this works:

- FEC gives you compelling financial signals like contributions by state, contributor, and spending/payee patterns.[[medium](https://medium.com/@tommasina1/show-me-the-money-create-your-own-federal-election-app-with-the-open-fec-api-e183dc266a5b)]
- Congress.gov gives you structured legislative objects you can connect to the same actors: members, bills, actions, and summaries.[[blogs.loc](https://blogs.loc.gov/law/2022/09/introducing-the-congress-gov-api/)]
- The result is a story with tension: who gets funded, who acts, and what kinds of legislation follow. That is much more “narrative artifact” than “BI dashboard,” which is exactly the competition vibe.[[motherduck](https://motherduck.com/blog/divemaxxing-data-viz-contest/)]

## Three angles

| Concept                      | Why it’s engaging                                            | Core APIs                                                    |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Money to Law**             | Trace fundraising strength to legislative activity for specific members or issue areas; this creates a clear story arc. [[medium](https://medium.com/@tommasina1/show-me-the-money-create-your-own-federal-election-app-with-the-open-fec-api-e183dc266a5b)] | FEC candidate/committee endpoints + Congress.gov bill/member endpoints. [[medium](https://medium.com/@tommasina1/show-me-the-money-create-your-own-federal-election-app-with-the-open-fec-api-e183dc266a5b)] |
| **Geography of Influence**   | Map where money comes from by state, then show which federal bills those funded lawmakers are pushing; maps and linked views are naturally visual. [[medium](https://medium.com/@vernal.futures/federal-election-commission-fec-api-data-retrieval-with-python-and-power-bi-dashboard-4469016059d1)] | FEC `/by_state` style aggregation + Congress bill lists and actions. [[18f.gsa](https://18f.gsa.gov/2015/07/15/openfec-api-update/)] |
| **Committee Constellations** | Show PACs, committees, candidates, and bill subjects as a network; this is more original and less dashboard-like. [[propublica](https://www.propublica.org/nerds/untangling-a-web-of-fec-data)] | FEC committee/contributor/payee data + Congress member, committee, and bill metadata. [[18f.gsa](https://18f.gsa.gov/2015/07/15/openfec-api-update/)] |

## Best MVP

If you’re racing the deadline, I’d do **Geography of Influence** because it can be beautiful fast and still say something real. FEC examples specifically highlight state-level fundraising maps, top fundraisers, and momentum charts as strong visual primitives, while Congress.gov’s bill endpoints give you recent bill/action metadata to anchor the legislative side.[[medium](https://medium.com/@vernal.futures/federal-election-commission-fec-api-data-retrieval-with-python-and-power-bi-dashboard-4469016059d1)]

A tight MVP structure:

1. **Choropleth or bubble map** of contribution totals by state for selected lawmakers or committees.[[18f.gsa](https://18f.gsa.gov/2015/07/15/openfec-api-update/)]
2. **Member cards** that show total receipts, cash-on-hand, and latest legislative activity. FEC tutorials emphasize receipts and financial health metrics, while Congress.gov bill data is sorted by latest action.[[documenter.getpostman](https://documenter.getpostman.com/view/6803158/VV56LCkZ)]
3. **Linked bill timeline** with short summaries and latest actions to make the policy side readable. Congress.gov returns bills and latest actions in structured form.[[youtube](https://www.youtube.com/watch?v=-KQU2YDFDmE)][[documenter.getpostman](https://documenter.getpostman.com/view/6803158/VV56LCkZ)]
4. **One narrative hook**, such as “members receiving the most out-of-state money vs. the subjects of the bills they’re moving.” The “surprise” criterion matters, so choose a framing that produces at least one unexpected pattern.[[motherduck](https://motherduck.com/divemaxxing-full/)]

## Visual form

Avoid a plain dashboard grid. The contest explicitly says this isn’t a dashboarding exercise and rewards craft, taste, surprise, originality, ambition, and execution.[[motherduck](https://motherduck.com/blog/divemaxxing-data-viz-contest/)]

A better visual pattern:

- Start with a **full-bleed map** or network as the hero interaction.
- On hover or click, open a **story panel** with donor geography, top contributors/PACs, and recent bills. FEC supports contributor and state breakdowns, and Congress.gov supports bill detail flows.[[18f.gsa](https://18f.gsa.gov/2015/07/15/openfec-api-update/)]
- Add a **subject ribbon** or tag cloud using bill topics or summaries so users can see not just activity volume but issue emphasis. Congress.gov includes summaries and bill metadata that make this feasible.[[blogs.loc](https://blogs.loc.gov/law/2022/09/introducing-the-congress-gov-api/)]
- Use one bold metaphor, like a **signal path** from money source → member → policy output; that gives you a memorable structure without overcomplicating the build.[[propublica](https://www.propublica.org/nerds/untangling-a-web-of-fec-data)]

## Data model

A simple join strategy will keep this shippable:

- Pick a set of **current members of Congress** as your anchor entity. Congress.gov exposes member and bill data for congressional actors.[[documenter.getpostman](https://documenter.getpostman.com/view/6803158/VV56LCkZ)]
- Match each member to their **campaign committee or candidate record** in FEC. FEC examples show candidate search, committee reports, and schedule-based contribution aggregations.[[medium](https://medium.com/@tommasina1/show-me-the-money-create-your-own-federal-election-app-with-the-open-fec-api-e183dc266a5b)]
- For each member, compute:
  - Total receipts, cash on hand, debt, contribution geography, top contributor categories or committees.[[medium](https://medium.com/@vernal.futures/federal-election-commission-fec-api-data-retrieval-with-python-and-power-bi-dashboard-4469016059d1)]
  - Bill count, recent actions, bill subjects, and summaries.[[blogs.loc](https://blogs.loc.gov/law/2022/09/introducing-the-congress-gov-api/)]
- Then build one or two derived metrics, for example:
  - Fundraising concentration score.
  - Legislative activity score.
  - Out-of-state money share vs. local-state share. FEC’s state aggregation endpoints make this plausible.[[18f.gsa](https://18f.gsa.gov/2015/07/15/openfec-api-update/)]

My recommendation: keep the scope to **20–50 members** or one issue slice, such as energy, housing, defense, or tech, so the narrative stays coherent and the UI feels intentional rather than encyclopedic.[[motherduck](https://motherduck.com/divemaxxing-full/)]

Would you like me to turn this into a concrete build plan with API endpoints, schema, and a one-day implementation outline?