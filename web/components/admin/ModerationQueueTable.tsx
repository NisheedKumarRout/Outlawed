"use client";

import { Check, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import type { PostStatus } from "@/types/database.types";
import type { ModerationPost } from "@/types/moderation";

type ReviewAction = "reject" | "changes";

export function ModerationQueueTable({ initialPosts }: { initialPosts: ModerationPost[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [active, setActive] = useState<{ id: string; action: ReviewAction } | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updatePost(
    post: ModerationPost,
    action: "approve" | ReviewAction,
  ) {
    const needsNote = action === "reject" || action === "changes";
    if (needsNote && !note.trim()) {
      setError(action === "reject" ? "A rejection reason is required." : "A changes comment is required.");
      return;
    }

    setBusyId(post.id);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Your admin session has expired.");
      setBusyId(null);
      return;
    }

    const status: PostStatus =
      action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested";
    const update = action === "approve"
      ? { status, approved_by: userData.user.id, approved_at: new Date().toISOString(), admin_notes: null }
      : { status, approved_by: null, approved_at: null, admin_notes: note.trim() };

    const { error: updateError } = await supabase.from("posts").update(update).eq("id", post.id);
    if (updateError) {
      setError("The moderation decision could not be saved.");
      setBusyId(null);
      return;
    }

    if (action === "changes") {
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, status: "changes_requested" } : item));
    } else {
      setPosts((current) => current.filter((item) => item.id !== post.id));
    }
    setActive(null);
    setNote("");
    setBusyId(null);
    router.refresh();
  }

  if (!posts.length) {
    return <div className="quiet-state"><Check size={28} /><h2>The queue is clear</h2><p>New organization submissions will appear here.</p></div>;
  }

  return (
    <div className="moderation-list">
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {posts.map((post) => (
        <article className="moderation-row" key={post.id}>
          <div className="moderation-row-meta"><span className={`status-label status-${post.status}`}>{post.status === "changes_requested" ? "Changes requested" : "Pending"}</span><span>{post.organizationName}</span><time>{new Date(post.createdAt).toLocaleDateString("en-IN")}</time></div>
          <Link href={`/posts/${post.id}`}><h2>{post.title}</h2></Link>
          <p>{post.problem}</p>
          <div className="moderation-takeaway"><strong>Key takeaway</strong><span>{post.keyTakeaway}</span></div>
          <div className="moderation-actions">
            <Button type="button" onClick={() => updatePost(post, "approve")} disabled={busyId === post.id}><Check size={15} /> Approve</Button>
            <Button type="button" variant="secondary" onClick={() => { setActive({ id: post.id, action: "changes" }); setNote(""); setError(null); }}><RotateCcw size={15} /> Request changes</Button>
            <Button type="button" variant="ghost" onClick={() => { setActive({ id: post.id, action: "reject" }); setNote(""); setError(null); }}><X size={15} /> Reject</Button>
          </div>
          {active?.id === post.id ? <div className="moderation-note"><label>{active.action === "reject" ? "Rejection reason" : "Changes required"}<textarea className="form-textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} autoFocus /></label><div><Button type="button" variant="secondary" onClick={() => setActive(null)}>Cancel</Button><Button type="button" onClick={() => updatePost(post, active.action)} disabled={busyId === post.id}>{busyId === post.id ? "Saving…" : "Confirm decision"}</Button></div></div> : null}
        </article>
      ))}
    </div>
  );
}
