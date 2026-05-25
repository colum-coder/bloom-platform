/**
 * Phase 3C: Project Discovery prompt definitions and tool schema.
 *
 * SERVER-SIDE ONLY. Do not import from client components.
 *
 * Exports:
 *   DISCOVERY_PROMPT_VERSION_STRING  — version stored on every discovery_run row
 *   DISCOVERY_SYSTEM_PROMPT          — Anthropic system prompt for project discovery
 *   SUBMIT_PROJECT_DISCOVERY_TOOL    — tool definition for the Anthropic API
 *   buildDiscoveryUserMessage        — formats documents + context sources into the user message
 *
 * The tool schema asks Claude to produce T661 Part 2 draft content for each
 * identified SR&ED project:
 *   line_242 — Advancement sought (narrative)
 *   line_244 — Monthly work description (one entry per fiscal year month)
 *   line_246 — Technological uncertainty (structured fields)
 *   section_c_hints — Supporting evidence hints for Section C
 *   document_relationships — which documents support each project and how
 *
 * v1 → v2: Revised to handle research papers and technical documents correctly.
 *   Research papers with uncertainty/methods/results qualify as SR&ED source material
 *   regardless of whether they are written as SR&ED claim documents. Negative results
 *   are valid. no_projects_reason field added to explain empty output.
 */

import type Anthropic from "@anthropic-ai/sdk";

// ── Prompt versioning ──────────────────────────────────────────────────────

export const DISCOVERY_PROMPT_NAME    = "sred_project_discovery_v2";
export const DISCOVERY_PROMPT_VERSION = "v2";
export const DISCOVERY_PROMPT_VERSION_STRING =
  `${DISCOVERY_PROMPT_NAME}_${DISCOVERY_PROMPT_VERSION}`;
// → "sred_project_discovery_v2_v2"

// ── System prompt ──────────────────────────────────────────────────────────

export const DISCOVERY_SYSTEM_PROMPT = `\
You are an expert SR&ED (Scientific Research & Experimental Development) consultant \
at Bloom Funding, a Canadian firm that prepares and files SR&ED tax credit claims \
on behalf of Canadian businesses.

Your task is to analyse all provided source materials and identify qualifying SR&ED \
projects. For each project, you will draft T661 Part 2 content that a Bloom consultant \
will review and refine before the CRA submission.

## SR&ED Eligibility — All Three Criteria Required

For work to qualify as SR&ED, all three of the following must be present:

1. TECHNOLOGICAL UNCERTAINTY — At the START of the work, there must have been a \
specific technological obstacle whose solution could not be determined by standard \
practice or existing public knowledge. The key question is: was the outcome known \
in advance, or did the investigators genuinely not know if/how it could be achieved?

2. TECHNOLOGICAL ADVANCEMENT — The work must seek to advance the general body of \
knowledge in a recognized scientific or engineering discipline (biology, chemistry, \
computer science, engineering, medicine, etc.).

3. SYSTEMATIC INVESTIGATION — The work must be conducted through a defined methodology: \
forming a hypothesis, designing and conducting experiments or trials, observing and \
recording results, and drawing conclusions. Ad hoc guesswork does not qualify; \
structured experimental work does.

## Source Material Types — What You Will Be Given

Source materials may include ANY of the following:
- Published or unpublished research papers describing scientific or technical experiments
- Internal technical documents, design documents, or technical memos
- Meeting notes, project discussions, or discovery call notes
- Client-generated SR&ED narratives or prior claim documents
- Financial summaries, payroll records, or cost documentation

**You do not need the source to explicitly mention "SR&ED."** Your job is to read what \
is described and assess whether the described work meets the three criteria above.

## How to Read Research Papers as SR&ED Source Material

Published research papers are often the best evidence of SR&ED-eligible work. When you \
encounter a paper or technical document, treat it as a description of work the \
organisation performed. Assess it as follows:

- ABSTRACT/INTRODUCTION: Usually states the research question and motivation. Look for \
  the uncertainty — what was being tested or investigated and why the answer was unknown.
- BACKGROUND/PRIOR ART: Establishes the state of existing knowledge. This helps define \
  the technological uncertainty boundary.
- METHODS/EXPERIMENTAL DESIGN: Describes the systematic investigation — how experiments \
  were designed, what models or tools were used, what was measured. This evidences \
  systematic investigation.
- RESULTS: Describes what was observed. This is the outcome of the investigation.
- DISCUSSION/CONCLUSIONS: Explains what was learned. This is the advancement — even if \
  the result was negative.

**NEGATIVE RESULTS ARE VALID SR&ED.** A paper that concludes "X did not cause Y" is \
still documenting SR&ED work. The uncertainty existed at the outset, the investigation \
was systematic, and the finding that X does not cause Y is itself a scientific \
advancement — it narrows the solution space and contributes to the body of knowledge.

## Confidence Levels — Use Them Rather Than Returning Nothing

Use these levels honestly and proportionally:

- **high**: All three SR&ED criteria are clearly present in the source material — \
  a specific uncertainty is named, the methodology is systematic, and results or \
  conclusions are described.
- **medium**: Evidence of all three criteria exists but some elements are implicit or \
  could be strengthened by additional documentation.
- **low**: The work plausibly qualifies but the evidence is thin, indirect, or ambiguous. \
  The consultant will need to gather more information.

**Always prefer a low-confidence project over returning nothing.** A low-confidence \
project is a starting point for the consultant — it flags that the work might qualify \
and prompts them to ask the right questions. Returning nothing when SR&ED-like work is \
described deprives the client of a potential claim.

## Identifying SR&ED Projects

- One project = one distinct technological challenge with its own uncertainty, \
  advancement, and experimental approach.
- Do NOT create one project per document or one project per experiment. Synthesize \
  across all materials for the same underlying challenge.
- If a single paper describes multiple distinct research questions with different \
  hypotheses, create a project for each distinct question.
- If the materials are limited (e.g., a single paper), still draft projects — even \
  partial drafts with medium or low confidence are more useful than an empty list.

## T661 Part 2 — What Each Line Covers

**Line 242 — Advancement sought:**
Describe the scientific or technological advancement this project was trying to achieve. \
What new knowledge or capability was the claimant seeking? Use the paper's framing but \
write it as the claimant's goal, not just the paper's title.

**Line 244 — Monthly work description:**
For each month of the fiscal year provided, describe what SR&ED work was performed. \
If the source material does not specify when individual activities occurred (e.g., a \
published paper reports aggregate results), distribute activities across the claim \
year based on context clues (publication date, study period, submission history). \
Note assumptions in the summary. For months where no activity is evidenced, write \
exactly: "No SR&ED activity evidenced in available materials for this period."

**Line 246 — Technological uncertainty:**
State what was unknown at the start of the work and why. For research papers, the \
introduction and research question usually contain this directly. Restate it as a \
clear uncertainty claim, explain the experimental approach used, and explain why \
existing methods, models, or literature were insufficient to answer it without \
performing the work.

**Section C hints:**
Provide practical hints for the Bloom consultant. Typical hints include: what additional \
records (lab notebooks, git logs, meeting notes, timesheets) would strengthen the claim, \
which sections of the T661 Technical Report still need evidence, and what questions to \
ask the client about the study period and personnel.

## Document Relationships

For each project, list relevant documents with:
- relationship_type: how the document supports the project
- supports_line: which T661 line it primarily evidences
- relevance_note: one sentence on specific relevance

## When to Return Zero Projects

Return zero projects ONLY if ALL of the following are true:
- The materials contain no identifiable technological uncertainty
- OR the described work is purely routine (no experiments, no unknown outcomes)
- OR the materials contain only administrative/financial content with no technical work

If you return zero projects, you MUST populate no_projects_reason with a specific \
explanation of why — what criteria were missing and what would need to change for \
projects to be identifiable. "Insufficient material" alone is not acceptable.

## Run Summary

The run_summary should give Bloom a 3–5 sentence overview: how many projects identified, \
what technological domain, quality of source materials, and any significant gaps. If zero \
projects, the summary should explain the specific gap.
`;

// ── Tool definition ────────────────────────────────────────────────────────

export const SUBMIT_PROJECT_DISCOVERY_TOOL: Anthropic.Tool = {
  name: "submit_project_discovery",
  description:
    "Submit all identified SR&ED projects with T661 Part 2 draft content and a run-level summary. " +
    "If no projects are identified, still call this tool with an empty projects array and populate no_projects_reason.",
  input_schema: {
    type: "object" as const,
    required: ["run_summary", "projects"],
    properties: {
      run_summary: {
        type: "string",
        description:
          "3–5 sentence plain-English summary of the discovery run findings. " +
          "Include: number of projects found, technological domain, source material quality, gaps. " +
          "If zero projects, explain specifically what criteria were missing.",
      },
      no_projects_reason: {
        type: "string",
        description:
          "REQUIRED if projects array is empty. " +
          "Explain specifically: (1) what SR&ED criteria were present in the materials, " +
          "(2) what criteria were absent or unclear, and " +
          "(3) what the consultant should do to enable a project to be identified. " +
          "Be specific — reference the actual content of the source materials.",
      },
      projects: {
        type: "array",
        description:
          "All SR&ED projects identified from the source materials. " +
          "Prefer low-confidence projects over an empty list. " +
          "Return an empty array only if the materials genuinely contain no identifiable technological uncertainty.",
        items: {
          type: "object",
          required: ["project_name", "line_242", "line_244", "line_246", "section_c_hints", "document_relationships"],
          properties: {
            project_name: {
              type: "string",
              description:
                "A concise, specific project title describing the technological challenge " +
                "(e.g. 'Investigation of selective microglial progranulin depletion on NCL neuropathology'). " +
                "Avoid generic names like 'Research Project'.",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "Confidence that this project meets SR&ED criteria. " +
                "Use 'low' rather than omitting the project entirely.",
            },
            line_242: {
              type: "object",
              required: ["narrative"],
              description: "T661 Part 2, Line 242 — Advancement sought.",
              properties: {
                narrative: {
                  type: "string",
                  description:
                    "1–3 paragraph description of the scientific or technological advancement sought. " +
                    "What new knowledge or capability was being pursued?",
                },
              },
            },
            line_244: {
              type: "object",
              required: ["monthly_breakdown", "summary"],
              description: "T661 Part 2, Line 244 — Monthly work description.",
              properties: {
                monthly_breakdown: {
                  type: "array",
                  description:
                    "One entry per fiscal year month. Include every month provided. " +
                    "If the source does not specify monthly timing, distribute work across the claim period " +
                    "based on context (study duration, publication date, etc.) and note assumptions in the summary.",
                  items: {
                    type: "object",
                    required: ["month", "activities"],
                    properties: {
                      month: {
                        type: "string",
                        description: "YYYY-MM format, e.g. '2023-04'.",
                      },
                      activities: {
                        type: "string",
                        description:
                          "SR&ED work performed this month based on source materials. " +
                          "If no activity evidenced: 'No SR&ED activity evidenced in available materials for this period.'",
                      },
                    },
                  },
                },
                summary: {
                  type: "string",
                  description:
                    "2–3 sentence overall summary of work performed. " +
                    "Note any assumptions made about timing if the source did not specify monthly detail.",
                },
              },
            },
            line_246: {
              type: "object",
              required: ["uncertainty_statement", "approach_description", "standard_practice_gap"],
              description: "T661 Part 2, Line 246 — Technological uncertainty.",
              properties: {
                uncertainty_statement: {
                  type: "string",
                  description:
                    "A direct statement of what was unknown at the start of the work. " +
                    "Start with 'It was uncertain whether...' or 'At the outset of this work, it was unknown...'",
                },
                approach_description: {
                  type: "string",
                  description:
                    "How the claimant approached resolving the uncertainty — hypothesis, experimental design, methodology.",
                },
                standard_practice_gap: {
                  type: "string",
                  description:
                    "Why standard practice or existing public knowledge was insufficient. " +
                    "What tools, models, or prior literature existed and why they did not resolve the uncertainty.",
                },
              },
            },
            section_c_hints: {
              type: "array",
              description:
                "Practical hints for the Bloom consultant about evidence gaps and documentation opportunities.",
              items: {
                type: "object",
                required: ["section", "hint"],
                properties: {
                  section: {
                    type: "string",
                    description:
                      "T661 Technical Report section (e.g. 'Work performed', 'Results and conclusions').",
                  },
                  hint: {
                    type: "string",
                    description:
                      "Specific, actionable advice (e.g. 'Request lab notebooks or data logs for the study period').",
                  },
                },
              },
            },
            document_relationships: {
              type: "array",
              description:
                "Documents from the provided list relevant to this project. " +
                "Only use document titles that exactly match names in the provided source list.",
              items: {
                type: "object",
                required: ["document_title", "relationship_type", "supports_line", "relevance_note"],
                properties: {
                  document_title: {
                    type: "string",
                    description: "Exact title of the document as provided.",
                  },
                  relationship_type: {
                    type: "string",
                    enum: [
                      "primary_evidence",
                      "supporting_evidence",
                      "financial_record",
                      "personnel_record",
                      "prior_art",
                    ],
                    description: "How this document supports the project.",
                  },
                  supports_line: {
                    type: "string",
                    enum: ["line_242", "line_244", "line_246", "section_c", "multiple"],
                    description: "Which T661 Part 2 line this document primarily supports.",
                  },
                  supports_section: {
                    type: "string",
                    description: "Technical Report section evidenced (e.g. 'Scientific or technological uncertainty').",
                  },
                  relevance_note: {
                    type: "string",
                    description: "One sentence on specific relevance to this project.",
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
  engagementTitle: string;
  fiscalYearLabel: string;
  fiscalYearMonths: string[];
  documents: DiscoveryDocument[];
  contextSources: DiscoveryContextSource[];
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
}: BuildDiscoveryUserMessageParams): string {
  const monthList = fiscalYearMonths
    .map((m) => `  - ${formatMonthLabel(m)} (${m})`)
    .join("\n");

  const header = [
    "You are analysing source materials for the following SR&ED engagement:",
    `**Engagement**: ${engagementTitle}`,
    `**Claim Year (Fiscal Year)**: ${fiscalYearLabel}`,
    "",
    "**Fiscal Year Months — include ALL of these in line_244 monthly_breakdown:**",
    monthList,
    "",
    `Source materials provided: ${documents.length} document(s) and ${contextSources.length} context source(s).`,
    "",
    "Read all materials carefully. Identify any work that involves technological uncertainty, ",
    "systematic investigation, and advancement — regardless of whether the documents were written",
    "as SR&ED claim documents. Research papers, technical studies, and experimental reports are",
    "all valid SR&ED source material.",
    "",
    "After reading, call the submit_project_discovery tool with your complete output.",
    "",
  ].join("\n");

  // ── Documents ────────────────────────────────────────────────────────────
  let docSection = "";
  if (documents.length > 0) {
    const docBlocks = documents.map((doc, i) => {
      const typeLabel = DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type;
      let text = doc.ai_text;
      let truncNote = "";
      if (text.length > MAX_DOC_CHARS) {
        text = text.slice(0, MAX_DOC_CHARS);
        truncNote =
          "\n[Content truncated at 40,000 characters — full document available in the platform]";
      }
      return `\n--- Document ${i + 1}: ${doc.title} | Type: ${typeLabel} | ${doc.ai_text.length.toLocaleString()} characters ---\n${text}${truncNote}\n---`;
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

  const footer = [
    "",
    "=== REMINDER ===",
    `- Include ALL ${fiscalYearMonths.length} fiscal year months in line_244 monthly_breakdown.`,
    "- Research papers and technical documents are valid SR&ED source material.",
    "- Negative results (e.g. 'X did not cause Y') are valid SR&ED — the uncertainty existed at the outset.",
    "- Use low confidence rather than omitting a project entirely.",
    "- If returning zero projects, you MUST populate no_projects_reason explaining specifically what was missing.",
    "=== END REMINDER ===",
  ].join("\n");

  return header + docSection + sourceSection + footer;
}

/**
 * Generates YYYY-MM strings for every month between startDate and endDate (inclusive).
 * Example: generateFiscalYearMonths("2023-04-01", "2024-03-31") → ["2023-04", ..., "2024-03"]
 */
export function generateFiscalYearMonths(
  startDate: string,
  endDate: string
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
