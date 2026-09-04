import "server-only";

import { NextResponse } from "next/server";

import type { UserRole } from "@/lib/auth/roles";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  role: UserRole | null;
  isAdmin: boolean;
};

/**
 * Resolve the caller of an API route.
 *
 * Returns null when nobody is signed in. Route handlers use this before
 * forwarding anything to the agent service — that service holds an
 * RLS-bypassing key, so an unauthenticated request must never reach it.
 */
export async function getViewer(): Promise<Viewer | null> {
  if (!hasSupabasePublicEnv()) return null;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? null;
  return { userId, role, isAdmin: role === "admin" };
}

export function unauthorized() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export function forbidden(message = "You do not have access to this action.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notConfigured() {
  return NextResponse.json(
    { error: "Supabase is not configured for the web app." },
    { status: 503 },
  );
}

/**
 * Confirm the caller can actually see this post, using their OWN session.
 *
 * This is the cheap half of the two-layer check the RAG route relies on: RLS
 * decides here, and the agent service re-derives the same decision itself. If
 * RLS returns nothing, the caller cannot see the post and the request stops
 * before any Claude tokens are spent.
 */
export async function canViewPost(postId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("posts").select("id").eq("id", postId).maybeSingle();
  return Boolean(data);
}
