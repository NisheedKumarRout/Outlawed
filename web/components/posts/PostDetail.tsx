import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";

import { CommentThread, type FlatComment } from "@/components/comments/CommentThread";
import { OrganizationHoverCard } from "@/components/organizations/OrganizationHoverCard";
import { PostFeedback } from "@/components/posts/PostFeedback";
import { PostActionBar } from "@/components/posts/PostActionBar";
import { PeerReviewCard, type PeerReview } from "@/components/reviews/PeerReviewCard";
import { Badge } from "@/components/ui/Badge";
import type { FeedbackSummary, FeedbackValue } from "@/lib/data/discussion";
import type { InsightPost } from "@/types/insight";

export function PostDetail({
  post,
  comments,
  reviews,
  feedbackSummary,
  viewerFeedback,
  pinned,
  canContribute,
}: {
  post: InsightPost;
  comments: FlatComment[];
  reviews: PeerReview[];
  feedbackSummary: FeedbackSummary;
  viewerFeedback: FeedbackValue | null;
  pinned: boolean;
  canContribute: boolean;
}) {
  return (
    <article className="post-detail">
      <Link href="/feed" className="back-link"><ArrowLeft size={16} /> Back to feed</Link>
      <header className="post-detail-header">
        <OrganizationHoverCard organization={post.organization} />
        <h1>{post.title}</h1>
        <div className="detail-meta">
          {post.geography ? <span><MapPin size={15} /> {post.geography}</span> : null}
        </div>
        <div className="tag-list">
          {post.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>)}
        </div>
      </header>

      <p className="post-detail-lead">{post.problem}</p>

      {post.imageUrl ? (
        <div
          className="post-detail-image"
          role="img"
          aria-label={`Field context for ${post.title}`}
          style={{ backgroundImage: `url(${JSON.stringify(post.imageUrl).slice(1, -1)})` }}
        />
      ) : null}

      <PostActionBar
        postId={post.id}
        usefulCount={feedbackSummary.usefulCount}
        commentCount={comments.length}
      />

      <div className="insight-body">
        <section>
          <h2>From the field</h2>
          <p>{post.context}</p>
        </section>
        <section>
          <h2>What we did</h2>
          <p>{post.approach}</p>
        </section>
        <section>
          <h2>What changed</h2>
          <p>{post.evidenceOutcome}</p>
        </section>
        <section className="insight-takeaway">
          <h2>What we learned</h2>
          <p>{post.keyTakeaway}</p>
        </section>
        {(post.whatWorked || post.whatFailed || post.cautions) ? (
          <section className="field-notes">
            <h2>Practice notes</h2>
            {post.whatWorked ? <p><strong>What helped:</strong> {post.whatWorked}</p> : null}
            {post.whatFailed ? <p><strong>What did not:</strong> {post.whatFailed}</p> : null}
            {post.cautions ? <p><strong>Watch for:</strong> {post.cautions}</p> : null}
          </section>
        ) : null}
        {post.conditions ? (
          <section><h2>Conditions for reuse</h2><p>{post.conditions}</p></section>
        ) : null}
        {post.wouldDoDifferently ? (
          <section><h2>Next time</h2><p>{post.wouldDoDifferently}</p></section>
        ) : null}
      </div>

      <PostFeedback
        postId={post.id}
        initialValue={viewerFeedback}
        initialSummary={feedbackSummary}
        initialPinned={pinned}
        canRespond={canContribute}
      />

      <section className="peer-review-section">
        <h2>Peer review</h2>
        {reviews.length ? (
          reviews.map((review) => <PeerReviewCard key={review.id} review={review} />)
        ) : (
          <p className="comment-empty">
            No verified peer reviewer has critiqued this insight yet.
          </p>
        )}
      </section>

      <section className="discussion-section" id="discussion">
        <h2>Discussion</h2>
        <p>
          {comments.length
            ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"} on this insight.`
            : "No comments yet."}
        </p>
        <CommentThread postId={post.id} initialComments={comments} canComment={canContribute} />
      </section>
    </article>
  );
}
