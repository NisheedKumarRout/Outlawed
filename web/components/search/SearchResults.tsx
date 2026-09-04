"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PostCard } from "@/components/posts/PostCard";
import { SimilarCasesList } from "@/components/posts/SimilarCasesList";
import { EMPTY_FILTERS, FilterPanel, type Filters } from "@/components/search/FilterPanel";
import { SearchBar } from "@/components/search/SearchBar";
import { cn } from "@/lib/utils";
import type { InsightPost } from "@/types/insight";

type Mode = "keyword" | "situation";

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/**
 * Two ways in, deliberately.
 *
 * Keyword search answers "find the thing I already know exists". Situation
 * search answers "I have a problem, what has anyone learned about it" — which
 * is the actual moment of need, and the one a search box cannot serve.
 */
export function SearchResults({ posts }: { posts: InsightPost[] }) {
  const [mode, setMode] = useState<Mode>("keyword");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const facets = useMemo(
    () => ({
      sectors: uniqueSorted(posts.flatMap((post) => post.sectors)),
      targetGroups: uniqueSorted(posts.flatMap((post) => post.targetGroups)),
      geographies: uniqueSorted(posts.map((post) => post.geography ?? "")),
    }),
    [posts],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    return posts.filter((post) => {
      if (filters.sector && !post.sectors.includes(filters.sector)) return false;
      if (filters.targetGroup && !post.targetGroups.includes(filters.targetGroup)) return false;
      if (filters.geography && post.geography !== filters.geography) return false;
      if (!normalizedQuery) return true;

      return [
        post.title,
        post.problem,
        post.keyTakeaway,
        post.organization.name,
        post.geography,
        ...post.tags,
        ...post.sectors,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [filters, normalizedQuery, posts]);

  return (
    <>
      <div className="search-mode-toggle" role="tablist" aria-label="Search mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "keyword"}
          className={cn(mode === "keyword" && "search-mode-active")}
          onClick={() => setMode("keyword")}
        >
          Search by keyword
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "situation"}
          className={cn(mode === "situation" && "search-mode-active")}
          onClick={() => setMode("situation")}
        >
          Describe your situation
        </button>
      </div>

      {mode === "situation" ? (
        <SimilarCasesList heading="What are you up against?" />
      ) : (
        <>
          <SearchBar value={query} onChange={setQuery} />
          <FilterPanel
            sectors={facets.sectors}
            targetGroups={facets.targetGroups}
            geographies={facets.geographies}
            filters={filters}
            onChange={setFilters}
          />
          <p className="result-count">
            {results.length} {results.length === 1 ? "insight" : "insights"}
          </p>
          {results.length ? (
            <div className="feed-list">
              {results.map((post) => <PostCard post={post} key={post.id} />)}
            </div>
          ) : (
            <div className="quiet-state">
              <Search size={26} aria-hidden="true" />
              <h2>No matching insights</h2>
              <p>
                Try a broader term, or switch to &ldquo;Describe your
                situation&rdquo; — that searches by meaning rather than wording.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
