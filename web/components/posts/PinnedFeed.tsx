"use client";

import { Bookmark } from "lucide-react";
import { useEffect, useState } from "react";

import { PostCard } from "@/components/posts/PostCard";
import type { InsightPost } from "@/types/insight";

function loadPinnedIds() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem("otr:pinned-posts") ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

export function PinnedFeed({ posts }: { posts: InsightPost[] }) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const refresh = () => setPinnedIds(loadPinnedIds());
    refresh();
    window.addEventListener("otr:local-state", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("otr:local-state", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const pinnedPosts = posts.filter((post) => pinnedIds.has(post.id));
  if (!pinnedPosts.length) {
    return <div className="quiet-state"><Bookmark size={28} /><h2>No pinned insights yet</h2><p>Use the Pin action on any feed item to save it here.</p></div>;
  }

  return <div className="feed-list">{pinnedPosts.map((post) => <PostCard post={post} key={post.id} />)}</div>;
}
