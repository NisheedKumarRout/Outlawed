import Link from "next/link";

import { OrganizationHoverCard } from "@/components/organizations/OrganizationHoverCard";
import { PostActionBar } from "@/components/posts/PostActionBar";
import { Badge } from "@/components/ui/Badge";
import type { InsightPost } from "@/types/insight";

export function PostCard({ post }: { post: InsightPost }) {
  return (
    <article className="post-card">
      <div className="post-card-topline">
        <OrganizationHoverCard organization={post.organization} />
      </div>

      <Link href={`/posts/${post.id}`} className="post-title-link">
        <h2>{post.title}</h2>
      </Link>
      <p className="post-excerpt">{post.problem}</p>

      <div className="tag-list" aria-label="Post tags">
        {post.tags.map((tag) => (
          <Badge key={tag}>#{tag}</Badge>
        ))}
      </div>

      {post.imageUrl ? (
        <Link
          href={`/posts/${post.id}`}
          className="post-card-image"
          aria-label={`Open ${post.title}`}
          style={{ backgroundImage: `url(${JSON.stringify(post.imageUrl).slice(1, -1)})` }}
        />
      ) : null}

      <PostActionBar
        postId={post.id}
        usefulCount={post.usefulCount}
        commentCount={post.commentCount}
        compact
      />
    </article>
  );
}
