import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InsightToolsPanel } from "@/components/posts/InsightToolsPanel";
import { PostDetail } from "@/components/posts/PostDetail";
import {
  getFeedbackSummary,
  getPeerReviews,
  getPostComments,
  getViewerFeedback,
  isPinned,
} from "@/lib/data/discussion";
import { getPostById } from "@/lib/data/posts";
import { getCurrentRole } from "@/lib/data/auth";

type PostPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getPostById(id);
  return { title: post?.title ?? "Insight" };
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  // Independent queries, so they run together rather than in series.
  const [comments, reviews, feedbackSummary, viewerFeedback, pinned, role] =
    await Promise.all([
      getPostComments(id),
      getPeerReviews(id),
      getFeedbackSummary(id),
      getViewerFeedback(id),
      isPinned(id),
      getCurrentRole(),
    ]);

  return (
    <div className="page-grid detail-page-grid">
      <section className="content-column">
        <PostDetail
          post={post}
          comments={comments}
          reviews={reviews}
          feedbackSummary={feedbackSummary}
          viewerFeedback={viewerFeedback}
          pinned={pinned}
          canContribute={role === "org" || role === "reviewer"}
        />
      </section>
      <InsightToolsPanel post={post} />
    </div>
  );
}
