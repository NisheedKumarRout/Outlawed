import { NextResponse } from "next/server";
import { z } from "zod";

import { getViewer, notConfigured } from "@/lib/auth/session";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({
  q: z.string().trim().max(300).optional(),
  sector: z.string().trim().max(120).optional(),
  target_group: z.string().trim().max(120).optional(),
  geography: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const url = new URL(request.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search parameters." }, { status: 422 });
  }

  const { q, sector, target_group: targetGroup, geography, tag, limit } = parsed.data;
  const supabase = await createClient();

  let query = supabase
    .from("posts")
    .select(
      "id,title,problem,key_takeaway,tldr,sector,target_group,geography,tags,created_at," +
        "organization:organizations(id,org_name,verified)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    // Escape PostgREST's `or` delimiters so a comma or parenthesis in the
    // query cannot break out of this filter into extra conditions.
    const safe = q.replace(/[,()]/g, " ").trim();
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,problem.ilike.%${safe}%,key_takeaway.ilike.%${safe}%,context.ilike.%${safe}%`,
      );
    }
  }

  if (sector) query = query.contains("sector", [sector]);
  if (targetGroup) query = query.contains("target_group", [targetGroup]);
  if (tag) query = query.contains("tags", [tag]);
  if (geography) query = query.ilike("geography", `%${geography}%`);

  // No status filter here either — RLS returns only what this viewer may see.
  const { data, error } = await query;

  if (error) {
    console.error("Search failed:", error.message);
    return NextResponse.json({ error: "Search is unavailable." }, { status: 400 });
  }

  const viewer = await getViewer();
  if (q && viewer) {
    void supabase
      .from("search_logs")
      .insert({
        user_id: viewer.userId,
        query: q,
        filters: { sector, target_group: targetGroup, geography, tag },
      })
      .then(({ error: logError }) => {
        if (logError) console.error("Search log failed:", logError.message);
      });
  }

  return NextResponse.json({ results: data ?? [], count: data?.length ?? 0 });
}
