import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import type {
  SredProject,
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

const RELATIONSHIP_LABELS: Record<string, string> = {
  primary_evidence:   "Primary Evidence",
  supporting_evidence:"Supporting Evidence",
  financial_record:   "Financial Record",
  personnel_record:   "Personnel Record",
  prior_art:          "Prior Art",
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
      `id, project_name, decision, decision_reason, reviewed_at,
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

  const base = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;
  const runBase = `${base}/discovery/${params.runId}`;
  const yearBase = base;

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
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold flex-shrink-0 ${
            DECISION_STYLES[project.decision] ?? "bg-gray-100 text-gray-500"
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {DECISION_LABELS[project.decision] ?? project.decision}
          </span>
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

      {/* ── Document relationships card ───────────────────────────────────── */}
      {relationships.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Supporting Documents{" "}
              <span className="text-gray-400 font-normal">({relationships.length})</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Documents identified as relevant to this project during discovery
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {relationships.map((rel) => (
              <div key={rel.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
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
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {rel.supports_line && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 font-medium">
                        {SUPPORTS_LINE_LABELS[rel.supports_line] ?? rel.supports_line}
                      </span>
                    )}
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                      {RELATIONSHIP_LABELS[rel.relationship_type] ?? rel.relationship_type}
                    </span>
                  </div>
                </div>
                {rel.supports_section && (
                  <p className="text-xs text-gray-500 mb-0.5">{rel.supports_section}</p>
                )}
                {rel.relevance_note && (
                  <p className="text-xs text-gray-400 italic">{rel.relevance_note}</p>
                )}
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
