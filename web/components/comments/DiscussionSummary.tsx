"use client";

import { MessagesSquare } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

type Summary = {
  summary: string;
  open_questions: string[];
  unresolved_concerns: string[];
  points_of_agreement: string[];
};

/**
 * Summarises the scrutiny an insight has received.
 *
 * Loaded on demand rather than on render: it is a metered Claude call, and
 * most readers scroll past the discussion without needing it summarised.
 */
export function DiscussionSummary({ postId }: { postId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/discussion-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const payload = (await response.json()) as {
        summary?: Summary | null;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "The summary failed.");
      setSummary(payload.summary ?? null);
      setMessage(payload.message ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The summary failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="discussion-summary">
      {!summary && !message ? (
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          <MessagesSquare size={14} aria-hidden="true" />
          {loading ? "Reading the thread…" : "Summarise the scrutiny"}
        </Button>
      ) : null}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="comment-empty">{message}</p> : null}

      {summary ? (
        <div className="discussion-summary-body">
          <p>{summary.summary}</p>

          {summary.unresolved_concerns.length ? (
            <div>
              <h4>Unresolved concerns</h4>
              <ul>{summary.unresolved_concerns.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}

          {summary.open_questions.length ? (
            <div>
              <h4>Open questions</h4>
              <ul>{summary.open_questions.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}

          {summary.points_of_agreement.length ? (
            <div>
              <h4>Points of agreement</h4>
              <ul>{summary.points_of_agreement.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
