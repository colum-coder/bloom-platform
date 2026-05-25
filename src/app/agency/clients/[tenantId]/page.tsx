import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import {
  TenantStatusBadge,
  MembershipStatusBadge,
  RoleBadge,
  FiscalYearStatusBadge,
  EngagementStatusBadge,
} from "@/components/status-badge";
import { AddMemberForm } from "./add-member-form";
import type {
  Engagement,
  EngagementType,
  FiscalYear,
  MembershipWithProfile,
  ServiceLine,
  Tenant,
} from "@/types/database";

interface Props {
  params: { tenantId: string };
}

export default async function ClientTenantDetailPage({ params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myMemberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const myRoles = (myMemberships ?? []) as unknown as Array<{ role: string }>;
  if (!myRoles.some((m) => isAgencyRole(m.role as never)))
    redirect("/unauthorized");

  // Load the target tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", params.tenantId)
    .eq("type", "client")
    .single();

  if (tenantError || !tenant) notFound();
  const tenantRow = tenant as Tenant;

  // Load memberships
  const { data: members } = await supabase
    .from("tenant_memberships")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: true });

  const rawMembers = (members ?? []) as unknown as Array<{
    id: string; tenant_id: string; user_id: string; role: string;
    status: string; created_by: string | null; created_at: string; updated_at: string;
  }>;

  const userIds = rawMembers.map((m) => m.user_id);
  const { data: profileRows } = userIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };

  const profileMap = Object.fromEntries((profileRows ?? []).map((p) => [p.id, p]));
  const memberList: MembershipWithProfile[] = rawMembers.map((m) => ({
    ...(m as unknown as MembershipWithProfile),
    profile: profileMap[m.user_id] ?? null,
  }));

  const clientMembers = memberList.filter((m) => m.role.startsWith("client_"));
  const agencyMembers = memberList.filter((m) => m.role.startsWith("agency_"));
  const myMembershipHere = memberList.find((m) => m.user_id === user.id && m.status === "active");

  // ── Active Claim Years ──────────────────────────────────────────────────
  // Shows fiscal years with status='active' that belong to this tenant's
  // engagements. Fiscal years are always owned by an engagement — this
  // section is a convenience view across all engagements for daily work.
  //
  // Future: when claim work statuses are more granular, filter on statuses
  // that indicate active work, e.g.:
  //   context_gathering | ai_review | project_discovery | qualification |
  //   writing | review
  // For now, status='active' is the proxy for "currently being worked on."
  //
  // Planned future statuses (do not change DB schema yet — document only):
  //   not_started, context_gathering, ai_review, project_discovery,
  //   qualification, writing, review, submitted, closed, archived

  type ActiveClaimYear = FiscalYear & {
    engagement: { id: string; title: string } | null;
  };

  const { data: rawActiveYears } = await supabase
    .from("fiscal_years")
    .select("*, engagement:engagements(id, title)")
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .not("engagement_id", "is", null)
    .order("start_date", { ascending: false });

  const activeClaimYears = (rawActiveYears ?? []) as unknown as ActiveClaimYear[];

  // ── Engagements ─────────────────────────────────────────────────────────
  // Claim year count per engagement (for the engagements table)
  const { data: fyRows } = await supabase
    .from("fiscal_years")
    .select("engagement_id")
    .eq("tenant_id", params.tenantId)
    .not("engagement_id", "is", null);

  const claimYearCountMap = (fyRows ?? []).reduce<Record<string, number>>((acc, row) => {
    const r = row as unknown as { engagement_id: string };
    acc[r.engagement_id] = (acc[r.engagement_id] ?? 0) + 1;
    return acc;
  }, {});

  const { data: rawEngagements } = await supabase
    .from("engagements")
    .select("*, engagement_type:engagement_types(*, service_line:service_lines(*))")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false });

  type EngagementRow = Engagement & {
    engagement_type: EngagementType & { service_line: ServiceLine };
  };
  const engagements = (rawEngagements ?? []) as unknown as EngagementRow[];

  return (
    <div className="px-6 sm:px-8 py-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
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

        <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Type</p>
            <p className="text-gray-900 capitalize">{tenantRow.type}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Slug</p>
            <p className="text-gray-900 font-mono">{tenantRow.slug}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Created</p>
            <p className="text-gray-900">
              {new Date(tenantRow.created_at).toLocaleDateString("en-CA", {
                year: "numeric", month: "short", day: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Members</p>
            <p className="text-gray-900">{memberList.length}</p>
          </div>
        </div>
      </div>

      {/* ── Active Claim Years ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Active Claim Years{" "}
            <span className="text-gray-400 font-normal ml-1">({activeClaimYears.length})</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            SR&amp;ED claim years currently being worked — across all engagements.
          </p>
        </div>

        {activeClaimYears.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">
            No active claim years. Open an engagement and add a claim year to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeClaimYears.map((fy) => {
              if (!fy.engagement) return null;
              const yearBase = `/agency/clients/${params.tenantId}/engagements/${fy.engagement.id}/years/${fy.id}`;
              return (
                <div key={fy.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <Link
                          href={yearBase}
                          className="text-sm font-semibold text-gray-900 hover:text-teal-700 transition-colors"
                        >
                          {fy.label}
                        </Link>
                        <FiscalYearStatusBadge status={fy.status} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(fy.start_date).toLocaleDateString("en-CA", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                        {" – "}
                        {new Date(fy.end_date).toLocaleDateString("en-CA", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                        <span className="mx-2 text-gray-300">·</span>
                        <Link
                          href={`/agency/clients/${params.tenantId}/engagements/${fy.engagement.id}`}
                          className="text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          {fy.engagement.title}
                        </Link>
                      </p>
                    </div>
                  </div>

                  {/* Quick links */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={yearBase}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                    >
                      Open Claim Year
                    </Link>
                    <Link
                      href={`${yearBase}/documents`}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-600 bg-white hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                    >
                      Documents
                    </Link>
                    <Link
                      href={`${yearBase}/discovery`}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-600 bg-white hover:border-blue-300 hover:text-blue-700 transition-colors"
                    >
                      Project Discovery
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Engagements ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Engagements{" "}
            <span className="text-gray-400 font-normal ml-1">({engagements.length})</span>
          </h2>
          <Link
            href={`/agency/clients/${params.tenantId}/engagements/new`}
            className="text-xs font-semibold text-white rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#03CEA4" }}
          >
            + New
          </Link>
        </div>

        {engagements.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">
            No engagements yet.{" "}
            <Link
              href={`/agency/clients/${params.tenantId}/engagements/new`}
              className="text-teal-600 hover:underline"
            >
              Create the first one
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Type</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Claim Years</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {engagements.map((eng) => (
                  <tr key={eng.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/agency/clients/${params.tenantId}/engagements/${eng.id}`}
                        className="font-medium text-gray-900 hover:text-teal-700 transition-colors"
                      >
                        {eng.title}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5 md:hidden">
                        {eng.engagement_type.service_line.name} — {eng.engagement_type.name}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">
                      <span>{eng.engagement_type.name}</span>
                      <span className="text-gray-400 ml-1 text-xs">
                        ({eng.engagement_type.service_line.name})
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">
                      {claimYearCountMap[eng.id] ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <EngagementStatusBadge status={eng.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Members ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Members{" "}
            <span className="text-gray-400 font-normal ml-1">({memberList.length})</span>
          </h2>
        </div>

        {memberList.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400 text-center">
            No members yet. Use the form below to add someone.
          </div>
        ) : (
          <>
            {clientMembers.length > 0 && (
              <>
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Client Users</p>
                </div>
                <MemberRows members={clientMembers} currentUserId={user.id} />
              </>
            )}
            {agencyMembers.length > 0 && (
              <>
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bloom Staff</p>
                </div>
                <MemberRows members={agencyMembers} currentUserId={user.id} />
              </>
            )}
          </>
        )}
      </div>

      {/* Add member */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add or Assign a User</h2>
        <AddMemberForm tenantId={params.tenantId} />
      </div>
    </div>
  );
}

// ── MemberRows sub-component ───────────────────────────────────────────────

function MemberRows({ members, currentUserId }: { members: MembershipWithProfile[]; currentUserId: string }) {
  return (
    <div className="divide-y divide-gray-100">
      {members.map((member) => {
        const name = member.profile?.full_name ?? "Unknown user";
        const initial = name[0].toUpperCase();
        const isAgency = member.role.startsWith("agency_");

        return (
          <div key={member.id} className="flex items-center gap-4 px-5 py-3">
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
