import { BadgeCheck, FileCheck2, Flag, Layers, ShieldAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboardPage() {
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();

  // head:true returns the count without transferring any rows.
  const exact = { count: "exact" as const, head: true };

  const [pendingPosts, approvedPosts, pendingVerifications, ingestionFlags, openReports, orgs] =
    await Promise.all([
      supabase.from("posts").select("*", exact).in("status", ["pending", "changes_requested"]),
      supabase.from("posts").select("*", exact).eq("status", "approved"),
      supabase.from("verification_requests").select("*", exact).eq("status", "pending"),
      supabase
        .from("raw_submissions")
        .select("*", exact)
        .in("redaction_status", ["needs_manual_review", "failed"]),
      supabase.from("reports").select("*", exact).eq("status", "open"),
      supabase.from("organizations").select("*", exact).eq("verified", true),
    ]).then((results) => results.map((result) => result.count ?? 0));

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <span className="page-eyebrow">OutLawed India operations</span>
          <h1>Dashboard</h1>
          <p>Everything waiting on an admin decision, and the shape of the library.</p>
        </div>
      </header>

      <div className="admin-stat-grid">
        <AdminStatCard
          label="Awaiting moderation"
          value={pendingPosts}
          hint="Submissions no one outside the organization can see yet."
          href="/moderation"
          icon={FileCheck2}
          tone={pendingPosts > 0 ? "attention" : "neutral"}
        />
        <AdminStatCard
          label="Redactions to confirm"
          value={ingestionFlags}
          hint="Raw uploads flagged for a human check."
          href="/ingestion-queue"
          icon={ShieldAlert}
          tone={ingestionFlags > 0 ? "attention" : "neutral"}
        />
        <AdminStatCard
          label="Verification applications"
          value={pendingVerifications}
          hint="Organizations and peer reviewers awaiting credentialing."
          href="/verifications"
          icon={BadgeCheck}
          tone={pendingVerifications > 0 ? "attention" : "neutral"}
        />
        <AdminStatCard
          label="Open reports"
          value={openReports}
          hint="Flagged posts and comments."
          href="/reports"
          icon={Flag}
          tone={openReports > 0 ? "attention" : "neutral"}
        />
        <AdminStatCard
          label="Published insights"
          value={approvedPosts}
          hint="Live and discoverable across the platform."
          href="/library"
          icon={Layers}
        />
        <AdminStatCard
          label="Verified organizations"
          value={orgs}
          hint="Accounts permitted to submit."
          icon={Users}
        />
      </div>

      <section className="admin-note">
        <h2>Where the next OTR session should look</h2>
        <p>
          Thin coverage is a signal, not a gap to hide. The{" "}
          <a href="/knowledge-gaps">knowledge gaps</a> view ranks sectors by how
          few published insights they hold, which is what turns this from an
          archive into a way of deciding what to examine next.
        </p>
      </section>
    </div>
  );
}
