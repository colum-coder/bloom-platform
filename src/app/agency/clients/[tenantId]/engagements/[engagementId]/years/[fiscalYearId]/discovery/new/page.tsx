import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { RunTriggerForm } from "./run-trigger-form";

interface Props {
  params: { tenantId: string; engagementId: string; fiscalYearId: string };
}

export default async function RunDiscoveryPage({ params }: Props) {
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

  // ── Load inputs + last run in parallel ────────────────────────────────────
  // Fetch full doc data (not just count) so we can compute:
  //   - documentCount
  //   - totalAiTextChars
  //   - lowQualityDocCount
  //   - newDocCount / updatedDocCount since last run
  type AiReadyDoc = { id: string; ai_text: string; updated_at: string };
  type SourceId   = { id: string };
  type LastRun    = { id: string; created_at: string; document_ids: string[]; context_source_ids: string[] };

  const [
    { data: aiReadyDocsRaw },
    { data: contextSourcesRaw },
    { data: lastRunRaw },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id, ai_text, updated_at")
      .eq("fiscal_year_id", params.fiscalYearId)
      .eq("tenant_id", params.tenantId)
      .neq("status", "archived")
      .not("ai_text", "is", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("context_sources")
      .select("id")
      .eq("fiscal_year_id", params.fiscalYearId)
      .eq("tenant_id", params.tenantId)
      .eq("status", "active"),
    supabase
      .from("discovery_runs")
      .select("id, created_at, document_ids, context_source_ids")
      .eq("fiscal_year_id", params.fiscalYearId)
      .eq("tenant_id", params.tenantId)
      .in("status", ["completed", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const aiReadyDocList   = (aiReadyDocsRaw   ?? []) as AiReadyDoc[];
  const contextSourceList = (contextSourcesRaw ?? []) as SourceId[];
  const lastRun          = lastRunRaw as unknown as LastRun | null;

  const documentCount      = aiReadyDocList.length;
  const contextSourceCount = contextSourceList.length;
  const lowQualityDocCount = aiReadyDocList.filter((d) => d.ai_text.length < 500).length;
  const totalAiTextChars   = aiReadyDocList.reduce((sum, d) => sum + d.ai_text.length, 0);

  // ── What changed since last run ─────────────────────────────────────────────
  let newDocCount     = 0;
  let updatedDocCount = 0;
  let newSourceCount  = 0;
  let nothingChanged  = false;

  if (lastRun) {
    const lastDocIds    = new Set(lastRun.document_ids);
    const lastSourceIds = new Set(lastRun.context_source_ids);

    newDocCount = aiReadyDocList.filter((d) => !lastDocIds.has(d.id)).length;

    // A doc "updated AI text" if it was in the last run AND its updated_at is
    // strictly after the run was created (i.e. ai_text changed after the run queued).
    updatedDocCount = aiReadyDocList.filter(
      (d) => lastDocIds.has(d.id) && d.updated_at > lastRun.created_at
    ).length;

    newSourceCount = contextSourceList.filter((s) => !lastSourceIds.has(s.id)).length;

    nothingChanged =
      newDocCount     === 0 &&
      updatedDocCount === 0 &&
      newSourceCount  === 0;
  }

  const base = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-2xl mx-auto">
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
        <Link href={`${base}/discovery`} className="hover:text-gray-700 transition-colors">Project Discovery</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Run</span>
      </nav>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Run Project Discovery</h1>
        <p className="text-sm text-gray-400 mb-6">
          Claude will read all AI-ready documents and active context sources for{" "}
          <strong className="text-gray-700">{fy.label}</strong> and produce draft T661 Part 2 content.
        </p>

        <RunTriggerForm
          fiscalYearId={params.fiscalYearId}
          engagementId={params.engagementId}
          tenantId={params.tenantId}
          documentCount={documentCount}
          contextSourceCount={contextSourceCount}
          lowQualityDocCount={lowQualityDocCount}
          totalAiTextChars={totalAiTextChars}
          lastRunId={lastRun?.id ?? null}
          newDocCount={newDocCount}
          updatedDocCount={updatedDocCount}
          newSourceCount={newSourceCount}
          nothingChanged={nothingChanged}
        />
      </div>

      <div className="mt-4 text-sm">
        <Link href={`${base}/discovery`} className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Back to Project Discovery
        </Link>
      </div>
    </div>
  );
}
