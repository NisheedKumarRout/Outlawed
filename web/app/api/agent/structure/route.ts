import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AgentRequestError,
  AgentUnavailableError,
  callAgent,
} from "@/lib/agent/agentClient";
import { forbidden, getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({
  raw_text: z.string().trim().min(40).max(200_000),
  source_hint: z.enum(["session_notes", "transcript", "slide_deck", "other"]).optional(),
});

export async function POST(request: Request) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paste at least a paragraph of source material." },
      { status: 422 },
    );
  }

  // Structuring is a metered Claude call, so it is gated to the accounts that
  // can actually submit an insight: verified orgs and admins.
  const supabase = await createClient();
  const { data: organization } = await supabase
    .from("organizations")
    .select("org_name,verified")
    .eq("id", viewer.userId)
    .maybeSingle();

  if (!viewer.isAdmin && !organization?.verified) {
    return forbidden("A verified organization account is required to use AI structuring.");
  }

  try {
    const result = await callAgent<{ insight: Record<string, unknown> }>("/structure", {
      body: {
        raw_text: parsed.data.raw_text,
        organization_name: organization?.org_name ?? null,
        source_hint: parsed.data.source_hint ?? null,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      return NextResponse.json({ error: "The AI service is not configured." }, { status: 503 });
    }
    if (error instanceof AgentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Structuring failed:", error);
    return NextResponse.json({ error: "Structuring is unavailable." }, { status: 502 });
  }
}
