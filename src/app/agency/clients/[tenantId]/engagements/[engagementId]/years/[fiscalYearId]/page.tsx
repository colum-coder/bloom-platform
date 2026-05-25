import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { FiscalYearStatusBadge } from "@/components/status-badge";
import type { FiscalYear } from "@/types/database";

interface Props {
  params: { tenantId: string; engagementId: string; fiscalYearId: string };
}

export default async function FiscalYearWorkspacePage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const rows = (memberships ?? []) as Array<{ role: string }>;
  if (!rows.some((m) => isAgencyRole(m.role as never))) redirect("/unauthorized");

  // Load fiscal year — triple-ownership check
  const { data: rawFy, error: fyError } = await supabase
    .from("fiscal_years")
    .select("*")
    .eq("id", params.fiscalYearId)
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (fyError || !rawFy) notFound();
  const fy = rawFy as unknown as FiscalYear;

  const { data: engData } = await supabase
    .from("engagements")
    .select("title")
    .eq("id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();
  const engTitle = (engData as unknown as { title: string } | null)?.title ?? "Engagement";

  const { data: tenantData } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", params.tenantId)
    .single();
  const tenantName = (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  // Summary counts — primary workspace cards + legacy tools
  const [
    { count: sourceCount },
    { count: documentCount },
    { count: aiReadyCount },
    { count: discoveryRunCount },
    { count: acceptedProjectCount },
    { count: runCount },
    { count: proposalCount },
    { count: pendingCount },
  ] = await Promise.all([
    supabase.from("context_sources").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).eq("status", "active"),
    supabase.from("documents").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).neq("status", "archived"),
    supabase.from("documents").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).neq("status", "archived")
      .not("ai_text", "is", null),
    supabase.from("discovery_runs").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).eq("status", "completed"),
    supabase.from("sred_projects").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).eq("decision", "accepted"),
    supabase.from("ai_suggestion_runs").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId),
    supabase.from("ai_proposals").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId),
    supabase.from("ai_proposals").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).eq("decision", "pending"),
  ]);

  const base = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}`} className="hover:text-gray-700 transition-colors truncate max-w-[100px]">{tenantName}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`} className="hover:text-gray-700 transition-colors truncate max-w-[140px]">{engTitle}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{fy.label}</span>
      </nav>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{fy.label}</h1>
            <p className="text-sm text-gray-400 mt-0.5">SR&amp;ED Claim Year</p>
          </div>
          <FiscalYearStatusBadge status={fy.status} />
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Period</p>
            <p className="text-gray-900 text-xs">
              {new Date(fy.start_date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}
              {" – "}
              {new Date(fy.end_date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Documents</p>
            <p className="font-medium text-gray-900">
              {documentCount ?? 0}
              {(aiReadyCount ?? 0) > 0 && (
                <span className="ml-1.5 text-xs font-normal text-emerald-600">
                  {aiReadyCount} AI ready
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Sources</p>
            <p className="font-medium text-gray-900">{sourceCount ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Discovery</p>
            <p className="font-medium text-gray-900">
              {discoveryRunCount ?? 0} {(discoveryRunCount ?? 0) === 1 ? "run" : "runs"}
              {(acceptedProjectCount ?? 0) > 0 && (
                <span className="ml-1.5 text-xs font-normal text-emerald-600">
                  {acceptedProjectCount} accepted
                </span>
              )}
            </p>
          </div>
        </div>

        {fy.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{fy.notes}</p>
          </div>
        )}
      </div>

      {/* ── Primary workspace cards ─────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <WorkspaceCard
          title="Documents"
          description="Upload client files. AI text is extracted automatically from PDFs and Word docs for analysis."
          href={`${base}/documents`}
          color="#6366F1"
          count={documentCount ?? 0}
          countLabel={`${aiReadyCount ?? 0} AI ready`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          }
        />
        <WorkspaceCard
          title="Context Sources"
          description="Typed source material — meeting notes, technical narratives, prior claims, payroll summaries."
          href={`${base}/context`}
          color="#03CEA4"
          count={sourceCount ?? 0}
          countLabel="active"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
        />
        <WorkspaceCard
          title="Project Discovery"
          description="Run Claude to draft T661 Part 2 content — Line 242, 244, 246 — for each SR&ED project."
          href={`${base}/discovery`}
          color="#2B307E"
          count={discoveryRunCount ?? 0}
          countLabel={
            (acceptedProjectCount ?? 0) > 0
              ? `${acceptedProjectCount} project${(acceptedProjectCount ?? 0) !== 1 ? "s" : ""} accepted`
              : "runs completed"
          }
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          }
        />
      </div>

      {/* ── Legacy tools row ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 font-medium mr-1">Advanced:</span>
        <Link
          href={`${base}/ai-runs`}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 bg-white rounded-md px-2.5 py-1"
        >
          AI Runs
          {(runCount ?? 0) > 0 && (
            <span className="ml-1.5 text-gray-400">{runCount}</span>
          )}
        </Link>
        <Link
          href={`${base}/proposals`}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 bg-white rounded-md px-2.5 py-1"
        >
          Proposals
          {(pendingCount ?? 0) > 0 && (
            <span className="ml-1.5 text-amber-600 font-medium">{pendingCount} pending</span>
          )}
        </Link>
      </div>
    </div>
  );
}

function WorkspaceCard({
  title,
  description,
  href,
  color,
  count,
  countLabel,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  color: string;
  count: number;
  countLabel: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="flex items-start gap-3 mb-2">
        <span style={{ color }} className="flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {count} {countLabel}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed ml-8">{description}</p>
    </Link>
  );
}
