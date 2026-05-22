import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getDefaultRedirect, isAgencyRole } from "@/lib/auth/permissions";
import type { MembershipWithTenant } from "@/types/database";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/unauthorized"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always refresh the session token first
  const { supabaseResponse, user, supabase } = await updateSession(request);

  // Allow public paths through without auth
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // Unauthenticated users go to /login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Load active memberships (needed for role-based routing)
  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("*, tenant:tenants(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const activeMemberships = (memberships ?? []) as MembershipWithTenant[];

  // /agency routes require an active agency-role membership
  if (pathname.startsWith("/agency")) {
    const hasAgencyAccess = activeMemberships.some((m) =>
      isAgencyRole(m.role)
    );
    if (!hasAgencyAccess) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  // /workspace routes require any active membership (client or agency in client-mode)
  if (pathname.startsWith("/workspace")) {
    if (activeMemberships.length === 0) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  // Root redirect: send logged-in users to their default landing page
  if (pathname === "/") {
    const redirect = getDefaultRedirect(activeMemberships);
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
