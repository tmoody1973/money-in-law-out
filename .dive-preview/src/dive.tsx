import { useSQLQuery, useDiveState } from "@motherduck/react-sql-query";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const N = (v: unknown): number => (v != null ? Number(v) : 0);
const PARTY = (p: string) => (p === "Democrat" ? "#0777b3" : p === "Republican" ? "#bc1200" : "#6a6a6a");

type XMetric = "total_raised" | "career_receipts" | "pct_from_pacs" | "pct_from_individuals";
const X_LABEL: Record<XMetric, string> = {
  total_raised: "Peak campaign raised",
  career_receipts: "Career total raised",
  pct_from_pacs: "% of money from PACs",
  pct_from_individuals: "% from individuals",
};
const isPct = (m: XMetric) => m === "pct_from_pacs" || m === "pct_from_individuals";
const fmtX = (m: XMetric, v: number) => (isPct(m) ? `${v.toFixed(0)}%` : `$${(v / 1e6).toFixed(0)}M`);

export default function Dive() {
  const [xMetric, setXMetric] = useDiveState<XMetric>("x", "total_raised");

  const q = useSQLQuery(`
    SELECT bioguide_id, full_name, state, party,
           total_raised, career_receipts, pct_from_pacs, pct_from_individuals,
           cash_on_hand, receipts
    FROM "my_db"."main"."member_money"
  `);

  const rows = (Array.isArray(q.data) ? q.data : []).map((r) => ({
    bioguide: r.bioguide_id as string,
    name: r.full_name as string,
    state: r.state as string,
    party: r.party as string,
    x: N(r[xMetric]),
    y: N(r.cash_on_hand),
    z: N(r.receipts),
    fill: PARTY(r.party as string),
  }));

  return (
    <div className="p-6" style={{ background: "#f8f8f8", color: "#231f20" }}>
      <h1 className="text-2xl font-semibold">Money In, Law Out</h1>
      <p className="text-sm mb-4" style={{ color: "#6a6a6a" }}>
        U.S. Senate · campaign money (interim Y: cash on hand — bills sponsored lands next)
      </p>

      <div className="flex gap-2 mb-3 flex-wrap">
        {(["total_raised", "career_receipts", "pct_from_pacs", "pct_from_individuals"] as XMetric[]).map((m) => (
          <button
            key={m}
            onClick={() => setXMetric(m)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: xMetric === m ? "#0777b3" : "#e5e5e5", color: xMetric === m ? "#fff" : "#231f20" }}
          >
            {X_LABEL[m]}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="bg-gray-100 animate-pulse rounded" style={{ height: 380 }} />
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 10, right: 24, bottom: 36, left: 16 }}>
            <CartesianGrid stroke="#eee" />
            <XAxis
              type="number" dataKey="x" name={X_LABEL[xMetric]} fontSize={11}
              scale={isPct(xMetric) ? "linear" : "log"}
              domain={isPct(xMetric) ? [0, 100] : ["auto", "auto"]}
              tickFormatter={(v) => fmtX(xMetric, v)}
            />
            <YAxis
              type="number" dataKey="y" name="Cash on hand" fontSize={11}
              tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload;
                if (!p) return null;
                return (
                  <div className="text-xs p-2" style={{ background: "#fff", border: "1px solid #ddd" }}>
                    <strong>{p.name}</strong> ({p.state}, {p.party})
                    <br />
                    {X_LABEL[xMetric]}: {fmtX(xMetric, p.x)}
                    <br />
                    Cash on hand: ${(p.y / 1e6).toFixed(1)}M
                  </div>
                );
              }}
            />
            <Scatter
              data={rows}
              shape={(props: any) => (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={Math.min(15, Math.sqrt(props.payload.z) / 1300 + 3)}
                  fill={props.payload.fill}
                  fillOpacity={0.6}
                  stroke="#fff"
                  strokeWidth={0.5}
                />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
