"use client";

import { CornerDownRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

export type CommentNode = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorRole: string | null;
  isAnonymous: boolean;
  isDeleted: boolean;
  replies: CommentNode[];
};

export function CommentItem({
  comment,
  depth,
  onReply,
  busy,
  canReply,
}: {
  comment: CommentNode;
  depth: number;
  onReply: (parentId: string, body: string, isAnonymous: boolean) => Promise<void>;
  busy: boolean;
  canReply: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  async function submitReply() {
    if (!draft.trim()) return;
    await onReply(comment.id, draft.trim(), anonymous);
    setDraft("");
    setReplying(false);
  }

  return (
    <li className="comment-item" style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div className="comment-body">
        <div className="comment-meta">
          <strong>{comment.authorName}</strong>
          {!comment.isAnonymous && comment.authorRole && comment.authorRole !== "individual" ? (
            <span className="comment-role">{comment.authorRole}</span>
          ) : null}
          <time dateTime={comment.createdAt}>
            {new Date(comment.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </time>
        </div>
        <p className={comment.isDeleted ? "comment-deleted" : undefined}>{comment.body}</p>

        {/* Replies to a removed comment still make sense; new ones do not. */}
        {canReply && !comment.isDeleted && depth < 3 ? (
          <button type="button" className="comment-reply-toggle" onClick={() => setReplying((v) => !v)}>
            <CornerDownRight size={12} aria-hidden="true" /> Reply
          </button>
        ) : null}

        {replying ? (
          <div className="comment-reply-form">
            <textarea
              className="form-textarea"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add to this thread…"
              autoFocus
            />
            <label className="privacy-choice privacy-choice-compact">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
              />
              <span className="privacy-choice-control" aria-hidden="true" />
              <span>
                <strong>Reply anonymously</strong>
                <small>Your identity remains visible only to moderators.</small>
              </span>
            </label>
            <div>
              <Button type="button" variant="secondary" onClick={() => setReplying(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitReply()} disabled={busy || !draft.trim()}>
                {busy ? "Posting…" : "Post reply"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {comment.replies.length ? (
        <ul className="comment-children">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onReply={onReply}
              busy={busy}
              canReply={canReply}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
