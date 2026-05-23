/**
 * SR&ED prompt definitions and tool schema.
 *
 * SERVER-SIDE ONLY. Do not import from client components.
 *
 * Exports:
 *   SRED_SYSTEM_PROMPT  — the Anthropic system prompt string
 *   SUBMIT_PROPOSALS_TOOL — the tool definition sent to the Anthropic API
 *   buildUserMessage    — formats the context sources into the user message
 *   SOURCE_TYPE_LABELS  — human-readable labels for all 14 source types
 */

import type Anthropic from "@anthropic-ai/sdk";

// ── Prompt template versioning ─────────────────────────────────────────────
//
// Every ai_suggestion_run stores the prompt version used so output quality
// can be compared as the prompt improves over time.
//
// Naming convention: {template_name}_{version}
//   template_name — kebab-case description of what the prompt does
//   version       — monotonically incrementing vN
//
// INCREMENT the version (v1 → v2) whenever the system prompt or tool schema
// changes in a way that materially affects proposal quality or coverage.
// Do NOT change the name — the name identifies the purpose of the template
// across all versions.
//
// This is stored in code (not a DB table) for Phase 3A. A future Guidance
// Mode can promote templates to a DB-managed library for per-client tuning.

export const PROMPT_NAME    = "sred_project_discovery";
export const PROMPT_VERSION = "v1";

/** Full version string stored on every ai_suggestion_runs row. */
export const PROMPT_VERSION_STRING = `${PROMPT_NAME}_${PROMPT_VERSION}`;
// → "sred_project_discovery_v1"

// ── Source type labels ─────────────────────────────────────────────────────

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  prior_claim:                  "Prior SR&ED Claim",
  meeting_notes:                "Meeting Notes",
  project_discussion:           "Project Discussion",
  staff_note:                   "Staff Note",
  client_background:            "Client Background",
  discovery_call_note:          "Discovery Call Note",
  email_thread:                 "Email Thread",
  technical_narrative:          "Technical Narrative",
  technical_document_summary:   "Technical Document Summary",
  financial_summary:            "Financial Summary",
  payroll_export:               "Payroll Export",
  contractor_invoice:           "Contractor Invoice",
  cra_review_context:           "CRA Review Context",
  other:                        "Other",
};

// ── System prompt ──────────────────────────────────────────────────────────

export const SRED_SYSTEM_PROMPT = `\
You are an expert SR&ED (Scientific Research & Experimental Development) consultant \
analysing source materials for a Canadian SR&ED tax credit claim. You work for Bloom \
Funding, a firm that prepares and files SR&ED claims on behalf of Canadian businesses.

Your task is to analyse the provided source materials and identify all SR&ED-eligible \
activities, people, costs, and evidence gaps. Report your findings using the \
submit_proposals tool.

## SR&ED Eligibility Criteria

All three criteria must be present for work to qualify as SR&ED:

1. TECHNOLOGICAL UNCERTAINTY — There must be a specific technological problem whose \
solution cannot be determined by standard practice or derived from existing public \
knowledge. The claimant must have faced genuine uncertainty about whether — or how — a \
goal could be achieved technologically. Routine software development, known engineering \
approaches, or business uncertainty do not qualify.

2. TECHNOLOGICAL ADVANCEMENT — The work must seek to advance the general body of \
knowledge in science or technology. This is not the same as advancing the claimant's \
own knowledge. The advancement must be in a recognized scientific or engineering \
discipline (computer science, electrical engineering, chemistry, biology, etc.).

3. SYSTEMATIC INVESTIGATION — The work must be conducted through a defined, systematic \
process: forming a hypothesis, designing and conducting experiments or trials, observing \
results, and drawing conclusions. Ad hoc trial-and-error without a defined methodology \
does not qualify.

## Proposal Types

Identify proposals of the following types. Only propose items with genuine SR&ED support \
from the source materials — do not speculate or fabricate:

- project: A distinct SR&ED-eligible R&D project. Each project should address a specific \
  technological challenge. Projects appear in the Technical Report (TR).

- person: An individual who performed SR&ED work. Include the person's role and the \
  nature of their SR&ED contribution. Appears in both TR and Cost Summary (CS).

- evidence: A specific document, artifact, or record that substantiates SR&ED activity \
  (e.g., test logs, git commit descriptions, meeting notes with technical content, \
  technical specs, experimental data).

- hours: Estimated SR&ED labour hours or time allocation for a person, team, or project.

- contractor: A third-party contractor or arm's-length entity that performed SR&ED work. \
  Contractor payments are SR&ED expenditures in the CS.

- material: Materials, components, or supplies consumed or transformed during SR&ED \
  experimentation. Appears in the CS.

- government_support: Government assistance received (grants, subsidies, tax credits from \
  other programs) that must be disclosed and may reduce the SR&ED claim value.

- gap: A gap in the context where information is missing, unclear, or ambiguous and is \
  needed for a complete SR&ED assessment. Use gaps to flag what additional documentation \
  or clarification is required from the client. Be specific about what information is \
  missing and why it matters for the claim.

## Technical Report vs. Cost Summary

Technical Report (TR): describes the scientific/technological content. Includes project \
descriptions, technological uncertainty, advancement sought, systematic investigation \
approach, experiments, results, and conclusions. All "project" proposals belong in the TR.

Cost Summary (CS): quantifies SR&ED expenditures. Includes salaries of SR&ED performers, \
contractor payments, materials consumed in experiments, and overhead allocations. \
"person", "hours", "contractor", and "material" proposals belong in the CS.

## Source Snippets (Critical)

For each proposal, include the specific passages that support it in the "sources" array. \
Each snippet:
- MUST be a verbatim excerpt from the source document — copy the exact text
- MUST be approximately 200 characters in length
- MUST come only from the provided source materials — never fabricate or paraphrase a snippet
- SHOULD be the most specific passage that evidences the SR&ED activity

If a proposal has no supporting passage in the source materials, do not include the \
proposal — it is a speculation, not a finding.

## Quality Guidelines

- Prefer fewer, higher-confidence proposals over many speculative ones
- Each project proposal must identify the specific technological uncertainty
- Flag as "gap" anything a reviewer would need before the claim can be filed
- For the run_summary, identify which calendar months show SR&ED activity (YYYY-MM format)
  and which standard Technical Report sections are and are not evidenced in the context
- Standard TR sections: "Project description", "Scientific or technological advancement", \
  "Scientific or technological uncertainty", "Work performed", \
  "Hypothesis and experimental approach", "Results and conclusions"
`;

// ── Tool definition ────────────────────────────────────────────────────────

export const SUBMIT_PROPOSALS_TOOL: Anthropic.Tool = {
  name: "submit_proposals",
  description:
    "Submit all identified SR&ED proposals and a run-level summary from the analysis of the provided source materials.",
  input_schema: {
    type: "object" as const,
    required: ["proposals", "run_summary"],
    properties: {
      proposals: {
        type: "array",
        description: "All SR&ED proposals identified from the source materials.",
        items: {
          type: "object",
          required: ["proposal_type", "title", "confidence", "sources"],
          properties: {
            proposal_type: {
              type: "string",
              enum: [
                "project",
                "person",
                "evidence",
                "hours",
                "contractor",
                "material",
                "government_support",
                "gap",
              ],
              description: "The type of SR&ED proposal.",
            },
            title: {
              type: "string",
              description:
                "A concise title for the proposal (e.g. 'Machine learning model optimisation project', 'Jane Smith — SR&ED labour').",
            },
            description: {
              type: "string",
              description:
                "A 2–4 sentence description of what this proposal covers and why it is SR&ED-eligible.",
            },
            proposed_project: {
              type: "string",
              description:
                "The SR&ED project this proposal relates to (free text). Omit for gap proposals.",
            },
            proposed_person: {
              type: "string",
              description:
                "The person's name. Relevant for person, hours, and contractor proposals.",
            },
            claim_component: {
              type: "string",
              description:
                "The SR&ED expenditure category (e.g. 'SR&ED labour', 'SR&ED materials', 'Contract payments', 'Government assistance').",
            },
            section_or_area: {
              type: "string",
              description:
                "The Technical Report section or SR&ED area this proposal relates to (e.g. 'Scientific or technological uncertainty', 'Work performed').",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "Confidence that this proposal is SR&ED-eligible based on the source materials.",
            },
            reason: {
              type: "string",
              description:
                "One sentence explaining why this is SR&ED-eligible or why this gap matters.",
            },
            sources: {
              type: "array",
              description:
                "Verbatim passages from the source materials that support this proposal.",
              items: {
                type: "object",
                required: ["snippet"],
                properties: {
                  source_title: {
                    type: "string",
                    description:
                      "The title of the source document this snippet comes from. Must match one of the provided source titles exactly.",
                  },
                  snippet: {
                    type: "string",
                    description:
                      "A verbatim excerpt (~200 characters) from the source document. Do not paraphrase.",
                  },
                  relevance_note: {
                    type: "string",
                    description:
                      "One sentence explaining how this passage supports the proposal.",
                  },
                },
              },
            },
          },
        },
      },
      run_summary: {
        type: "object",
        description: "A run-level summary of the overall SR&ED findings.",
        required: [
          "summary",
          "activity_months",
          "tr_sections_supported",
          "tr_sections_unsupported",
        ],
        properties: {
          summary: {
            type: "string",
            description:
              "A 2–4 sentence plain-English summary of what the source materials revealed about SR&ED activity.",
          },
          activity_months: {
            type: "array",
            items: { type: "string" },
            description:
              "Calendar months (YYYY-MM format) in which SR&ED activity is evidenced in the source materials.",
          },
          tr_sections_supported: {
            type: "array",
            items: { type: "string" },
            description:
              "Standard Technical Report sections that are evidenced in the source materials.",
          },
          tr_sections_unsupported: {
            type: "array",
            items: { type: "string" },
            description:
              "Standard Technical Report sections for which no evidence was found in the source materials.",
          },
        },
      },
    },
  },
};

// ── User message builder ───────────────────────────────────────────────────

interface BuildUserMessageParams {
  engagementTitle: string;
  serviceLineName: string;
  engagementTypeName: string;
  fiscalYearLabel: string | null;
  contextSources: Array<{
    title: string;
    source_type: string;
    body: string;
  }>;
}

// Per-source character limit — prevents individual sources from dominating
// the context window. Content beyond this is truncated with a note.
const MAX_SOURCE_CHARS = 50_000;

export function buildUserMessage({
  engagementTitle,
  serviceLineName,
  engagementTypeName,
  fiscalYearLabel,
  contextSources,
}: BuildUserMessageParams): string {
  const header = [
    "You are analysing the following engagement:",
    `**Engagement**: ${engagementTitle}`,
    `**Service Line**: ${serviceLineName}`,
    `**Engagement Type**: ${engagementTypeName}`,
    `**Fiscal Year**: ${fiscalYearLabel ?? "Not specified"}`,
    "",
    `Analyse ALL ${contextSources.length} source material${contextSources.length === 1 ? "" : "s"} below.`,
    "Then call the submit_proposals tool with your complete findings.",
    "",
    "=== SOURCE MATERIALS ===",
  ].join("\n");

  const sourceSections = contextSources.map((src, i) => {
    const typeLabel = SOURCE_TYPE_LABELS[src.source_type] ?? src.source_type;
    let body = src.body;
    let truncationNote = "";
    if (body.length > MAX_SOURCE_CHARS) {
      body = body.slice(0, MAX_SOURCE_CHARS);
      truncationNote =
        "\n[Content truncated at 50,000 characters — full document available in the platform]";
    }
    return `\n--- Source ${i + 1}: ${src.title} | ${typeLabel} ---\n${body}${truncationNote}\n---`;
  });

  const footer = [
    "",
    "=== END OF SOURCE MATERIALS ===",
    "",
    "Call the submit_proposals tool with all SR&ED proposals and the run summary.",
  ].join("\n");

  return header + sourceSections.join("") + footer;
}
