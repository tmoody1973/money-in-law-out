import { useSQLQuery } from "@motherduck/react-sql-query";
const N = (v: unknown): number => (v != null ? Number(v) : 0);
export default function Dive() {
  const q = useSQLQuery(`SELECT count(*) AS n FROM "sample_data"."nyc"."taxi"`);
  const rows = Array.isArray(q.data) ? q.data : [];
  return (
    <div className="p-6" style={{ background: "#f8f8f8", color: "#231f20" }}>
      <h1 className="text-2xl font-semibold">Preview online</h1>
      <p className="text-sm" style={{ color: "#6a6a6a" }}>
        {q.isLoading ? "querying…" : `sample taxi rows: ${N(rows[0]?.n).toLocaleString()}`}
      </p>
    </div>
  );
}
