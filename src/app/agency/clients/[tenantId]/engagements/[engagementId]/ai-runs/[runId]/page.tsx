import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { ProposalDecisionWidget } from "./proposal-decision-widget";
import type { AiSuggestionRun, AiProposalWithSources, ProposalType } from "@/types/database";

interface Props {
  params: { tenantId: string; engagementId: string; runId: string };
}

const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  project:           "Projects",
  person:            "People",
  evidence:          "Evidence",
  hours:             "Hours",
  contractor:        "Contractors",
  material:          "Materials",
  government_support: "Government Support",
  gap:               "Gaps",
};

const PROPOSAL_TYPE_ORDER: ProposalType[] = [
  "project", "person", "hours", "contractor", "material",
  "evidence", "government_support", "gap",
];

const CONFIDENCE_STYLES = {
  high:   "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low:    "bg-gray-100 text-gray-500",
};

const RUN_STATUS_STYLES: Record<string, { label: string; style: string }> = {
  new:               { label: "New",             style: "bg-blue-50 text-blue-700" },
  resurfacing:       { label: "Seen before",     style: "bg-amber-50 text-amber-700" },
  possible_duplicate: { label: "Possible duplicate", style: "bg-orange-50 text-orange-700" },
  confirmed:         { label: "Confirmed",       style: "bg-emerald-50 text-emerald-700" },
  superseded:        { label: "Superseded",      style: "bg-gray-100 text-gray-500" },
};

export default async function AiRunDetailPage({ params }: Props) {
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

  // Load run
  const { data: rawRun, error: runError } = await supabase
    .from("ai_suggestion_runs")
    .select("*")
    .eq("id", params.runId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (runError || !rawRun) notFound();
  const run = rawRun as unknown as AiSuggestionRun;

  // Load engagement
  const { data: rawEng } = await supabase
    .from("engagements")
    .select("title")
    .eq("id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();
  const eng = rawEng as unknown as { title: string } | null;

  const { data: tenantData } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", params.tenantId)
    .single();
  const tenantName = (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  // Load proposals with their sources
  const { data: rawProposals } = await supabase
    .from("ai_proposals")
    .select("*, ai_suggestion_sources(*)")
    .eq("run_id", params.runId)
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: true });

  const proposals = (rawProposals ?? []) as unknown as AiProposalWithSources[];

  // Group by proposal_type
  const grouped = PROPOSAL_TYPE_ORDER.reduce<Record<string, AiProposalWithSources[]>>(
    (acc, type) => {
      acc[type] = proposals.filter((p) => p.proposal_type === type);
      return acc;
    },
    {}
  );

  return (
    <div className="px-6 sm:px-8 py-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}`} className="hover:text-gray-700 transition-colors truncate max-w-[100px]">{tenantName}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`} className="hover:text-gray-700 transition-colors truncate max-w-[140px]">{eng?.title ?? "Engagement"}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/ai-runs`} className="hover:text-gray-700 transition-colors">AI Runs</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">
          {new Date(run.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}
        </span>
      </nav>

      {/* Truncation warning — prominent if present */}
      {run.truncation_warning && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800 mb-0.5">⚠ Partial results — response was truncated</p>
          <p className="text-xs text-amber-700">
            The AI response reached the token limit before completing. Some proposals may be missing.
            Consider re-running with fewer context sources or a more focused selection.
          </p>
        </div>
      )}

      {/* Run header card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              AI Run — {new Date(run.created_at).toLocaleDateString("en-CA", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </h1>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-sm text-gray-400 font-mono">{run.model}</span>
            {run.prompt_version && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 text-gray-500">
                {run.prompt_version}
              </span>
            )}
          </div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
            run.status === "completed" ? "bg-emerald-50 text-emerald-700" :
            run.status === "failed"    ? "bg-red-50 text-red-700"         :
            run.status === "running"   ? "bg-blue-50 text-blue-700"       :
                                         "bg-gray-100 text-gray-500"
          }`}>
            {run.status}
          </span>
        </div>

        {/* Run summary */}
        {run.summary && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Summary</p>
            <p className="text-sm text-gray-700 leading-relaxed">{run.summary}</p>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Sources</p>
            <p className="font-medium text-gray-900">{run.context_source_ids.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Proposals</p>
            <p className="font-medium text-gray-900">{proposals.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Tokens used</p>
            <p className="font-medium text-gray-900">
              {run.prompt_tokens != null && run.completion_tokens != null
                ? `${(run.prompt_tokens + run.completion_tokens).toLocaleString()}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Completed</p>
            <p className="font-medium text-gray-900">
              {run.completed_at
                ? new Date(run.completed_at).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </p>
          </div>
        </div>

        {/* Activity months */}
        {run.activity_months && run.activity_months.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">SR&amp;ED Activity Months</p>
            <div className="flex flex-wrap gap-1.5">
              {run.activity_months.map((m) => (
                <span key={m} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* TR sections */}
        {((run.tr_sections_supported?.length ?? 0) > 0 || (run.tr_sections_unsupported?.length ?? 0) > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid sm:grid-cols-2 gap-4">
            {(run.tr_sections_supported?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">TR Sections — Evidenced</p>
                <ul className="space-y-0.5">
                  {run.tr_sections_supported!.map((s) => (
                    <li key={s} className="text-xs text-emerald-700 flex items-center gap-1">
                      <span>✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(run.tr_sections_unsupported?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">TR Sections — Not Evidenced</p>
                <ul className="space-y-0.5">
                  {run.tr_sections_unsupported!.map((s) => (
                    <li key={s} className="text-xs text-gray-400 flex items-center gap-1">
                      <span>○</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {run.status === "failed" && run.error_message && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Error</p>
            <p className="text-sm text-red-700 font-mono bg-red-50 rounded-lg px-3 py-2">{run.error_message}</p>
          </div>
        )}
      </div>

      {/* Proposals grouped by type */}
      {proposals.length === 0 && run.status === "completed" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No proposals were generated in this run.</p>
        </div>
      )}

      {PROPOSAL_TYPE_ORDER.map((type) => {
        const group = grouped[type];
        if (!group || group.length === 0) return null;

        return (
          <div key={type} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">
                {PROPOSAL_TYPE_LABELS[type]}{" "}
                <span className="text-gray-400 font-normal">({group.length})</span>
              </h2>
            </div>

            <div className="divide-y divide-gray-100">
              {group.map((proposal) => {
                const rs = RUN_STATUS_STYLES[proposal.run_status] ?? RUN_STATUS_STYLES.new;
                const conf = CONFIDENCE_STYLES[proposal.confidence] ?? CONFIDENCE_STYLES.medium;

                return (
                  <div key={proposal.id} className="px-5 py-4">
                    {/* Proposal header */}
                    <div className="flex items-start gap-3 flex-wrap mb-2">
                      <p className="text-sm font-semibold text-gray-900 flex-1 min-w-0">
                        {proposal.title}
                      </p>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${conf}`}>
                          {proposal.confidence} confidence
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${rs.style}`}>
                          {rs.label}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    {proposal.description && (
                      <p className="text-sm text-gray-600 leading-relaxed mb-2">{proposal.description}</p>
                    )}

                    {/* Meta fields */}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mb-2">
                      {proposal.proposed_project && (
                        <span>Project: <span className="text-gray-600">{proposal.proposed_project}</span></span>
                      )}
                      {proposal.proposed_person && (
                        <span>Person: <span className="text-gray-600">{proposal.proposed_person}</span></span>
                      )}
                      {proposal.claim_component && (
                        <span>Component: <span className="text-gray-600">{proposal.claim_component}</span></span>
                      )}
                      {proposal.section_or_area && (
                        <span>Section: <span className="text-gray-600">{proposal.section_or_area}</span></span>
                      )}
                    </div>

                    {/* Reason */}
                    {proposal.reason && (
                      <p className="text-xs text-gray-500 italic mb-2">{proposal.reason}</p>
                    )}

                    {/* Source snippets */}
                    {proposal.ai_suggestion_sources.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {proposal.ai_suggestion_sources.map((src) => (
                          <blockquote
                            key={src.id}
                            className="border-l-2 border-gray-200 pl-3 text-xs text-gray-600 leading-relaxed"
                          >
                            <p className="italic">&ldquo;{src.snippet}&rdquo;</p>
                            {src.relevance_note && (
                              <p className="text-gray-400 mt-0.5 not-italic">{src.relevance_note}</p>
                            )}
                          </blockquote>
                        ))}
                      </div>
                    )}

                    {/* Decision widget — captures optional reason for reject/defer */}
                    <ProposalDecisionWidget
                      proposalId={proposal.id}
                      tenantId={params.tenantId}
                      initialDecision={proposal.decision}
                      initialReason={proposal.decision_reason}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Navigation */}
      <div className="mt-4 flex items-center gap-4 text-sm">
        <Link
          href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/proposals`}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          View All Proposals →
        </Link>
        <Link
          href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/context`}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Context Sources
        </Link>
      </div>
    </div>
  );
}
