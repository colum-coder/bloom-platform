"use server";

/**
 * Per-fiscal-year server actions — context sources, AI runs, proposals.
 *
 * All mutating functions verify that fiscalYearId, engagementId, and
 * tenantId are mutually consistent (triple-ownership check via
 * verifyFiscalYearOwnership) before operating.
 *
 * SECURITY:
 *   - ANTHROPIC_API_KEY is accessed only via createAnthropicClient() in
 *     @/lib/ai/anthropic. Never referenced here directly.
 *   - All AI output tables are agency-only. No path here returns
 *     AI data to a client user.
 *   - context_sources always default to client_visible=false in Phase 3A.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAnthropicClient, getModel } from "@/lib/ai/anthropic";
import {
  SRED_SYSTEM_PROMPT,
  SUBMIT_PROPOSALS_TOOL,
  PROMPT_VERSION_STRING,
  buildUserMessage,
} from "@/lib/ai/sred-prompt";
import { repairTruncatedJson } from "@/lib/ai/repair-json";
import { requireAgencyUser } from "../../phase3-actions";
import type {
  ContextSourceType,
  ProposalDecision,
  ProposalType,
  ProposalRunStatus,
} from "@/types/database";

// ── Triple-ownership verification ─────────────────────────────────────────
// Confirms that the fiscal year belongs to this engagement AND tenant.
// Returns the fiscal year row or null on failure.

async function verifyFiscalYearOwnership(
  fiscalYearId: string,
  engagementId: string,
  tenantId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ label: string } | null> {
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("label, engagement_id, tenant_id")
    .eq("id", fiscalYearId)
    .eq("engagement_id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) return null;
  return data as unknown as { label: string };
}

// ── Allowed source types (mirrors DB check constraint) ────────────────────

const ALLOWED_SOURCE_TYPES: ContextSourceType[] = [
  "prior_claim",
  "meeting_notes",
  "project_discussion",
  "staff_note",
  "client_background",
  "discovery_call_note",
  "email_thread",
  "technical_narrative",
  "technical_document_summary",
  "financial_summary",
  "payroll_export",
  "contractor_invoice",
  "cra_review_context",
  "other",
];

// ─────────────────────────────────────────────────────────────────────────
// addContextSource
// ─────────────────────────────────────────────────────────────────────────

export async function addContextSource(
  formData: FormData,
  fiscalYearId: string,
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  const fy = await verifyFiscalYearOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!fy) return { error: "Claim year not found or access denied." };

  const title       = (formData.get("title") as string ?? "").trim();
  const source_type = (formData.get("source_type") as string ?? "").trim() as ContextSourceType;
  const body        = (formData.get("body") as string ?? "").trim();
  const file_name   = (formData.get("file_name") as string ?? "").trim() || null;

  if (!title) return { error: "Title is required." };
  if (!body)  return { error: "Content is required." };
  if (!ALLOWED_SOURCE_TYPES.includes(source_type))
    return { error: "Invalid source type." };

  const { error: insertError } = await supabase
    .from("context_sources")
    .insert({
      fiscal_year_id: fiscalYearId,
      engagement_id:  engagementId,
      tenant_id:      tenantId,
      source_type,
      title,
      body,
      file_name,
      client_visible: false,
      status:         "active",
      uploaded_by:    user.id,
    } as unknown as never);

  if (insertError) {
    if (insertError.code === "42501")
      return { error: "You do not have permission to add context sources." };
    return { error: `Failed to add context source: ${insertError.message}` };
  }

  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/context`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// updateContextSource
// ─────────────────────────────────────────────────────────────────────────

export async function updateContextSource(
  id: string,
  formData: FormData,
  fiscalYearId: string,
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase } = await requireAgencyUser(tenantId);

  const fy = await verifyFiscalYearOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!fy) return { error: "Claim year not found or access denied." };

  const title       = (formData.get("title") as string ?? "").trim();
  const source_type = (formData.get("source_type") as string ?? "").trim() as ContextSourceType;
  const body        = (formData.get("body") as string ?? "").trim();
  const file_name   = (formData.get("file_name") as string ?? "").trim() || null;

  if (!title) return { error: "Title is required." };
  if (!body)  return { error: "Content is required." };
  if (!ALLOWED_SOURCE_TYPES.includes(source_type))
    return { error: "Invalid source type." };

  const { error: updateError } = await supabase
    .from("context_sources")
    .update({ title, source_type, body, file_name } as unknown as never)
    .eq("id", id)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId);

  if (updateError)
    return { error: `Failed to update context source: ${updateError.message}` };

  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/context`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// archiveContextSource
// Called as a form action. Uses revalidatePath so user stays on the list.
// ─────────────────────────────────────────────────────────────────────────

export async function archiveContextSource(formData: FormData): Promise<void> {
  const id           = formData.get("id") as string;
  const tenantId     = formData.get("tenantId") as string;
  const engagementId = formData.get("engagementId") as string;
  const fiscalYearId = formData.get("fiscalYearId") as string;

  if (!id || !tenantId || !engagementId || !fiscalYearId) return;

  const { supabase } = await requireAgencyUser(tenantId);

  await supabase
    .from("context_sources")
    .update({ status: "archived" } as unknown as never)
    .eq("id", id)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId);

  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/context`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// triggerAiRun
//
// Loads all active context sources for the fiscal year, calls the Anthropic
// API with tool use, persists proposals and source snippets, then redirects.
//
// SECURITY:
//   - createAnthropicClient() is the only path to the API key.
//   - The key is never logged, never passed to formData, never stored in DB.
//   - redirect() is always outside any try/catch (avoids catching NEXT_REDIRECT).
// ─────────────────────────────────────────────────────────────────────────

export async function triggerAiRun(
  fiscalYearId: string,
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  // ── 1. Verify ownership ─────────────────────────────────────────────────
  const fy = await verifyFiscalYearOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!fy) return { error: "Claim year not found or access denied." };

  // ── 2. Load active context sources for this fiscal year ─────────────────
  const { data: rawSources, error: sourcesError } = await supabase
    .from("context_sources")
    .select("id, title, source_type, body")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (sourcesError)
    return { error: `Failed to load context sources: ${sourcesError.message}` };

  const sources = (rawSources ?? []) as Array<{
    id: string;
    title: string;
    source_type: string;
    body: string;
  }>;

  if (sources.length === 0)
    return {
      error:
        "No active context sources found. Add at least one context source before running AI analysis.",
    };

  // ── 3. Load engagement + type + service line ────────────────────────────
  const { data: rawEng, error: engError } = await supabase
    .from("engagements")
    .select(
      "title, engagement_type:engagement_types(name, service_line:service_lines(name))"
    )
    .eq("id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  if (engError || !rawEng) return { error: "Engagement not found." };

  const eng = rawEng as unknown as {
    title: string;
    engagement_type: { name: string; service_line: { name: string } };
  };

  // ── 4. Insert pending run row ───────────────────────────────────────────
  const model = getModel();
  const contextSourceIds = sources.map((s) => s.id);

  const { data: runRow, error: runInsertError } = await supabase
    .from("ai_suggestion_runs")
    .insert({
      fiscal_year_id:     fiscalYearId,
      engagement_id:      engagementId,
      tenant_id:          tenantId,
      triggered_by:       user.id,
      context_source_ids: contextSourceIds,
      model,
      prompt_version:     PROMPT_VERSION_STRING, // "sred_project_discovery_v1"
      status:             "pending",
    } as unknown as never)
    .select("id")
    .single();

  if (runInsertError || !runRow)
    return { error: `Failed to create run record: ${runInsertError?.message}` };

  const runId = (runRow as unknown as { id: string }).id;

  await supabase
    .from("ai_suggestion_runs")
    .update({ status: "running" } as unknown as never)
    .eq("id", runId);

  // ── Inner helper — marks run failed, returns error object ───────────────
  async function failRun(msg: string): Promise<{ error: string }> {
    await supabase
      .from("ai_suggestion_runs")
      .update({
        status:        "failed",
        error_message: msg,
        completed_at:  new Date().toISOString(),
      } as unknown as never)
      .eq("id", runId);
    return { error: msg };
  }

  // ── 5. Build prompt ─────────────────────────────────────────────────────
  const userMessage = buildUserMessage({
    engagementTitle:    eng.title,
    serviceLineName:    eng.engagement_type.service_line.name,
    engagementTypeName: eng.engagement_type.name,
    fiscalYearLabel:    fy.label,
    contextSources:     sources,
  });

  // ── 6. Call Anthropic API ───────────────────────────────────────────────
  let aiResponse: Awaited<
    ReturnType<ReturnType<typeof createAnthropicClient>["messages"]["create"]>
  >;

  try {
    const ai = createAnthropicClient();
    aiResponse = await ai.messages.create({
      model,
      max_tokens:  8192,
      system:      SRED_SYSTEM_PROMPT,
      tools:       [SUBMIT_PROPOSALS_TOOL],
      tool_choice: { type: "tool", name: "submit_proposals" },
      messages:    [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    return await failRun(
      `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const promptTokens      = aiResponse.usage?.input_tokens ?? null;
  const completionTokens  = aiResponse.usage?.output_tokens ?? null;
  const truncatedByTokens = aiResponse.stop_reason === "max_tokens";

  // ── 7. Extract tool use block ───────────────────────────────────────────
  const toolUseBlock = aiResponse.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    return await failRun(
      "The AI did not call the submit_proposals tool. The response may have been blocked or misconfigured."
    );
  }

  // ── 8. Parse and repair tool input ─────────────────────────────────────
  type RunSummary = {
    summary: string;
    activity_months: string[];
    tr_sections_supported: string[];
    tr_sections_unsupported: string[];
  };
  type ProposalInput = {
    proposal_type: string;
    title: string;
    description?: string;
    proposed_project?: string;
    proposed_person?: string;
    claim_component?: string;
    section_or_area?: string;
    confidence: string;
    reason?: string;
    sources?: Array<{
      source_title?: string;
      snippet: string;
      relevance_note?: string;
    }>;
  };
  type ToolInput = {
    proposals: ProposalInput[];
    run_summary: RunSummary;
  };

  let toolInput: ToolInput;
  let truncationWarning = truncatedByTokens;

  try {
    const raw = toolUseBlock.input as Partial<ToolInput>;
    if (Array.isArray(raw?.proposals) && raw.proposals.length > 0) {
      toolInput = {
        proposals:   raw.proposals as ProposalInput[],
        run_summary: raw.run_summary ?? {
          summary: "",
          activity_months: [],
          tr_sections_supported: [],
          tr_sections_unsupported: [],
        },
      };
    } else if (truncatedByTokens) {
      const rawStr   = JSON.stringify(toolUseBlock.input);
      const repaired = repairTruncatedJson<ToolInput>(rawStr);
      toolInput         = repaired.data;
      truncationWarning = true;
    } else {
      return await failRun("The AI returned an empty proposals list.");
    }
  } catch (err) {
    return await failRun(
      `Failed to parse AI response: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── 9. Load existing proposals for run_status computation ───────────────
  const { data: existingRaw } = await supabase
    .from("ai_proposals")
    .select("id, title, decision")
    .eq("fiscal_year_id", fiscalYearId);

  const existingProposals = (existingRaw ?? []) as Array<{
    id: string;
    title: string;
    decision: string;
  }>;

  function computeRunStatus(newTitle: string): {
    runStatus: ProposalRunStatus;
    duplicateOf: string | null;
  } {
    const normalised = newTitle.toLowerCase().trim();
    for (const existing of existingProposals) {
      const ex = existing.title.toLowerCase().trim();
      if (ex === normalised || normalised.includes(ex) || ex.includes(normalised)) {
        if (existing.decision === "accepted")
          return { runStatus: "resurfacing", duplicateOf: null };
        return { runStatus: "possible_duplicate", duplicateOf: existing.id };
      }
    }
    return { runStatus: "new", duplicateOf: null };
  }

  const sourceTitleMap = new Map(sources.map((s) => [s.title.toLowerCase(), s.id]));

  // ── 10. Insert proposals and source snippets ────────────────────────────
  const VALID_TYPES: ProposalType[] = [
    "project", "person", "evidence", "hours",
    "contractor", "material", "government_support", "gap",
  ];
  const VALID_CONFIDENCE = ["high", "medium", "low"];

  for (const p of toolInput.proposals) {
    if (!p.title || !VALID_TYPES.includes(p.proposal_type as ProposalType)) continue;
    if (!VALID_CONFIDENCE.includes(p.confidence)) p.confidence = "medium";

    const { runStatus, duplicateOf } = computeRunStatus(p.title);

    const { data: insertedProposal, error: proposalInsertError } = await supabase
      .from("ai_proposals")
      .insert({
        run_id:           runId,
        fiscal_year_id:   fiscalYearId,
        engagement_id:    engagementId,
        tenant_id:        tenantId,
        proposal_type:    p.proposal_type,
        title:            p.title,
        description:      p.description ?? null,
        proposed_project: p.proposed_project ?? null,
        proposed_person:  p.proposed_person ?? null,
        claim_component:  p.claim_component ?? null,
        section_or_area:  p.section_or_area ?? null,
        confidence:       p.confidence,
        reason:           p.reason ?? null,
        decision:         "pending",
        run_status:       runStatus,
        duplicate_of:     duplicateOf,
      } as unknown as never)
      .select("id")
      .single();

    if (proposalInsertError || !insertedProposal) continue;

    const proposalId = (insertedProposal as unknown as { id: string }).id;
    const snippets   = (p.sources ?? []).filter((s) => s.snippet?.trim());
    if (snippets.length === 0) continue;

    const sourceInserts = snippets.map((src) => ({
      proposal_id:       proposalId,
      context_source_id: src.source_title
        ? (sourceTitleMap.get(src.source_title.toLowerCase()) ?? null)
        : null,
      tenant_id:      tenantId,
      snippet:        src.snippet.trim().slice(0, 500),
      relevance_note: src.relevance_note ?? null,
    }));

    await supabase
      .from("ai_suggestion_sources")
      .insert(sourceInserts as unknown as never);
  }

  // ── 11. Update run to completed ─────────────────────────────────────────
  const rs = toolInput.run_summary;
  await supabase
    .from("ai_suggestion_runs")
    .update({
      status:                  "completed",
      summary:                 rs.summary || null,
      activity_months:         rs.activity_months ?? [],
      tr_sections_supported:   rs.tr_sections_supported ?? [],
      tr_sections_unsupported: rs.tr_sections_unsupported ?? [],
      truncation_warning:      truncationWarning,
      prompt_tokens:           promptTokens,
      completion_tokens:       completionTokens,
      completed_at:            new Date().toISOString(),
    } as unknown as never)
    .eq("id", runId);

  // redirect() is OUTSIDE the try/catch so NEXT_REDIRECT is not caught
  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/ai-runs/${runId}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// updateProposalDecision
//
// Valid transitions:
//   pending  → accepted | rejected | deferred
//   accepted → pending  (undo only — cannot go directly to rejected)
//   rejected → pending  (undo only)
//   deferred → pending  (undo only)
//
// decision_reason is captured for reject/defer (Guidance Layer feedback).
// It is always cleared when undoing to pending.
// The original AI proposal fields are never modified here.
// ─────────────────────────────────────────────────────────────────────────

export async function updateProposalDecision(
  proposalId: string,
  newDecision: ProposalDecision,
  tenantId: string,
  decisionReason: string | null = null
): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  const VALID_DECISIONS: ProposalDecision[] = [
    "pending", "accepted", "rejected", "deferred",
  ];
  if (!VALID_DECISIONS.includes(newDecision))
    return { error: "Invalid decision value." };

  const { data: current, error: loadError } = await supabase
    .from("ai_proposals")
    .select("decision")
    .eq("id", proposalId)
    .eq("tenant_id", tenantId)
    .single();

  if (loadError || !current)
    return { error: "Proposal not found or access denied." };

  const currentDecision = (current as unknown as { decision: string }).decision;

  if (currentDecision === "accepted" && newDecision !== "pending")
    return {
      error:
        "An accepted proposal can only be moved back to pending. Change to pending first, then reject or defer.",
    };

  // Normalise reason: always null when undoing to pending
  const normalisedReason =
    newDecision === "pending"
      ? null
      : (decisionReason?.trim() || null);

  const { error: updateError } = await supabase
    .from("ai_proposals")
    .update({
      decision:        newDecision,
      decision_reason: normalisedReason,
      reviewed_by:     user.id,
      reviewed_at:     new Date().toISOString(),
    } as unknown as never)
    .eq("id", proposalId)
    .eq("tenant_id", tenantId);

  if (updateError)
    return { error: `Failed to update decision: ${updateError.message}` };

  return { success: true };
}
