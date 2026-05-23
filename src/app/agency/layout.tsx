import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { MembershipWithTenant } from "@/types/database";

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("tenant_memberships")
    .select("*, tenant:tenants(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberships) redirect("/unauthorized");

  const activeMemberships = memberships as MembershipWithTenant[];
  const hasAgencyRole = activeMemberships.some((m) => isAgencyRole(m.role));
  if (!hasAgencyRole) redirect("/unauthorized");

  // Resolve active tenant from metadata, falling back to the agency tenant
  const metaTenantId = user.user_metadata?.active_tenant_id as string | undefined;
  const agencyMembership = activeMemberships.find((m) => m.tenant.type === "agency");
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : agencyMembership?.tenant_id ?? activeMemberships[0].tenant_id;

  const activeMembership = activeMemberships.find(
    (m) => m.tenant_id === activeTenantId
  )!;

  const isViewingClient = activeMembership.tenant.type === "client";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#2B307E" }}>
      {/* ── Top navigation ── */}
      <header
        className="border-b border-white/10"
        style={{ backgroundColor: "#2B307E" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          {/* Logo + wordmark */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src="/logo-mark.svg" alt="Bloom" className="h-6 w-auto" />
            <span className="text-xs text-white/40 font-medium hidden sm:block tracking-wider uppercase">
              Agency
            </span>
          </div>

          {/* Primary nav links */}
          <nav className="hidden md:flex items-center gap-1 text-sm ml-2">
            <NavLink href="/agency">Dashboard</NavLink>
            <NavLink href="/agency/clients">Clients</NavLink>
          </nav>

          {/* Tenant switcher — pushes to centre */}
          <div className="flex-1 flex justify-center text-white">
            <TenantSwitcher
              memberships={activeMemberships}
              activeTenantId={activeTenantId}
            />
          </div>

          {/* User + sign out */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-sm text-white/60 hidden sm:block truncate max-w-[160px]">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* ── Mode banner — shown when viewing a client workspace ── */}
      {isViewingClient && (
        <div
          className="text-center py-2 text-sm font-medium"
          style={{ backgroundColor: "#FF6A42" }}
        >
          <span className="text-white">
            Viewing Client Workspace:{" "}
            <strong>{activeMembership.tenant.name}</strong>
            {"  ·  "}
            <Link
              href="/workspace"
              className="underline underline-offset-2 opacity-90 hover:opacity-100"
            >
              Go to workspace ↗
            </Link>
          </span>
        </div>
      )}

      {/* ── Page content ── */}
      {children}
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors font-medium"
    >
      {children}
    </Link>
  );
}
