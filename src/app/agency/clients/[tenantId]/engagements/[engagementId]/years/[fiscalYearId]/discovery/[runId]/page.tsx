import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { DiscoveryRun, SredProject } from "@/types/database";

interface Props {
  params: {
    tenantId: string;
    engagementId: string;
    fiscalYearId: string;
    runId: string;
  };
}

const DECISION_STYLES: Record<string, string> = {
  pending:  "bg-gray-100 text-gray-500",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  deferred: "bg-amber-50 text-amber-700",
};

const DECISION_LABELS: Record<string, string> = {
  pending:  "Pending Review",
  accepted: "Accepted",
  rejected: "Rejected",
  deferred: "Deferred",
};

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-gray-100 text-gray-500",
  running:   "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed:    "bg-red-50 text-red-700",
};

export default async function DiscoveryRunDetailPage({ params }: Props) {
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

  // Load run — triple-ownership check baked in
  const { data: rawRun, error: runError } = await supabase
    .from("discovery_runs")
    .select(
      `id, status, run_summary, error_message, prompt_tokens, completion_tokens,
       document_ids, context_source_ids, created_at, completed_at`
    )
    .eq("id", params.runId)
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (runError || !rawRun) notFound();
  const run = rawRun as unknown as DiscoveryRun;

  // Load projects for this run
  const { data: rawProjects } = await supabase
    .from("sred_projects")
    .select("id, project_name, decision, decision_reason, line_242_ai_draft, line_246_ai_draft, created_at")
    .eq("run_id", params.runId)
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: true });

  const projects = (rawProjects ?? []) as unknown as Array<
    Pick<SredProject, "id" | "project_name" | "decision" | "decision_reason" | "line_242_ai_draft" | "line_246_ai_draft" | "created_at">
  >;

  // Breadcrumb names
  const { data: rawFy } = await supabase
    .from("fiscal_years").select("label")
    .eq("id", params.fiscalYearId).eq("tenant_id", params.tenantId).single();
  const fyLabel = (rawFy as unknown as { label: string } | null)?.label ?? "Claim Year";

  const { data: engData } = await supabase
    .from("engagements").select("title")
    .eq("id", params.engagementId).eq("tenant_id", params.tenantId).single();
  const engTitle = (engData as unknown as { title: string } | null)?.title ?? "Engagement";

  const { data: tenantData } = await supabase
    .from("tenants").select("name").eq("id", params.tenantId).single();
  const tenantName = (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  const base = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;
  const runBase = `${base}/discovery/${params.runId}`;

  const acceptedCount = projects.filter((p) => p.decision === "accepted").length;
  const pendingCount  = projects.filter((p) => p.decision === "pending").length;

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
        <Link href={base} className="hover:text-gray-700 transition-colors">{fyLabel}</Link>
        <span>/</span>
        <Link href={`${base}/discovery`} className="hover:text-gray-700 transition-colors">Project Discovery</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">
          {new Date(run.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} run
        </span>
      </nav>

      {/* Run summary card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Discovery Run</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(run.created_at).toLocaleDateString("en-CA", {
                year: "numeric", month: "long", day: "numeric",
              })}
              {run.completed_at && (
                <> · completed {new Date(run.completed_at).toLocaleTimeString("en-CA", {
                  hour: "2-digit", minute: "2-digit",
                })}</>
              )}
            </p>
          </div>
          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
            STATUS_STYLES[run.status] ?? "bg-gray-100 text-gray-500"
          }`}>
            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
          </span>
        </div>

        {run.run_summary && (
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            {run.run_summary}
          </p>
        )}

        {run.error_message && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
            <strong>Error:</strong> {run.error_message}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Projects</p>
            <p className="font-medium text-gray-900">
              {projects.length}
              {pendingCount > 0 && (
                <span className="ml-1.5 text-xs font-normal text-amber-600">
                  ({pendingCount} pending)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Accepted</p>
            <p className="font-medium text-gray-900">{acceptedCount}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Documents</p>
            <p className="font-medium text-gray-900">{run.document_ids.length}</p>
          </div>
          {run.prompt_tokens && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Tokens</p>
              <p className="font-medium text-gray-900">
                {((run.prompt_tokens + (run.completion_tokens ?? 0)) / 1000).toFixed(0)}k
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1">
            SR&amp;ED Projects ({projects.length})
          </h2>
          {projects.map((project, idx) => {
            const hasLine242 = !!project.line_242_ai_draft;
            const advancement = project.line_242_ai_draft?.narrative;

            return (
              <Link
                key={project.id}
                href={`${runBase}/${project.id}`}
                className="block bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                style={{ borderLeftWidth: 3, borderLeftColor: "#2B307E" }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-gray-400 flex-shrink-0">
                      #{idx + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {project.project_name}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${
                    DECISION_STYLES[project.decision] ?? "bg-gray-100 text-gray-500"
                  }`}>
                    {DECISION_LABELS[project.decision] ?? project.decision}
                  </span>
                </div>

                {advancement && (
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 ml-6">
                    {advancement}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-2 ml-6 text-xs text-gray-400">
                  {hasLine242 && <span className="text-emerald-600">Line 242 ✓</span>}
                  {project.line_246_ai_draft && <span className="text-emerald-600">Line 246 ✓</span>}
                  <span className="text-gray-300">Line 244 ✓</span>
                  <span className="ml-auto text-gray-300">View &amp; edit →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {run.status === "completed" && projects.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
          No SR&amp;ED projects were identified in this run. The source materials may not
          contain sufficient technical detail to draft T661 content.
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-4 text-sm">
        <Link href={`${base}/discovery`} className="text-gray-400 hover:text-gray-900 transition-colors">
          ← All Runs
        </Link>
        <Link
          href={`${base}/discovery/new`}
          className="ml-auto text-sm font-medium hover:opacity-90 transition-opacity"
          style={{ color: "#2B307E" }}
        >
          Run again →
        </Link>
      </div>
    </div>
  );
}
