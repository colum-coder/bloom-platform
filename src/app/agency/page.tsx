import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { TenantStatusBadge, RoleBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
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
  const agencyMembership = activeMemberships.find((m) => m.tenant?.type === "agency");
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : agencyMembership?.tenant_id ?? activeMemberships[0].tenant_id;

  const activeMembership =
    activeMemberships.find((m) => m.tenant_id === activeTenantId) ??
    activeMemberships[0];

  const clientMemberships = activeMemberships.filter(
    (m) => m.tenant?.type === "client"
  );

  const activeClientCount = clientMemberships.filter(
    (m) => m.tenant?.status === "active"
  ).length;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-6xl mx-auto">
      {/* Page header */}
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user.user_metadata?.full_name ?? user.email}`}
        actions={
          <Link
            href="/agency/clients/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-bloom-orange hover:opacity-90 transition-opacity"
          >
            <span aria-hidden="true">+</span> New Client
          </Link>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Your clients"
          value={clientMemberships.length}
          sub="assigned to you"
          accent="#03CEA4"
        />
        <StatCard
          label="Active"
          value={activeClientCount}
          sub="client tenants"
          accent="#10b981"
        />
        <StatCard
          label="Your role"
          value={activeMembership?.role.replace(/_/g, " ") ?? "—"}
          sub={agencyMembership?.tenant?.name ?? "Bloom Agency"}
        />
      </div>

      {/* Client tenants section */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Your Client Tenants</h2>
        {clientMemberships.length > 0 && (
          <Link
            href="/agency/clients"
            className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            View all →
          </Link>
        )}
      </div>

      {clientMemberships.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <EmptyState
            title="No client tenants yet"
            description="Create your first client tenant to start managing SR&ED engagements."
            action={
              <Link
                href="/agency/clients/new"
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-bloom-orange hover:opacity-90 transition-opacity"
              >
                Create first client
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientMemberships.slice(0, 6).map((m) => (
            <Link
              key={m.tenant_id}
              href={`/agency/clients/${m.tenant_id}`}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all block group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <TenantStatusBadge status={m.tenant.status} />
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                  style={{ backgroundColor: "#03CEA4" }}
                />
              </div>
              <p className="font-semibold text-gray-900 group-hover:text-gray-700 truncate mb-0.5">
                {m.tenant.name}
              </p>
              <p className="text-xs text-gray-400 truncate font-mono mb-3">
                {m.tenant.slug}
              </p>
              <RoleBadge role={m.role} />
            </Link>
          ))}
        </div>
      )}

      {/* Phase status */}
      <div className="mt-8 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-gray-900">Phase 1 — Workspace Management</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
            Current
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Client tenant management, member assignment, and workspace context switching.
          SR&amp;ED engagements, documents, and workflows will be available in Phase 2.
        </p>
      </div>
    </div>
  );
}
