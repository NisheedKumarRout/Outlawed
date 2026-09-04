import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AgentRequestError,
  AgentUnavailableError,
  callAgent,
} from "@/lib/agent/agentClient";
import { canViewPost, getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({ post_id: z.string().uuid() });

export async function POST(request: Request) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid OTR insight is required." }, { status: 422 });
  }

  if (!(await canViewPost(parsed.data.post_id))) {
    return NextResponse.json({ error: "That insight is not available." }, { status: 404 });
  }

  try {
    const result = await callAgent<Record<string, unknown>>("/translate", {
      body: {
        post_id: parsed.data.post_id,
        requester_id: viewer.userId,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      return NextResponse.json({ error: "The translation service is not configured." }, { status: 503 });
    }
    if (error instanceof AgentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Kannada translation failed:", error);
    return NextResponse.json({ error: "Kannada translation is unavailable." }, { status: 502 });
  }
}
