import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidden, getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

const createSchema = z.object({
  post_id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
  parent_comment_id: z.string().uuid().nullable().optional(),
  is_anonymous: z.boolean().default(false),
});

export async function POST(request: Request) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (viewer.role !== "org" && viewer.role !== "reviewer") {
    return forbidden("Only verified organizations can join insight discussions.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Write a comment first." }, { status: 422 });
  }

  const supabase = await createClient();

  // A reply must belong to the same post as its parent. Without this a crafted
  // request could graft a reply from one discussion onto another.
  if (parsed.data.parent_comment_id) {
    const { data: parent } = await supabase
      .from("comments")
      .select("post_id")
      .eq("id", parsed.data.parent_comment_id)
      .maybeSingle();

    if (!parent || parent.post_id !== parsed.data.post_id) {
      return NextResponse.json({ error: "That reply target is not valid." }, { status: 422 });
    }
  }

  // The comments_insert RLS policy also verifies the post is visible to this
  // user, so a comment on an unpublished insight is rejected by the database.
  const primaryInsert = await supabase
    .from("comments")
    .insert({
      post_id: parsed.data.post_id,
      parent_comment_id: parsed.data.parent_comment_id ?? null,
      author_id: viewer.userId,
      is_anonymous: parsed.data.is_anonymous,
      body: parsed.data.body,
    })
    .select("id, post_id, parent_comment_id, body, created_at, is_anonymous")
    .single();

  let comment = primaryInsert.data;
  let error = primaryInsert.error;

  // Keep ordinary commenting available while the additive privacy migration
  // is pending. Anonymous mode never falls back, because that would expose
  // someone who explicitly asked to hide their public identity.
  if (error?.message.includes("is_anonymous") && !parsed.data.is_anonymous) {
    const legacyInsert = await supabase
      .from("comments")
      .insert({
        post_id: parsed.data.post_id,
        parent_comment_id: parsed.data.parent_comment_id ?? null,
        author_id: viewer.userId,
        body: parsed.data.body,
      })
      .select("id, post_id, parent_comment_id, body, created_at")
      .single();
    comment = legacyInsert.data
      ? { ...legacyInsert.data, is_anonymous: false }
      : null;
    error = legacyInsert.error;
  }

  if (error || !comment) {
    console.error("Comment insert failed:", error?.message);
    if (error?.message.includes("is_anonymous")) {
      return NextResponse.json(
        { error: "The anonymous-participation database update has not been applied yet." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "The comment could not be posted." }, { status: 400 });
  }

  return NextResponse.json(comment, { status: 201 });
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (viewer.role !== "org" && viewer.role !== "reviewer" && viewer.role !== "admin") {
    return forbidden("Only verified organizations can manage insight discussions.");
  }

  const parsed = deleteSchema.safeParse({
    id: new URL(request.url).searchParams.get("id"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "A comment id is required." }, { status: 422 });
  }

  const supabase = await createClient();

  // Soft delete: replies hang off this row, and a hard delete would cascade
  // them away along with any discussion that followed.
  const { error } = await supabase
    .from("comments")
    .update({ is_deleted: true, body: "[deleted]" })
    .eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json({ error: "The comment could not be removed." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
