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
 */

import type Anthropic from "@anthropic-ai/sdk";

// ── Prompt versioning ──────────────────────────────────────────────────────

export const DISCOVERY_PROMPT_NAME    = "sred_project_discovery_v2";
export const DISCOVERY_PROMPT_VERSION = "v1";
export const DISCOVERY_PROMPT_VERSION_STRING =
  `${DISCOVERY_PROMPT_NAME}_${DISCOVERY_PROMPT_VERSION}`;
// → "sred_project_discovery_v2_v1"

// ── System prompt ──────────────────────────────────────────────────────────

export const DISCOVERY_SYSTEM_PROMPT = `\
You are an expert SR&ED (Scientific Research & Experimental Development) consultant \
at Bloom Funding, a Canadian firm that prepares and files SR&ED tax credit claims \
on behalf of Canadian businesses.

Your task is to analyse all provided source materials and identify qualifying SR&ED \
projects. For each project, you will draft T661 Part 2 content that a Bloom consultant \
will review and refine before the CRA submission.

## SR&ED Eligibility — All Three Criteria Required

1. TECHNOLOGICAL UNCERTAINTY — The claimant must have faced a genuine technological \
obstacle whose solution could not be determined by standard practice or existing public \
knowledge. Business uncertainty or routine engineering does not qualify.

2. TECHNOLOGICAL ADVANCEMENT — The work must seek to advance the general body of \
knowledge in a recognized scientific or engineering discipline. Advancing only the \
claimant's internal knowledge is insufficient.

3. SYSTEMATIC INVESTIGATION — Work must be conducted through hypothesis, experiment, \
observation of results, and conclusions. Ad hoc trial-and-error does not qualify.

## Identifying SR&ED Projects

— One project corresponds to one distinct technological challenge with its own \
  uncertainty, advancement sought, and experimental approach.
— Do NOT create one project per document. Synthesize across all materials.
— If multiple documents all describe the same technological work, combine them into \
  one project and list all supporting documents in document_relationships.
— If the materials contain clearly distinct R&D streams (e.g., different software \
  modules with different uncertainties, or separate hardware and software challenges), \
  create a separate project for each.
— Typical SR&ED claims have 1 to 5 projects. Do not over-fragment.

## T661 Part 2 — What Each Line Covers

**Line 242 — Advancement sought:**
Describe the scientific or technological advancement this project was trying to achieve. \
Explain what new knowledge or capability the claimant was seeking. Use specific \
technical language. One to three paragraphs.

**Line 244 — Monthly work description:**
For each month of the fiscal year provided to you, describe what SR&ED work was \
performed in that month. If no SR&ED activity is evidenced in the materials for a \
particular month, write exactly: \
"No SR&ED activity evidenced in available materials for this period." \
Do not fabricate activity. Base each month's description only on what the source \
materials reveal. You MUST include an entry for every month in the fiscal year list.

**Line 246 — Technological uncertainty:**
State the specific technological uncertainty that existed at the start of this project.
— uncertainty_statement: A clear, direct statement of what the claimant did not know \
  and could not determine from existing knowledge (e.g., "It was unknown whether X \
  approach could achieve Y performance without Z drawback").
— approach_description: How the claimant approached the uncertainty — what hypothesis \
  was formed and what experimental or investigative approach was taken.
— standard_practice_gap: Why standard practice or publicly available knowledge was \
  insufficient to resolve the uncertainty. Be specific about what standard tools, \
  frameworks, or methods were tried or considered and why they fell short.

**Section C hints:**
Provide practical hints for the Bloom consultant about what additional evidence or \
documentation would strengthen the Technical Report for this project. Reference specific \
sections of the T661 Technical Report (e.g., "Scientific or technological uncertainty", \
"Work performed", "Hypothesis and experimental approach", "Results and conclusions"). \
Each hint should point to a specific gap or opportunity in the evidence.

## Document Relationships

For each project, list which provided documents are relevant and how:
— relationship_type: 'primary_evidence' (directly demonstrates the SR&ED work), \
  'supporting_evidence' (corroborates activity), 'financial_record' (quantifies labour \
  or materials), 'personnel_record' (identifies SR&ED performers), 'prior_art' \
  (establishes state of the art or prior claim context)
— supports_line: which T661 Part 2 line the document primarily supports \
  (line_242, line_244, line_246, section_c, or multiple)
— supports_section: which Technical Report section (e.g., "Work performed", \
  "Systematic investigation")
— relevance_note: one sentence explaining the specific relevance

## Quality Guidelines

— Draft T661 content should be clear, factual, and defensible at a CRA review.
— Do not fabricate technical details not present in the source materials.
— Use precise technical language — avoid vague phrases like "advanced technology".
— If the source materials are insufficient to draft a particular section, write what \
  you can and flag the gap in section_c_hints.
— The run_summary should give Bloom a 3–5 sentence overview of what was found: \
  how many projects identified, the dominant technological domain, and any \
  significant gaps in the source materials.
`;

// ── Tool definition ────────────────────────────────────────────────────────

export const SUBMIT_PROJECT_DISCOVERY_TOOL: Anthropic.Tool = {
  name: "submit_project_discovery",
  description:
    "Submit all identified SR&ED projects with T661 Part 2 draft content and a run-level summary.",
  input_schema: {
    type: "object" as const,
    required: ["run_summary", "projects"],
    properties: {
      run_summary: {
        type: "string",
        description:
          "3–5 sentence plain-English summary of the discovery run findings. " +
          "Include: number of projects found, dominant technological domain, " +
          "quality/quantity of source materials, and any major gaps.",
      },
      projects: {
        type: "array",
        description: "All SR&ED projects identified from the source materials.",
        items: {
          type: "object",
          required: ["project_name", "line_242", "line_244", "line_246", "section_c_hints", "document_relationships"],
          properties: {
            project_name: {
              type: "string",
              description:
                "A concise, specific project title (e.g. 'Adaptive load-balancing algorithm for distributed inference'). " +
                "Avoid generic names like 'Software Development Project'.",
            },
            line_242: {
              type: "object",
              required: ["narrative"],
              description: "T661 Part 2, Line 242 — Advancement sought.",
              properties: {
                narrative: {
                  type: "string",
                  description:
                    "1–3 paragraph description of the scientific or technological advancement sought by this project. " +
                    "Explain what new knowledge or capability the claimant was seeking to develop.",
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
                    "One entry per fiscal year month. You MUST include every month in the fiscal year. " +
                    "If no activity is evidenced for a month, write the required placeholder text.",
                  items: {
                    type: "object",
                    required: ["month", "activities"],
                    properties: {
                      month: {
                        type: "string",
                        description: "Month in YYYY-MM format, e.g. '2023-04'.",
                      },
                      activities: {
                        type: "string",
                        description:
                          "Description of SR&ED work performed in this month based on source materials. " +
                          "If no activity is evidenced: 'No SR&ED activity evidenced in available materials for this period.'",
                      },
                    },
                  },
                },
                summary: {
                  type: "string",
                  description:
                    "2–3 sentence overall summary of the work performed throughout the fiscal year for this project.",
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
                    "A direct statement of the specific technological uncertainty: what was unknown and why it could not " +
                    "be determined from existing knowledge. Start with 'It was uncertain whether...' or similar.",
                },
                approach_description: {
                  type: "string",
                  description:
                    "How the claimant approached resolving the uncertainty: the hypothesis formed and the " +
                    "experimental or investigative methodology used.",
                },
                standard_practice_gap: {
                  type: "string",
                  description:
                    "Why standard practice or existing public knowledge was insufficient. " +
                    "Name specific tools, methods, or frameworks considered and explain why they fell short.",
                },
              },
            },
            section_c_hints: {
              type: "array",
              description:
                "Practical hints for the Bloom consultant about evidence gaps and opportunities " +
                "for strengthening the Technical Report for this project.",
              items: {
                type: "object",
                required: ["section", "hint"],
                properties: {
                  section: {
                    type: "string",
                    description:
                      "The T661 Technical Report section this hint relates to " +
                      "(e.g. 'Work performed', 'Results and conclusions', 'Hypothesis and experimental approach').",
                  },
                  hint: {
                    type: "string",
                    description:
                      "Specific, actionable advice for the consultant " +
                      "(e.g. 'Obtain git commit logs or test run records for the period Apr–Jun 2023 " +
                      "to evidence the hypothesis testing phase').",
                  },
                },
              },
            },
            document_relationships: {
              type: "array",
              description:
                "Documents from the provided list that are relevant to this project. " +
                "Only reference documents whose titles exactly match a document in the provided list.",
              items: {
                type: "object",
                required: ["document_title", "relationship_type", "supports_line", "relevance_note"],
                properties: {
                  document_title: {
                    type: "string",
                    description:
                      "The exact title of the document as provided in the source list.",
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
                    description:
                      "The Technical Report section this document evidences " +
                      "(e.g. 'Scientific or technological uncertainty', 'Work performed').",
                  },
                  relevance_note: {
                    type: "string",
                    description:
                      "One sentence explaining the specific relevance of this document to this project.",
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

// Per-document character limit — prevents any single large document from
// dominating the context window.
const MAX_DOC_CHARS     = 40_000;
const MAX_SOURCE_CHARS  = 30_000;

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
  fiscalYearMonths: string[]; // ["2023-04", "2023-05", ...] in chronological order
  documents: DiscoveryDocument[];
  contextSources: DiscoveryContextSource[];
}

/**
 * Formats fiscal year months as human-readable labels for the prompt.
 * "2023-04" → "April 2023"
 */
function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "long" });
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
    "You are analysing the following SR&ED engagement:",
    `**Engagement**: ${engagementTitle}`,
    `**Claim Year (Fiscal Year)**: ${fiscalYearLabel}`,
    "",
    "**Fiscal Year Months — you MUST include all of these in line_244 monthly_breakdown:**",
    monthList,
    "",
    `You have been provided ${documents.length} AI-ready document(s) and ${contextSources.length} context source(s).`,
    "Analyse ALL materials below, identify SR&ED projects, and call the submit_project_discovery tool.",
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
      return `\n--- Document ${i + 1}: ${doc.title} | ${typeLabel} ---\n${text}${truncNote}\n---`;
    });
    docSection =
      "\n=== UPLOADED DOCUMENTS (AI-ready text) ===\n" +
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
        truncNote =
          "\n[Content truncated at 30,000 characters]";
      }
      return `\n--- Context Source ${i + 1}: ${src.title} | ${typeLabel} ---\n${body}${truncNote}\n---`;
    });
    sourceSection =
      "\n=== CONTEXT SOURCES ===\n" +
      sourceBlocks.join("") +
      "\n=== END CONTEXT SOURCES ===\n";
  }

  const footer = [
    "",
    "=== INSTRUCTIONS ===",
    "1. Identify all SR&ED-eligible projects in the materials above.",
    "2. Draft T661 Part 2 content for each project.",
    `3. For Line 244 monthly_breakdown, include ALL ${fiscalYearMonths.length} months listed above.`,
    "4. Only reference document titles that exactly match names in the Document list above.",
    "5. Call the submit_project_discovery tool with your complete output.",
    "=== END INSTRUCTIONS ===",
  ].join("\n");

  return header + docSection + sourceSection + footer;
}

/**
 * Generates an array of YYYY-MM strings for every month between
 * startDate and endDate (inclusive).
 *
 * Example: generateFiscalYearMonths("2023-04-01", "2024-03-31")
 *   → ["2023-04", "2023-05", ..., "2024-03"]
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
