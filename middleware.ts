import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/database";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/reset-password", "/unauthorized"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always refresh the session token first
  const { supabaseResponse, user, supabase } = await updateSession(request);

  // Allow public paths through without auth
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // Unauthenticated users go to /login.
  // IMPORTANT: copy cookies from supabaseResponse so any token refresh persists.
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value));
    return redirectResponse;
  }

  // Load active memberships (role only — no tenant JOIN to avoid RLS/Edge Runtime conflicts)
  const membershipResult = await supabase
    .from("tenant_memberships")
    .select("id, tenant_id, user_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  const activeMemberships = (membershipResult.data ?? []) as unknown as Array<{
    tenant_id: string;
    role: string;
    status: string;
  }>;

  // Helper: build a redirect that carries along any refreshed session cookies.
  function redirectWithCookies(destination: string | URL) {
    const url =
      typeof destination === "string"
        ? new URL(destination, request.url)
        : destination;
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => res.cookies.set(cookie.name, cookie.value));
    return res;
  }

  // /agency routes require an active agency-role membership
  if (pathname.startsWith("/agency")) {
    const hasAgencyAccess = activeMemberships.some((m) =>
      isAgencyRole(m.role as UserRole)
    );
    if (!hasAgencyAccess) {
      return redirectWithCookies("/unauthorized");
    }
  }

  // /workspace routes require any active membership (client or agency in client-mode)
  if (pathname.startsWith("/workspace")) {
    if (activeMemberships.length === 0) {
      return redirectWithCookies("/unauthorized");
    }
  }

  // Root redirect: send logged-in users to their default landing page
  if (pathname === "/") {
    const hasAgency = activeMemberships.some((m) => isAgencyRole(m.role as UserRole));
    return redirectWithCookies(hasAgency ? "/agency" : "/workspace");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
