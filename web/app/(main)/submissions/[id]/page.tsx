import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionShell } from "@/components/layout/SectionShell";
import {
  RedactionReviewPanel,
  type RedactionResult,
} from "@/components/submissions/RedactionReviewPanel";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submission" };

type PageProps = { params: Promise<{ id: string }> };

export default async function SubmissionPage({ params }: PageProps) {
  if (!hasSupabasePublicEnv()) notFound();

  const { id } = await params;
  const supabase = await createClient();

  // Queried through the review view, never the base table: the view has no
  // storage_path or extracted_text columns at all, so the unredacted material
  // cannot reach this page even by mistake.
  const { data } = await supabase
    .from("raw_submissions_review")
    .select(
      "id, original_filename, source_type, redaction_status, redaction_report, redacted_text, redaction_error, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const report = (data.redaction_report ?? {}) as {
    findings?: RedactionResult["findings"];
    residual_risk?: RedactionResult["residual_risk"];
    chunk_count?: number;
    reason?: string | null;
  };

  const result: RedactionResult = {
    submission_id: data.id as string,
    redaction_status: data.redaction_status as RedactionResult["redaction_status"],
    findings: report.findings ?? [],
    residual_risk: report.residual_risk,
    chunk_count: report.chunk_count,
    reason: report.reason ?? (data.redaction_error as string | null),
    redacted_text: data.redacted_text as string | null,
  };

  return (
    <SectionShell
      eyebrow="Secure ingestion"
      title={(data.original_filename as string) ?? "Raw submission"}
      description={`Uploaded ${new Date(data.created_at as string).toLocaleDateString("en-IN")} · ${String(
        data.source_type,
      ).replace(/_/g, " ")}`}
    >
      <RedactionReviewPanel result={result} />
    </SectionShell>
  );
}
