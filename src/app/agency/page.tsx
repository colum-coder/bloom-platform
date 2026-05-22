import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { MembershipWithTenant } from "@/types/database";

export default async function AgencyDashboard() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load all active memberships with their tenant data
  const { data: memberships, error } = await supabase
    .from("tenant_memberships")
    .select("*, tenant:tenants(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberships) redirect("/unauthorized");

  const activeMemberships = memberships as MembershipWithTenant[];

  // Ensure at least one agency-role membership
  const hasAgencyRole = activeMemberships.some((m) => isAgencyRole(m.role));
  if (!hasAgencyRole) redirect("/unauthorized");

  // Determine active tenant: prefer user metadata, fall back to first agency tenant
  const metaTenantId = user.user_metadata?.active_tenant_id as string | undefined;
  const agencyMembership = activeMemberships.find(
    (m) => m.tenant.type === "agency"
  );
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : agencyMembership?.tenant_id ?? activeMemberships[0].tenant_id;

  const activeMembership = activeMemberships.find(
    (m) => m.tenant_id === activeTenantId
  )!;

  // Load the tenants the agency user manages (client tenants with active membership)
  const clientMemberships = activeMemberships.filter(
    (m) => m.tenant.type === "client"
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#2B307E" }}>
      {/* Top nav */}
      <header
        className="border-b border-white/10"
        style={{ backgroundColor: "#2B307E" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src="/logo-mark.svg" alt="Bloom" className="h-6 w-auto" />
            <span className="text-xs text-white/40 font-medium hidden sm:block tracking-wider uppercase">
              Agency
            </span>
          </div>

          {/* Tenant switcher — centre */}
          <div className="text-white flex-1 flex justify-center">
            <TenantSwitcher
              memberships={activeMemberships}
              activeTenantId={activeTenantId}
            />
          </div>

          {/* User info + sign out */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-sm text-white/60 hidden sm:block truncate max-w-[160px]">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Active tenant context banner */}
      {activeMembership.tenant.type !== "agency" && (
        <div
          className="text-center py-2 text-sm font-medium"
          style={{ backgroundColor: "#FF6A42" }}
        >
          <span className="text-white">
            Viewing client workspace:{" "}
            <strong>{activeMembership.tenant.name}</strong>
          </span>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Agency Dashboard</h1>
          <p className="text-white/60 mt-1 text-sm">
            Welcome back,{" "}
            <span className="text-white">{user.user_metadata?.full_name ?? user.email}</span>
            {" "}· {activeMembership.role.replace(/_/g, " ")}
          </p>
        </div>

        {/* Tenant overview grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {/* Bloom agency card */}
          <div className="bg-white/10 rounded-2xl p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#FF6A42" }} />
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                Agency
              </span>
            </div>
            <p className="text-lg font-semibold text-white">
              {agencyMembership?.tenant.name ?? "Bloom Funding"}
            </p>
            <p className="text-sm text-white/50 mt-0.5">
              {activeMemberships.filter((m) => m.tenant.type === "client").length} client
              {clientMemberships.length !== 1 ? "s" : ""} assigned
            </p>
          </div>

          {/* Client tenant cards */}
          {clientMemberships.map((m) => (
            <div
              key={m.tenant_id}
              className="bg-white/5 hover:bg-white/10 rounded-2xl p-5 border border-white/10 transition-colors cursor-default"
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#03CEA4" }}
                />
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                  Client
                </span>
              </div>
              <p className="text-lg font-semibold text-white">{m.tenant.name}</p>
              <p className="text-sm text-white/50 mt-0.5">
                Your role: {m.role.replace(/_/g, " ")}
              </p>
            </div>
          ))}
        </div>

        {/* Phase 0 status card */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <h2 className="text-base font-semibold text-white mb-1">
            Phase 0 — Foundation complete
          </h2>
          <p className="text-sm text-white/50">
            Multi-tenant auth, RLS-enforced tenant isolation, and role-based
            routing are verified. SR&amp;ED engagements, documents, and
            workflows will be built in Phase 1.
          </p>
        </div>
      </main>
    </div>
  );
}
