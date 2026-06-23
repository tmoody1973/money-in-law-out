import { useSQLQuery, useDiveState } from "@motherduck/react-sql-query";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── theme ──────────────────────────────────────────────────────────
const BG = "#0d1117", PANEL = "#161b22", TILE = "#1c2230", BORDER = "#30363d";
const TEXT = "#e6edf3", MUTED = "#8b949e";
const DEM = "#4aa3df", REP = "#ff6b6b", IND = "#a0a0a0";
const GREEN = "#3fb950";

const N = (v: unknown): number => (v != null ? Number(v) : 0);
const PARTY = (p: string) => (p === "Democrat" ? DEM : p === "Republican" ? REP : IND);
const PARTY_NAME: Record<string, string> = { D: "Democrat", R: "Republican", I: "Independent" };
const cleanCommittee = (s: string) =>
  s.replace(/^Senate Select Committee on /, "")
   .replace(/^Senate Committee on /, "")
   .replace(/^Joint Committee of Congress on the /, "Joint: ")
   .replace(/^Joint Committee on /, "Joint: ")
   .replace(/^United States Senate Caucus on /, "Caucus: ");

type XMetric = "total_raised" | "career_receipts" | "pct_from_pacs" | "pct_from_individuals" | "out_state_pct";
const X_LABEL: Record<XMetric, string> = {
  total_raised: "Peak campaign $",
  career_receipts: "Career total $",
  pct_from_pacs: "% from PACs",
  pct_from_individuals: "% from individuals",
  out_state_pct: "% out-of-state $",
};
const isPct = (m: XMetric) => m !== "total_raised" && m !== "career_receipts";
const fmtX = (m: XMetric, v: number) => (isPct(m) ? `${v.toFixed(0)}%` : `$${(v / 1e6).toFixed(0)}M`);
const fmtM = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
const fmtAmt = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`);

// ── face scatter point ─────────────────────────────────────────────
function FaceDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const r = Math.min(18, Math.sqrt(payload.z) / 1000 + 8);
  const id = "c" + payload.bioguide;
  return (
    <g style={{ cursor: "pointer" }}>
      <defs>
        <clipPath id={id}><circle cx={cx} cy={cy} r={r} /></clipPath>
      </defs>
      {payload.uri ? (
        <image href={payload.uri} x={cx - r} y={cy - r} width={r * 2} height={r * 2}
          clipPath={`url(#${id})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <circle cx={cx} cy={cy} r={r} fill={payload.fill} fillOpacity={0.7} />
      )}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={payload.fill} strokeWidth={2.2} />
    </g>
  );
}

// ── money-mix bar ──────────────────────────────────────────────────
function MixBar({ pac, ind, small }: { pac: number; ind: number; small: number }) {
  const other = Math.max(0, 100 - pac - ind - small);
  const seg = (w: number, c: string) =>
    w > 0.5 ? <div style={{ width: `${w}%`, background: c, height: "100%" }} /> : null;
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: TILE }}>
        {seg(ind, DEM)}{seg(small, GREEN)}{seg(pac, REP)}{seg(other, "#3a4250")}
      </div>
      <div className="flex gap-3 mt-1 text-xs" style={{ color: MUTED }}>
        <span style={{ color: DEM }}>● itemized {ind.toFixed(0)}%</span>
        <span style={{ color: GREEN }}>● small-dollar {small.toFixed(0)}%</span>
        <span style={{ color: REP }}>● PACs {pac.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default function Dive() {
  const [xMetric, setXMetric] = useDiveState<XMetric>("x", "total_raised");
  const [sel, setSel] = useDiveState<string>("sel", "");
  const [partyF, setPartyF] = useDiveState<string>("pf", "all");
  const [stateF, setStateF] = useDiveState<string>("sf", "all");
  const bg = sel.replace(/[^A-Za-z0-9]/g, "");

  const q = useSQLQuery(`
    SELECT bioguide_id, full_name, state, party,
           total_raised, career_receipts, pct_from_pacs, pct_from_individuals,
           pct_small_dollar, out_state_pct, cash_on_hand, dollars_per_resident,
           bills_sponsored, photo_uri
    FROM "my_db"."main"."member_money_law"
  `);

  const kpi = useSQLQuery(`
    WITH r AS (
      SELECT bills_sponsored, total_raised, out_state_pct, laws_passed,
             ntile(10) OVER (ORDER BY total_raised DESC) AS d
      FROM "my_db"."main"."member_money_law"
    )
    SELECT round(median(bills_sponsored) FILTER (WHERE d = 1)) AS top_funded_median,
           round(median(bills_sponsored)) AS overall_median, count(*) AS n,
           count(*) FILTER (WHERE out_state_pct >= 70) AS n_mostly_out,
           count(*) FILTER (WHERE laws_passed = 0) AS n_zero_laws,
           round(avg(out_state_pct)) AS avg_out
    FROM r
  `);
  const k = (Array.isArray(kpi.data) ? kpi.data : [])[0] ?? {};

  const leads = useSQLQuery(`
    SELECT * FROM (
      (SELECT 1 AS ord, 'Bankrolled by strangers' AS lead, full_name AS nm, bioguide_id AS bg,
              printf('%.0f%%', out_state_pct) AS val,
              row_number() OVER (ORDER BY out_state_pct DESC) AS rk
       FROM "my_db"."main"."member_money_law" ORDER BY out_state_pct DESC LIMIT 5)
      UNION ALL
      (SELECT 2, 'Most PAC-reliant', full_name, bioguide_id, printf('%.0f%%', pct_from_pacs),
              row_number() OVER (ORDER BY pct_from_pacs DESC)
       FROM "my_db"."main"."member_money_law" ORDER BY pct_from_pacs DESC LIMIT 5)
      UNION ALL
      (SELECT 3, 'Big money, few bills', full_name, bioguide_id,
              printf('$%.0fM/%d', total_raised/1e6, bills_sponsored),
              row_number() OVER (ORDER BY bills_sponsored ASC)
       FROM "my_db"."main"."member_money_law" WHERE total_raised > 5e7 ORDER BY bills_sponsored ASC LIMIT 5)
      UNION ALL
      (SELECT 4, 'Priciest seat', full_name, bioguide_id, printf('$%.0f', dollars_per_resident),
              row_number() OVER (ORDER BY dollars_per_resident DESC)
       FROM "my_db"."main"."member_money_law" ORDER BY dollars_per_resident DESC LIMIT 5)
    ) ORDER BY ord, rk
  `);
  const leadRows = Array.isArray(leads.data) ? leads.data : [];
  const LEAD_CATS = ["Bankrolled by strangers", "Most PAC-reliant", "Big money, few bills", "Priciest seat"];
  const leadsByCat: Record<string, any[]> = {};
  for (const r of leadRows) (leadsByCat[r.lead as string] ||= []).push(r);

  const detail = useSQLQuery(
    `SELECT full_name, state, party, total_raised, career_receipts, cash_on_hand,
            pct_from_pacs, pct_from_individuals, pct_small_dollar, out_state_pct,
            dollars_per_resident, bills_sponsored, laws_passed, photo_uri
     FROM "my_db"."main"."member_money_law" WHERE bioguide_id = '${bg}'`,
    { enabled: !!bg }
  );
  const committees = useSQLQuery(
    `SELECT committee, title FROM "my_db"."main"."committees"
     WHERE bioguide_id = '${bg}' ORDER BY rank LIMIT 6`,
    { enabled: !!bg }
  );
  const orgs = useSQLQuery(
    `SELECT org, total FROM "my_db"."main"."top_orgs"
     WHERE bioguide_id = '${bg}'
       AND org NOT ILIKE '%information requested%' AND org NOT ILIKE '%best efforts%'
       AND lower(org) NOT IN ('entrepreneur','housewife','homemaker','self','self employed',
           'retired','none','not employed','unemployed','investor','not applicable','n/a','na')
     ORDER BY total DESC LIMIT 5`,
    { enabled: !!bg }
  );
  const bills = useSQLQuery(
    `SELECT title, latest_action, action_date, url FROM "my_db"."main"."bills"
     WHERE bioguide_id = '${bg}' ORDER BY action_date DESC LIMIT 5`,
    { enabled: !!bg }
  );
  const oosStates = useSQLQuery(
    `SELECT from_state, amount FROM "my_db"."main"."out_of_state"
     WHERE bioguide_id = '${bg}' ORDER BY rank LIMIT 5`,
    { enabled: !!bg }
  );
  const superPac = useSQLQuery(
    `SELECT support_total, oppose_total FROM "my_db"."main"."super_pac_totals" WHERE bioguide_id = '${bg}'`,
    { enabled: !!bg }
  );
  const superPacTop = useSQLQuery(
    `SELECT committee, support_oppose, total FROM "my_db"."main"."super_pac"
     WHERE bioguide_id = '${bg}' ORDER BY rank LIMIT 5`,
    { enabled: !!bg }
  );
  const sp = (Array.isArray(superPac.data) ? superPac.data : [])[0];
  const d = (Array.isArray(detail.data) ? detail.data : [])[0];

  const rows = (Array.isArray(q.data) ? q.data : []).map((r) => ({
    bioguide: r.bioguide_id as string,
    name: r.full_name as string,
    state: r.state as string,
    party: r.party as string,
    x: isPct(xMetric) ? N(r[xMetric]) : Math.max(N(r[xMetric]), 1e6), // floor for log scale
    y: N(r.bills_sponsored),
    z: N(r.total_raised),
    uri: r.photo_uri as string | null,
    fill: PARTY(r.party as string),
  }));

  const states = Array.from(new Set(rows.map((r) => r.state))).sort();
  const shown = rows.filter((r) =>
    (partyF === "all" || r.party === PARTY_NAME[partyF]) &&
    (stateF === "all" || r.state === stateF));

  const Kpi = ({ v, label }: { v: any; label: string }) => (
    <div>
      {kpi.isLoading ? <div className="h-10 w-16 animate-pulse rounded" style={{ background: TILE }} />
        : <p className="text-4xl font-bold" style={{ color: TEXT }}>{N(v)}</p>}
      <p className="text-xs mt-1" style={{ color: MUTED }}>{label}</p>
    </div>
  );

  return (
    <div className="p-6" style={{ background: BG, color: TEXT, position: "relative", minHeight: 560 }}>
      <h1 className="text-2xl font-semibold">Money In, Law Out</h1>
      <p className="text-sm mb-2" style={{ color: MUTED }}>
        U.S. Senate · campaign money raised vs. bills sponsored, 119th Congress · click a face
      </p>
      <p className="text-sm mb-5" style={{ color: TEXT, maxWidth: 760 }}>
        The best-funded senators aren't slackers — the top-funded 10% sponsor a median{" "}
        <b>{N(k.top_funded_median)}</b> bills vs <b>{N(k.overall_median)}</b> chamber-wide. Yet{" "}
        <b>{N(k.n_mostly_out)} of {N(k.n)}</b> raise ≥70% of their money <b>out-of-state</b> — and almost
        none of it becomes law: <b>{N(k.n_zero_laws)} of {N(k.n)}</b> senators have enacted <b>zero</b> bills this Congress.
      </p>

      <p className="text-xs mb-4" style={{ color: MUTED }}>
        Each face is a senator · → right = more money · ↑ up = more bills · bigger = bigger campaign ·{" "}
        <span style={{ color: DEM }}>click any face for the full money trail</span>
      </p>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <span className="text-xs" style={{ color: MUTED }}>party</span>
        {["all", "D", "R", "I"].map((p) => (
          <button key={p} onClick={() => setPartyF(p)} className="text-xs px-2 py-1 rounded"
            style={{ background: partyF === p ? DEM : TILE, color: partyF === p ? "#04121f" : TEXT,
              border: `1px solid ${BORDER}` }}>{p}</button>
        ))}
        <span className="text-xs ml-2" style={{ color: MUTED }}>state</span>
        <select value={stateF} onChange={(e) => setStateF(e.target.value)} className="text-xs"
          style={{ background: TILE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "2px 6px" }}>
          <option value="all">all</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(partyF !== "all" || stateF !== "all") && (
          <button onClick={() => { setPartyF("all"); setStateF("all"); }} className="text-xs px-2 py-1"
            style={{ color: MUTED }}>clear ✕</button>
        )}
        <span className="text-xs ml-1" style={{ color: MUTED }}>· showing {shown.length}</span>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {(Object.keys(X_LABEL) as XMetric[]).map((m) => (
          <button key={m} onClick={() => setXMetric(m)} className="text-xs px-2 py-1 rounded"
            style={{ background: xMetric === m ? DEM : TILE, color: xMetric === m ? "#04121f" : TEXT,
              border: `1px solid ${BORDER}`, fontWeight: xMetric === m ? 700 : 400 }}>
            {X_LABEL[m]}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="animate-pulse rounded" style={{ height: 460, background: PANEL }} />
      ) : (
        <ResponsiveContainer width="100%" height={460}>
          <ScatterChart margin={{ top: 10, right: 24, bottom: 34, left: 16 }}>
            <CartesianGrid stroke="#21262d" />
            <XAxis type="number" dataKey="x" name={X_LABEL[xMetric]} fontSize={11}
              stroke={MUTED} scale={isPct(xMetric) ? "linear" : "log"}
              domain={isPct(xMetric) ? [0, "dataMax"] : ["auto", "auto"]}
              tickFormatter={(v) => fmtX(xMetric, v)} />
            <YAxis type="number" dataKey="y" name="Bills sponsored" fontSize={11}
              stroke={MUTED} tickFormatter={(v) => String(v)} />
            <Tooltip cursor={{ strokeDasharray: "3 3", stroke: MUTED }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload; if (!p) return null;
                return (
                  <div className="text-xs p-2 rounded" style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT }}>
                    <strong>{p.name}</strong> ({p.state}, {p.party})<br />
                    {X_LABEL[xMetric]}: {fmtX(xMetric, p.x)}<br />
                    Bills sponsored: {p.y}
                  </div>
                );
              }} />
            <Scatter data={shown} isAnimationActive={false}
              shape={(props: any) => <FaceDot {...props} />}
              onClick={(pt: any) => setSel(pt?.payload?.bioguide || pt?.bioguide || "")} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {/* standouts — explore the extremes (below the hero) */}
      <div className="mt-6">
        <div className="text-xs mb-2" style={{ color: MUTED }}>STANDOUTS · click any name for their dossier</div>
        <div className="grid grid-cols-4 gap-3">
          {LEAD_CATS.map((cat) => (
            <div key={cat} style={{ background: TILE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px" }}>
              <div className="text-xs mb-1" style={{ color: MUTED }}>{cat}</div>
              {leads.isLoading ? (
                <div className="animate-pulse" style={{ height: 80, background: PANEL, borderRadius: 4 }} />
              ) : (leadsByCat[cat] || []).map((l, i) => (
                <button key={i} onClick={() => setSel(l.bg as string)}
                  style={{ display: "flex", justifyContent: "space-between", gap: 6, width: "100%",
                    textAlign: "left", padding: "1px 0", cursor: "pointer" }}>
                  <span className="text-xs" style={{ color: TEXT, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{N(l.rk)}. {l.nm as string}</span>
                  <span className="text-xs" style={{ color: DEM, flexShrink: 0 }}>{l.val as string}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── modal ── */}
      {bg && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(1,4,9,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 10 }}
          onClick={() => setSel("")}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: 20, width: "100%", maxWidth: 720, maxHeight: "92%", overflowY: "auto" }}>
            {!d ? (
              <div className="animate-pulse" style={{ height: 120, background: TILE, borderRadius: 8 }} />
            ) : (
              <>
                <div className="flex items-start gap-3" style={{ marginBottom: 14 }}>
                  {d.photo_uri && <img src={d.photo_uri as string} alt="" width={56} height={56}
                    style={{ borderRadius: 999, border: `3px solid ${PARTY(d.party as string)}` }} />}
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <strong style={{ fontSize: 18 }}>{d.full_name as string}
                        <span style={{ color: MUTED, fontWeight: 400 }}>  ({d.party}–{d.state})</span></strong>
                      <button onClick={() => setSel("")} style={{ color: MUTED, fontSize: 18 }}>✕</button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-3" style={{ marginBottom: 14 }}>
                  {[
                    { v: fmtM(N(d.total_raised)), l: "peak campaign" },
                    { v: N(d.bills_sponsored), l: "bills (119th)" },
                    { v: N(d.laws_passed), l: "became law" },
                    { v: fmtM(N(d.cash_on_hand)), l: "cash on hand" },
                    { v: `$${N(d.dollars_per_resident).toFixed(0)}`, l: "raised / resident" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: TILE, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{s.v}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div className="text-xs mb-1" style={{ color: MUTED }}>WHO FUNDS THEM
                    <span style={{ float: "right" }}>{N(d.out_state_pct).toFixed(0)}% out-of-state</span></div>
                  <MixBar pac={N(d.pct_from_pacs)} ind={N(d.pct_from_individuals)} small={N(d.pct_small_dollar)} />
                  {(Array.isArray(oosStates.data) ? oosStates.data : []).length > 0 && (
                    <div className="text-xs mt-2" style={{ color: MUTED }}>
                      out-of-state money from:{" "}
                      {(Array.isArray(oosStates.data) ? oosStates.data : []).map((s, i) => (
                        <span key={i}>
                          <span style={{ color: TEXT }}>{s.from_state as string}</span> {fmtAmt(N(s.amount))}
                          {i < (oosStates.data as any[]).length - 1 ? "  ·  " : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {sp && (N(sp.support_total) + N(sp.oppose_total)) > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div className="text-xs mb-1" style={{ color: MUTED }}>OUTSIDE MONEY · SUPER PACs (uncapped)</div>
                    <div className="flex gap-4 text-sm" style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN }}>▲ {fmtM(N(sp.support_total))} supporting</span>
                      <span style={{ color: REP }}>▼ {fmtM(N(sp.oppose_total))} opposing</span>
                    </div>
                    {(Array.isArray(superPacTop.data) ? superPacTop.data : []).map((c, i) => (
                      <div key={i} className="text-xs flex justify-between" style={{ padding: "1px 0" }}>
                        <span style={{ color: c.support_oppose === "S" ? GREEN : REP }}>
                          {c.support_oppose === "S" ? "▲" : "▼"} {c.committee as string}</span>
                        <span style={{ color: MUTED }}>{fmtAmt(N(c.total))}</span>
                      </div>))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4" style={{ marginBottom: 14 }}>
                  <div>
                    <div className="text-xs mb-1" style={{ color: MUTED }}>TOP ORG DONORS</div>
                    {orgs.isLoading ? <div className="animate-pulse" style={{ height: 60, background: TILE, borderRadius: 6 }} />
                      : (Array.isArray(orgs.data) ? orgs.data : []).map((o, i) => (
                        <div key={i} className="text-sm flex justify-between" style={{ padding: "1px 0" }}>
                          <span>{o.org as string}</span><span style={{ color: MUTED }}>{fmtAmt(N(o.total))}</span>
                        </div>))}
                    {!orgs.isLoading && (!Array.isArray(orgs.data) || orgs.data.length === 0) &&
                      <div className="text-sm" style={{ color: MUTED }}>—</div>}
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: MUTED }}>COMMITTEES</div>
                    {(Array.isArray(committees.data) ? committees.data : []).map((c, i) => (
                      <div key={i} className="text-sm" style={{ padding: "1px 0" }}>
                        {cleanCommittee(c.committee as string)}
                        {c.title !== "Member" && <span style={{ color: GREEN, fontSize: 11 }}>  {c.title as string}</span>}
                      </div>))}
                  </div>
                </div>

                <div>
                  <div className="text-xs mb-1" style={{ color: MUTED }}>RECENT BILLS (119TH)</div>
                  {(Array.isArray(bills.data) ? bills.data : []).map((b, i) => (
                    <div key={i} className="text-xs" style={{ padding: "2px 0", color: TEXT }}>
                      • {b.url ? (
                        <a href={b.url as string} target="_blank" rel="noopener noreferrer"
                          style={{ color: DEM, textDecoration: "underline" }}>{b.title as string}</a>
                      ) : (b.title as string)}
                      {" "}<span style={{ color: MUTED }}>— {b.latest_action as string}</span>
                    </div>))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
