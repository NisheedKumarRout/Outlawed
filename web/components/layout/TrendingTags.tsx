import { ArrowUpRight, Hash } from "lucide-react";
import Link from "next/link";

export function TrendingTags({ tags }: { tags: Array<[string, number]> }) {
  return (
    <aside className="context-panel" aria-label="Trending topics">
      <div className="context-card">
        <div className="context-heading">
          <div>
            <span className="page-eyebrow">Across OTR</span>
            <h2>Trending tags</h2>
          </div>
          <Hash size={18} />
        </div>
        <div className="trending-list">
          {tags.map(([tag, count], index) => (
            <Link href={`/search?tag=${encodeURIComponent(tag)}`} key={tag}>
              <span className="trend-rank">{String(index + 1).padStart(2, "0")}</span>
              <span>
                <strong>{tag}</strong>
                <small>{count} {count === 1 ? "insight" : "insights"}</small>
              </span>
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
