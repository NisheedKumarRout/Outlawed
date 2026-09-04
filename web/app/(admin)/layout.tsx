import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (!hasSupabasePublicEnv()) redirect("/admin-login");

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/admin-login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/admin-login?error=unauthorized");

  return (
    <div className="app-frame">
      <AdminSidebar />
      <main className="main-canvas">{children}</main>
    </div>
  );
}
