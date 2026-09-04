import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, target_kind, target_id, reason, description, status, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const rows = data ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <span className="page-eyebrow">OutLawed India operations</span>
          <h1>Reports</h1>
          <p>Flagged posts and comments awaiting a decision.</p>
        </div>
        <strong>{rows.length} open</strong>
      </header>

      {error ? <p className="form-error">The reports queue could not be loaded.</p> : null}

      {rows.length ? (
        <div className="report-list">
          {rows.map((row) => (
            <article className="report-row" key={row.id as string}>
              <div className="report-row-meta">
                <span className="status-label status-pending">{row.target_kind as string}</span>
                <time>{new Date(row.created_at as string).toLocaleDateString("en-IN")}</time>
              </div>
              <h2>{row.reason as string}</h2>
              {row.description ? <p>{row.description as string}</p> : null}
              {row.target_kind === "post" ? (
                <Link href={`/posts/${row.target_id}`}>Open the reported insight</Link>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="quiet-state">
          <h2>Nothing reported</h2>
          <p>Reports raised on posts or comments appear here.</p>
        </div>
      )}
    </div>
  );
}
