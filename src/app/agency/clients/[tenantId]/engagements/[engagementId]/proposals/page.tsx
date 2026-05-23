import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { ProposalDecisionWidget } from "../ai-runs/[runId]/proposal-decision-widget";
import type { AiProposalWithSources, ProposalDecision, ProposalType } from "@/types/database";

interface Props {
  params: { tenantId: string; engagementId: string };
  searchParams: { decision?: string; type?: string };
}

const PROPOSAL_TYPE_OPTIONS: Array<{ value: ProposalType | "all"; label: string }> = [
  { value: "all",              label: "All types" },
  { value: "project",          label: "Projects" },
  { value: "person",           label: "People" },
  { value: "hours",            label: "Hours" },
  { value: "contractor",       label: "Contractors" },
  { value: "material",         label: "Materials" },
  { value: "evidence",         label: "Evidence" },
  { value: "government_support", label: "Gov. Support" },
  { value: "gap",              label: "Gaps" },
];

const DECISION_OPTIONS: Array<{ value: ProposalDecision | "all"; label: string }> = [
  { value: "all",      label: "All decisions" },
  { value: "pending",  label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "deferred", label: "Deferred" },
];

const CONFIDENCE_STYLES: Record<string, string> = {
  high:   "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low:    "bg-gray-100 text-gray-500",
};

const RUN_STATUS_STYLES: Record<string, { label: string; style: string }> = {
  new:               { label: "New",              style: "bg-blue-50 text-blue-700" },
  resurfacing:       { label: "Seen before",      style: "bg-amber-50 text-amber-700" },
  possible_duplicate: { label: "Possible dup.",   style: "bg-orange-50 text-orange-700" },
  confirmed:         { label: "Confirmed",        style: "bg-emerald-50 text-emerald-700" },
  superseded:        { label: "Superseded",       style: "bg-gray-100 text-gray-500" },
};

const DECISION_STYLES: Record<string, string> = {
  pending:  "bg-gray-100 text-gray-500",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  deferred: "bg-amber-50 text-amber-700",
};

export default async function AllProposalsPage({ params, searchParams }: Props) {
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

  // Load engagement
  const { data: rawEng, error: engError } = await supabase
    .from("engagements")
    .select("title")
    .eq("id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (engError || !rawEng) notFound();
  const eng = rawEng as unknown as { title: string };

  const { data: tenantData } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", params.tenantId)
    .single();
  const tenantName = (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  // Read filter params
  const decisionFilter = searchParams.decision ?? "all";
  const typeFilter      = searchParams.type ?? "all";

  // Build query
  let query = supabase
    .from("ai_proposals")
    .select("*, ai_suggestion_sources(snippet, relevance_note, context_source_id)")
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false });

  if (decisionFilter !== "all") {
    query = query.eq("decision", decisionFilter);
  }
  if (typeFilter !== "all") {
    query = query.eq("proposal_type", typeFilter);
  }

  const { data: rawProposals } = await query;
  const proposals = (rawProposals ?? []) as unknown as AiProposalWithSources[];

  // Counts per decision for the filter bar
  const { data: allDecisionRows } = await supabase
    .from("ai_proposals")
    .select("decision")
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId);

  const decisionCounts = (allDecisionRows ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      const r = row as unknown as { decision: string };
      acc[r.decision] = (acc[r.decision] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    },
    {}
  );

  function filterHref(d: string, t: string) {
    const sp = new URLSearchParams();
    if (d !== "all") sp.set("decision", d);
    if (t !== "all") sp.set("type", t);
    const qs = sp.toString();
    return `?${qs}`;
  }

  return (
    <div className="px-6 sm:px-8 py-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}`} className="hover:text-gray-700 transition-colors truncate max-w-[120px]">{tenantName}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`} className="hover:text-gray-700 transition-colors truncate max-w-[180px]">{eng.title}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Proposals</span>
      </nav>

      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">All Proposals</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          AI-generated proposals across all runs for this engagement. Agency-only.
        </p>
      </div>

      {/* Decision filter */}
      <div className="flex flex-wrap gap-2 mb-3">
        {DECISION_OPTIONS.map((opt) => {
          const active = decisionFilter === opt.value;
          const count  = opt.value === "all" ? decisionCounts.all : decisionCounts[opt.value];
          return (
            <Link
              key={opt.value}
              href={filterHref(opt.value, typeFilter)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                active
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {opt.label}
              {count != null && count > 0 && (
                <span className="ml-1 opacity-60">({count})</span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {PROPOSAL_TYPE_OPTIONS.map((opt) => {
          const active = typeFilter === opt.value;
          return (
            <Link
              key={opt.value}
              href={filterHref(decisionFilter, opt.value)}
              className={`rounded-lg px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                active
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Proposal list */}
      {proposals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-12 text-center">
          <p className="text-sm text-gray-400">
            No proposals match the current filters.
            {decisionCounts.all == null || decisionCounts.all === 0 ? (
              <>
                {" "}Run AI analysis from the{" "}
                <Link
                  href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/context`}
                  className="text-teal-600 hover:underline"
                >
                  Context
                </Link>{" "}
                page to generate proposals.
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => {
            const rs   = RUN_STATUS_STYLES[proposal.run_status] ?? RUN_STATUS_STYLES.new;
            const conf = CONFIDENCE_STYLES[proposal.confidence] ?? CONFIDENCE_STYLES.medium;
            const dec  = DECISION_STYLES[proposal.decision] ?? DECISION_STYLES.pending;

            return (
              <div key={proposal.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
                {/* Header row */}
                <div className="flex items-start gap-3 flex-wrap mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                        {proposal.proposal_type}
                      </span>
                      <p className="text-sm font-semibold text-gray-900">{proposal.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${conf}`}>
                      {proposal.confidence}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${rs.style}`}>
                      {rs.label}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${dec}`}>
                      {proposal.decision}
                    </span>
                  </div>
                </div>

                {proposal.description && (
                  <p className="text-sm text-gray-600 leading-relaxed mb-2">{proposal.description}</p>
                )}

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
                </div>

                {proposal.reason && (
                  <p className="text-xs text-gray-500 italic mb-2">{proposal.reason}</p>
                )}

                {/* Snippets */}
                {proposal.ai_suggestion_sources.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {proposal.ai_suggestion_sources.map((src) => (
                      <blockquote key={src.id} className="border-l-2 border-gray-200 pl-3 text-xs text-gray-600 leading-relaxed">
                        <p className="italic">&ldquo;{src.snippet}&rdquo;</p>
                      </blockquote>
                    ))}
                  </div>
                )}

                {/* Run link */}
                <div className="mt-2 mb-0.5">
                  <Link
                    href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/ai-runs/${proposal.run_id}`}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    From run {new Date(proposal.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}
                  </Link>
                </div>

                <ProposalDecisionWidget
                  proposalId={proposal.id}
                  tenantId={params.tenantId}
                  initialDecision={proposal.decision}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
