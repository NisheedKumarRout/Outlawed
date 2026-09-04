"use client";

import { Check, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  RedactionReviewPanel,
  type RedactionResult,
} from "@/components/submissions/RedactionReviewPanel";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export type IngestionRow = {
  id: string;
  organizationName: string;
  originalFilename: string | null;
  sourceType: string;
  redactionStatus: RedactionResult["redaction_status"];
  redactedText: string | null;
  redactionError: string | null;
  createdAt: string;
  report: {
    findings?: RedactionResult["findings"];
    residual_risk?: RedactionResult["residual_risk"];
    chunk_count?: number;
    reason?: string | null;
  };
};

/**
 * The ingestion queue is a separate step from post moderation.
 *
 * This is the earlier gate: an admin confirms the redaction looks right before
 * the organisation builds a structured insight from the material. Approving
 * here does not publish anything.
 */
export function IngestionQueueTable({ initialRows }: { initialRows: IngestionRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function clearSubmission(row: IngestionRow) {
    setBusyId(row.id);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("raw_submissions")
      .update({ redaction_status: "cleared" })
      .eq("id", row.id);

    if (updateError) {
      setError("The clearance could not be saved.");
      setBusyId(null);
      return;
    }

    setRows((current) => current.filter((item) => item.id !== row.id));
    setBusyId(null);
    router.refresh();
  }

  if (!rows.length) {
    return (
      <div className="quiet-state">
        <Check size={28} aria-hidden="true" />
        <h2>Nothing awaiting redaction review</h2>
        <p>Uploads flagged for a human check appear here before an insight is built from them.</p>
      </div>
    );
  }

  return (
    <div className="ingestion-list">
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {rows.map((row) => {
        const result: RedactionResult = {
          submission_id: row.id,
          redaction_status: row.redactionStatus,
          findings: row.report.findings ?? [],
          residual_risk: row.report.residual_risk,
          chunk_count: row.report.chunk_count,
          reason: row.report.reason ?? row.redactionError,
          redacted_text: row.redactedText,
        };

        return (
          <article className="ingestion-row" key={row.id}>
            <div className="ingestion-row-meta">
              <span className={`status-label status-${row.redactionStatus}`}>
                {row.redactionStatus.replace(/_/g, " ")}
              </span>
              <span>{row.organizationName}</span>
              <time>{new Date(row.createdAt).toLocaleDateString("en-IN")}</time>
            </div>

            <h2>{row.originalFilename ?? "Untitled upload"}</h2>
            <p className="ingestion-source">{row.sourceType.replace(/_/g, " ")}</p>

            {row.redactionStatus === "needs_manual_review" ? (
              <p className="ingestion-flag">
                <ShieldAlert size={13} aria-hidden="true" />
                {row.report.reason ?? "Flagged for a human check before use."}
              </p>
            ) : null}

            <div className="ingestion-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpenId(openId === row.id ? null : row.id)}
              >
                {openId === row.id ? "Hide redaction" : "Review redaction"}
              </Button>
              {row.redactionStatus !== "failed" ? (
                <Button
                  type="button"
                  onClick={() => void clearSubmission(row)}
                  disabled={busyId === row.id}
                >
                  <Check size={15} aria-hidden="true" />
                  {busyId === row.id ? "Saving…" : "Clear for use"}
                </Button>
              ) : null}
            </div>

            {openId === row.id ? (
              <RedactionReviewPanel result={result} showNextStep={false} />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
