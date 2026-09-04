import type { Metadata } from "next";

import { TrendingTags } from "@/components/layout/TrendingTags";
import { PostCard } from "@/components/posts/PostCard";
import { getFeedPosts, getTrendingTags } from "@/lib/data/posts";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  const posts = await getFeedPosts();
  const trendingTags = getTrendingTags(posts);

  return (
    <div className="page-grid">
      <section className="content-column">
        <header className="feed-header">
          <div>
            <h1>Feed</h1>
            <p>Verified legal-aid insights from the field</p>
          </div>
          <span className="feed-order">Latest</span>
        </header>
        {posts.length ? (
          <div className="feed-list">
            {posts.map((post) => <PostCard post={post} key={post.id} />)}
          </div>
        ) : (
          <div className="quiet-state">
            <h2>No insights are visible yet</h2>
            <p>Run the seed script, or sign in with an account that can view registered insights.</p>
          </div>
        )}
      </section>
      <TrendingTags tags={trendingTags} />
    </div>
  );
}
