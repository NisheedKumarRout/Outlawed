"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

export type RedactionFinding = {
  category: string;
  count: number;
  note?: string | null;
};

export type RedactionResult = {
  submission_id: string;
  redaction_status: "cleared" | "needs_manual_review" | "failed" | "processing";
  chunk_count?: number;
  findings?: RedactionFinding[];
  residual_risk?: "none" | "low" | "medium" | "high";
  reason?: string | null;
  redacted_text?: string | null;
};

const STATUS_COPY = {
  cleared: {
    icon: CheckCircle2,
    title: "Cleared automatically",
    body: "No residual identifiers were flagged. An admin still confirms before this is used.",
  },
  needs_manual_review: {
    icon: AlertTriangle,
    title: "Needs a human check",
    body: "The redaction completed but is not being auto-cleared. An admin reviews it before it can be used.",
  },
  failed: {
    icon: XCircle,
    title: "Redaction failed",
    body: "Nothing was published. Check the file format and try again.",
  },
  processing: {
    icon: AlertTriangle,
    title: "Still processing",
    body: "The redaction pass has not finished yet.",
  },
} as const;

/**
 * Shared by the org's own view and the admin ingestion queue.
 *
 * Shows only `redacted_text` — the pre-redaction extraction and the storage
 * path are excluded from the `raw_submissions_review` view this data comes
 * from, so there is no way for this component to receive them.
 */
export function RedactionReviewPanel({
  result,
  showNextStep = true,
}: {
  result: RedactionResult;
  showNextStep?: boolean;
}) {
  const copy = STATUS_COPY[result.redaction_status] ?? STATUS_COPY.processing;
  const Icon = copy.icon;
  const findings = result.findings ?? [];
  const totalRedactions = findings.reduce((sum, finding) => sum + finding.count, 0);

  return (
    <section className={`redaction-panel redaction-${result.redaction_status}`}>
      <header>
        <Icon size={18} aria-hidden="true" />
        <div>
          <strong>{copy.title}</strong>
          <p>{result.reason || copy.body}</p>
        </div>
      </header>

      <dl className="redaction-stats">
        <div><dt>Identifiers removed</dt><dd>{totalRedactions}</dd></div>
        <div><dt>Sections checked</dt><dd>{result.chunk_count ?? "—"}</dd></div>
        <div><dt>Residual risk</dt><dd>{result.residual_risk ?? "—"}</dd></div>
      </dl>

      {findings.length ? (
        <div className="redaction-findings">
          <h4>What was found</h4>
          <ul>
            {findings.map((finding) => (
              <li key={finding.category}>
                <span className="redaction-category">{finding.category.replace(/_/g, " ")}</span>
                <span className="redaction-count">{finding.count}</span>
                {finding.note ? <em>{finding.note}</em> : null}
              </li>
            ))}
          </ul>
          <p className="redaction-note">
            Counts only — the removed values are never shown here or stored anywhere
            a client can read.
          </p>
        </div>
      ) : null}

      {result.redacted_text ? (
        <details className="redaction-preview">
          <summary>Preview the redacted text</summary>
          <pre>{result.redacted_text}</pre>
        </details>
      ) : null}

      {showNextStep && result.redaction_status !== "failed" ? (
        <p className="redaction-next">
          Next: use this text as the starting reference for a structured
          submission.{" "}
          <Link href={`/posts/new?submission=${result.submission_id}`}>
            Start the OTR form
          </Link>
        </p>
      ) : null}
    </section>
  );
}
