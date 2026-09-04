import { CheckCircle2, Clock3, LibraryBig, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ModerationQueueTable } from "@/components/admin/ModerationQueueTable";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";
import type { ModerationPost } from "@/types/moderation";

export const metadata: Metadata = { title: "Central insight library" };

type LibraryRow = {
  id: string;
  title: string;
  problem: string;
  key_takeaway: string;
  status: "draft" | "pending" | "approved" | "rejected" | "changes_requested";
  created_at: string;
  organization: { org_name: string } | Array<{ org_name: string }>;
};

function organizationName(row: LibraryRow) {
  return Array.isArray(row.organization)
    ? row.organization[0]?.org_name ?? "Unknown organization"
    : row.organization.org_name;
}

export default async function InsightLibraryPage() {
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id,title,problem,key_takeaway,status,created_at,organization:organizations(org_name)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as LibraryRow[];
  const pending: ModerationPost[] = rows
    .filter((row) => row.status === "pending" || row.status === "changes_requested")
    .map((row) => ({
      id: row.id,
      title: row.title,
      problem: row.problem,
      keyTakeaway: row.key_takeaway,
      status: row.status as "pending" | "changes_requested",
      createdAt: row.created_at,
      organizationName: organizationName(row),
    }));
  const published = rows.filter((row) => row.status === "approved");
  const closed = rows.filter((row) => row.status === "rejected");

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <span className="page-eyebrow">OutLawed India central library</span>
          <h1>Insight library</h1>
          <p>One operator view of every proposal and every published precedent.</p>
        </div>
        <LibraryBig size={30} aria-hidden="true" />
      </header>

      {error ? <p className="form-error">The central library could not be loaded.</p> : null}

      <div className="library-summary" aria-label="Library status">
        <span><Clock3 size={16} /><strong>{pending.length}</strong> awaiting decision</span>
        <span><CheckCircle2 size={16} /><strong>{published.length}</strong> published</span>
        <span><XCircle size={16} /><strong>{closed.length}</strong> rejected</span>
      </div>

      <section className="admin-library-section">
        <div className="admin-section-heading">
          <div><span className="page-eyebrow">Proposals</span><h2>Approve or return submissions</h2></div>
          <strong>{pending.length}</strong>
        </div>
        <ModerationQueueTable initialPosts={pending} />
      </section>

      <section className="admin-library-section">
        <div className="admin-section-heading">
          <div><span className="page-eyebrow">Published collection</span><h2>Live insights</h2></div>
          <strong>{published.length}</strong>
        </div>
        <div className="library-list">
          {published.map((row) => (
            <article key={row.id}>
              <div><span className="status-label status-approved">Published</span><span>{organizationName(row)}</span><time>{new Date(row.created_at).toLocaleDateString("en-IN")}</time></div>
              <a href={`/posts/${row.id}`}><h3>{row.title}</h3></a>
              <p>{row.problem}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
