import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import {
  TenantStatusBadge,
  MembershipStatusBadge,
  RoleBadge,
} from "@/components/status-badge";
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

  // Confirm agency role (layout also checks — defence in depth)
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

  // Load memberships — separate query avoids indirect FK join issue
  const { data: members } = await supabase
    .from("tenant_memberships")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: true });

  const rawMembers = (members ?? []) as unknown as Array<{
    id: string;
    tenant_id: string;
    user_id: string;
    role: string;
    status: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>;

  // Fetch profiles for all member user_ids
  const userIds = rawMembers.map((m) => m.user_id);
  const { data: profileRows } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };

  const profileMap = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p])
  );

  const memberList: MembershipWithProfile[] = rawMembers.map((m) => ({
    ...(m as unknown as MembershipWithProfile),
    profile: profileMap[m.user_id] ?? null,
  }));

  // Split members into client users and Bloom staff for separate display
  const clientMembers = memberList.filter((m) => m.role.startsWith("client_"));
  const agencyMembers = memberList.filter((m) => m.role.startsWith("agency_"));

  const myMembershipHere = memberList.find(
    (m) => m.user_id === user.id && m.status === "active"
  );

  return (
    <div className="px-6 sm:px-8 py-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
        <Link
          href="/agency/clients"
          className="hover:text-gray-700 transition-colors"
        >
          Clients
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium truncate">{tenantRow.name}</span>
      </nav>

      {/* Account header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{tenantRow.name}</h1>
              <TenantStatusBadge status={tenantRow.status} />
            </div>
            <p className="text-sm text-gray-400 font-mono">{tenantRow.slug}</p>
          </div>
          {myMembershipHere && (
            <Link
              href="/workspace"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white flex-shrink-0 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#03CEA4" }}
            >
              Switch to Workspace ↗
            </Link>
          )}
        </div>

        {/* Detail grid */}
        <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Type
            </p>
            <p className="text-gray-900 capitalize">{tenantRow.type}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Slug
            </p>
            <p className="text-gray-900 font-mono">{tenantRow.slug}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Created
            </p>
            <p className="text-gray-900">
              {new Date(tenantRow.created_at).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Total members
            </p>
            <p className="text-gray-900">{memberList.length}</p>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Members{" "}
            <span className="text-gray-400 font-normal ml-1">
              ({memberList.length})
            </span>
          </h2>
        </div>

        {memberList.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400 text-center">
            No members yet. Use the form below to add someone.
          </div>
        ) : (
          <>
            {/* Client users section */}
            {clientMembers.length > 0 && (
              <>
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Client Users
                  </p>
                </div>
                <MemberRows members={clientMembers} currentUserId={user.id} />
              </>
            )}

            {/* Bloom staff section */}
            {agencyMembers.length > 0 && (
              <>
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Bloom Staff
                  </p>
                </div>
                <MemberRows members={agencyMembers} currentUserId={user.id} />
              </>
            )}
          </>
        )}
      </div>

      {/* Add member */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Add or Assign a User
        </h2>
        <AddMemberForm tenantId={params.tenantId} />
      </div>
    </div>
  );
}

// ── MemberRows sub-component ───────────────────────────────────────────────

function MemberRows({
  members,
  currentUserId,
}: {
  members: MembershipWithProfile[];
  currentUserId: string;
}) {
  return (
    <div className="divide-y divide-gray-100">
      {members.map((member) => {
        const name = member.profile?.full_name ?? "Unknown user";
        const initial = name[0].toUpperCase();
        const isAgency = member.role.startsWith("agency_");

        return (
          <div key={member.id} className="flex items-center gap-4 px-5 py-3">
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={
                isAgency
                  ? { backgroundColor: "#EEF0FB", color: "#2B307E" }
                  : { backgroundColor: "#E6F9F5", color: "#03CEA4" }
              }
            >
              {initial}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {name}
                {member.user_id === currentUserId && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">(you)</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <RoleBadge role={member.role} />
              <MembershipStatusBadge status={member.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
