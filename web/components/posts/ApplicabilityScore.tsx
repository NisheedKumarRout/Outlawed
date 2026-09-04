"use client";

import { AlertTriangle, Check, Target, X } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";

type Assessment = {
  score: number;
  verdict: "strong_match" | "partial_match" | "weak_match";
  matching_conditions: string[];
  divergent_conditions: string[];
  cautions: string[];
  recommended_next_steps: string[];
  rationale: string;
};

const VERDICT_LABELS: Record<Assessment["verdict"], string> = {
  strong_match: "Likely transfers",
  partial_match: "Transfers with caveats",
  weak_match: "Unlikely to transfer",
};

/**
 * Applicability — how well THIS insight transfers to the reader's context.
 *
 * Distinct from Similar Cases: that one picks which insights are relevant,
 * this one takes the insight already on screen and checks it against the
 * conditions the authors recorded.
 */
export function ApplicabilityScore({ postId }: { postId: string }) {
  const [context, setContext] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (context.trim().length < 10) {
      setError("Describe your own situation so it can be compared.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/applicability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, requester_context: context.trim() }),
      });
      const payload = (await response.json()) as {
        assessment?: Assessment;
        error?: string;
      };
      if (!response.ok || !payload.assessment) {
        throw new Error(payload.error ?? "The assessment could not be produced.");
      }
      setAssessment(payload.assessment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assessment failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="applicability" aria-label="Does this apply to you?">
      <header className="applicability-header">
        <Target size={16} aria-hidden="true" />
        <div>
          <h2>Does this apply to you?</h2>
          <p>Checked against the conditions this insight says had to hold.</p>
        </div>
      </header>

      <form onSubmit={assess} className="applicability-form">
        <textarea
          className="form-textarea"
          rows={3}
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder="Your sector, who you serve, where you work, and the constraint you are up against…"
          maxLength={4000}
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Assessing…" : "Assess applicability"}
        </Button>
      </form>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {assessment ? (
        <div className={`applicability-result applicability-${assessment.verdict}`}>
          <div className="applicability-score-row">
            <strong>{assessment.score}</strong>
            <span>{VERDICT_LABELS[assessment.verdict]}</span>
          </div>
          <p className="applicability-rationale">{assessment.rationale}</p>

          {assessment.matching_conditions.length ? (
            <div className="applicability-group">
              <h3><Check size={13} aria-hidden="true" /> Conditions that match</h3>
              <ul>{assessment.matching_conditions.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}

          {assessment.divergent_conditions.length ? (
            <div className="applicability-group">
              <h3><X size={13} aria-hidden="true" /> Where your context differs</h3>
              <ul>{assessment.divergent_conditions.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}

          {assessment.cautions.length ? (
            <div className="applicability-group">
              <h3><AlertTriangle size={13} aria-hidden="true" /> Cautions</h3>
              <ul>{assessment.cautions.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}

          {assessment.recommended_next_steps.length ? (
            <div className="applicability-group">
              <h3>Suggested next steps</h3>
              <ol>{assessment.recommended_next_steps.map((item) => <li key={item}>{item}</li>)}</ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
