/**
 * Background processor for Project Discovery runs — hypothesis paradigm (v4).
 *
 * ─── ARCHITECTURE NOTE (Option A — in-process fire-and-forget) ───────────────
 *
 * Invoked from discovery-actions.ts via a floating promise:
 *   void processDiscoveryRun(params).catch(console.error);
 *   redirect(url);
 *
 * Railway runs a persistent Node.js server so floating promises DO complete.
 *
 * MANUAL RECOVERY SQL (if process restarts mid-run):
 *   UPDATE discovery_runs
 *   SET status = 'failed',
 *       error_message = 'Process interrupted — manual recovery after restart'
 *   WHERE status IN ('pending', 'running')
 *     AND started_at < now() - interval '30 minutes';
 *
 * SECURITY:
 *   - Uses createServiceClient() (bypasses RLS) — server only.
 *   - Only modifies rows whose id = params.runId.
 *   - ANTHROPIC_API_KEY accessed only via createAnthropicClient() — never logged.
 *   - SUPABASE_SERVICE_ROLE_KEY accessed only via createServiceClient() — never logged.
 *   - All AI output is agency-internal.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createAnthropicClient } from "@/lib/ai/anthropic";
import {
  DISCOVERY_SYSTEM_PROMPT,
  SUBMIT_DISCOVERY_HYPOTHESES_TOOL,
  buildDiscoveryUserMessage,
} from "@/lib/ai/discovery-prompt";
import type {
  Line242Content,
  Line244Content,
  Line246Content,
  SectionCHint,
  HypothesisData,
} from "@/types/database";

// ── Parameter contract ────────────────────────────────────────────────────────

export interface ProcessDiscoveryRunParams {
  runId:            string;
  fiscalYearId:     string;
  engagementId:     string;
  tenantId:         string;
  engTitle:         string;
  fiscalYearLabel:  string;
  fiscalYearMonths: string[];
  model:            string;
  runFocusNote?:    string;
  documents: Array<{
    id:            string;
    title:         string;
    document_type: string;
    ai_text:       string;
  }>;
  contextSources: Array<{
    id:          string;
    title:       string;
    source_type: string;
    body:        string;
  }>;
}

// ── Internal types ────────────────────────────────────────────────────────────

type HypothesisInput = {
  title: string;
  likelihood: "likely" | "plausible" | "unlikely";
  observed_activity: string;
  potential_technological_uncertainty: string;
  hypothesis_or_advancement_sought: string;
  systematic_investigation_summary: string;
  potential_advancement: string;
  why_this_rating: string;
  missing_evidence: string[];
  consultant_questions: string[];
  recommended_next_step:
    | "draft_full_project"
    | "draft_skeleton_and_request_evidence"
    | "brief_client_check"
    | "do_not_pursue";
  draft_readiness:
    | "ready_for_review"
    | "needs_consultant_validation"
    | "insufficient_evidence";
  // Optional T661 drafts — expected for "likely" tier only
  line_242?: Line242Content;
  line_244?: Line244Content;
  line_246?: Line246Content;
  section_c_hints?: SectionCHint[];
  document_relationships: Array<{
    document_id:      string;  // slug: "doc_01", "doc_02", etc.
    document_title?:  string;  // display only
    evidence_role:    string;
    relevance_summary: string;
    cited_passages?:  string[];
  }>;
};

type HypothesisToolInput = {
  run_summary: string;
  hypotheses:  HypothesisInput[];
};

// ── Allowlists ────────────────────────────────────────────────────────────────

const VALID_LIKELIHOOD = new Set(["likely", "plausible", "unlikely"]);
const VALID_EVIDENCE_ROLE = new Set([
  // v4 hypothesis paradigm
  "primary_evidence", "supporting_evidence", "context",
  "contradictory_evidence", "evidence_gap",
  // v3 backward compat (old runs may still reference these)
  "financial_record", "personnel_record", "prior_art",
]);

// ── Main processor ────────────────────────────────────────────────────────────

export async function processDiscoveryRun(
  params: ProcessDiscoveryRunParams
): Promise<void> {
  const supabase = createServiceClient();

  async function failRun(msg: string): Promise<void> {
    console.error(`[run-discovery] Run ${params.runId} failed: ${msg}`);
    await supabase
      .from("discovery_runs")
      .update({
        status:        "failed",
        error_message: msg,
        completed_at:  new Date().toISOString(),
      } as unknown as never)
      .eq("id", params.runId);
  }

  // ── Build document slug map ───────────────────────────────────────────────
  // Assigns stable IDs (doc_01, doc_02, …) to documents for this run.
  // Claude returns these slugs in document_relationships.document_id.
  // We map them back to real DB UUIDs here.
  const docSlugs = params.documents.map(
    (_, i) => `doc_${String(i + 1).padStart(2, "0")}`
  );
  const docSlugToId = new Map<string, string>(
    docSlugs.map((slug, i) => [slug, params.documents[i].id])
  );
  // Fallback: lowercased title → UUID if Claude ignored the slug
  const docTitleToId = new Map<string, string>(
    params.documents.map((d) => [d.title.toLowerCase().trim(), d.id])
  );

  // ── Mark running ──────────────────────────────────────────────────────────
  const docWord    = params.documents.length === 1 ? "document" : "documents";
  const sourceWord = params.contextSources.length === 1 ? "source" : "sources";
  const contextNote = params.contextSources.length > 0
    ? ` and ${params.contextSources.length} context ${sourceWord}`
    : "";

  await supabase
    .from("discovery_runs")
    .update({
      status:           "running",
      started_at:       new Date().toISOString(),
      progress_message: `Analysing ${params.documents.length} ${docWord}${contextNote}…`,
    } as unknown as never)
    .eq("id", params.runId);

  // ── Build prompt ──────────────────────────────────────────────────────────
  const userMessage = buildDiscoveryUserMessage({
    engagementTitle:  params.engTitle,
    fiscalYearLabel:  params.fiscalYearLabel,
    fiscalYearMonths: params.fiscalYearMonths,
    documents:        params.documents,
    contextSources:   params.contextSources,
    docSlugs,
    runFocusNote:     params.runFocusNote,
  });

  // ── Call Anthropic ────────────────────────────────────────────────────────
  let aiResponse: Awaited<
    ReturnType<ReturnType<typeof createAnthropicClient>["messages"]["create"]>
  >;

  try {
    const ai = createAnthropicClient();
    aiResponse = await ai.messages.create({
      model:       params.model,
      max_tokens:  16000,
      system:      DISCOVERY_SYSTEM_PROMPT,
      tools:       [SUBMIT_DISCOVERY_HYPOTHESES_TOOL],
      tool_choice: { type: "tool", name: "submit_discovery_hypotheses" },
      messages:    [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    await failRun(
      `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  const promptTokens     = aiResponse.usage?.input_tokens  ?? null;
  const completionTokens = aiResponse.usage?.output_tokens ?? null;

  // ── Extract tool_use block ────────────────────────────────────────────────
  const toolUseBlock = aiResponse.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    await failRun(
      "The AI did not call submit_discovery_hypotheses. " +
      "The response may have been blocked or the model did not comply with tool_choice."
    );
    return;
  }

  // ── Parse tool input ──────────────────────────────────────────────────────
  let toolInput: HypothesisToolInput;
  try {
    const raw = toolUseBlock.input as Partial<HypothesisToolInput>;

    // Diagnostics — log raw shape (no secrets, no doc content)
    console.log(
      `[run-discovery] Tool input shape for run ${params.runId}:`,
      JSON.stringify({
        hypotheses_key_present: Array.isArray(raw?.hypotheses),
        hypothesis_count:       Array.isArray(raw?.hypotheses) ? raw.hypotheses.length : 0,
        run_summary_preview:    (raw.run_summary ?? "").slice(0, 300),
        titles: Array.isArray(raw?.hypotheses)
          ? (raw.hypotheses as HypothesisInput[]).map((h) => (h?.title ?? "").slice(0, 60))
          : [],
      })
    );

    toolInput = {
      run_summary: raw.run_summary ?? "",
      hypotheses:  Array.isArray(raw?.hypotheses) ? raw.hypotheses as HypothesisInput[] : [],
    };
  } catch (err) {
    await failRun(
      `Failed to parse AI response: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  // ── Empty hypotheses — only valid for purely non-technical content ────────
  if (toolInput.hypotheses.length === 0) {
    const reason =
      toolInput.run_summary?.trim() ||
      "No technological activities identified in the provided materials.";

    await supabase
      .from("discovery_runs")
      .update({
        status:            "completed",
        run_summary:       reason,
        prompt_tokens:     promptTokens,
        completion_tokens: completionTokens,
        completed_at:      new Date().toISOString(),
        progress_message:  null,
      } as unknown as never)
      .eq("id", params.runId);

    console.log(`[run-discovery] Run ${params.runId} completed with 0 hypotheses.`);
    return;
  }

  // ── Update progress — saving phase ───────────────────────────────────────
  const hWord = toolInput.hypotheses.length === 1 ? "hypothesis" : "hypotheses";
  await supabase
    .from("discovery_runs")
    .update({
      progress_message: `Saving ${toolInput.hypotheses.length} ${hWord}…`,
    } as unknown as never)
    .eq("id", params.runId);

  // ── Insert sred_projects (one row per hypothesis) ─────────────────────────
  let savedCount = 0;
  const insertErrors: string[] = [];
  const relationshipWarnings: string[] = [];

  for (const h of toolInput.hypotheses) {
    if (!h.title?.trim()) continue;

    // Map likelihood → confidence for backward-compat with old UI code
    const confidenceMap: Record<string, "high" | "medium" | "low"> = {
      likely:   "high",
      plausible: "medium",
      unlikely: "low",
    };

    // Build hypothesis_data blob — everything except T661 draft content
    const hypothesisData: HypothesisData = {
      observed_activity:                   h.observed_activity               ?? "",
      potential_technological_uncertainty: h.potential_technological_uncertainty ?? "",
      hypothesis_or_advancement_sought:    h.hypothesis_or_advancement_sought  ?? "",
      systematic_investigation_summary:    h.systematic_investigation_summary  ?? "",
      potential_advancement:               h.potential_advancement              ?? "",
      why_this_rating:                     h.why_this_rating                   ?? "",
      missing_evidence:    Array.isArray(h.missing_evidence)    ? h.missing_evidence    : [],
      consultant_questions: Array.isArray(h.consultant_questions) ? h.consultant_questions : [],
      recommended_next_step: h.recommended_next_step ?? "brief_client_check",
      draft_readiness:       h.draft_readiness       ?? "insufficient_evidence",
    };

    const { data: insertedProject, error: projectInsertError } = await supabase
      .from("sred_projects")
      .insert({
        run_id:                   params.runId,
        fiscal_year_id:           params.fiscalYearId,
        engagement_id:            params.engagementId,
        tenant_id:                params.tenantId,
        project_name:             h.title.trim(),
        likelihood:               VALID_LIKELIHOOD.has(h.likelihood ?? "") ? h.likelihood : null,
        confidence:               confidenceMap[h.likelihood ?? ""] ?? null,
        decision:                 "pending",
        hypothesis_data:          hypothesisData,
        line_242_ai_draft:        h.line_242    ?? null,
        line_244_ai_draft:        h.line_244    ?? null,
        line_246_ai_draft:        h.line_246    ?? null,
        section_c_hints_ai_draft: Array.isArray(h.section_c_hints) ? h.section_c_hints : null,
      } as unknown as never)
      .select("id")
      .single();

    if (projectInsertError || !insertedProject) {
      const errMsg = projectInsertError?.message ?? "No row returned after insert";
      console.error(`[run-discovery] Failed to insert hypothesis "${h.title}": ${errMsg}`);
      insertErrors.push(`"${h.title.trim()}": ${errMsg}`);
      continue;
    }

    savedCount++;
    const projectId = (insertedProject as unknown as { id: string }).id;

    // ── Insert document relationships ─────────────────────────────────────
    const rels = (h.document_relationships ?? []).filter((r) => r.document_id?.trim());

    if (rels.length > 0) {
      const relInserts = rels.flatMap((r) => {
        // 1. Primary path: slug lookup (doc_01 → real UUID)
        let docId = docSlugToId.get(r.document_id?.trim() ?? "");

        // 2. Fallback: exact title match (if Claude ignored the slug)
        if (!docId && r.document_title) {
          docId = docTitleToId.get(r.document_title.toLowerCase().trim());
          if (docId) {
            relationshipWarnings.push(
              `Slug "${r.document_id}" not found; matched by title "${r.document_title}" ` +
              `(hypothesis: "${h.title}")`
            );
          }
        }

        // 3. Unresolved — warn and skip
        if (!docId) {
          relationshipWarnings.push(
            `Unresolved document reference: id="${r.document_id}" ` +
            `title="${r.document_title ?? "none"}" (hypothesis: "${h.title}")`
          );
          return [];
        }

        const evidenceRole = VALID_EVIDENCE_ROLE.has(r.evidence_role ?? "")
          ? r.evidence_role
          : "supporting_evidence";

        return [{
          project_id:        projectId,
          document_id:       docId,
          tenant_id:         params.tenantId,
          relationship_type: evidenceRole,
          supports_line:     null,
          // Repurpose supports_section to store cited passages as JSON (no migration needed)
          supports_section:  r.cited_passages?.length
            ? JSON.stringify(r.cited_passages.slice(0, 5))
            : null,
          relevance_note:    r.relevance_summary ?? null,
        }];
      });

      if (relInserts.length > 0) {
        const { error: relErr } = await supabase
          .from("project_document_relationships")
          .insert(relInserts as unknown as never);

        if (relErr) {
          console.error(
            `[run-discovery] Relationship insert error for hypothesis ${projectId}:`,
            relErr.message
          );
          relationshipWarnings.push(
            `Relationship insert failed for "${h.title}": ${relErr.message}`
          );
        }
      }
    }
  }

  // ── Guard: fail if every insert failed ───────────────────────────────────
  if (savedCount === 0 && toolInput.hypotheses.length > 0) {
    await failRun(
      `All ${toolInput.hypotheses.length} hypothesis insert(s) failed. ` +
      `DB errors: ${insertErrors.join("; ")}`
    );
    return;
  }

  // ── Build final run summary (append any relationship warnings) ────────────
  let finalSummary = toolInput.run_summary || null;
  if (relationshipWarnings.length > 0) {
    const extra =
      `\n\n[${relationshipWarnings.length} document relationship warning(s): ` +
      `${relationshipWarnings.slice(0, 5).join("; ")}` +
      `${relationshipWarnings.length > 5 ? ` … +${relationshipWarnings.length - 5} more` : ""}]`;
    finalSummary = (finalSummary ?? "") + extra;
  }

  // ── Mark completed ────────────────────────────────────────────────────────
  await supabase
    .from("discovery_runs")
    .update({
      status:            "completed",
      run_summary:       finalSummary,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      completed_at:      new Date().toISOString(),
      progress_message:  null,
    } as unknown as never)
    .eq("id", params.runId);

  if (insertErrors.length > 0) {
    console.warn(
      `[run-discovery] Run ${params.runId} completed with partial saves: ` +
      `${savedCount} saved, ${insertErrors.length} failed. ` +
      `Failed: ${insertErrors.join("; ")}`
    );
  } else {
    console.log(
      `[run-discovery] Run ${params.runId} completed. ` +
      `${savedCount} hypothesis/hypotheses saved. ` +
      `Tokens: ${promptTokens ?? "?"}p / ${completionTokens ?? "?"}c. ` +
      `Relationship warnings: ${relationshipWarnings.length}`
    );
  }
}
