import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { TenantStatusBadge } from "@/components/status-badge";
import { ModeBadge } from "@/components/mode-badge";
import type { MembershipWithTenant } from "@/types/database";

export default async function AgencyDashboard() {
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

  const metaTenantId = user.user_metadata?.active_tenant_id as string | undefined;
  const agencyMembership = activeMemberships.find((m) => m.tenant.type === "agency");
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : agencyMembership?.tenant_id ?? activeMemberships[0].tenant_id;

  const activeMembership = activeMemberships.find(
    (m) => m.tenant_id === activeTenantId
  ) ?? activeMemberships[0];

  const clientMemberships = activeMemberships.filter(
    (m) => m.tenant?.type === "client"
  );

  const isViewingClient = activeMembership?.tenant?.type === "client";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Agency Dashboard</h1>
            <ModeBadge
              mode={isViewingClient ? "client" : "agency"}
              clientName={isViewingClient ? activeMembership.tenant.name : undefined}
            />
          </div>
          <p className="text-white/60 text-sm">
            Welcome,{" "}
            <span className="text-white">
              {user.user_metadata?.full_name ?? user.email}
            </span>
            {" · "}
            <span className="capitalize">
              {activeMembership.role.replace(/_/g, " ")}
            </span>
          </p>
        </div>
        <Link
          href="/agency/clients/new"
          className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80"
          style={{ backgroundColor: "#FF6A42" }}
        >
          + New Client
        </Link>
      </div>

      {/* Bloom agency context card */}
      {agencyMembership && (
        <div className="bg-white/10 rounded-2xl p-5 border border-white/10 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#FF6A42" }} />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              Your Agency
            </span>
          </div>
          <p className="text-lg font-semibold text-white">
            {agencyMembership.tenant.name}
          </p>
          <p className="text-sm text-white/50 mt-0.5">
            {clientMemberships.length} client tenant
            {clientMemberships.length !== 1 ? "s" : ""} assigned to you
          </p>
        </div>
      )}

      {/* Client tenants grid */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Your Client Tenants</h2>
          <Link
            href="/agency/clients"
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            View all →
          </Link>
        </div>

        {clientMemberships.length === 0 ? (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10 text-center">
            <p className="text-white/50 text-sm">No client tenants assigned yet.</p>
            <Link
              href="/agency/clients/new"
              className="inline-block mt-3 text-sm font-medium underline text-white/60 hover:text-white"
            >
              Create your first client tenant
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientMemberships.map((m) => (
              <Link
                key={m.tenant_id}
                href={`/agency/clients/${m.tenant_id}`}
                className="bg-white/5 hover:bg-white/10 rounded-2xl p-5 border border-white/10 transition-colors block group"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#03CEA4" }} />
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                      Client
                    </span>
                  </div>
                  <TenantStatusBadge status={m.tenant.status} />
                </div>
                <p className="text-base font-semibold text-white group-hover:text-white/90 truncate">
                  {m.tenant.name}
                </p>
                <p className="text-xs text-white/40 mt-0.5 truncate">
                  {m.tenant.slug}
                </p>
                <p className="text-xs text-white/50 mt-2 capitalize">
                  Your role: {m.role.replace(/_/g, " ")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Phase 1 status card */}
      <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
        <h2 className="text-sm font-semibold text-white mb-1">
          Phase 1 — Workspace Management
        </h2>
        <p className="text-sm text-white/40">
          Create and manage client tenants, assign team members, and switch
          between workspace contexts. SR&amp;ED engagements, documents, and
          workflows will be built in Phase 2.
        </p>
      </div>
    </main>
  );
}
