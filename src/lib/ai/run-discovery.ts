/**
 * Background processor for Project Discovery runs.
 *
 * ─── ARCHITECTURE NOTE (Option A — in-process fire-and-forget) ───────────────
 *
 * This module is invoked from discovery-actions.ts via a floating promise:
 *
 *   void processDiscoveryRun(params).catch(console.error);
 *   redirect(url);  // returns immediately to the browser
 *
 * Railway runs a persistent Node.js server (not serverless), so floating
 * promises DO complete — the event loop stays alive between requests.
 *
 * KNOWN LIMITATION: If Railway restarts the process (deploy, OOM, crash) while
 * this function is executing, the discovery_run row will remain stuck in
 * "running" status indefinitely. There is no automatic recovery.
 *
 * Manual recovery SQL:
 *   UPDATE discovery_runs
 *   SET status = 'failed',
 *       error_message = 'Process interrupted — manual recovery after restart'
 *   WHERE status IN ('pending', 'running')
 *     AND started_at < now() - interval '30 minutes';
 *
 * MIGRATION PATH (Option B — durable queued worker):
 *   Replace `void processDiscoveryRun(params)` in discovery-actions.ts with a
 *   job queue enqueue call (e.g. pg-boss, Supabase Edge Function, or Railway
 *   background service). This function can move to a separate worker process
 *   without changing its internal logic. ProcessDiscoveryRunParams is the
 *   stable interface contract between the trigger and the processor.
 *
 * SECURITY:
 *   - Uses createServiceClient() — bypasses RLS — server only.
 *   - Only modifies rows whose id = params.runId (generated server-side).
 *   - ANTHROPIC_API_KEY accessed only via createAnthropicClient() — never logged.
 *   - SUPABASE_SERVICE_ROLE_KEY accessed only via createServiceClient() — never logged.
 *   - All AI output is agency-internal. No client-visible data is written here.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createAnthropicClient } from "@/lib/ai/anthropic";
import {
  DISCOVERY_SYSTEM_PROMPT,
  SUBMIT_PROJECT_DISCOVERY_TOOL,
  buildDiscoveryUserMessage,
} from "@/lib/ai/discovery-prompt";
import type {
  Line242Content,
  Line244Content,
  Line246Content,
  SectionCHint,
} from "@/types/database";

// ── Parameter contract ────────────────────────────────────────────────────────
// All data required for the Anthropic call is passed in from the server action
// so the processor does not need to re-query the DB for document content
// (which would require the service client to re-fetch potentially large ai_text
// fields). The ownership anchors (fiscalYearId, engagementId, tenantId) are
// needed only for the sred_project inserts.

export interface ProcessDiscoveryRunParams {
  runId:            string;
  fiscalYearId:     string;
  engagementId:     string;
  tenantId:         string;
  engTitle:         string;
  fiscalYearLabel:  string;
  fiscalYearMonths: string[];
  model:            string;
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

type ProjectInput = {
  project_name: string;
  confidence?:  "high" | "medium" | "low";
  line_242:     Line242Content;
  line_244:     Line244Content;
  line_246:     Line246Content;
  section_c_hints: SectionCHint[];
  document_relationships: Array<{
    document_title:    string;
    relationship_type: string;
    supports_line:     string | null;
    supports_section:  string | null;
    relevance_note:    string | null;
  }>;
};

type ToolInput = {
  run_summary:        string;
  no_projects_reason?: string;
  projects:           ProjectInput[];
};

// ── Allowlists ────────────────────────────────────────────────────────────────

const VALID_CONFIDENCE      = new Set(["high", "medium", "low"]);
const VALID_RELATIONSHIP    = new Set([
  "primary_evidence", "supporting_evidence",
  "financial_record", "personnel_record", "prior_art",
]);
const VALID_SUPPORTS_LINE   = new Set([
  "line_242", "line_244", "line_246", "section_c", "multiple",
]);

// ── Main processor ────────────────────────────────────────────────────────────

export async function processDiscoveryRun(
  params: ProcessDiscoveryRunParams
): Promise<void> {
  const supabase = createServiceClient();

  // Helper — marks the run failed and returns (does NOT throw).
  // Returns void so callers can `return await failRun(...)` to exit.
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

  // ── Mark running ────────────────────────────────────────────────────────────
  const docWord = params.documents.length === 1 ? "document" : "documents";
  const sourceWord = params.contextSources.length === 1 ? "source" : "sources";
  const contextNote = params.contextSources.length > 0
    ? ` and ${params.contextSources.length} context ${sourceWord}`
    : "";
  const progressMsg =
    `Analysing ${params.documents.length} ${docWord}${contextNote}…`;

  const { error: startErr } = await supabase
    .from("discovery_runs")
    .update({
      status:           "running",
      started_at:       new Date().toISOString(),
      progress_message: progressMsg,
    } as unknown as never)
    .eq("id", params.runId);

  if (startErr) {
    console.error(
      `[run-discovery] Failed to mark run ${params.runId} as running:`,
      startErr.message
    );
    // Continue anyway — the run is in the DB, best effort.
  }

  // ── Build prompt ─────────────────────────────────────────────────────────────
  const userMessage = buildDiscoveryUserMessage({
    engagementTitle:  params.engTitle,
    fiscalYearLabel:  params.fiscalYearLabel,
    fiscalYearMonths: params.fiscalYearMonths,
    documents:        params.documents,
    contextSources:   params.contextSources,
  });

  // ── Call Anthropic — no AbortController, no artificial timeout ────────────
  // Railway's proxy does not impose a short request timeout on background work.
  // The Anthropic SDK has its own internal retry / timeout logic.
  let aiResponse: Awaited<
    ReturnType<ReturnType<typeof createAnthropicClient>["messages"]["create"]>
  >;

  try {
    const ai = createAnthropicClient();
    aiResponse = await ai.messages.create({
      model:       params.model,
      max_tokens:  8192,
      system:      DISCOVERY_SYSTEM_PROMPT,
      tools:       [SUBMIT_PROJECT_DISCOVERY_TOOL],
      tool_choice: { type: "tool", name: "submit_project_discovery" },
      messages:    [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    await failRun(
      `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  const promptTokens     = aiResponse.usage?.input_tokens     ?? null;
  const completionTokens = aiResponse.usage?.output_tokens    ?? null;

  // ── Extract tool_use block ──────────────────────────────────────────────────
  const toolUseBlock = aiResponse.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    await failRun(
      "The AI did not call the submit_project_discovery tool. " +
      "The response may have been blocked or the model did not comply with the tool_choice constraint."
    );
    return;
  }

  // ── Parse tool input ────────────────────────────────────────────────────────
  // If Claude returns no_projects_reason without a projects key (valid — it found
  // nothing qualifying), treat missing projects as an empty array so the run
  // completes gracefully rather than failing with a misleading error message.
  let toolInput: ToolInput;
  try {
    const raw = toolUseBlock.input as Partial<ToolInput>;
    toolInput = {
      run_summary:        raw.run_summary        ?? "",
      no_projects_reason: raw.no_projects_reason ?? undefined,
      projects:           Array.isArray(raw?.projects) ? raw.projects as ProjectInput[] : [],
    };
  } catch (err) {
    await failRun(
      `Failed to parse AI response: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  // ── Zero projects — complete with explanation ───────────────────────────────
  // Zero projects is a valid outcome (no qualifying SR&ED work found).
  // The run detail page shows Claude's explanation from run_summary.
  if (toolInput.projects.length === 0) {
    const reason =
      toolInput.no_projects_reason?.trim() ||
      toolInput.run_summary?.trim()        ||
      null;

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

    console.log(`[run-discovery] Run ${params.runId} completed with 0 projects.`);
    return;
  }

  // ── Build document title → ID lookup ────────────────────────────────────────
  const docTitleToId = new Map(
    params.documents.map((d) => [d.title.toLowerCase().trim(), d.id])
  );

  // ── Update progress — saving phase ─────────────────────────────────────────
  await supabase
    .from("discovery_runs")
    .update({
      progress_message: `Saving ${toolInput.projects.length} project${toolInput.projects.length !== 1 ? "s" : ""}…`,
    } as unknown as never)
    .eq("id", params.runId);

  // ── Insert sred_projects + relationships ─────────────────────────────────────
  let savedCount = 0;

  for (const p of toolInput.projects) {
    if (!p.project_name?.trim()) continue;

    const { data: insertedProject, error: projectInsertError } = await supabase
      .from("sred_projects")
      .insert({
        run_id:                   params.runId,
        fiscal_year_id:           params.fiscalYearId,
        engagement_id:            params.engagementId,
        tenant_id:                params.tenantId,
        project_name:             p.project_name.trim(),
        confidence:               VALID_CONFIDENCE.has(p.confidence ?? "")
                                    ? p.confidence
                                    : null,
        decision:                 "pending",
        line_242_ai_draft:        p.line_242          ?? null,
        line_244_ai_draft:        p.line_244          ?? null,
        line_246_ai_draft:        p.line_246          ?? null,
        section_c_hints_ai_draft: Array.isArray(p.section_c_hints)
                                    ? p.section_c_hints
                                    : null,
      } as unknown as never)
      .select("id")
      .single();

    if (projectInsertError || !insertedProject) {
      console.error(
        `[run-discovery] Failed to insert project "${p.project_name}":`,
        projectInsertError?.message
      );
      continue; // Best-effort: skip this project, don't fail the entire run
    }

    savedCount++;
    const projectId = (insertedProject as unknown as { id: string }).id;

    // Insert document relationships
    const relationships = (p.document_relationships ?? []).filter(
      (r) => r.document_title?.trim() && VALID_RELATIONSHIP.has(r.relationship_type)
    );

    if (relationships.length > 0) {
      const relInserts = relationships.flatMap((r) => {
        const docId = docTitleToId.get(r.document_title.toLowerCase().trim());
        if (!docId) return [];
        return [{
          project_id:        projectId,
          document_id:       docId,
          tenant_id:         params.tenantId,
          relationship_type: r.relationship_type,
          supports_line:     VALID_SUPPORTS_LINE.has(r.supports_line ?? "")
                               ? r.supports_line
                               : null,
          supports_section:  r.supports_section ?? null,
          relevance_note:    r.relevance_note   ?? null,
        }];
      });

      if (relInserts.length > 0) {
        const { error: relErr } = await supabase
          .from("project_document_relationships")
          .insert(relInserts as unknown as never);

        if (relErr) {
          console.error(
            `[run-discovery] Failed to insert relationships for project ${projectId}:`,
            relErr.message
          );
        }
      }
    }
  }

  // ── Mark completed ──────────────────────────────────────────────────────────
  await supabase
    .from("discovery_runs")
    .update({
      status:            "completed",
      run_summary:       toolInput.run_summary || null,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      completed_at:      new Date().toISOString(),
      progress_message:  null,
    } as unknown as never)
    .eq("id", params.runId);

  console.log(
    `[run-discovery] Run ${params.runId} completed. ` +
    `${savedCount} project(s) saved. ` +
    `Tokens: ${promptTokens ?? "?"}p / ${completionTokens ?? "?"}c.`
  );
}
