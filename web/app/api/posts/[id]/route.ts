import { NextResponse } from "next/server";

import { getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";
import { postSubmissionSchema } from "@/lib/validation/post";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const { id } = await params;
  const supabase = await createClient();

  // No status filter: RLS decides what this viewer may see, and a hidden post
  // is indistinguishable from one that does not exist.
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id,title,problem,context,approach,evidence_outcome,what_worked,what_failed," +
        "why_worked_or_failed,conditions,cautions,would_do_differently,key_takeaway," +
        "sector,target_group,geography,tags,tldr,status,visibility,created_at," +
        "organization:organizations(id,org_name,verified)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "That insight is not available." }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  const { id } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  // Unknown keys — status, approved_by, approved_at — are stripped, so an org
  // cannot self-publish by adding fields to the request.
  const parsed = postSubmissionSchema.partial().safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("posts")
    .select("id,org_id,status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "That insight is not available." }, { status: 404 });
  }

  // Snapshot before writing, so the revision trail records what was replaced
  // rather than what replaced it.
  const { data: snapshot } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();

  const { data: updated, error } = await supabase
    .from("posts")
    .update(parsed.data)
    .eq("id", id)
    .select("id,title,status")
    .single();

  if (error || !updated) {
    console.error("Post update failed:", error?.message);
    return NextResponse.json({ error: "The insight could not be updated." }, { status: 400 });
  }

  if (snapshot) {
    const { error: revisionError } = await supabase
      .from("post_revisions")
      .insert({ post_id: id, editor_id: viewer.userId, snapshot });
    if (revisionError) console.error("Revision log failed:", revisionError.message);
  }

  // An edit to an approved post is demoted to 'pending' by the
  // reset_status_on_org_edit trigger, so published content never changes
  // silently — it goes back through moderation.
  return NextResponse.json({
    ...updated,
    returned_to_moderation: existing.status === "approved" && updated.status === "pending",
  });
}
