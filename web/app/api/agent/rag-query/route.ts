import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AgentRequestError,
  AgentUnavailableError,
  streamAgent,
} from "@/lib/agent/agentClient";
import { canViewPost, getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({
  post_id: z.string().uuid(),
  question: z.string().trim().min(3).max(2000),
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
    return NextResponse.json({ error: "Ask a question about this insight." }, { status: 422 });
  }

  // First check: does RLS return this post for THIS user? If not, stop here —
  // before spending any tokens, and without revealing whether the post exists.
  if (!(await canViewPost(parsed.data.post_id))) {
    return NextResponse.json({ error: "That insight is not available." }, { status: 404 });
  }

  try {
    // Second check happens inside the agent service, which re-derives
    // visibility from the database itself rather than trusting this hop.
    const stream = await streamAgent("/rag-query", {
      post_id: parsed.data.post_id,
      question: parsed.data.question,
      requester_id: viewer.userId,
    });

    // Piped straight through, never buffered — that is what makes tokens
    // appear incrementally in the browser.
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      return NextResponse.json(
        { error: "The AI service is not configured." },
        { status: 503 },
      );
    }
    if (error instanceof AgentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("RAG query failed:", error);
    return NextResponse.json({ error: "The assistant is unavailable." }, { status: 502 });
  }
}
