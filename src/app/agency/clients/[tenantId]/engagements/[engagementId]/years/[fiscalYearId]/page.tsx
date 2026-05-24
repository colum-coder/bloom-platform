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

  // Summary counts
  const [
    { count: sourceCount },
    { count: runCount },
    { count: proposalCount },
    { count: pendingCount },
    { count: documentCount },
    { count: aiReadyCount },
  ] = await Promise.all([
    supabase.from("context_sources").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).eq("status", "active"),
    supabase.from("ai_suggestion_runs").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId),
    supabase.from("ai_proposals").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId),
    supabase.from("ai_proposals").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).eq("decision", "pending"),
    supabase.from("documents").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).neq("status", "archived"),
    supabase.from("documents").select("*", { count: "exact", head: true })
      .eq("fiscal_year_id", params.fiscalYearId).neq("status", "archived")
      .not("ai_text", "is", null),
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Sources</p>
            <p className="font-medium text-gray-900">{sourceCount ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">AI Runs</p>
            <p className="font-medium text-gray-900">{runCount ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Proposals</p>
            <p className="font-medium text-gray-900">
              {proposalCount ?? 0}
              {(pendingCount ?? 0) > 0 && (
                <span className="ml-1.5 text-xs font-normal text-amber-600">
                  ({pendingCount} pending)
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

      {/* Workspace navigation cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <WorkspaceCard
          title="Context Sources"
          description="Source material the AI will analyse — technical narratives, meeting notes, prior claims, payroll."
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
          title="AI Runs"
          description="Analysis runs — view sources included, AI summary, and what was proposed."
          href={`${base}/ai-runs`}
          color="#2B307E"
          count={runCount ?? 0}
          countLabel="total"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          }
        />
        <WorkspaceCard
          title="Proposals"
          description="All AI-proposed projects, people, evidence, and gaps. Accept, reject, or defer each one."
          href={`${base}/proposals`}
          color="#FF6A42"
          count={proposalCount ?? 0}
          countLabel={`${pendingCount ?? 0} pending`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <WorkspaceCard
          title="Documents"
          description="Uploaded files. AI-readable text is extracted automatically for PDFs and Word docs."
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
