import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidden, getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({
  value: z.enum(["useful", "somewhat_useful", "not_useful"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (viewer.role !== "org" && viewer.role !== "reviewer") {
    return forbidden("Feedback is limited to verified organizations.");
  }

  const { id } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a feedback value." }, { status: 422 });
  }

  const supabase = await createClient();

  // Feedback is deliberately not a like button: one rating per person per
  // insight, upserted, so a niche insight cannot be buried by volume.
  const { error } = await supabase
    .from("post_feedback")
    .upsert(
      { post_id: id, user_id: viewer.userId, value: parsed.data.value },
      { onConflict: "post_id,user_id" },
    );

  if (error) {
    console.error("Feedback upsert failed:", error.message);
    return NextResponse.json({ error: "Your feedback could not be saved." }, { status: 400 });
  }

  // Counts come from post_feedback_summary, which aggregates without exposing
  // who rated what.
  const { data: summary } = await supabase
    .from("post_feedback_summary")
    .select("useful_count, somewhat_useful_count, not_useful_count, total_count")
    .eq("post_id", id)
    .maybeSingle();

  return NextResponse.json({ ok: true, value: parsed.data.value, summary });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (viewer.role !== "org" && viewer.role !== "reviewer") {
    return forbidden("Feedback is limited to verified organizations.");
  }

  const { id } = await params;
  const supabase = await createClient();

  const { error } = await supabase
    .from("post_feedback")
    .delete()
    .eq("post_id", id)
    .eq("user_id", viewer.userId);

  if (error) {
    return NextResponse.json({ error: "Your feedback could not be removed." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
