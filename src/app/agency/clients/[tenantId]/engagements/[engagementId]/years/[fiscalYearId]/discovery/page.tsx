import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { DiscoveryRun, SredProject } from "@/types/database";

interface Props {
  params: { tenantId: string; engagementId: string; fiscalYearId: string };
}

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-gray-100 text-gray-500",
  running:   "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed:    "bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending:   "Pending",
  running:   "Running…",
  completed: "Completed",
  failed:    "Failed",
};

const DECISION_STYLES: Record<string, string> = {
  pending:  "bg-gray-100 text-gray-500",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  deferred: "bg-amber-50 text-amber-700",
};

export default async function DiscoveryListPage({ params }: Props) {
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

  // Triple-ownership check
  const { data: rawFy, error: fyError } = await supabase
    .from("fiscal_years")
    .select("label")
    .eq("id", params.fiscalYearId)
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (fyError || !rawFy) notFound();
  const fy = rawFy as unknown as { label: string };

  // Breadcrumb names
  const { data: engData } = await supabase
    .from("engagements").select("title")
    .eq("id", params.engagementId).eq("tenant_id", params.tenantId).single();
  const engTitle = (engData as unknown as { title: string } | null)?.title ?? "Engagement";

  const { data: tenantData } = await supabase
    .from("tenants").select("name").eq("id", params.tenantId).single();
  const tenantName = (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  // Load discovery runs with project counts
  const { data: rawRuns } = await supabase
    .from("discovery_runs")
    .select(`
      id, status, run_summary, prompt_tokens, completion_tokens,
      document_ids, context_source_ids, created_at, completed_at,
      sred_projects(id, decision)
    `)
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false });

  type RunWithProjects = DiscoveryRun & { sred_projects: Pick<SredProject, "id" | "decision">[] };
  const runs = (rawRuns ?? []) as unknown as RunWithProjects[];

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
        <Link href={base} className="hover:text-gray-700 transition-colors">{fy.label}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Project Discovery</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Project Discovery</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Claude analyses your documents and context sources to draft T661 Part 2 content.
          </p>
        </div>
        <Link
          href={`${base}/discovery/new`}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#2B307E" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Run Project Discovery
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">No discovery runs yet</p>
          <p className="text-sm text-gray-400 mb-6">
            Upload AI-ready documents or add context sources, then run Project Discovery to
            have Claude draft T661 Part 2 content.
          </p>
          <Link
            href={`${base}/discovery/new`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#2B307E" }}
          >
            Run Project Discovery
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run, idx) => {
            const projects = run.sred_projects ?? [];
            const acceptedCount = projects.filter((p) => p.decision === "accepted").length;
            const pendingCount  = projects.filter((p) => p.decision === "pending").length;

            return (
              <Link
                key={run.id}
                href={`${base}/discovery/${run.id}`}
                className="block bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        STATUS_STYLES[run.status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {STATUS_LABELS[run.status] ?? run.status}
                    </span>
                    {idx === 0 && (
                      <span className="text-xs text-gray-400 font-medium">Latest</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(run.created_at).toLocaleDateString("en-CA", {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                    {run.completed_at && (
                      <> · {new Date(run.completed_at).toLocaleTimeString("en-CA", {
                        hour: "2-digit", minute: "2-digit",
                      })}</>
                    )}
                  </span>
                </div>

                {run.run_summary && (
                  <p className="text-sm text-gray-700 mb-3 leading-relaxed line-clamp-2">
                    {run.run_summary}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
                  {acceptedCount > 0 && (
                    <span className="text-emerald-600 font-medium">{acceptedCount} accepted</span>
                  )}
                  {pendingCount > 0 && (
                    <span className="text-amber-600">{pendingCount} pending review</span>
                  )}
                  <span>{run.document_ids.length} doc{run.document_ids.length !== 1 ? "s" : ""}</span>
                  {run.context_source_ids.length > 0 && (
                    <span>{run.context_source_ids.length} source{run.context_source_ids.length !== 1 ? "s" : ""}</span>
                  )}
                  {run.prompt_tokens && (
                    <span className="ml-auto">
                      {((run.prompt_tokens + (run.completion_tokens ?? 0)) / 1000).toFixed(0)}k tokens
                    </span>
                  )}
                </div>

                {/* Project decision chips */}
                {projects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
                    {projects.map((p) => (
                      <span
                        key={p.id}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          DECISION_STYLES[p.decision] ?? "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {p.decision}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 pt-4 border-t border-gray-100 text-sm text-gray-500">
        <Link href={base} className="hover:text-gray-900 transition-colors">← Back to {fy.label}</Link>
      </div>
    </div>
  );
}
