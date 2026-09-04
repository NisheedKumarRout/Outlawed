import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mode: z.enum(["reader", "organization", "admin", "member"]).default("reader"),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address and password." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user || !data.session) {
    console.error(
      "Supabase password sign-in failed:",
      error?.message ?? "No user session was returned.",
    );
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const mode = parsed.data.mode === "member" ? "reader" : parsed.data.mode;
  if (mode === "admin" && profile?.role !== "admin") {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "This account does not have OutLawed administrator access." },
      { status: 403 },
    );
  }

  if (mode === "organization") {
    const { data: organization } = await supabase
      .from("organizations")
      .select("verified")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profile?.role !== "org" || !organization?.verified) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "This organization has not been verified for publishing access." },
        { status: 403 },
      );
    }
  }

  if (mode === "reader" && profile?.role !== "individual") {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error:
          profile?.role === "org"
            ? "Use the organization sign-in page for this account."
            : "Use the correct portal for this account.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
