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

const CONFIDENCE_STYLES: Record<string, string> = {
  high:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low:    "bg-red-50 text-red-600 border border-red-200",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high:   "High",
  medium: "Medium",
  low:    "Low",
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
       document_ids, context_source_ids, created_at, completed_at,
       started_at, progress_message, total_document_count`
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
    .select("id, project_name, confidence, decision, decision_reason, line_242_ai_draft, line_246_ai_draft, created_at")
    .eq("run_id", params.runId)
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: true });

  const projects = (rawProjects ?? []) as unknown as Array<
    Pick<SredProject, "id" | "project_name" | "confidence" | "decision" | "decision_reason" | "line_242_ai_draft" | "line_246_ai_draft" | "created_at">
  >;

  // When zero projects on a completed run, fetch the included documents for diagnostics
  type DiagDoc = { id: string; title: string; document_type: string; ai_text: string | null; status: string };
  let diagnosticDocs: DiagDoc[] = [];
  if (run.status === "completed" && projects.length === 0 && run.document_ids.length > 0) {
    const { data: docData } = await supabase
      .from("documents")
      .select("id, title, document_type, ai_text, status")
      .in("id", run.document_ids);
    diagnosticDocs = (docData ?? []) as unknown as DiagDoc[];
  }

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

  const isInProgress = run.status === "pending" || run.status === "running";
  const docCount = run.total_document_count ?? run.document_ids.length;
  const isLargeRun = docCount > 5;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-4xl mx-auto">
      {/* Auto-refresh every 8 seconds while the run is in progress.
          React 18 + Next.js App Router hoists <meta> from server components to <head>. */}
      {isInProgress && (
        <meta httpEquiv="refresh" content="8" />
      )}

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

      {/* ── In-progress loading card ─────────────────────────────────────────── */}
      {isInProgress && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 mb-5">
          <div className="flex flex-col items-center text-center">

            {/* Logo reveal animation — 8 s, synced with the meta refresh */}
            <video
              src="/bloom-logo-reveal.mp4"
              autoPlay
              muted
              playsInline
              className="w-72 mb-4"
            />

            <h2 className="text-base font-semibold text-gray-900 mb-1">
              {run.status === "pending"
                ? "Discovery run queued"
                : "Claude is analysing your documents"}
            </h2>

            <p className="text-sm text-gray-500 mb-4 max-w-sm">
              {run.progress_message
                ? run.progress_message
                : run.status === "pending"
                ? "The run will begin shortly."
                : `Reading ${docCount} document${docCount !== 1 ? "s" : ""}${
                    run.context_source_ids.length > 0
                      ? ` and ${run.context_source_ids.length} context source${run.context_source_ids.length !== 1 ? "s" : ""}`
                      : ""
                  }…`}
            </p>

            {/* Scope pills */}
            <div className="flex items-center gap-2 flex-wrap justify-center mb-4">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {docCount} document{docCount !== 1 ? "s" : ""}
              </span>
              {run.context_source_ids.length > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  {run.context_source_ids.length} context source{run.context_source_ids.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Large-run note */}
            {isLargeRun && (
              <p className="text-sm text-gray-500 leading-relaxed max-w-sm mb-3">
                This is a large run and may take a few minutes.{" "}
                <strong className="text-gray-700">You can leave this page and return later</strong>{" "}
                — the analysis continues in the background.
              </p>
            )}

            <p className="text-xs text-gray-400">
              This page refreshes automatically every 8 seconds.
            </p>
          </div>
        </div>
      )}

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
            // v3: use advancement_statement from line_246, or combined_draft from line_242
            // v1/v2 fallback: narrative field
            const preview =
              project.line_246_ai_draft?.advancement_statement ||
              project.line_242_ai_draft?.combined_draft ||
              project.line_242_ai_draft?.narrative;

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
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                    {project.confidence && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        CONFIDENCE_STYLES[project.confidence] ?? ""
                      }`}>
                        {CONFIDENCE_LABELS[project.confidence]} confidence
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      DECISION_STYLES[project.decision] ?? "bg-gray-100 text-gray-500"
                    }`}>
                      {DECISION_LABELS[project.decision] ?? project.decision}
                    </span>
                  </div>
                </div>

                {preview && (
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 ml-6">
                    {preview}
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
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden"
             style={{ borderLeftWidth: 4, borderLeftColor: "#F59E0B" }}>
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h2 className="text-sm font-semibold text-amber-800">No SR&amp;ED Projects Suggested</h2>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Claude's explanation */}
            {run.run_summary && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Claude&apos;s explanation
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{run.run_summary}</p>
              </div>
            )}

            {/* Documents analysed */}
            {diagnosticDocs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Documents analysed in this run
                </p>
                <div className="space-y-2">
                  {diagnosticDocs.map((doc) => {
                    const charCount = doc.ai_text?.length ?? 0;
                    const isAiReady = !!doc.ai_text;
                    return (
                      <div key={doc.id} className="flex items-start gap-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
                        <span className={`mt-0.5 text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          isAiReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {isAiReady ? "AI Ready" : "Needs Text"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {isAiReady
                              ? `${charCount.toLocaleString()} characters sent to Claude`
                              : "No AI text — document was NOT included in this run"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Context sources count */}
            {run.context_source_ids.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Context sources included
                </p>
                <p className="text-sm text-gray-700">
                  {run.context_source_ids.length} active context source{run.context_source_ids.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}

            {/* Suggested actions */}
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3.5">
              <p className="text-xs font-semibold text-indigo-800 mb-2">Suggested next steps</p>
              <ul className="space-y-1.5 text-sm text-indigo-700">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">1.</span>
                  <span>
                    Check each document above has an <strong>AI Ready</strong> badge and a character count above ~500.
                    If a document shows &ldquo;Needs Text,&rdquo; open it and add AI text manually.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">2.</span>
                  <span>
                    Add a <strong>Context Source</strong> to describe the research in plain language —
                    what problem was being solved, what was unknown, what was tried, and what was found.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">3.</span>
                  <span>
                    Run Project Discovery again. The updated prompt explicitly recognises research papers,
                    negative results, and low-confidence candidates.
                  </span>
                </li>
              </ul>
            </div>

            {/* Re-run link */}
            <div className="flex items-center gap-3 pt-1">
              <a
                href={`${base}/discovery/new`}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#2B307E" }}
              >
                Run Project Discovery again
              </a>
              <a
                href={`${base}/documents`}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Review documents →
              </a>
            </div>
          </div>
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
