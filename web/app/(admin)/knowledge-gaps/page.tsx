import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Knowledge gaps" };

export default async function KnowledgeGapsPage() {
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();

  const [{ data: coverage }, { data: searches }] = await Promise.all([
    supabase
      .from("knowledge_gap_summary")
      .select("sector, insight_count")
      .order("insight_count", { ascending: true }),
    // What people looked for is the other half of the picture: a sector with
    // no insights and no searches is not a gap, it is simply out of scope.
    supabase
      .from("search_logs")
      .select("query, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const rows = (coverage ?? []) as Array<{ sector: string; insight_count: number }>;
  const maxCount = Math.max(1, ...rows.map((row) => Number(row.insight_count)));

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <span className="page-eyebrow">OutLawed India operations</span>
          <h1>Knowledge gaps</h1>
          <p>
            Sectors ranked by how little published knowledge they hold. This is
            what turns the library into a way of deciding what the next OTR
            session should examine, rather than a static archive.
          </p>
        </div>
      </header>

      {rows.length ? (
        <ol className="gap-list">
          {rows.map((row) => {
            const count = Number(row.insight_count);
            return (
              <li key={row.sector}>
                <div className="gap-row-head">
                  <strong>{row.sector}</strong>
                  <span>{count} {count === 1 ? "insight" : "insights"}</span>
                </div>
                <div className="gap-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(6, (count / maxCount) * 100)}%` }} />
                </div>
                {count <= 1 ? (
                  <p className="gap-flag">
                    Effectively uncovered — a single insight is not a body of practice.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="quiet-state">
          <h2>No published insights yet</h2>
          <p>Coverage appears here once posts are approved.</p>
        </div>
      )}

      <section className="admin-note">
        <h2>What people have been searching for</h2>
        {searches?.length ? (
          <ul className="gap-queries">
            {searches.slice(0, 20).map((row, index) => (
              <li key={`${row.query as string}-${index}`}>{row.query as string}</li>
            ))}
          </ul>
        ) : (
          <p>No searches logged yet.</p>
        )}
      </section>
    </div>
  );
}
