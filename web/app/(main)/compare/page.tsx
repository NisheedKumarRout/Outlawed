import type { Metadata } from "next";

import { SectionShell } from "@/components/layout/SectionShell";
import { CompareBoard } from "@/components/posts/CompareBoard";
import { getFeedPosts } from "@/lib/data/posts";

export const metadata: Metadata = { title: "Compare insights" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string }>;
}) {
  const { post } = await searchParams;
  const posts = await getFeedPosts();

  return (
    <SectionShell
      eyebrow="Knowledge discovery"
      title="Compare insights side by side"
      description="Structured fields make two insights genuinely comparable — read what worked, what failed, and under what conditions, in the same row."
    >
      <CompareBoard posts={posts} initialPostId={post} />
    </SectionShell>
  );
}
