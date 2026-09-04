"use client";

import { ArrowUpRight, Compass } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type SimilarCase = {
  post_id: string;
  title: string;
  organization_name: string | null;
  similarity: number;
  why_relevant: string;
  key_takeaway: string | null;
  sector: string[];
  geography: string | null;
};

type Result = {
  retrieval_mode: "vector" | "lexical" | "recent";
  results: SimilarCase[];
  briefing: string | null;
};

/**
 * Similar Cases — describe a situation, get precedents with a stated reason.
 *
 * The `why_relevant` line is the point of this component. A list of titles is
 * a search result; a list of titles each explaining what it shares with your
 * situation is something you can act on without reading all of them first.
 */
export function SimilarCasesList({
  excludePostId,
  initialQuery = "",
  heading = "Find relevant precedents",
}: {
  excludePostId?: string;
  initialQuery?: string;
  heading?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 10) {
      setError("Describe your situation in a sentence or two.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/similar-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          match_count: 5,
          exclude_post_id: excludePostId,
        }),
      });
      const payload = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Search failed.");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="similar-cases" aria-label={heading}>
      <header className="similar-cases-header">
        <Compass size={16} aria-hidden="true" />
        <div>
          <h2>{heading}</h2>
          <p>Describe what you are facing. Results are ranked by context, not keywords.</p>
        </div>
      </header>

      <form onSubmit={search} className="similar-cases-form">
        <textarea
          className="form-textarea"
          rows={3}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="We run a volunteer paralegal programme in two districts and cannot get consistent buy-in from local officials…"
          maxLength={4000}
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Find precedents"}
        </Button>
      </form>

      {loading ? (
        <p className="similar-search-progress" role="status">
          Comparing your situation with verified cases. This can take about 15 seconds.
        </p>
      ) : null}

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {result?.briefing ? (
        <div className="similar-briefing">
          <strong>Briefing</strong>
          <p>{result.briefing}</p>
        </div>
      ) : null}

      {result && result.results.length === 0 ? (
        <p className="similar-empty">
          Nothing in the library matches that closely yet. That gap is itself
          recorded — it feeds the admin knowledge-gap view.
        </p>
      ) : null}

      <ol className="similar-list">
        {result?.results.map((item) => (
          <li key={item.post_id}>
            <div className="similar-list-top">
              <Link href={`/posts/${item.post_id}`}>
                {item.title} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
              <span
                className="similar-score"
                title="Contextual relevance to the situation you described"
              >
                {Math.round(item.similarity * 100)}% fit
              </span>
            </div>
            <p className="similar-why">{item.why_relevant}</p>
            {item.key_takeaway ? <p className="similar-takeaway">{item.key_takeaway}</p> : null}
            <div className="similar-meta">
              {item.organization_name ? <span>{item.organization_name}</span> : null}
              {item.geography ? <span>{item.geography}</span> : null}
              {item.sector.map((sector) => (
                <Badge key={sector}>{sector}</Badge>
              ))}
            </div>
          </li>
        ))}
      </ol>

      {result && result.retrieval_mode === "lexical" ? (
        <p className="similar-mode-note">
          Retrieved by full-text search — no embedding provider is configured.
          Ranking and explanations are unaffected.
        </p>
      ) : null}
    </section>
  );
}
