"use server";

/**
 * Phase 3C — Project Discovery server actions.
 *
 * SECURITY:
 *   - All actions verify agency membership via requireAgencyUser.
 *   - Triple-ownership check (fiscal_year_id + engagement_id + tenant_id) on
 *     every mutation.
 *   - ANTHROPIC_API_KEY accessed only via createAnthropicClient() inside the
 *     background processor (run-discovery.ts) — never logged, stored, or passed
 *     to client code.
 *   - All discovery data is agency-internal. No client-visible output.
 *
 * AI DRAFT IMMUTABILITY:
 *   - *_ai_draft fields are written once by the background processor and never updated.
 *   - *_edited fields are written by updateProjectLineContent and start as null.
 *
 * BACKGROUND PROCESSING (Option A — in-process fire-and-forget):
 *   triggerDiscovery inserts the run as "pending" then fires a floating promise
 *   via `void processDiscoveryRun(params).catch(console.error)` before redirecting.
 *   The actual Anthropic call, project inserts, and run completion happen in
 *   src/lib/ai/run-discovery.ts running in the background.
 *   See run-discovery.ts for the full architecture note and migration path.
 *
 * ACTIONS:
 *   triggerDiscovery         — validate → queue run → fire background processor → redirect
 *   updateProjectLineContent — Bloom edits a T661 line for a project
 *   updateProjectDecision    — Bloom accepts / rejects / defers a project
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getModel } from "@/lib/ai/anthropic";
import {
  DISCOVERY_PROMPT_VERSION_STRING,
  generateFiscalYearMonths,
} from "@/lib/ai/discovery-prompt";
import {
  processDiscoveryRun,
} from "@/lib/ai/run-discovery";
import { requireAgencyUser } from "../../phase3-actions";
import type { SredProjectDecision } from "@/types/database";

// ── Triple-ownership verification ─────────────────────────────────────────

async function verifyFYOwnership(
  fiscalYearId: string,
  engagementId: string,
  tenantId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ label: string; start_date: string; end_date: string } | null> {
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("label, start_date, end_date")
    .eq("id", fiscalYearId)
    .eq("engagement_id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) return null;
  return data as unknown as { label: string; start_date: string; end_date: string };
}

// ─────────────────────────────────────────────────────────────────────────
// triggerDiscovery
//
// Validates inputs, queues the discovery run, fires the background processor,
// and redirects immediately. The actual Anthropic call and project inserts
// happen in src/lib/ai/run-discovery.ts.
//
// Flow:
//  1. Verify ownership + load fiscal year dates
//  2. Load AI-ready documents (ai_text NOT NULL, status != archived)
//  3. Load active context sources
//  4. Require at least one input
//  5. Load engagement title
//  6. Generate fiscal year months
//  7. Insert discovery_run row (status = 'pending', total_document_count set)
//  8. Fire background processor (floating promise — does NOT block the redirect)
//  9. redirect() to run detail page — OUTSIDE any try/catch
// ─────────────────────────────────────────────────────────────────────────

export async function triggerDiscovery(
  fiscalYearId: string,
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  // ── 1. Ownership + fiscal year dates ────────────────────────────────────
  const fy = await verifyFYOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!fy) return { error: "Claim year not found or access denied." };

  // ── 2. Load AI-ready documents ───────────────────────────────────────────
  const { data: rawDocs, error: docsError } = await supabase
    .from("documents")
    .select("id, title, document_type, ai_text")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .not("ai_text", "is", null)
    .order("created_at", { ascending: true });

  if (docsError)
    return { error: `Failed to load documents: ${docsError.message}` };

  const documents = (rawDocs ?? []) as Array<{
    id: string;
    title: string;
    document_type: string;
    ai_text: string;
  }>;

  // ── 3. Load active context sources ──────────────────────────────────────
  const { data: rawSources, error: sourcesError } = await supabase
    .from("context_sources")
    .select("id, title, source_type, body")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (sourcesError)
    return { error: `Failed to load context sources: ${sourcesError.message}` };

  const contextSources = (rawSources ?? []) as Array<{
    id: string;
    title: string;
    source_type: string;
    body: string;
  }>;

  // ── 4. Require at least one input ────────────────────────────────────────
  if (documents.length === 0 && contextSources.length === 0) {
    return {
      error:
        "No AI-ready documents or active context sources found. " +
        "Add at least one document with AI text or one context source before running Project Discovery.",
    };
  }

  // ── 5. Load engagement title ─────────────────────────────────────────────
  const { data: rawEng } = await supabase
    .from("engagements")
    .select("title")
    .eq("id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  const engTitle =
    (rawEng as unknown as { title: string } | null)?.title ?? "Engagement";

  // ── 6. Generate fiscal year months ───────────────────────────────────────
  const fiscalYearMonths = generateFiscalYearMonths(fy.start_date, fy.end_date);

  // ── 7. Insert discovery_run row (status = pending) ───────────────────────
  const model = getModel();

  const { data: runRow, error: runInsertError } = await supabase
    .from("discovery_runs")
    .insert({
      fiscal_year_id:       fiscalYearId,
      engagement_id:        engagementId,
      tenant_id:            tenantId,
      triggered_by:         user.id,
      document_ids:         documents.map((d) => d.id),
      context_source_ids:   contextSources.map((s) => s.id),
      model,
      prompt_version:       DISCOVERY_PROMPT_VERSION_STRING,
      status:               "pending",
      total_document_count: documents.length,
    } as unknown as never)
    .select("id")
    .single();

  if (runInsertError || !runRow)
    return { error: `Failed to create discovery run record: ${runInsertError?.message}` };

  const runId = (runRow as unknown as { id: string }).id;

  // ── 8. Fire background processor (non-blocking) ──────────────────────────
  // The floating promise runs in the Railway Node.js event loop after this
  // server action returns. It marks the run running, calls Anthropic, inserts
  // projects, and marks the run completed/failed.
  //
  // KNOWN LIMITATION: if the process restarts mid-run, the row stays "running".
  // See src/lib/ai/run-discovery.ts for the recovery SQL and migration path.
  void processDiscoveryRun({
    runId,
    fiscalYearId,
    engagementId,
    tenantId,
    engTitle,
    fiscalYearLabel:  fy.label,
    fiscalYearMonths,
    model,
    documents,
    contextSources,
  }).catch((err) => {
    console.error("[discovery-actions] Unhandled error in background processor:", err);
  });

  // ── 9. redirect() — OUTSIDE any try/catch, NEXT_REDIRECT must not be caught
  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/discovery/${runId}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// updateProjectLineContent
//
// Bloom edits a T661 line for a specific SR&ED project.
// Reads line name from formData ("line_242" | "line_244" | "line_246" | "section_c_hints").
// Writes to the corresponding *_edited field.
// Never touches *_ai_draft fields.
// ─────────────────────────────────────────────────────────────────────────

export async function updateProjectLineContent(
  formData: FormData
): Promise<{ error?: string }> {
  const projectId    = formData.get("projectId")    as string;
  const tenantId     = formData.get("tenantId")     as string;
  const engagementId = formData.get("engagementId") as string;
  const fiscalYearId = formData.get("fiscalYearId") as string;
  const runId        = formData.get("runId")        as string;
  const line         = formData.get("line")         as string;
  const contentJson  = formData.get("content")      as string;

  if (!projectId || !tenantId || !engagementId || !fiscalYearId || !runId || !line)
    return { error: "Missing required fields." };

  const VALID_LINES = ["line_242", "line_244", "line_246", "section_c_hints"];
  if (!VALID_LINES.includes(line))
    return { error: "Invalid line name." };

  // Parse content
  let content: unknown;
  try {
    content = JSON.parse(contentJson);
  } catch {
    return { error: "Invalid content format." };
  }

  const { supabase } = await requireAgencyUser(tenantId);

  const fy = await verifyFYOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!fy) return { error: "Access denied." };

  // Verify project belongs to this run + fiscal year + tenant
  const { data: projectRow, error: projError } = await supabase
    .from("sred_projects")
    .select("id")
    .eq("id", projectId)
    .eq("run_id", runId)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId)
    .single();

  if (projError || !projectRow)
    return { error: "Project not found or access denied." };

  // Map line to the edited column name
  const columnMap: Record<string, string> = {
    line_242:      "line_242_edited",
    line_244:      "line_244_edited",
    line_246:      "line_246_edited",
    section_c_hints: "section_c_hints_edited",
  };
  const column = columnMap[line];

  const { error: updateError } = await supabase
    .from("sred_projects")
    .update({ [column]: content } as unknown as never)
    .eq("id", projectId)
    .eq("tenant_id", tenantId);

  if (updateError)
    return { error: `Failed to save edits: ${updateError.message}` };

  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/discovery/${runId}/${projectId}`
  );
  return {};
}

// ─────────────────────────────────────────────────────────────────────────
// updateProjectDecision
//
// Bloom marks a project as accepted / rejected / deferred, or reverts to pending.
// Records reviewer identity and timestamp.
// ─────────────────────────────────────────────────────────────────────────

export async function updateProjectDecision(
  projectId: string,
  decision: SredProjectDecision,
  tenantId: string,
  engagementId: string,
  fiscalYearId: string,
  runId: string,
  decisionReason: string | null = null
): Promise<{ error?: string }> {
  const VALID: SredProjectDecision[] = ["pending", "accepted", "rejected", "deferred"];
  if (!VALID.includes(decision)) return { error: "Invalid decision value." };

  const { supabase, user } = await requireAgencyUser(tenantId);

  const fy = await verifyFYOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!fy) return { error: "Access denied." };

  const { error: updateError } = await supabase
    .from("sred_projects")
    .update({
      decision,
      decision_reason: decision === "pending" ? null : (decisionReason?.trim() || null),
      reviewed_by:     user.id,
      reviewed_at:     new Date().toISOString(),
    } as unknown as never)
    .eq("id", projectId)
    .eq("run_id", runId)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId);

  if (updateError)
    return { error: `Failed to update project decision: ${updateError.message}` };

  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/discovery/${runId}/${projectId}`
  );
  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/discovery/${runId}`
  );
  return {};
}
