import { OrganizationContextCard } from "@/components/organizations/OrganizationContextCard";
import { ApplicabilityScore } from "@/components/posts/ApplicabilityScore";
import { PostRAGChat } from "@/components/posts/PostRAGChat";
import { SimilarCasesList } from "@/components/posts/SimilarCasesList";
import type { InsightPost } from "@/types/insight";

export function InsightToolsPanel({ post }: { post: InsightPost }) {
  return (
    <aside className="context-panel insight-tools-panel" aria-label="Insight tools">
      <OrganizationContextCard organization={post.organization} />
      <ApplicabilityScore postId={post.id} />
      <PostRAGChat postId={post.id} postTitle={post.title} />
      <SimilarCasesList
        excludePostId={post.id}
        initialQuery={post.problem.slice(0, 400)}
        heading="Related cases"
      />
    </aside>
  );
}
