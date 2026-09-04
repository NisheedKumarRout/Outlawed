import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AgentRequestError,
  AgentUnavailableError,
  callAgent,
} from "@/lib/agent/agentClient";
import { getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({
  query: z.string().trim().min(10).max(4000),
  match_count: z.coerce.number().int().min(1).max(10).default(5),
  filter_sector: z.string().trim().min(1).max(120).optional(),
  exclude_post_id: z.string().uuid().optional(),
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
      { error: "Describe your situation in a sentence or two." },
      { status: 422 },
    );
  }

  try {
    const result = await callAgent<Record<string, unknown>>("/similar-cases", {
      body: parsed.data,
    });

    // Log the query so the admin knowledge-gap view reflects what people are
    // actually looking for, not just what has been published. Never blocking.
    const supabase = await createClient();
    void supabase
      .from("search_logs")
      .insert({
        user_id: viewer.userId,
        query: parsed.data.query,
        filters: { source: "similar-cases", sector: parsed.data.filter_sector ?? null },
      })
      .then(({ error }) => {
        if (error) console.error("Search log failed:", error.message);
      });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      return NextResponse.json({ error: "The AI service is not configured." }, { status: 503 });
    }
    if (error instanceof AgentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Similar cases failed:", error);
    return NextResponse.json({ error: "Similar cases is unavailable." }, { status: 502 });
  }
}
