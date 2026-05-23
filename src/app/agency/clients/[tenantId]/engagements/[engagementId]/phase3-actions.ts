"use server";

/**
 * Phase 3A server actions.
 *
 * All functions in this file run on the server. None return or accept data
 * that would expose AI internals, API keys, or client-restricted information.
 *
 * SECURITY:
 *   - ANTHROPIC_API_KEY is accessed only via createAnthropicClient() in
 *     @/lib/ai/anthropic. It is never referenced here directly.
 *   - All AI output tables (ai_suggestion_runs, ai_proposals,
 *     ai_suggestion_sources) are agency-only. No path here returns
 *     AI data to a client user.
 *   - context_sources rows always default to client_visible=false.
 *     This file does not expose a way to set client_visible=true in
 *     Phase 3A (future phase).
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
import { isAgencyRole } from "@/lib/auth/permissions";
import type {
  ContextSourceType,
  ProposalDecision,
  ProposalType,
  ProposalRunStatus,
} from "@/types/database";

// ── Shared auth helper ────────────────────────────────────────────────────

async function requireAgencyUser(tenantId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("role, tenant_id, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  const rows = (memberships ?? []) as Array<{
    role: string;
    tenant_id: string;
    status: string;
  }>;

  const isAgency = rows.some((m) => isAgencyRole(m.role as never));
  if (!isAgency) redirect("/unauthorized");

  return { supabase, user };
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
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  const title       = (formData.get("title") as string ?? "").trim();
  const source_type = (formData.get("source_type") as string ?? "").trim() as ContextSourceType;
  const body        = (formData.get("body") as string ?? "").trim();
  const file_name   = (formData.get("file_name") as string ?? "").trim() || null;

  if (!title)                              return { error: "Title is required." };
  if (!body)                               return { error: "Content is required." };
  if (!ALLOWED_SOURCE_TYPES.includes(source_type))
    return { error: "Invalid source type." };

  const { error: insertError } = await supabase
    .from("context_sources")
    .insert({
      engagement_id:  engagementId,
      tenant_id:      tenantId,
      source_type,
      title,
      body,
      file_name,
      client_visible: false, // Phase 3A: always false
      status:         "active",
      uploaded_by:    user.id,
    } as unknown as never);

  if (insertError) {
    if (insertError.code === "42501")
      return { error: "You do not have permission to add context sources to this engagement." };
    return { error: `Failed to add context source: ${insertError.message}` };
  }

  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/context`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// updateContextSource
// ─────────────────────────────────────────────────────────────────────────

export async function updateContextSource(
  id: string,
  formData: FormData,
  tenantId: string,
  engagementId: string
): Promise<{ error?: string }> {
  const { supabase } = await requireAgencyUser(tenantId);

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
    .eq("tenant_id", tenantId);

  if (updateError)
    return { error: `Failed to update context source: ${updateError.message}` };

  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/context`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// archiveContextSource
// Called as a form action from the context list page.
// Uses revalidatePath (not redirect) so the user stays on the list.
// ─────────────────────────────────────────────────────────────────────────

export async function archiveContextSource(formData: FormData): Promise<void> {
  const id          = formData.get("id") as string;
  const tenantId    = formData.get("tenantId") as string;
  const engagementId = formData.get("engagementId") as string;

  if (!id || !tenantId || !engagementId) return;

  const { supabase } = await requireAgencyUser(tenantId);

  await supabase
    .from("context_sources")
    .update({ status: "archived" } as unknown as never)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  // Stays on the context list with a fresh fetch
  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/context`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// triggerAiRun
//
// Loads all active context sources for the engagement, calls the Anthropic
// API with tool use, persists proposals and source snippets, then redirects
// to the run detail page.
//
// Returns { error } if the run failed before a run row was created, or if
// the AI call itself failed. On success, redirect() is called — the caller
// never receives a return value.
//
// SECURITY:
//   - createAnthropicClient() is the only path to the API key.
//   - The key is never logged, never passed to formData, never stored in DB.
//   - redirect() is always outside any try/catch so NEXT_REDIRECT is not caught.
// ─────────────────────────────────────────────────────────────────────────

export async function triggerAiRun(
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  // ── 1. Load active context sources ─────────────────────────────────────
  const { data: rawSources, error: sourcesError } = await supabase
    .from("context_sources")
    .select("id, title, source_type, body")
    .eq("engagement_id", engagementId)
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

  // ── 2. Load engagement + type + service line + fiscal year ──────────────
  const { data: rawEng, error: engError } = await supabase
    .from("engagements")
    .select(
      `title,
       engagement_type:engagement_types(name, service_line:service_lines(name)),
       fiscal_year:fiscal_years(label)`
    )
    .eq("id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  if (engError || !rawEng)
    return { error: "Engagement not found." };

  const eng = rawEng as unknown as {
    title: string;
    engagement_type: { name: string; service_line: { name: string } };
    fiscal_year: { label: string } | null;
  };

  // ── 3. Insert pending run row ───────────────────────────────────────────
  const model = getModel();
  const contextSourceIds = sources.map((s) => s.id);

  const { data: runRow, error: runInsertError } = await supabase
    .from("ai_suggestion_runs")
    .insert({
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

  // ── 4. Update run to "running" ──────────────────────────────────────────
  await supabase
    .from("ai_suggestion_runs")
    .update({ status: "running" } as unknown as never)
    .eq("id", runId);

  // ── Inner function — marks run failed and returns error object ──────────
  async function failRun(msg: string): Promise<{ error: string }> {
    await supabase
      .from("ai_suggestion_runs")
      .update({
        status: "failed",
        error_message: msg,
        completed_at: new Date().toISOString(),
      } as unknown as never)
      .eq("id", runId);
    return { error: msg };
  }

  // ── 5. Build prompt ─────────────────────────────────────────────────────
  const userMessage = buildUserMessage({
    engagementTitle:   eng.title,
    serviceLineName:   eng.engagement_type.service_line.name,
    engagementTypeName: eng.engagement_type.name,
    fiscalYearLabel:   eng.fiscal_year?.label ?? null,
    contextSources:    sources,
  });

  // ── 6. Call Anthropic API ───────────────────────────────────────────────
  let aiResponse: Awaited<ReturnType<ReturnType<typeof createAnthropicClient>["messages"]["create"]>>;

  try {
    const ai = createAnthropicClient();
    aiResponse = await ai.messages.create({
      model,
      max_tokens: 8192,
      system:     SRED_SYSTEM_PROMPT,
      tools:      [SUBMIT_PROPOSALS_TOOL],
      tool_choice: { type: "tool", name: "submit_proposals" },
      messages:   [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    return await failRun(
      `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const promptTokens     = aiResponse.usage?.input_tokens ?? null;
  const completionTokens = aiResponse.usage?.output_tokens ?? null;
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
    // The SDK deserialises the input for us. If it's usable, use it directly.
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
      // SDK gave us an empty/broken input due to truncation — try repair
      const rawStr = JSON.stringify(toolUseBlock.input);
      const repaired = repairTruncatedJson<ToolInput>(rawStr);
      toolInput       = repaired.data;
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
    .eq("engagement_id", engagementId);

  const existingProposals = (existingRaw ?? []) as Array<{
    id: string;
    title: string;
    decision: string;
  }>;

  // ── 10. Compute run_status per new proposal ─────────────────────────────
  function computeRunStatus(newTitle: string): {
    runStatus: ProposalRunStatus;
    duplicateOf: string | null;
  } {
    const normalised = newTitle.toLowerCase().trim();
    for (const existing of existingProposals) {
      const ex = existing.title.toLowerCase().trim();
      if (ex === normalised || normalised.includes(ex) || ex.includes(normalised)) {
        if (existing.decision === "accepted") {
          return { runStatus: "resurfacing", duplicateOf: null };
        }
        return { runStatus: "possible_duplicate", duplicateOf: existing.id };
      }
    }
    return { runStatus: "new", duplicateOf: null };
  }

  // Build source title → id lookup for snippet storage
  const sourceTitleMap = new Map(sources.map((s) => [s.title.toLowerCase(), s.id]));

  // ── 11. Insert proposals and their source snippets ──────────────────────
  const VALID_TYPES: ProposalType[] = [
    "project", "person", "evidence", "hours",
    "contractor", "material", "government_support", "gap",
  ];
  const VALID_CONFIDENCE = ["high", "medium", "low"];

  for (const p of toolInput.proposals) {
    // Guard against malformed AI output
    if (!p.title || !VALID_TYPES.includes(p.proposal_type as ProposalType)) continue;
    if (!VALID_CONFIDENCE.includes(p.confidence)) p.confidence = "medium";

    const { runStatus, duplicateOf } = computeRunStatus(p.title);

    const { data: insertedProposal, error: proposalInsertError } = await supabase
      .from("ai_proposals")
      .insert({
        run_id:          runId,
        engagement_id:   engagementId,
        tenant_id:       tenantId,
        proposal_type:   p.proposal_type,
        title:           p.title,
        description:     p.description ?? null,
        proposed_project: p.proposed_project ?? null,
        proposed_person:  p.proposed_person ?? null,
        claim_component:  p.claim_component ?? null,
        section_or_area:  p.section_or_area ?? null,
        confidence:      p.confidence,
        reason:          p.reason ?? null,
        decision:        "pending",
        run_status:      runStatus,
        duplicate_of:    duplicateOf,
      } as unknown as never)
      .select("id")
      .single();

    if (proposalInsertError || !insertedProposal) continue;

    const proposalId = (insertedProposal as unknown as { id: string }).id;

    // Insert source snippets for this proposal
    const snippets = (p.sources ?? []).filter((s) => s.snippet?.trim());
    if (snippets.length === 0) continue;

    const sourceInserts = snippets.map((src) => {
      const contextSourceId =
        src.source_title
          ? (sourceTitleMap.get(src.source_title.toLowerCase()) ?? null)
          : null;
      return {
        proposal_id:       proposalId,
        context_source_id: contextSourceId,
        tenant_id:         tenantId,
        snippet:           src.snippet.trim().slice(0, 500), // hard cap
        relevance_note:    src.relevance_note ?? null,
      };
    });

    await supabase
      .from("ai_suggestion_sources")
      .insert(sourceInserts as unknown as never);
  }

  // ── 12. Update run to completed ─────────────────────────────────────────
  const rs = toolInput.run_summary;
  await supabase
    .from("ai_suggestion_runs")
    .update({
      status:                 "completed",
      summary:                rs.summary || null,
      activity_months:        rs.activity_months ?? [],
      tr_sections_supported:  rs.tr_sections_supported ?? [],
      tr_sections_unsupported: rs.tr_sections_unsupported ?? [],
      truncation_warning:     truncationWarning,
      prompt_tokens:          promptTokens,
      completion_tokens:      completionTokens,
      completed_at:           new Date().toISOString(),
    } as unknown as never)
    .eq("id", runId);

  // redirect() is OUTSIDE the try/catch — it throws NEXT_REDIRECT
  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/ai-runs/${runId}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// updateProposalDecision
//
// Valid transitions:
//   pending  → accepted | rejected | deferred
//   accepted → pending  (undo only)
//   rejected → pending  (undo only)
//   deferred → pending  (undo only)
//
// An accepted proposal cannot be moved directly to rejected.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Update the decision on a proposal, optionally recording a reason.
 *
 * decision_reason:
 *   - For reject/defer: optional text (e.g. "not SR&ED", "routine work").
 *     Stored verbatim. The UI surfaces predefined suggestions via datalist.
 *   - For accept: reason is not used; pass null.
 *   - For pending (undo): reason is always cleared to null regardless of input.
 *
 * The original AI proposal fields (title, description, reason, confidence)
 * are NEVER updated here. They are read-only after creation.
 */
export async function updateProposalDecision(
  proposalId: string,
  newDecision: ProposalDecision,
  tenantId: string,
  decisionReason: string | null = null
): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  const VALID_DECISIONS: ProposalDecision[] = ["pending", "accepted", "rejected", "deferred"];
  if (!VALID_DECISIONS.includes(newDecision))
    return { error: "Invalid decision value." };

  // Load current decision to validate the transition
  const { data: current, error: loadError } = await supabase
    .from("ai_proposals")
    .select("decision")
    .eq("id", proposalId)
    .eq("tenant_id", tenantId)
    .single();

  if (loadError || !current)
    return { error: "Proposal not found or access denied." };

  const currentDecision = (current as unknown as { decision: string }).decision;

  // Enforce transition rules
  if (currentDecision === "accepted" && newDecision !== "pending")
    return {
      error:
        "An accepted proposal can only be moved back to pending. Change to pending first, then reject or defer.",
    };

  // Normalise reason: strip whitespace; clear it when undoing to pending.
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
