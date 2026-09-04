import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  VerificationQueue,
  type VerificationRequestRow,
} from "@/components/admin/VerificationQueue";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Verifications" };

export default async function VerificationsPage() {
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_requests")
    .select("id, profile_id, request_type, payload, created_at, profile:profiles(display_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const rows: VerificationRequestRow[] = (data ?? []).map((row) => {
    const profile = row.profile as { display_name: string } | Array<{ display_name: string }> | null;
    const resolved = Array.isArray(profile) ? profile[0] : profile;
    return {
      id: row.id as string,
      profileId: row.profile_id as string,
      requestType: row.request_type as VerificationRequestRow["requestType"],
      displayName: resolved?.display_name ?? "Applicant",
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: row.created_at as string,
    };
  });

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <span className="page-eyebrow">OutLawed India operations</span>
          <h1>Verifications</h1>
          <p>
            Manual credentialing. Verifying an organization is what permits it to
            submit at all; verifying a reviewer is what permits structured critique.
          </p>
        </div>
        <strong>{rows.length} waiting</strong>
      </header>

      {error ? <p className="form-error">The verification queue could not be loaded.</p> : null}
      <VerificationQueue initialRows={rows} />
    </div>
  );
}
