import { SectionShell } from "@/components/layout/SectionShell";
import { SearchResults } from "@/components/search/SearchResults";
import { getFeedPosts } from "@/lib/data/posts";

export default async function SearchPage() {
  const posts = await getFeedPosts();
  return (
    <SectionShell eyebrow="Knowledge discovery" title="Search field insights" description="Search by intervention, target group, geography, or the conditions you need to understand.">
      <SearchResults posts={posts} />
    </SectionShell>
  );
}
