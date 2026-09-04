import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AgentRequestError,
  AgentUnavailableError,
  callAgent,
} from "@/lib/agent/agentClient";
import { canViewPost, getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({
  post_id: z.string().uuid(),
  requester_context: z.string().trim().min(10).max(4000),
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
      { error: "Describe your own situation so it can be compared." },
      { status: 422 },
    );
  }

  if (!(await canViewPost(parsed.data.post_id))) {
    return NextResponse.json({ error: "That insight is not available." }, { status: 404 });
  }

  try {
    const result = await callAgent<Record<string, unknown>>("/applicability", {
      body: { ...parsed.data, requester_id: viewer.userId },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      return NextResponse.json({ error: "The AI service is not configured." }, { status: 503 });
    }
    if (error instanceof AgentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Applicability failed:", error);
    return NextResponse.json({ error: "Applicability scoring is unavailable." }, { status: 502 });
  }
}
