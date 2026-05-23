import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { EngagementStatusBadge, FiscalYearStatusBadge } from "@/components/status-badge";
import { EngagementStatusForm } from "./engagement-status-form";
import type { EngagementWithDetails } from "@/types/database";

interface Props {
  params: { tenantId: string; engagementId: string };
}

export default async function EngagementDetailPage({ params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Determine if the user is an agency member (can edit)
  const { data: myMemberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const myRoles = (myMemberships ?? []) as unknown as Array<{ role: string }>;
  const isAgency = myRoles.some((m) => isAgencyRole(m.role as never));

  if (!isAgency) redirect("/unauthorized");

  // Load engagement with type and fiscal year
  const { data: raw, error } = await supabase
    .from("engagements")
    .select(
      `*,
       fiscal_year:fiscal_years(*),
       engagement_type:engagement_types(*, service_line:service_lines(*))`
    )
    .eq("id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (error || !raw) notFound();

  const engagement = raw as unknown as EngagementWithDetails;

  // Load tenant name for breadcrumb
  const { data: tenantData } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", params.tenantId)
    .single();

  const tenantName = (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  const et   = engagement.engagement_type;
  const fy   = engagement.fiscal_year;
  const sl   = et.service_line;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">
          Clients
        </Link>
        <span>/</span>
        <Link
          href={`/agency/clients/${params.tenantId}`}
          className="hover:text-gray-700 transition-colors truncate max-w-[160px]"
        >
          {tenantName}
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium truncate max-w-[240px]">
          {engagement.title}
        </span>
      </nav>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <h1 className="text-xl font-semibold text-gray-900">{engagement.title}</h1>
          <EngagementStatusBadge status={engagement.status} />
        </div>
        <p className="text-sm text-gray-400">
          {sl.name} — {et.name}
        </p>

        {/* Detail grid */}
        <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Service Line
            </p>
            <p className="text-gray-900">{sl.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Engagement Type
            </p>
            <p className="text-gray-900">{et.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Fiscal Year
            </p>
            {fy ? (
              <div className="flex items-center gap-2">
                <span className="text-gray-900">{fy.label}</span>
                <FiscalYearStatusBadge status={fy.status} />
              </div>
            ) : (
              <span className="text-gray-400 italic">None</span>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Created
            </p>
            <p className="text-gray-900">
              {new Date(engagement.created_at).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Notes */}
        {engagement.notes && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Notes
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{engagement.notes}</p>
          </div>
        )}
      </div>

      {/* Fiscal year detail (if linked) */}
      {fy && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Fiscal Year</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Label
              </p>
              <p className="text-gray-900">{fy.label}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Period
              </p>
              <p className="text-gray-900">
                {new Date(fy.start_date).toLocaleDateString("en-CA", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                {" – "}
                {new Date(fy.end_date).toLocaleDateString("en-CA", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Status
              </p>
              <FiscalYearStatusBadge status={fy.status} />
            </div>
          </div>
          {fy.notes && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Notes
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{fy.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Status management (agency only) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Update Status</h2>
        <p className="text-xs text-gray-400 mb-4">
          Changes are applied immediately. Draft engagements are not visible to the client.
        </p>
        <EngagementStatusForm
          engagementId={engagement.id}
          tenantId={params.tenantId}
          currentStatus={engagement.status}
        />
      </div>
    </div>
  );
}
