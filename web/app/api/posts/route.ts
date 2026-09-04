import { NextResponse } from "next/server";

import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";
import { postSubmissionSchema } from "@/lib/validation/post";

export async function POST(request: Request) {
  if (!hasSupabasePublicEnv()) {
    return NextResponse.json({ error: "Supabase is not configured for the web app." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  // Unknown keys—including status, approved_by, and approved_at—are stripped.
  const parsed = postSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id,verified")
    .eq("id", userId)
    .maybeSingle();

  if (!organization?.verified) {
    return NextResponse.json(
      { error: "A verified organization account is required to submit." },
      { status: 403 },
    );
  }

  const primaryInsert = await supabase
    .from("posts")
    .insert({
      ...parsed.data,
      image_url: parsed.data.image_url ?? null,
      is_anonymous: parsed.data.is_anonymous,
      org_id: userId,
      status: "pending",
    })
    .select("id,title,status")
    .single();

  let post = primaryInsert.data;
  let error = primaryInsert.error;

  if (error?.message.includes("is_anonymous") && !parsed.data.is_anonymous) {
    const { is_anonymous: ignoredAnonymousFlag, ...legacySubmission } = parsed.data;
    void ignoredAnonymousFlag;
    const legacyInsert = await supabase
      .from("posts")
      .insert({
        ...legacySubmission,
        image_url: legacySubmission.image_url ?? null,
        org_id: userId,
        status: "pending",
      })
      .select("id,title,status")
      .single();
    post = legacyInsert.data;
    error = legacyInsert.error;
  }

  if (error) {
    console.error("Post submission failed:", error.message);
    if (error.message.includes("is_anonymous")) {
      return NextResponse.json(
        { error: "The anonymous-participation database update has not been applied yet." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "The insight could not be submitted." }, { status: 400 });
  }

  return NextResponse.json(post, { status: 201 });
}
