import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database.types";

const MAIN_ROUTES = [
  "/feed",
  "/search",
  "/org-application",
  "/posts",
  "/submissions",
  "/compare",
  "/organizations",
  "/pinned",
  "/profile",
];

const ADMIN_ROUTES = [
  "/dashboard",
  "/library",
  "/moderation",
  "/ingestion-queue",
  "/verifications",
  "/reports",
  "/knowledge-gaps",
];

const ORGANIZATION_ROUTES = ["/posts/new", "/submissions", "/pinned"];
function matches(pathname: string, roots: string[]) {
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const portalMode = process.env.PORTAL_MODE === "admin" ? "admin" : "public";
  const isApiRoute = pathname.startsWith("/api/");

  function destination(configured: string | undefined, localPort: string, path: string) {
    const target = configured ? new URL(configured) : request.nextUrl.clone();
    if (!configured && ["localhost", "127.0.0.1"].includes(target.hostname)) {
      target.port = localPort;
    }
    target.pathname = path;
    target.search = request.nextUrl.search;
    return target;
  }

  // The same reviewed codebase is deployed twice. The public deployment never
  // serves operator routes; the admin deployment never becomes a second public
  // feed. Both continue to share the same Supabase project and policies.
  if (!isApiRoute && portalMode === "public" && (matches(pathname, ADMIN_ROUTES) || pathname === "/admin-login")) {
    return NextResponse.redirect(
      destination(process.env.ADMIN_PORTAL_URL, "3001", pathname),
    );
  }

  if (!isApiRoute && portalMode === "admin") {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    const allowedAdminPage =
      pathname === "/admin-login" ||
      matches(pathname, ADMIN_ROUTES) ||
      pathname.startsWith("/posts/");
    if (!allowedAdminPage) {
      return NextResponse.redirect(
        destination(process.env.PUBLIC_APP_URL, "3000", pathname),
      );
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Keep local UI development usable until the public browser key is added.
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const isOrganizationRoute = matches(pathname, ORGANIZATION_ROUTES);

  if (!userId && (matches(pathname, MAIN_ROUTES) || matches(pathname, ADMIN_ROUTES))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = matches(pathname, ADMIN_ROUTES)
      ? "/admin-login"
      : isOrganizationRoute
        ? "/organization-login"
        : "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (userId && ["/login", "/signup"].includes(pathname)) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  if (userId && (matches(pathname, ADMIN_ROUTES) || isOrganizationRoute)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (matches(pathname, ADMIN_ROUTES) && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/admin-login", request.url));
    }
    if (isOrganizationRoute && profile?.role !== "org") {
      const organizationLogin = new URL("/organization-login", request.url);
      organizationLogin.searchParams.set("error", "organization_access_required");
      return NextResponse.redirect(organizationLogin);
    }
  }

  return response;
}
