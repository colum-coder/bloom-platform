import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { TenantStatusBadge, MembershipStatusBadge, RoleBadge } from "@/components/status-badge";
import { AddMemberForm } from "./add-member-form";
import type { MembershipWithProfile, Tenant } from "@/types/database";

interface Props {
  params: { tenantId: string };
}

export default async function ClientTenantDetailPage({ params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Confirm the current user has an agency role
  const { data: myMemberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const myRoles = (myMemberships ?? []) as unknown as Array<{ role: string }>;
  if (!myRoles.some((m) => isAgencyRole(m.role as never)))
    redirect("/unauthorized");

  // Load the target tenant (RLS: is_active_member)
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", params.tenantId)
    .eq("type", "client")
    .single();

  if (tenantError || !tenant) notFound();

  const tenantRow = tenant as Tenant;

  // Load members of this tenant with their profile names
  // The new "memberships: agency staff can view all in their client tenants"
  // policy (003_phase1.sql) allows this query.
  const { data: members } = await supabase
    .from("tenant_memberships")
    .select("*, profile:profiles(full_name)")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: true });

  const memberList = (members ?? []) as unknown as MembershipWithProfile[];

  // Does the current user have an active membership in this tenant?
  // If so, show the "Switch to this workspace" button.
  const myMembershipHere = memberList.find((m) => m.user_id === user.id && m.status === "active");

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-white/40 mb-6">
        <Link href="/agency/clients" className="hover:text-white transition-colors">
          Client Tenants
        </Link>
        <span>/</span>
        <span className="text-white/70 truncate">{tenantRow.name}</span>
      </div>

      {/* Tenant header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{tenantRow.name}</h1>
          <p className="text-white/50 text-sm font-mono mt-0.5">{tenantRow.slug}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <TenantStatusBadge status={tenantRow.status} />
          {myMembershipHere && (
            <Link
              href="/workspace"
              onClick={async () => {
                // Switching is handled by TenantSwitcher metadata write.
                // This direct link just navigates to workspace — middleware
                // will use the active_tenant_id from user_metadata.
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: "#03CEA4" }}
            >
              Switch to Workspace ↗
            </Link>
          )}
        </div>
      </div>

      {/* Tenant details */}
      <div className="bg-white/5 rounded-2xl border border-white/10 p-6 mb-6">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">
          Tenant Details
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-white/40 text-xs mb-0.5">Name</p>
            <p className="text-white font-medium">{tenantRow.name}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs mb-0.5">Slug</p>
            <p className="text-white font-mono">{tenantRow.slug}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs mb-0.5">Type</p>
            <p className="text-white capitalize">{tenantRow.type}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs mb-0.5">Created</p>
            <p className="text-white">
              {new Date(tenantRow.created_at).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Members list */}
      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden mb-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">
            Members{" "}
            <span className="text-white/40 font-normal ml-1">
              ({memberList.length})
            </span>
          </h2>
        </div>

        {memberList.length === 0 ? (
          <p className="px-6 py-8 text-sm text-white/40 text-center">
            No members yet. Use the form below to add someone.
          </p>
        ) : (
          <div className="divide-y divide-white/10">
            {memberList.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-4 px-6 py-3"
              >
                {/* Avatar initial */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: member.role.startsWith("agency") ? "#2B307E" : "#03CEA420", color: member.role.startsWith("agency") ? "white" : "#03CEA4" }}
                >
                  {(member.profile?.full_name ?? "?")[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {member.profile?.full_name ?? "Unknown user"}
                    {member.user_id === user.id && (
                      <span className="ml-2 text-xs text-white/40">(you)</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <RoleBadge role={member.role} />
                  <MembershipStatusBadge status={member.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add member form */}
      <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
        <h2 className="text-sm font-semibold text-white mb-4">
          Add or Assign a User
        </h2>
        <AddMemberForm tenantId={params.tenantId} />
      </div>
    </main>
  );
}
