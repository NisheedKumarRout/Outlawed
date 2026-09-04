"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { InsightPost } from "@/types/insight";

const ROWS: Array<{ label: string; key: keyof InsightPost }> = [
  { label: "Problem", key: "problem" },
  { label: "Context", key: "context" },
  { label: "Approach", key: "approach" },
  { label: "Evidence & outcome", key: "evidenceOutcome" },
  { label: "What worked", key: "whatWorked" },
  { label: "What failed", key: "whatFailed" },
  { label: "Why", key: "whyWorkedOrFailed" },
  { label: "Conditions for reuse", key: "conditions" },
  { label: "Cautions", key: "cautions" },
  { label: "Would do differently", key: "wouldDoDifferently" },
  { label: "Key takeaway", key: "keyTakeaway" },
];

const MAX_SELECTED = 3;

/**
 * Side-by-side comparison, which only works because every insight shares one
 * schema. This is the concrete payoff of structured submission over freeform
 * posts — a blank cell here is itself informative, because it means that
 * organisation did not record that field, not that the layout differs.
 */
export function CompareBoard({ posts, initialPostId }: { posts: InsightPost[]; initialPostId?: string }) {
  const [selected, setSelected] = useState<string[]>(() => {
    const initial = posts.find((post) => post.id === initialPostId);
    if (!initial) return posts.slice(0, 2).map((post) => post.id);
    const comparison = posts.find((post) => post.id !== initial.id);
    return comparison ? [initial.id, comparison.id] : [initial.id];
  });

  const chosen = selected
    .map((id) => posts.find((post) => post.id === id))
    .filter((post): post is InsightPost => Boolean(post));

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= MAX_SELECTED
          ? current
          : [...current, id],
    );
  }

  if (!posts.length) {
    return (
      <div className="quiet-state">
        <h2>Nothing to compare yet</h2>
        <p>Approved insights appear here once the library has content.</p>
      </div>
    );
  }

  return (
    <>
      <section className="compare-picker" aria-label="Choose insights to compare">
        <p>Pick up to {MAX_SELECTED} insights.</p>
        <div>
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              onClick={() => toggle(post.id)}
              className={cn("filter-chip", selected.includes(post.id) && "filter-chip-active")}
              aria-pressed={selected.includes(post.id)}
              disabled={!selected.includes(post.id) && selected.length >= MAX_SELECTED}
            >
              {post.title}
            </button>
          ))}
        </div>
      </section>

      {chosen.length < 2 ? (
        <p className="compare-hint">Select at least two insights to compare them.</p>
      ) : (
        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                {chosen.map((post) => (
                  <th scope="col" key={post.id}>
                    <Link href={`/posts/${post.id}`}>{post.title}</Link>
                    <span>{post.organization.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {chosen.map((post) => {
                    const value = post[row.key];
                    return (
                      <td key={post.id}>
                        {typeof value === "string" && value.trim() ? (
                          value
                        ) : (
                          <em className="compare-empty">Not recorded</em>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
