"use server";

/**
 * Phase 3C — Project Discovery server actions.
 *
 * SECURITY:
 *   - All actions verify agency membership via requireAgencyUser.
 *   - Triple-ownership check (fiscal_year_id + engagement_id + tenant_id) on
 *     every mutation.
 *   - ANTHROPIC_API_KEY accessed only via createAnthropicClient() — never
 *     logged, stored, or passed to client code.
 *   - All discovery data is agency-internal. No client-visible output.
 *
 * AI DRAFT IMMUTABILITY:
 *   - *_ai_draft fields are written once by triggerDiscovery and never updated.
 *   - *_edited fields are written by updateProjectLineContent and start as null.
 *
 * ACTIONS:
 *   triggerDiscovery         — load materials → call Claude → insert run + projects
 *   updateProjectLineContent — Bloom edits a T661 line for a project
 *   updateProjectDecision    — Bloom accepts / rejects / defers a project
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAnthropicClient, getModel } from "@/lib/ai/anthropic";
import {
  DISCOVERY_PROMPT_VERSION_STRING,
  DISCOVERY_SYSTEM_PROMPT,
  SUBMIT_PROJECT_DISCOVERY_TOOL,
  buildDiscoveryUserMessage,
  generateFiscalYearMonths,
} from "@/lib/ai/discovery-prompt";
import { requireAgencyUser } from "../../phase3-actions";
import type {
  SredProjectDecision,
  Line242Content,
  Line244Content,
  Line246Content,
  SectionCHint,
} from "@/types/database";

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
// Full flow:
//  1. Verify ownership + load fiscal year (for dates → months)
//  2. Load AI-ready documents (ai_text NOT NULL, status != archived)
//  3. Load active context sources
//  4. Require at least one input (document OR context source)
//  5. Load engagement title
//  6. Generate fiscal year months from start_date/end_date
//  7. Insert discovery_run row (status = 'running')
//  8. Build prompt + call Claude with submit_project_discovery tool
//  9. Parse tool response
// 10. Insert sred_project rows (with ai_draft fields)
// 11. For each project: match document titles → insert project_document_relationships
// 12. Mark run 'completed'
// 13. redirect() to run detail page — OUTSIDE any try/catch
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

  // ── 7. Insert discovery_run row ──────────────────────────────────────────
  const model = getModel();

  const { data: runRow, error: runInsertError } = await supabase
    .from("discovery_runs")
    .insert({
      fiscal_year_id:    fiscalYearId,
      engagement_id:     engagementId,
      tenant_id:         tenantId,
      triggered_by:      user.id,
      document_ids:      documents.map((d) => d.id),
      context_source_ids: contextSources.map((s) => s.id),
      model,
      prompt_version:    DISCOVERY_PROMPT_VERSION_STRING,
      status:            "running",
    } as unknown as never)
    .select("id")
    .single();

  if (runInsertError || !runRow)
    return { error: `Failed to create discovery run record: ${runInsertError?.message}` };

  const runId = (runRow as unknown as { id: string }).id;

  // ── Inner helper — marks run failed, returns error object ────────────────
  async function failRun(msg: string): Promise<{ error: string }> {
    await supabase
      .from("discovery_runs")
      .update({
        status:        "failed",
        error_message: msg,
        completed_at:  new Date().toISOString(),
      } as unknown as never)
      .eq("id", runId);
    return { error: msg };
  }

  // ── 8. Build prompt + call Claude ────────────────────────────────────────
  const userMessage = buildDiscoveryUserMessage({
    engagementTitle:  engTitle,
    fiscalYearLabel:  fy.label,
    fiscalYearMonths,
    documents,
    contextSources,
  });

  let aiResponse: Awaited<
    ReturnType<ReturnType<typeof createAnthropicClient>["messages"]["create"]>
  >;

  try {
    const ai = createAnthropicClient();
    aiResponse = await ai.messages.create({
      model,
      max_tokens:  8192,
      system:      DISCOVERY_SYSTEM_PROMPT,
      tools:       [SUBMIT_PROJECT_DISCOVERY_TOOL],
      tool_choice: { type: "tool", name: "submit_project_discovery" },
      messages:    [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    return await failRun(
      `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const promptTokens     = aiResponse.usage?.input_tokens ?? null;
  const completionTokens = aiResponse.usage?.output_tokens ?? null;

  // ── 9. Extract tool use block ────────────────────────────────────────────
  const toolUseBlock = aiResponse.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    return await failRun(
      "The AI did not call the submit_project_discovery tool. " +
        "The response may have been blocked or the model did not comply with the tool_choice constraint."
    );
  }

  // ── Parse tool input ─────────────────────────────────────────────────────
  type ProjectInput = {
    project_name: string;
    line_242: Line242Content;
    line_244: Line244Content;
    line_246: Line246Content;
    section_c_hints: SectionCHint[];
    document_relationships: Array<{
      document_title: string;
      relationship_type: string;
      supports_line: string | null;
      supports_section: string | null;
      relevance_note: string | null;
    }>;
  };

  type ToolInput = {
    run_summary: string;
    projects: ProjectInput[];
  };

  let toolInput: ToolInput;

  try {
    const raw = toolUseBlock.input as Partial<ToolInput>;
    if (!Array.isArray(raw?.projects)) {
      return await failRun("The AI returned no projects array.");
    }
    toolInput = {
      run_summary: raw.run_summary ?? "",
      projects:    raw.projects as ProjectInput[],
    };
  } catch (err) {
    return await failRun(
      `Failed to parse AI response: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (toolInput.projects.length === 0) {
    return await failRun(
      "The AI returned an empty project list. " +
        "There may be insufficient source material to identify SR&ED projects."
    );
  }

  // ── Build document title → ID lookup map ─────────────────────────────────
  const docTitleToId = new Map(
    documents.map((d) => [d.title.toLowerCase().trim(), d.id])
  );

  // ── 10 + 11. Insert sred_projects and relationships ──────────────────────
  const VALID_RELATIONSHIP_TYPES = new Set([
    "primary_evidence", "supporting_evidence",
    "financial_record", "personnel_record", "prior_art",
  ]);
  const VALID_SUPPORTS_LINE = new Set([
    "line_242", "line_244", "line_246", "section_c", "multiple",
  ]);

  for (const p of toolInput.projects) {
    if (!p.project_name?.trim()) continue;

    const { data: insertedProject, error: projectInsertError } = await supabase
      .from("sred_projects")
      .insert({
        run_id:                  runId,
        fiscal_year_id:          fiscalYearId,
        engagement_id:           engagementId,
        tenant_id:               tenantId,
        project_name:            p.project_name.trim(),
        decision:                "pending",
        line_242_ai_draft:       p.line_242   ?? null,
        line_244_ai_draft:       p.line_244   ?? null,
        line_246_ai_draft:       p.line_246   ?? null,
        section_c_hints_ai_draft: Array.isArray(p.section_c_hints)
          ? p.section_c_hints
          : null,
      } as unknown as never)
      .select("id")
      .single();

    if (projectInsertError || !insertedProject) continue;

    const projectId = (insertedProject as unknown as { id: string }).id;

    // Insert document relationships for this project
    const relationships = (p.document_relationships ?? []).filter(
      (r) => r.document_title?.trim() && VALID_RELATIONSHIP_TYPES.has(r.relationship_type)
    );

    if (relationships.length > 0) {
      const relInserts = relationships.flatMap((r) => {
        const docId = docTitleToId.get(r.document_title.toLowerCase().trim());
        if (!docId) return []; // document not found — skip gracefully
        return [{
          project_id:        projectId,
          document_id:       docId,
          tenant_id:         tenantId,
          relationship_type: r.relationship_type,
          supports_line:     VALID_SUPPORTS_LINE.has(r.supports_line ?? "")
            ? r.supports_line
            : null,
          supports_section: r.supports_section ?? null,
          relevance_note:   r.relevance_note ?? null,
        }];
      });

      if (relInserts.length > 0) {
        await supabase
          .from("project_document_relationships")
          .insert(relInserts as unknown as never);
      }
    }
  }

  // ── 12. Mark run completed ───────────────────────────────────────────────
  await supabase
    .from("discovery_runs")
    .update({
      status:           "completed",
      run_summary:      toolInput.run_summary || null,
      prompt_tokens:    promptTokens,
      completion_tokens: completionTokens,
      completed_at:     new Date().toISOString(),
    } as unknown as never)
    .eq("id", runId);

  // redirect() is OUTSIDE any try/catch — NEXT_REDIRECT must not be caught
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
