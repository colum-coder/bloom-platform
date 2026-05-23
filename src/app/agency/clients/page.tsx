import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { TenantStatusBadge } from "@/components/status-badge";
import type { TenantWithMemberships } from "@/types/database";

export default async function ClientsListPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Confirm agency role (layout also checks, but defence-in-depth)
  const { data: myMemberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const memberships = (myMemberships ?? []) as unknown as Array<{ role: string }>;
  if (!memberships.some((m) => isAgencyRole(m.role as never)))
    redirect("/unauthorized");

  // Fetch client tenants visible to this user (RLS: is_active_member).
  // Include all memberships so we can count active ones per tenant.
  const { data: allClientTenants } = await supabase
    .from("tenants")
    .select("*, tenant_memberships(id, status)")
    .eq("type", "client")
    .order("created_at", { ascending: false });

  const clientTenants = (allClientTenants ?? []) as unknown as TenantWithMemberships[];

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Tenants</h1>
          <p className="text-white/60 text-sm mt-1">
            {clientTenants.length} client tenant
            {clientTenants.length !== 1 ? "s" : ""} visible to you
          </p>
        </div>
        <Link
          href="/agency/clients/new"
          className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-80 transition-opacity"
          style={{ backgroundColor: "#FF6A42" }}
        >
          + New Client
        </Link>
      </div>

      {clientTenants.length === 0 ? (
        <div className="bg-white/5 rounded-2xl p-10 border border-white/10 text-center">
          <p className="text-white/50 mb-4">No client tenants yet.</p>
          <Link
            href="/agency/clients/new"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-80 transition-opacity"
            style={{ backgroundColor: "#FF6A42" }}
          >
            Create First Client Tenant
          </Link>
        </div>
      ) : (
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_180px_110px_100px_80px_80px] gap-4 px-5 py-3 border-b border-white/10 text-xs font-semibold text-white/40 uppercase tracking-wider">
            <span>Tenant</span>
            <span>Slug</span>
            <span>Status</span>
            <span>Type</span>
            <span>Members</span>
            <span>Created</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/10">
            {clientTenants.map((tenant) => {
              const activeMemberCount = tenant.tenant_memberships?.filter(
                (m) => m.status === "active"
              ).length ?? 0;

              return (
                <Link
                  key={tenant.id}
                  href={`/agency/clients/${tenant.id}`}
                  className="grid md:grid-cols-[1fr_180px_110px_100px_80px_80px] gap-4 px-5 py-4 hover:bg-white/5 transition-colors items-center group"
                >
                  {/* Name */}
                  <div>
                    <p className="font-semibold text-white group-hover:text-white/90 truncate">
                      {tenant.name}
                    </p>
                    <p className="text-xs text-white/40 md:hidden mt-0.5">{tenant.slug}</p>
                  </div>

                  {/* Slug */}
                  <p className="hidden md:block text-sm text-white/50 truncate font-mono">
                    {tenant.slug}
                  </p>

                  {/* Status */}
                  <div className="hidden md:block">
                    <TenantStatusBadge status={tenant.status} />
                  </div>

                  {/* Type */}
                  <p className="hidden md:block text-sm text-white/50 capitalize">
                    {tenant.type}
                  </p>

                  {/* Member count */}
                  <p className="hidden md:block text-sm text-white/60 text-center">
                    {activeMemberCount}
                  </p>

                  {/* Created */}
                  <p className="hidden md:block text-xs text-white/40">
                    {new Date(tenant.created_at).toLocaleDateString("en-CA", {
                      year: "2-digit",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
