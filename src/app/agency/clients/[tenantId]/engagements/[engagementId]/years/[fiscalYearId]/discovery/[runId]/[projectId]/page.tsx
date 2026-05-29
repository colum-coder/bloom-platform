import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import type {
  SredProject,
  HypothesisData,
  ProjectDocumentRelationship,
  Document,
} from "@/types/database";
import { LineEditForm }  from "./line-edit-form";
import { DecisionForm }  from "./decision-form";

interface Props {
  params: {
    tenantId: string;
    engagementId: string;
    fiscalYearId: string;
    runId: string;
    projectId: string;
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

const CONFIDENCE_STYLES: Record<string, string> = {
  // v4 likelihood tiers
  likely:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  plausible:"bg-blue-50 text-blue-700 border border-blue-200",
  unlikely: "bg-gray-100 text-gray-500 border border-gray-200",
  // v3 confidence fallback
  high:     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medium:   "bg-amber-50 text-amber-700 border border-amber-200",
  low:      "bg-red-50 text-red-600 border border-red-200",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  // v4 likelihood tiers
  likely:   "Likely SR&ED",
  plausible:"Plausible SR&ED",
  unlikely: "Unlikely SR&ED",
  // v3 confidence fallback
  high:     "High confidence",
  medium:   "Medium confidence",
  low:      "Low confidence",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  // v4 evidence roles
  primary_evidence:      "Primary Evidence",
  supporting_evidence:   "Supporting Evidence",
  context:               "Context / Background",
  contradictory_evidence:"Contradicts Hypothesis",
  evidence_gap:          "Evidence Gap",
  // v3 backward compat
  financial_record:      "Financial Record",
  personnel_record:      "Personnel Record",
  prior_art:             "Prior Art",
};

const RELATIONSHIP_ROLE_STYLES: Record<string, string> = {
  primary_evidence:      "bg-emerald-50 text-emerald-700",
  supporting_evidence:   "bg-blue-50 text-blue-700",
  context:               "bg-gray-100 text-gray-600",
  contradictory_evidence:"bg-red-50 text-red-600",
  evidence_gap:          "bg-amber-50 text-amber-700",
  financial_record:      "bg-purple-50 text-purple-600",
  personnel_record:      "bg-purple-50 text-purple-600",
  prior_art:             "bg-gray-100 text-gray-600",
};

const SUPPORTS_LINE_LABELS: Record<string, string> = {
  line_242: "Line 242",
  line_244: "Line 244",
  line_246: "Line 246",
  section_c:"Section C",
  multiple: "Multiple lines",
};

export default async function ProjectDetailPage({ params }: Props) {
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

  // Load project — all ownership anchors in the query
  const { data: rawProject, error: projError } = await supabase
    .from("sred_projects")
    .select(
      `id, project_name, likelihood, confidence, decision, decision_reason, reviewed_at,
       hypothesis_data,
       line_242_ai_draft, line_244_ai_draft, line_246_ai_draft, section_c_hints_ai_draft,
       line_242_edited, line_244_edited, line_246_edited, section_c_hints_edited,
       created_at, updated_at`
    )
    .eq("id", params.projectId)
    .eq("run_id", params.runId)
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (projError || !rawProject) notFound();
  const project = rawProject as unknown as SredProject;

  // Load document relationships with document titles
  const { data: rawRels } = await supabase
    .from("project_document_relationships")
    .select(`
      id, relationship_type, supports_line, supports_section, relevance_note,
      document:documents(id, title, document_type)
    `)
    .eq("project_id", params.projectId)
    .eq("tenant_id", params.tenantId);

  type RelWithDoc = ProjectDocumentRelationship & {
    document: Pick<Document, "id" | "title" | "document_type"> | null;
  };
  const relationships = (rawRels ?? []) as unknown as RelWithDoc[];

  // Breadcrumb context
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

  const base    = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;
  const runBase = `${base}/discovery/${params.runId}`;
  const yearBase = base;

  // v4 hypothesis data
  const hyp  = project.hypothesis_data as HypothesisData | null;
  const tier = project.likelihood ?? (
    project.confidence === "high"   ? "likely"   :
    project.confidence === "medium" ? "plausible" :
    project.confidence === "low"    ? "unlikely"  : null
  );
  const tierKey = tier ?? "";

  return (
    <div className="px-6 sm:px-8 py-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}`} className="hover:text-gray-700 transition-colors truncate max-w-[80px]">{tenantName}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`} className="hover:text-gray-700 transition-colors truncate max-w-[120px]">{engTitle}</Link>
        <span>/</span>
        <Link href={base} className="hover:text-gray-700 transition-colors">{fyLabel}</Link>
        <span>/</span>
        <Link href={`${base}/discovery`} className="hover:text-gray-700 transition-colors">Discovery</Link>
        <span>/</span>
        <Link href={runBase} className="hover:text-gray-700 transition-colors">Run</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium truncate max-w-[160px]">{project.project_name}</span>
      </nav>

      {/* ── Project header card ─────────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5"
        style={{ borderLeftWidth: 3, borderLeftColor: "#2B307E" }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">{project.project_name}</h1>
            <p className="text-xs text-gray-400 mt-1">SR&amp;ED Project · T661 Part 2</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {tierKey && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                CONFIDENCE_STYLES[tierKey] ?? ""
              }`}>
                {CONFIDENCE_LABELS[tierKey] ?? tierKey}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
              DECISION_STYLES[project.decision] ?? "bg-gray-100 text-gray-500"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {DECISION_LABELS[project.decision] ?? project.decision}
            </span>
          </div>
        </div>

        {/* Decision controls */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Bloom Review Decision
          </p>
          <DecisionForm
            projectId={params.projectId}
            runId={params.runId}
            tenantId={params.tenantId}
            engagementId={params.engagementId}
            fiscalYearId={params.fiscalYearId}
            currentDecision={project.decision}
          />
          {project.decision_reason && (
            <p className="mt-2 text-xs text-gray-500 italic">{project.decision_reason}</p>
          )}
        </div>
      </div>

      {/* ── Hypothesis assessment (v4 runs) ───────────────────────────────── */}
      {hyp && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            SR&amp;ED Assessment
          </h2>

          {(
            [
              { label: "Observed Activity",                      value: hyp.observed_activity },
              { label: "Potential Technological Uncertainty",    value: hyp.potential_technological_uncertainty },
              { label: "Hypothesis / Advancement Sought",        value: hyp.hypothesis_or_advancement_sought },
              { label: "Systematic Investigation",               value: hyp.systematic_investigation_summary },
              { label: "Potential Advancement",                  value: hyp.potential_advancement },
            ] as const
          ).filter(({ value }) => value?.trim()).map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
              <p className="text-sm text-gray-800 leading-relaxed">{value}</p>
            </div>
          ))}

          {hyp.why_this_rating && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Why this rating</p>
              <p className="text-sm text-gray-700 leading-relaxed">{hyp.why_this_rating}</p>
            </div>
          )}

          {hyp.missing_evidence.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Missing Evidence</p>
              <ul className="space-y-1.5">
                {hyp.missing_evidence.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-amber-500 flex-shrink-0 mt-0.5">○</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hyp.consultant_questions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-2">Questions to Ask the Client</p>
              <ol className="space-y-2">
                {hyp.consultant_questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-5 text-right text-indigo-400 font-semibold">{i + 1}.</span>
                    <span className="leading-relaxed">{q}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* ── Line 242 card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="mb-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">
            T661 Part 2 · Line 242
          </p>
          <p className="text-xs text-gray-500">
            Scientific or technological uncertainty
          </p>
        </div>
        <div className="mt-4">
          <LineEditForm
            projectId={params.projectId}
            runId={params.runId}
            tenantId={params.tenantId}
            engagementId={params.engagementId}
            fiscalYearId={params.fiscalYearId}
            line="line_242"
            lineLabel="Scientific or technological uncertainty"
            aiDraft={project.line_242_ai_draft}
            edited={project.line_242_edited}
          />
        </div>
      </div>

      {/* ── Line 246 card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="mb-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">
            T661 Part 2 · Line 246
          </p>
          <p className="text-xs text-gray-500">
            Advancement achieved or attempted
          </p>
        </div>
        <div className="mt-4">
          <LineEditForm
            projectId={params.projectId}
            runId={params.runId}
            tenantId={params.tenantId}
            engagementId={params.engagementId}
            fiscalYearId={params.fiscalYearId}
            line="line_246"
            lineLabel="Advancement achieved or attempted"
            aiDraft={project.line_246_ai_draft}
            edited={project.line_246_edited}
          />
        </div>
      </div>

      {/* ── Line 244 card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="mb-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">
            T661 Part 2 · Line 244
          </p>
          <p className="text-xs text-gray-500">
            Work performed in the tax year
          </p>
        </div>
        <div className="mt-4">
          <LineEditForm
            projectId={params.projectId}
            runId={params.runId}
            tenantId={params.tenantId}
            engagementId={params.engagementId}
            fiscalYearId={params.fiscalYearId}
            line="line_244"
            lineLabel="Work performed in the tax year"
            aiDraft={project.line_244_ai_draft}
            edited={project.line_244_edited}
          />
        </div>
      </div>

      {/* ── Section C hints card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="mb-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-0.5">
            Section C hints
          </p>
          <p className="text-xs text-gray-500">
            Evidence gaps and recommendations for strengthening the Technical Report
          </p>
        </div>
        <div className="mt-4">
          <LineEditForm
            projectId={params.projectId}
            runId={params.runId}
            tenantId={params.tenantId}
            engagementId={params.engagementId}
            fiscalYearId={params.fiscalYearId}
            line="section_c_hints"
            lineLabel="Section C hints"
            aiDraft={project.section_c_hints_ai_draft}
            edited={project.section_c_hints_edited}
          />
        </div>
      </div>

      {/* ── Evidence map / document relationships ────────────────────────── */}
      {relationships.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Evidence Map{" "}
              <span className="text-gray-400 font-normal">({relationships.length} document{relationships.length !== 1 ? "s" : ""})</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Documents identified as relevant to this hypothesis during discovery
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {relationships.map((rel) => (
              <div key={rel.id} className="px-5 py-3.5">
                <div className="flex items-start gap-3 flex-wrap mb-1">
                  <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${
                    RELATIONSHIP_ROLE_STYLES[rel.relationship_type] ?? "bg-gray-100 text-gray-600"
                  }`}>
                    {RELATIONSHIP_LABELS[rel.relationship_type] ?? rel.relationship_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    {rel.document ? (
                      <Link
                        href={`${yearBase}/documents/${rel.document.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                      >
                        {rel.document.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Document not found</span>
                    )}
                  </div>
                </div>
                {rel.relevance_note && (
                  <p className="text-xs text-gray-500 leading-relaxed ml-0 mt-1">{rel.relevance_note}</p>
                )}
                {/* Cited passages — stored as JSON in supports_section by v4 processor */}
                {rel.supports_section && (() => {
                  try {
                    const passages = JSON.parse(rel.supports_section) as string[];
                    if (Array.isArray(passages) && passages.length > 0) {
                      return (
                        <div className="mt-2 space-y-1 ml-0">
                          {passages.slice(0, 3).map((p, pi) => (
                            <p key={pi} className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2 leading-relaxed">
                              &ldquo;{p.slice(0, 200)}{p.length > 200 ? "…" : ""}&rdquo;
                            </p>
                          ))}
                        </div>
                      );
                    }
                  } catch {
                    // Not JSON — old-style supports_section text
                    if (rel.supports_section.trim()) {
                      return <p className="text-xs text-gray-400 mt-1">{rel.supports_section}</p>;
                    }
                  }
                  return null;
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4 text-sm pt-2">
        <Link href={runBase} className="text-gray-400 hover:text-gray-900 transition-colors">
          ← Back to Run
        </Link>
        <Link href={`${base}/discovery`} className="text-gray-400 hover:text-gray-900 transition-colors">
          All Runs
        </Link>
      </div>
    </div>
  );
}
