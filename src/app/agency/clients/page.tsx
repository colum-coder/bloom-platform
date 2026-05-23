import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { TenantStatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { TenantWithMemberships } from "@/types/database";

export default async function ClientsListPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Defence-in-depth: confirm agency role (layout also checks)
  const { data: myMemberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const memberships = (myMemberships ?? []) as unknown as Array<{ role: string }>;
  if (!memberships.some((m) => isAgencyRole(m.role as never)))
    redirect("/unauthorized");

  // Fetch all client tenants visible to this user (RLS: is_active_member).
  // Include all memberships so we can display active member counts per tenant.
  const { data: allClientTenants } = await supabase
    .from("tenants")
    .select("*, tenant_memberships(id, status)")
    .eq("type", "client")
    .order("created_at", { ascending: false });

  const clientTenants = (allClientTenants ?? []) as unknown as TenantWithMemberships[];

  return (
    <div className="px-6 sm:px-8 py-8 max-w-6xl mx-auto">
      <PageHeader
        title="Clients"
        subtitle={
          clientTenants.length > 0
            ? `${clientTenants.length} client tenant${clientTenants.length !== 1 ? "s" : ""} visible to you`
            : undefined
        }
        actions={
          <Link
            href="/agency/clients/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-bloom-orange hover:opacity-90 transition-opacity"
          >
            <span aria-hidden="true">+</span> New Client
          </Link>
        }
      />

      {clientTenants.length === 0 ? (
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_180px_120px_80px_100px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
            {["Client", "Slug", "Status", "Members", "Created"].map((h) => (
              <span
                key={h}
                className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {clientTenants.map((tenant) => {
              const activeMemberCount =
                tenant.tenant_memberships?.filter((m) => m.status === "active")
                  .length ?? 0;

              return (
                <Link
                  key={tenant.id}
                  href={`/agency/clients/${tenant.id}`}
                  className="grid md:grid-cols-[1fr_180px_120px_80px_100px] gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors items-center group"
                >
                  {/* Name */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-700 truncate">
                      {tenant.name}
                    </p>
                    <p className="text-xs text-gray-400 md:hidden mt-0.5 font-mono truncate">
                      {tenant.slug}
                    </p>
                  </div>

                  {/* Slug */}
                  <p className="hidden md:block text-sm text-gray-400 truncate font-mono">
                    {tenant.slug}
                  </p>

                  {/* Status */}
                  <div className="hidden md:flex">
                    <TenantStatusBadge status={tenant.status} />
                  </div>

                  {/* Members */}
                  <p className="hidden md:block text-sm text-gray-700 font-medium">
                    {activeMemberCount}
                  </p>

                  {/* Created */}
                  <p className="hidden md:block text-xs text-gray-400">
                    {new Date(tenant.created_at).toLocaleDateString("en-CA", {
                      year: "numeric",
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
    </div>
  );
}
