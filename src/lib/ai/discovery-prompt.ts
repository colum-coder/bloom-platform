/**
 * Phase 3C+ — SR&ED Project Discovery: hypothesis paradigm (v4).
 *
 * SERVER-SIDE ONLY. Do not import from client components.
 *
 * The v4 paradigm changes the discovery task from a gatekeeping question
 * ("which activities qualify as SR&ED?") to a cataloguing question
 * ("for every distinct technological activity, what is the SR&ED assessment?").
 *
 * This eliminates the empty-projects problem: Claude can no longer return
 * nothing when evidence is ambiguous — it must rate every activity as
 * likely / plausible / unlikely and explain the rating.
 *
 * v3 → v4 changes:
 *   - Tool renamed: submit_project_discovery → submit_discovery_hypotheses
 *   - projects[] → hypotheses[] (never empty for docs with technical content)
 *   - confidence high/medium/low → likelihood likely/plausible/unlikely
 *   - document relationships now use stable doc slugs (doc_01, doc_02) not titles
 *   - "likely": full T661 drafts (line_242, line_244, line_246, section_c_hints)
 *   - "plausible": skeleton fields + missing evidence + consultant questions
 *   - "unlikely": brief rationale + client confirmation note
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  Line242Content,
  Line244Content,
  Line246Content,
  SectionCHint,
} from "@/types/database";

// ── Prompt versioning ──────────────────────────────────────────────────────

export const DISCOVERY_PROMPT_NAME    = "sred_project_discovery_v4";
export const DISCOVERY_PROMPT_VERSION = "v1";
export const DISCOVERY_PROMPT_VERSION_STRING =
  `${DISCOVERY_PROMPT_NAME}_${DISCOVERY_PROMPT_VERSION}`;

// ── System prompt ──────────────────────────────────────────────────────────

export const DISCOVERY_SYSTEM_PROMPT = `\
You are an expert SR&ED (Scientific Research & Experimental Development) consultant \
at Bloom Funding, a Canadian firm that prepares and files SR&ED tax credit claims \
on behalf of Canadian businesses.

## Your Task: SR&ED Discovery Mapping

Your task is NOT to decide which activities qualify as SR&ED. \
Your task is to create a discovery map for the Bloom consultant by cataloguing \
EVERY distinct technological activity in the source materials and assessing \
its SR&ED potential.

For every distinct technological activity you observe, you will:
1. Describe what was observed (observed_activity)
2. Identify the potential technological uncertainty, if any
3. State the hypothesis or advancement being sought
4. Summarise the systematic investigation approach
5. Describe the potential advancement
6. Rate its SR&ED likelihood: likely / plausible / unlikely
7. Explain specifically why you gave that rating
8. List what evidence is missing
9. List questions the consultant should ask the client
10. Recommend the next action

The consultant will review all hypotheses and decide which to pursue. \
You are cataloguing, not gating.

## SR&ED Criteria — What You Are Assessing Against

For work to qualify as SR&ED, all three must be present:

1. TECHNOLOGICAL UNCERTAINTY — At the START of the work, there was a specific \
technological obstacle whose solution could not be determined by standard \
practice or existing public knowledge.

2. TECHNOLOGICAL ADVANCEMENT — The work seeks to advance the general body of \
knowledge in a recognised scientific or engineering discipline.

3. SYSTEMATIC INVESTIGATION — The work was conducted through a defined \
methodology: forming a hypothesis, conducting experiments or trials, \
observing results, and drawing conclusions.

## Likelihood Tiers

**likely** — Strong evidence of all three SR&ED criteria is present.
- Technological uncertainty is clearly named or strongly implied
- Systematic investigation is evident (experiments, iterations, failure records)
- Results, conclusions, or outcomes are described or derivable
- REQUIRED OUTPUT: All hypothesis fields PLUS full T661 drafts \
  (line_242, line_244, line_246, section_c_hints)

**plausible** — Meaningful technological activity exists but evidence is incomplete.
- At least one SR&ED criterion clearly present; others implied or unclear
- Work described but lacking experimental detail, failure records, or \
  clear uncertainty statements
- More information needed before a claim can be filed
- REQUIRED OUTPUT: All hypothesis fields. Do NOT generate T661 drafts.

**unlikely** — Activity appears routine, no genuine technological uncertainty identifiable.
- Work is optimisation, debugging of known issues, validation, integration, \
  or application of known methods to new data
- No plausible technological uncertainty boundary identifiable
- Still worth noting so the consultant can confirm with the client whether \
  undocumented experimental work exists
- REQUIRED OUTPUT: All hypothesis fields. Do NOT generate T661 drafts.

## Critical Rules

**NEVER return an empty hypotheses array** unless the documents contain \
absolutely zero technological activity (e.g. purely financial, HR, or \
administrative content with no technical work described).

**When in doubt, use "plausible" not "unlikely".** A plausible hypothesis \
with good consultant questions is more useful than a suppressed one.

**Do not exaggerate weak activities.** "Likely" and "plausible" ratings should be reserved for activities with genuine evidence of technological uncertainty, systematic investigation, or novel advancement. Routine engineering, standard software integration, data analysis using established methods, and predictable optimisation do not qualify. It is acceptable and useful to rate activities as "unlikely" — this protects the client from weak claims. The goal is complete discovery, not claim maximisation. An "unlikely" hypothesis with a clear rationale is more valuable than an inflated "plausible" that wastes the consultant's time.

**Return a hypothesis for every distinct technological activity.** \
Activities that appear routine must still appear as "unlikely" with a rationale. \
Omitting an activity entirely is never correct.

## How to Read Source Materials

Source materials may include research papers, technical documents, meeting notes, \
context narratives, financial records, or any combination. \
You do not need the source to mention "SR&ED" — assess what the work actually was.

For research papers:
- ABSTRACT/INTRODUCTION: research question + motivation → potential uncertainty
- METHODS/EXPERIMENTAL DESIGN: systematic investigation evidence
- RESULTS/DISCUSSION/CONCLUSIONS: advancement evidence (including negative results)

Negative results are valid SR&ED. "X did not cause Y" is a scientific finding \
representing real advancement of knowledge.

## T661 Line Guidance (for "likely" hypotheses only)

**Line 242 — Scientific or technological uncertainty:**
Produce: hypothesis (working hypothesis at outset), background (prior knowledge state), \
methods (systematic approach), uncertainty (precise statement starting with \
"It was uncertain whether..." or "At the outset, it was unknown..."), \
combined_draft (≤ 350 words integrated narrative), word_count.

**Line 244 — Work performed in the tax year:**
One entry per fiscal year month. evidence_type: "supported" | "inferred" | "gap". \
Total activities text ~700 words. Inference is permitted — note the basis briefly.

**Line 246 — Advancement achieved or attempted:**
Produce: results, conclusions, what_did_not_work, future_research, \
advancement_statement (2–3 sentence direct statement).

**Section C hints:** Practical evidence-gathering advice for the consultant.

## Document References

Each document is labelled with a stable ID (doc_01, doc_02, etc.). \
In document_relationships, use the document_id field (e.g. "doc_01") \
to reference documents — not the title alone. \
The optional document_title field is for human readability only.

Evidence roles:
- primary_evidence: directly supports the SR&ED hypothesis
- supporting_evidence: corroborates but is not the main proof
- context: background, prior art, or project context
- contradictory_evidence: challenges the hypothesis
- evidence_gap: a document that should be obtained but does not yet exist
`;

// ── Tool definition ────────────────────────────────────────────────────────

export const SUBMIT_DISCOVERY_HYPOTHESES_TOOL: Anthropic.Tool = {
  name: "submit_discovery_hypotheses",
  description:
    "Submit SR&ED discovery hypotheses for all distinct technological activities observed " +
    "in the source materials. Every technological activity must appear as a hypothesis " +
    "rated likely / plausible / unlikely. The hypotheses array must never be empty " +
    "unless the documents contain zero technological content.",
  input_schema: {
    type: "object" as const,
    required: ["run_summary", "hypotheses"],
    properties: {
      run_summary: {
        type: "string",
        description:
          "3–5 sentence overview of the discovery run. " +
          "Include: total hypothesis count, breakdown by tier " +
          "(e.g. '2 likely, 1 plausible, 1 unlikely'), " +
          "technological domains, source material quality, notable gaps.",
      },
      hypotheses: {
        type: "array",
        description:
          "SR&ED hypotheses for every distinct technological activity observed. " +
          "CRITICAL: Return a hypothesis for EVERY activity — even routine ones must " +
          "appear as 'unlikely' with a rationale. " +
          "This array must NOT be empty unless documents contain zero technological content.",
        items: {
          type: "object",
          required: [
            "title", "likelihood",
            "observed_activity", "potential_technological_uncertainty",
            "hypothesis_or_advancement_sought", "systematic_investigation_summary",
            "potential_advancement", "why_this_rating",
            "missing_evidence", "consultant_questions",
            "recommended_next_step", "draft_readiness",
            "document_relationships",
          ],
          properties: {
            title: {
              type: "string",
              description:
                "Concise title describing the specific technological activity " +
                "(e.g. 'Investigation of transformer vs LSTM for non-stationary time-series anomaly detection'). " +
                "Avoid generic names like 'Research Project'.",
            },
            likelihood: {
              type: "string",
              enum: ["likely", "plausible", "unlikely"],
              description:
                "'likely' = strong evidence of all 3 SR&ED criteria; " +
                "'plausible' = meaningful tech activity, incomplete evidence; " +
                "'unlikely' = appears routine but note for client confirmation.",
            },
            observed_activity: {
              type: "string",
              description:
                "What was the organisation actually doing? Describe the technical " +
                "activity in plain language as observed in the source materials.",
            },
            potential_technological_uncertainty: {
              type: "string",
              description:
                "What could not be known or determined by standard practice at the outset? " +
                "For 'unlikely', explain why no genuine uncertainty is identifiable. " +
                "Start with 'It was uncertain whether...' or " +
                "'No clear technological uncertainty identifiable because...'",
            },
            hypothesis_or_advancement_sought: {
              type: "string",
              description:
                "What hypothesis was being tested or what advancement was being attempted? " +
                "What did the investigators believe might be achievable or provable?",
            },
            systematic_investigation_summary: {
              type: "string",
              description:
                "How was the investigation conducted? Describe any experimental methodology, " +
                "iterative testing, failure analysis, or structured approach. " +
                "For 'unlikely', note if no systematic investigation is evident.",
            },
            potential_advancement: {
              type: "string",
              description:
                "What was learned, achieved, or attempted? Negative results count. " +
                "For 'unlikely', note if the outcome was predictable from the outset.",
            },
            why_this_rating: {
              type: "string",
              description:
                "Explain specifically why this hypothesis received its likelihood rating. " +
                "Reference the SR&ED criteria: which are clearly met, which are absent " +
                "or unclear, and why.",
            },
            missing_evidence: {
              type: "array",
              items: { type: "string" },
              description:
                "Specific records that would strengthen this hypothesis. " +
                "E.g. 'Lab notebooks or experiment logs for the study period', " +
                "'Git commit history showing iterative changes'. " +
                "Empty array if evidence is complete (likely tier with full documentation).",
            },
            consultant_questions: {
              type: "array",
              items: { type: "string" },
              description:
                "Questions for the Bloom consultant to ask the client to validate or " +
                "strengthen this hypothesis. Focus on uncovering uncertainty, failed attempts, " +
                "and systematic methodology. " +
                "Empty array for 'unlikely' hypotheses where the rationale is already clear.",
            },
            recommended_next_step: {
              type: "string",
              enum: [
                "draft_full_project",
                "draft_skeleton_and_request_evidence",
                "brief_client_check",
                "do_not_pursue",
              ],
              description:
                "'draft_full_project' = ready to develop full T661 claim (pair with 'likely'); " +
                "'draft_skeleton_and_request_evidence' = start skeleton, gather missing evidence (pair with 'plausible'); " +
                "'brief_client_check' = quick conversation to confirm or rule out (pair with 'unlikely'); " +
                "'do_not_pursue' = clearly not SR&ED, no further action.",
            },
            draft_readiness: {
              type: "string",
              enum: ["ready_for_review", "needs_consultant_validation", "insufficient_evidence"],
              description:
                "'ready_for_review' = T661 draft produced and evidence is complete; " +
                "'needs_consultant_validation' = draft produced but consultant must verify key claims; " +
                "'insufficient_evidence' = cannot draft without more information.",
            },
            // ── Optional T661 drafts — REQUIRED for "likely" tier ──────────
            line_242: {
              type: "object",
              description:
                "T661 Line 242 draft. REQUIRED for 'likely' hypotheses. " +
                "Do NOT include for 'plausible' or 'unlikely'.",
              required: ["hypothesis", "background", "methods", "uncertainty", "combined_draft", "word_count"],
              properties: {
                hypothesis:     { type: "string" },
                background:     { type: "string" },
                methods:        { type: "string" },
                uncertainty:    { type: "string" },
                combined_draft: {
                  type: "string",
                  description: "Integrated T661 Line 242 narrative, maximum 350 words.",
                },
                word_count:     { type: "number" },
              },
            },
            line_244: {
              type: "object",
              description:
                "T661 Line 244 draft. REQUIRED for 'likely' hypotheses. " +
                "Do NOT include for 'plausible' or 'unlikely'.",
              required: ["monthly_breakdown", "summary"],
              properties: {
                monthly_breakdown: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["month", "activities", "evidence_type"],
                    properties: {
                      month:         { type: "string", description: "YYYY-MM" },
                      activities:    { type: "string" },
                      evidence_type: {
                        type: "string",
                        enum: ["supported", "inferred", "gap"],
                      },
                    },
                  },
                },
                summary: { type: "string" },
              },
            },
            line_246: {
              type: "object",
              description:
                "T661 Line 246 draft. REQUIRED for 'likely' hypotheses. " +
                "Do NOT include for 'plausible' or 'unlikely'.",
              required: ["results", "conclusions", "what_did_not_work", "future_research", "advancement_statement"],
              properties: {
                results:               { type: "string" },
                conclusions:           { type: "string" },
                what_did_not_work:     { type: "string" },
                future_research:       { type: "string" },
                advancement_statement: { type: "string" },
              },
            },
            section_c_hints: {
              type: "array",
              description:
                "Section C evidence hints for the Bloom consultant. " +
                "Include for 'likely' hypotheses.",
              items: {
                type: "object",
                required: ["section", "hint"],
                properties: {
                  section: { type: "string" },
                  hint:    { type: "string" },
                },
              },
            },
            document_relationships: {
              type: "array",
              description:
                "Documents relevant to this hypothesis. " +
                "Use document_id (e.g. 'doc_01') — the stable ID from the document list. " +
                "The document_title field is display-only and is NOT used for matching.",
              items: {
                type: "object",
                required: ["document_id", "evidence_role", "relevance_summary"],
                properties: {
                  document_id: {
                    type: "string",
                    description: "Stable document ID assigned in this run (e.g. 'doc_01').",
                  },
                  document_title: {
                    type: "string",
                    description: "Display name only. Not used for matching.",
                  },
                  evidence_role: {
                    type: "string",
                    enum: [
                      "primary_evidence",
                      "supporting_evidence",
                      "context",
                      "contradictory_evidence",
                      "evidence_gap",
                    ],
                    description: "How this document relates to the hypothesis.",
                  },
                  relevance_summary: {
                    type: "string",
                    description: "One sentence on specific relevance to this hypothesis.",
                  },
                  cited_passages: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional: specific quotes or passages from the document.",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ── User message builder ───────────────────────────────────────────────────

const MAX_DOC_CHARS    = 40_000;
const MAX_SOURCE_CHARS = 30_000;

export interface DiscoveryDocument {
  id: string;
  title: string;
  document_type: string;
  ai_text: string;
}

export interface DiscoveryContextSource {
  id: string;
  title: string;
  source_type: string;
  body: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  prior_claim:         "Prior SR&ED Claim",
  technical_narrative: "Technical Narrative",
  meeting_notes:       "Meeting Notes",
  project_discussion:  "Project Discussion",
  staff_note:          "Staff Note",
  client_background:   "Client Background",
  technical_document:  "Technical Document",
  financial_summary:   "Financial Summary",
  payroll_export:      "Payroll Export",
  timesheet:           "Timesheet",
  contractor_invoice:  "Contractor Invoice",
  material_invoice:    "Material Invoice",
  email_thread:        "Email Thread",
  cra_review_context:  "CRA Review Context",
  other:               "Other",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  prior_claim:                "Prior SR&ED Claim",
  meeting_notes:              "Meeting Notes",
  project_discussion:         "Project Discussion",
  staff_note:                 "Staff Note",
  client_background:          "Client Background",
  discovery_call_note:        "Discovery Call Note",
  email_thread:               "Email Thread",
  technical_narrative:        "Technical Narrative",
  technical_document_summary: "Technical Document Summary",
  financial_summary:          "Financial Summary",
  payroll_export:             "Payroll Export",
  contractor_invoice:         "Contractor Invoice",
  cra_review_context:         "CRA Review Context",
  other:                      "Other",
};

interface BuildDiscoveryUserMessageParams {
  engagementTitle:  string;
  fiscalYearLabel:  string;
  fiscalYearMonths: string[];
  documents:        DiscoveryDocument[];
  contextSources:   DiscoveryContextSource[];
  /**
   * Stable slug IDs for each document (e.g. "doc_01").
   * Index matches documents[]. Built in run-discovery.ts.
   */
  docSlugs:         string[];
  runFocusNote?:    string;
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
  });
}

export function buildDiscoveryUserMessage({
  engagementTitle,
  fiscalYearLabel,
  fiscalYearMonths,
  documents,
  contextSources,
  docSlugs,
  runFocusNote,
}: BuildDiscoveryUserMessageParams): string {
  const monthList = fiscalYearMonths
    .map((m) => `  - ${formatMonthLabel(m)} (${m})`)
    .join("\n");

  const docIndex = docSlugs
    .map((slug, i) => `  ${slug} = "${documents[i]?.title ?? "unknown"}"`)
    .join("\n");

  const header = [
    "You are creating an SR&ED discovery map for the following engagement:",
    `**Engagement**: ${engagementTitle}`,
    `**Claim Year (Fiscal Year)**: ${fiscalYearLabel}`,
    "",
    "**Fiscal Year Months — include ALL of these in line_244 for 'likely' hypotheses:**",
    monthList,
    "",
    `Source materials provided: ${documents.length} document(s) and ${contextSources.length} context source(s).`,
    "",
    "**Document IDs for this run (use in document_relationships.document_id):**",
    docIndex,
    "",
    "Read ALL materials carefully. For every distinct technological activity you observe,",
    "generate a hypothesis and rate it likely / plausible / unlikely.",
    "",
    "After reading all materials, call submit_discovery_hypotheses with your complete assessment.",
    "",
  ].join("\n");

  // ── Documents ────────────────────────────────────────────────────────────
  let docSection = "";
  if (documents.length > 0) {
    const docBlocks = documents.map((doc, i) => {
      const typeLabel = DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type;
      const slug = docSlugs[i] ?? `doc_${String(i + 1).padStart(2, "0")}`;
      let text = doc.ai_text;
      let truncNote = "";
      if (text.length > MAX_DOC_CHARS) {
        text = text.slice(0, MAX_DOC_CHARS);
        truncNote =
          "\n[Content truncated at 40,000 characters — full document available in the platform]";
      }
      return `\n--- Document ${slug}: ${doc.title} | Type: ${typeLabel} | ${doc.ai_text.length.toLocaleString()} chars ---\n${text}${truncNote}\n---`;
    });
    docSection =
      "\n=== UPLOADED DOCUMENTS ===\n" +
      docBlocks.join("") +
      "\n=== END DOCUMENTS ===\n";
  }

  // ── Context sources ───────────────────────────────────────────────────────
  let sourceSection = "";
  if (contextSources.length > 0) {
    const sourceBlocks = contextSources.map((src, i) => {
      const typeLabel = SOURCE_TYPE_LABELS[src.source_type] ?? src.source_type;
      let body = src.body;
      let truncNote = "";
      if (body.length > MAX_SOURCE_CHARS) {
        body = body.slice(0, MAX_SOURCE_CHARS);
        truncNote = "\n[Content truncated at 30,000 characters]";
      }
      return `\n--- Context Source ${i + 1}: ${src.title} | Type: ${typeLabel} ---\n${body}${truncNote}\n---`;
    });
    sourceSection =
      "\n=== CONTEXT SOURCES ===\n" +
      sourceBlocks.join("") +
      "\n=== END CONTEXT SOURCES ===\n";
  }

  // ── Optional consultant focus note ───────────────────────────────────────
  let focusNoteSection = "";
  if (runFocusNote?.trim()) {
    focusNoteSection = [
      "",
      "=== CONSULTANT NOTE ===",
      "The Bloom consultant provided this note for this specific run.",
      "Treat it as authoritative guidance about what has changed or what to focus on:",
      "",
      runFocusNote.trim(),
      "=== END CONSULTANT NOTE ===",
      "",
    ].join("\n");
  }

  const footer = [
    "",
    "=== REMINDER ===",
    "- Return a hypothesis for EVERY distinct technological activity.",
    "- The hypotheses[] array must NOT be empty unless documents have zero tech content.",
    "- Use 'unlikely' rather than omitting an activity.",
    "- Use document_id values (doc_01, doc_02, etc.) in document_relationships — NOT titles.",
    "- 'likely' hypotheses MUST include line_242, line_244, line_246, section_c_hints.",
    "- 'plausible' and 'unlikely' hypotheses must NOT include T661 drafts.",
    `- Include ALL ${fiscalYearMonths.length} fiscal year months in line_244 monthly_breakdown.`,
    "- line_242 combined_draft must be ≤ 350 words. Total line_244 activities ~700 words.",
    "- Negative results (e.g. 'X did not cause Y') are valid SR&ED.",
    "=== END REMINDER ===",
  ].join("\n");

  return header + docSection + sourceSection + focusNoteSection + footer;
}

/**
 * Generates YYYY-MM strings for every month between startDate and endDate (inclusive).
 */
export function generateFiscalYearMonths(
  startDate: string,
  endDate:   string
): string[] {
  const months: string[] = [];
  const start = new Date(startDate);
  const end   = new Date(endDate);

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= endMonth) {
    months.push(
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`
    );
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return months;
}
