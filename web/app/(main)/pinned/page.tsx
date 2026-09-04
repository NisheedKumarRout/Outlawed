import { SectionShell } from "@/components/layout/SectionShell";
import { PinnedFeed } from "@/components/posts/PinnedFeed";
import { getFeedPosts } from "@/lib/data/posts";

export default async function PinnedPage() {
  const posts = await getFeedPosts();
  return <SectionShell eyebrow="Your library" title="Pinned insights" description="Keep useful evidence close while designing or reviewing an intervention."><PinnedFeed posts={posts} /></SectionShell>;
}
