import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { EngagementStatusBadge, FiscalYearStatusBadge } from "@/components/status-badge";
import { EngagementStatusForm } from "./engagement-status-form";
import type { EngagementWithDetails, FiscalYear } from "@/types/database";

interface Props {
  params: { tenantId: string; engagementId: string };
}

export default async function EngagementDetailPage({ params }: Props) {
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
  const isAgency = myRoles.some((m) => isAgencyRole(m.role as never));
  if (!isAgency) redirect("/unauthorized");

  // Load engagement (no fiscal_year join — fiscal years are now a collection)
  const { data: raw, error } = await supabase
    .from("engagements")
    .select("*, engagement_type:engagement_types(*, service_line:service_lines(*))")
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

  // Load fiscal years (claim years) that belong to this engagement
  const { data: rawFys } = await supabase
    .from("fiscal_years")
    .select("*")
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .order("start_date", { ascending: true });

  const fiscalYears = (rawFys ?? []) as unknown as FiscalYear[];

  const et = engagement.engagement_type;
  const sl = et.service_line;

  const engBase = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}`;

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

        <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Service Line
            </p>
            <p className="text-gray-900">{sl.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Type
            </p>
            <p className="text-gray-900">{et.name}</p>
          </div>
          {engagement.contract_start_date && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Contract Start
              </p>
              <p className="text-gray-900">
                {new Date(engagement.contract_start_date).toLocaleDateString("en-CA", {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </p>
            </div>
          )}
          {engagement.contract_end_date && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Contract End
              </p>
              <p className="text-gray-900">
                {new Date(engagement.contract_end_date).toLocaleDateString("en-CA", {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Created
            </p>
            <p className="text-gray-900">
              {new Date(engagement.created_at).toLocaleDateString("en-CA", {
                year: "numeric", month: "short", day: "numeric",
              })}
            </p>
          </div>
        </div>

        {engagement.notes && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Notes
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{engagement.notes}</p>
          </div>
        )}
      </div>

      {/* ── SR&ED Claim Years ──────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900">SR&amp;ED Claim Years</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Each claim year has its own context sources, AI analysis runs, and proposals.
            </p>
          </div>
          <Link
            href={`${engBase}/years/new`}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity flex-shrink-0"
            style={{ backgroundColor: "#03CEA4" }}
          >
            + Add Claim Year
          </Link>
        </div>

        {fiscalYears.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-10 text-center">
            <p className="text-sm text-gray-400 mb-1">No claim years yet.</p>
            <p className="text-xs text-gray-400">
              Add the first SR&amp;ED fiscal year to start building context and AI proposals.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {fiscalYears.map((fy) => {
              const yearBase = `${engBase}/years/${fy.id}`;
              return (
                <div
                  key={fy.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
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
                      </p>
                    </div>
                  </div>

                  {/* Quick navigation */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`${yearBase}/context`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 bg-white hover:border-teal-300 hover:text-teal-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      Context Sources
                    </Link>
                    <Link
                      href={`${yearBase}/ai-runs`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 bg-white hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      AI Runs
                    </Link>
                    <Link
                      href={`${yearBase}/proposals`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 bg-white hover:border-orange-300 hover:text-orange-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Proposals
                    </Link>
                  </div>

                  {fy.notes && (
                    <p className="text-xs text-gray-400 italic mt-2">{fy.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status management */}
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
