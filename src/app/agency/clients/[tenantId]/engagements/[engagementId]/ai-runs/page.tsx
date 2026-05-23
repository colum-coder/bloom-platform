import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { AiSuggestionRun } from "@/types/database";

interface Props {
  params: { tenantId: string; engagementId: string };
}

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-gray-100 text-gray-500",
  running:   "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed:    "bg-red-50 text-red-700",
};

export default async function AiRunsPage({ params }: Props) {
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

  // Load runs
  const { data: rawRuns } = await supabase
    .from("ai_suggestion_runs")
    .select("*")
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false });

  const runs = (rawRuns ?? []) as unknown as AiSuggestionRun[];

  // Load proposal counts per run
  const runIds = runs.map((r) => r.id);
  const { data: proposalCounts } = runIds.length > 0
    ? await supabase
        .from("ai_proposals")
        .select("run_id")
        .in("run_id", runIds)
    : { data: [] as Array<{ run_id: string }> };

  const countMap = (proposalCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    const r = row as unknown as { run_id: string };
    acc[r.run_id] = (acc[r.run_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="px-6 sm:px-8 py-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}`} className="hover:text-gray-700 transition-colors truncate max-w-[120px]">{tenantName}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`} className="hover:text-gray-700 transition-colors truncate max-w-[180px]">{eng.title}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">AI Runs</span>
      </nav>

      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">AI Analysis Runs</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Each run analyses context sources and proposes SR&ED items. Agency-only.
          </p>
        </div>
        <Link
          href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/context`}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity flex-shrink-0"
          style={{ backgroundColor: "#03CEA4" }}
        >
          + New Run
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {runs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-500 mb-1">No AI runs yet.</p>
            <p className="text-xs text-gray-400">
              Add context sources and trigger the first run from the{" "}
              <Link
                href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/context`}
                className="text-teal-600 hover:underline"
              >
                Context
              </Link>{" "}
              page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Model</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Sources</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Proposals</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/ai-runs/${run.id}`}
                        className="font-medium text-gray-900 hover:text-teal-700 transition-colors"
                      >
                        {new Date(run.created_at).toLocaleDateString("en-CA", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(run.created_at).toLocaleTimeString("en-CA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[run.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs font-mono hidden sm:table-cell">
                      {run.model}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {run.context_source_ids.length}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {run.status === "completed"
                        ? countMap[run.id] ?? 0
                        : run.status === "failed"
                        ? <span className="text-gray-400">—</span>
                        : <span className="text-gray-400 italic text-xs">pending</span>}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        {run.truncation_warning && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                            Truncated
                          </span>
                        )}
                        {run.status === "failed" && run.error_message && (
                          <span className="text-xs text-red-500 truncate max-w-[180px]" title={run.error_message}>
                            {run.error_message.slice(0, 60)}{run.error_message.length > 60 ? "…" : ""}
                          </span>
                        )}
                        {!run.truncation_warning && run.status !== "failed" && (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
