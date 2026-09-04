import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ModerationQueueTable } from "@/components/admin/ModerationQueueTable";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";
import type { ModerationPost } from "@/types/moderation";

export const metadata: Metadata = { title: "Moderation" };

type RawModerationPost = {
  id: string;
  title: string;
  problem: string;
  key_takeaway: string;
  status: "pending" | "changes_requested";
  created_at: string;
  organization: { org_name: string } | Array<{ org_name: string }>;
};

export default async function ModerationPage() {
  // Pages and layouts can render in parallel, so the page must not assume the
  // layout redirect has completed before touching configured services.
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id,title,problem,key_takeaway,status,created_at,organization:organizations(org_name)")
    .in("status", ["pending", "changes_requested"])
    .order("created_at", { ascending: true });

  const rows: ModerationPost[] = error
    ? []
    : (data as unknown as RawModerationPost[]).map((post) => ({
        id: post.id,
        title: post.title,
        problem: post.problem,
        keyTakeaway: post.key_takeaway,
        status: post.status,
        createdAt: post.created_at,
        organizationName: Array.isArray(post.organization)
          ? post.organization[0]?.org_name ?? "Unknown organization"
          : post.organization.org_name,
      }));

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div><span className="page-eyebrow">OutLawed India operations</span><h1>Moderation queue</h1><p>Approve, reject, or return organization submissions for changes.</p></div>
        <strong>{rows.length} waiting</strong>
      </header>
      {error ? <p className="form-error">The moderation queue could not be loaded.</p> : null}
      <ModerationQueueTable initialPosts={rows} />
    </div>
  );
}
