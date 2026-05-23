import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { archiveContextSource } from "../year-actions";
import { TriggerAiRunButton } from "./trigger-run-button";
import type { ContextSource } from "@/types/database";
import { SOURCE_TYPE_LABELS } from "@/lib/ai/sred-prompt";

interface Props {
  params: { tenantId: string; engagementId: string; fiscalYearId: string };
}

export default async function ContextSourcesPage({ params }: Props) {
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
    .select("label")
    .eq("id", params.fiscalYearId)
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (fyError || !rawFy) notFound();
  const fy = rawFy as unknown as { label: string };

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

  // Load active context sources for this fiscal year
  const { data: rawSources } = await supabase
    .from("context_sources")
    .select("*")
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const sources = (rawSources ?? []) as unknown as ContextSource[];

  // Load AI run count for this fiscal year
  const { count: runCount } = await supabase
    .from("ai_suggestion_runs")
    .select("*", { count: "exact", head: true })
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("tenant_id", params.tenantId);

  const yearBase = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}`} className="hover:text-gray-700 transition-colors truncate max-w-[100px]">{tenantName}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`} className="hover:text-gray-700 transition-colors truncate max-w-[140px]">{engTitle}</Link>
        <span>/</span>
        <Link href={yearBase} className="hover:text-gray-700 transition-colors">{fy.label}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Context</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Context Sources</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Source material for the <span className="text-gray-600 font-medium">{fy.label}</span> claim year. Agency-only.
          </p>
        </div>
        <Link
          href={`${yearBase}/context/new`}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity flex-shrink-0"
          style={{ backgroundColor: "#03CEA4" }}
        >
          + Add Source
        </Link>
      </div>

      {/* AI run trigger */}
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5"
        style={{ borderLeftWidth: 3, borderLeftColor: "#2B307E" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <span style={{ color: "#2B307E" }} className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">AI Analysis</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Analyses all active sources and proposes SR&amp;ED projects, people, evidence, and gaps.
              {runCount != null && runCount > 0 && (
                <> &middot;{" "}
                  <Link
                    href={`${yearBase}/ai-runs`}
                    className="text-gray-600 hover:underline"
                  >
                    {runCount} run{runCount === 1 ? "" : "s"} so far
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <TriggerAiRunButton
          fiscalYearId={params.fiscalYearId}
          engagementId={params.engagementId}
          tenantId={params.tenantId}
          sourceCount={sources.length}
        />
      </div>

      {/* Source list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Active Sources{" "}
            <span className="text-gray-400 font-normal ml-1">({sources.length})</span>
          </h2>
        </div>

        {sources.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-500 mb-1">No context sources yet.</p>
            <p className="text-xs text-gray-400">
              Add source material to enable AI analysis.{" "}
              <Link href={`${yearBase}/context/new`} className="text-teal-600 hover:underline">
                Add the first one
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sources.map((src) => (
              <div key={src.id} className="flex items-start gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{src.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 mr-2">
                      {SOURCE_TYPE_LABELS[src.source_type] ?? src.source_type}
                    </span>
                    {src.file_name && (
                      <span className="mr-2 font-mono">{src.file_name}</span>
                    )}
                    {new Date(src.created_at).toLocaleDateString("en-CA", {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                    {src.body.slice(0, 160)}{src.body.length > 160 ? "…" : ""}
                  </p>
                </div>

                {/* Archive — stays on page via revalidatePath */}
                <form action={archiveContextSource} className="flex-shrink-0">
                  <input type="hidden" name="id"           value={src.id} />
                  <input type="hidden" name="tenantId"     value={params.tenantId} />
                  <input type="hidden" name="engagementId" value={params.engagementId} />
                  <input type="hidden" name="fiscalYearId" value={params.fiscalYearId} />
                  <button
                    type="submit"
                    className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:bg-gray-50 transition-colors"
                    title="Archive this source — it will no longer be included in new AI runs"
                  >
                    Archive
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center gap-4 text-sm">
        <Link href={`${yearBase}/ai-runs`} className="text-gray-500 hover:text-gray-900 transition-colors">
          View AI Runs →
        </Link>
        <Link href={`${yearBase}/proposals`} className="text-gray-500 hover:text-gray-900 transition-colors">
          View All Proposals →
        </Link>
      </div>
    </div>
  );
}
