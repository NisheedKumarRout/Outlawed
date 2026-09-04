import { AlertTriangle, BadgeCheck, HelpCircle, Lightbulb, ThumbsUp } from "lucide-react";

export type PeerReview = {
  id: string;
  strength: string | null;
  concern: string | null;
  missingContext: string | null;
  risk: string | null;
  recommendation: string | null;
  createdAt: string;
  reviewerName: string;
};

const SECTIONS = [
  { key: "strength", label: "Strength", icon: ThumbsUp },
  { key: "concern", label: "Concern", icon: AlertTriangle },
  { key: "missingContext", label: "Missing context", icon: HelpCircle },
  { key: "risk", label: "Risk", icon: AlertTriangle },
  { key: "recommendation", label: "Recommendation", icon: Lightbulb },
] as const;

/**
 * Structured critique from a verified peer reviewer — deliberately not a
 * comment. The fixed sections are what make reviews comparable across
 * insights instead of five different people's freeform opinions.
 */
export function PeerReviewCard({ review }: { review: PeerReview }) {
  return (
    <article className="peer-review">
      <header>
        <BadgeCheck size={14} aria-hidden="true" />
        <strong>{review.reviewerName}</strong>
        <span>Verified peer reviewer</span>
        <time dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </time>
      </header>

      <dl>
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const value = review[key];
          if (!value) return null;
          return (
            <div key={key} className={`peer-review-section peer-review-${key}`}>
              <dt><Icon size={12} aria-hidden="true" /> {label}</dt>
              <dd>{value}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}
