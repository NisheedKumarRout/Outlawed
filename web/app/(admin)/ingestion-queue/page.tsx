import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { IngestionQueueTable, type IngestionRow } from "@/components/admin/IngestionQueueTable";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ingestion queue" };

export default async function IngestionQueuePage() {
  // Pages and layouts render in parallel, so this must not assume the layout's
  // admin redirect has already run.
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();

  // The review view, not the base table — storage_path and extracted_text are
  // not columns here, so the admin UI structurally cannot request them.
  const { data, error } = await supabase
    .from("raw_submissions_review")
    .select(
      "id, org_id, original_filename, source_type, redaction_status, redaction_report, redacted_text, redaction_error, created_at",
    )
    .in("redaction_status", ["needs_manual_review", "processing", "failed"])
    .order("created_at", { ascending: true });

  const orgIds = Array.from(new Set((data ?? []).map((row) => row.org_id as string)));
  const { data: orgs } = orgIds.length
    ? await supabase.from("organizations").select("id, org_name").in("id", orgIds)
    : { data: [] };

  const orgNames = new Map((orgs ?? []).map((org) => [org.id as string, org.org_name as string]));

  const rows: IngestionRow[] = (data ?? []).map((row) => ({
    id: row.id as string,
    organizationName: orgNames.get(row.org_id as string) ?? "Unknown organization",
    originalFilename: (row.original_filename as string | null) ?? null,
    sourceType: (row.source_type as string) ?? "other",
    redactionStatus: row.redaction_status as IngestionRow["redactionStatus"],
    redactedText: (row.redacted_text as string | null) ?? null,
    redactionError: (row.redaction_error as string | null) ?? null,
    createdAt: row.created_at as string,
    report: (row.redaction_report ?? {}) as IngestionRow["report"],
  }));

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <span className="page-eyebrow">OutLawed India operations</span>
          <h1>Ingestion queue</h1>
          <p>
            Confirm redactions on raw session material before an insight is built
            from it. This is the step before post moderation, not a substitute for it.
          </p>
        </div>
        <strong>{rows.length} waiting</strong>
      </header>

      {error ? <p className="form-error">The ingestion queue could not be loaded.</p> : null}
      <IngestionQueueTable initialRows={rows} />
    </div>
  );
}
