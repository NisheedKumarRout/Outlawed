"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { FeedbackSummary, FeedbackValue } from "@/lib/data/discussion";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: FeedbackValue; label: string }> = [
  { value: "useful", label: "Useful" },
  { value: "somewhat_useful", label: "Somewhat useful" },
  { value: "not_useful", label: "Not useful" },
];

/**
 * Feedback, deliberately not a like button.
 *
 * Three graded values rather than an upvote, and the counts are shown without
 * ranking anything by them — a niche insight that is exactly right for one
 * organisation must not lose to a generic one with more votes.
 */
export function PostFeedback({
  postId,
  initialValue,
  initialSummary,
  initialPinned,
  canRespond,
}: {
  postId: string;
  initialValue: FeedbackValue | null;
  initialSummary: FeedbackSummary;
  initialPinned: boolean;
  canRespond: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [summary, setSummary] = useState(initialSummary);
  const [pinned, setPinned] = useState(initialPinned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rate(next: FeedbackValue) {
    if (!canRespond || busy) return;
    setBusy(true);
    setError(null);

    // Clicking the current rating clears it.
    const clearing = value === next;

    try {
      const response = await fetch(`/api/posts/${postId}/feedback`, {
        method: clearing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: clearing ? undefined : JSON.stringify({ value: next }),
      });
      const payload = (await response.json()) as {
        error?: string;
        summary?: {
          useful_count: number;
          somewhat_useful_count: number;
          not_useful_count: number;
          total_count: number;
        } | null;
      };
      if (!response.ok) throw new Error(payload.error ?? "Your feedback could not be saved.");

      setValue(clearing ? null : next);
      if (payload.summary) {
        setSummary({
          usefulCount: Number(payload.summary.useful_count ?? 0),
          somewhatUsefulCount: Number(payload.summary.somewhat_useful_count ?? 0),
          notUsefulCount: Number(payload.summary.not_useful_count ?? 0),
          totalCount: Number(payload.summary.total_count ?? 0),
        });
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your feedback could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePin() {
    if (!canRespond || busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Your session has expired.");
      setBusy(false);
      return;
    }

    // Pins are a plain RLS-protected table, so this goes straight to Supabase
    // rather than through an API route.
    const query = pinned
      ? supabase.from("pins").delete().eq("post_id", postId).eq("user_id", userData.user.id)
      : supabase.from("pins").insert({ post_id: postId, user_id: userData.user.id });

    const { error: pinError } = await query;
    if (pinError) setError("The pin could not be updated.");
    else {
      setPinned(!pinned);
      router.refresh();
    }
    setBusy(false);
  }

  const counts: Record<FeedbackValue, number> = {
    useful: summary.usefulCount,
    somewhat_useful: summary.somewhatUsefulCount,
    not_useful: summary.notUsefulCount,
  };

  return (
    <section className="post-feedback" id="feedback" aria-label="Was this useful?">
      <div className="post-feedback-head">
        <strong>Was this useful to you?</strong>
        <span>Feedback records fit, not popularity — nothing is ranked by it.</span>
      </div>

      <div className="post-feedback-options">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn("feedback-chip", value === option.value && "feedback-chip-active")}
            onClick={() => void rate(option.value)}
            disabled={!canRespond || busy}
            aria-pressed={value === option.value}
          >
            {option.label}
            <span>{counts[option.value]}</span>
          </button>
        ))}

        <button
          type="button"
          className={cn("feedback-chip", pinned && "feedback-chip-active")}
          onClick={() => void togglePin()}
          disabled={!canRespond || busy}
          aria-pressed={pinned}
        >
          {pinned ? <BookmarkCheck size={14} aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}
          {pinned ? "Pinned" : "Pin"}
        </button>
      </div>

      {!canRespond ? <p className="comment-signin">Feedback and pinning are available to verified organizations.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
