import type { UserRole } from "@/lib/auth/roles";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export async function getCurrentRole(): Promise<UserRole | null> {
  if (!hasSupabasePublicEnv()) return null;

  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) return null;

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    return (data?.role as UserRole | undefined) ?? null;
  } catch {
    return null;
  }
}
