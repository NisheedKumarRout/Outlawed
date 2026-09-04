"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CommentItem, type CommentNode } from "@/components/comments/CommentItem";
import { Button } from "@/components/ui/Button";

export type FlatComment = {
  id: string;
  body: string;
  createdAt: string;
  parentCommentId: string | null;
  authorName: string;
  authorRole: string | null;
  isAnonymous: boolean;
  isDeleted: boolean;
};

/** Rebuild the reply tree from the flat rows the server returned. */
function buildTree(flat: FlatComment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const comment of flat) {
    byId.set(comment.id, { ...comment, replies: [] });
  }

  const roots: CommentNode[] = [];
  for (const comment of flat) {
    const node = byId.get(comment.id)!;
    const parent = comment.parentCommentId ? byId.get(comment.parentCommentId) : null;
    // A reply whose parent is not in this set (filtered or removed) is
    // promoted to a root rather than silently dropped.
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export function CommentThread({
  postId,
  initialComments,
  canComment,
}: {
  postId: string;
  initialComments: FlatComment[];
  canComment: boolean;
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(comments), [comments]);

  async function post(body: string, parentCommentId: string | null, isAnonymous: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          body,
          parent_comment_id: parentCommentId,
          is_anonymous: isAnonymous,
        }),
      });
      const payload = (await response.json()) as {
        id?: string;
        created_at?: string;
        error?: string;
      };
      if (!response.ok || !payload.id) throw new Error(payload.error ?? "The comment failed.");

      setComments((current) => [
        ...current,
        {
          id: payload.id!,
          body,
          createdAt: payload.created_at ?? new Date().toISOString(),
          parentCommentId,
          authorName: isAnonymous ? "Anonymous" : "You",
          authorRole: null,
          isAnonymous,
          isDeleted: false,
        },
      ]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The comment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="comment-thread">
      {canComment ? (
        <div className="comment-composer">
          <textarea
            className="form-textarea"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add context, ask what conditions applied, or say how this played out for you…"
            maxLength={5000}
          />
          <label className="privacy-choice privacy-choice-compact">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
            />
            <span className="privacy-choice-control" aria-hidden="true" />
            <span>
              <strong>Comment anonymously</strong>
              <small>Your name is hidden publicly; moderators retain the accountable record.</small>
            </span>
          </label>
          <Button
            type="button"
            onClick={async () => {
              if (!draft.trim()) return;
              await post(draft.trim(), null, anonymous);
              setDraft("");
            }}
            disabled={busy || !draft.trim()}
          >
            {busy ? "Posting…" : "Post comment"}
          </Button>
        </div>
      ) : (
        <p className="comment-signin">Discussion is available to verified organizations.</p>
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {tree.length ? (
        <ul className="comment-list">
          {tree.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              depth={0}
              onReply={(parentId, body, isAnonymous) => post(body, parentId, isAnonymous)}
              busy={busy}
              canReply={canComment}
            />
          ))}
        </ul>
      ) : (
        <p className="comment-empty">No comments yet.</p>
      )}
    </div>
  );
}
