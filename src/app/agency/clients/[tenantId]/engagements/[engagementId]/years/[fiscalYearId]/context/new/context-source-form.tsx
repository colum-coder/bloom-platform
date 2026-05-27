"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addContextSource } from "../../year-actions";

const SOURCE_TYPE_OPTIONS = [
  { value: "technical_narrative",        label: "Technical Narrative" },
  { value: "technical_document_summary", label: "Technical Document Summary" },
  { value: "project_discussion",         label: "Project Discussion" },
  { value: "meeting_notes",              label: "Meeting Notes" },
  { value: "discovery_call_note",        label: "Discovery Call Note" },
  { value: "staff_note",                 label: "Staff Note" },
  { value: "client_background",          label: "Client Background" },
  { value: "email_thread",               label: "Email Thread" },
  { value: "prior_claim",                label: "Prior SR&ED Claim" },
  { value: "financial_summary",          label: "Financial Summary" },
  { value: "payroll_export",             label: "Payroll Export" },
  { value: "contractor_invoice",         label: "Contractor Invoice" },
  { value: "cra_review_context",         label: "CRA Review Context" },
  { value: "other",                      label: "Other" },
] as const;

// Questions shown when the consultant arrives from a zero-project discovery run.
// Designed to draw out the narrative context Claude needs to identify SR&ED work.
const SRED_GUIDANCE_QUESTIONS = [
  "What was technically uncertain at the outset? What didn't you know or couldn't predict?",
  "What hypothesis or approach was being tested?",
  "What methods, experiments, or iterations were tried?",
  "What failed or did not work as expected — and what did that tell you?",
  "How did the approach change during the project?",
  "What was learned or discovered by the end?",
  "What evidence or documents (e.g. code commits, test logs, meeting notes) support this work?",
  "Which specific project, product, or work area does this relate to?",
];

interface Props {
  fiscalYearId:      string;
  engagementId:      string;
  tenantId:          string;
  /** Pre-select a source type (e.g. "project_discussion" when arriving from discovery). */
  defaultSourceType?: string;
  /** Show the SR&ED narrative guidance questions above the content field. */
  showGuidance?:     boolean;
}

export function ContextSourceForm({
  fiscalYearId,
  engagementId,
  tenantId,
  defaultSourceType,
  showGuidance,
}: Props) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await addContextSource(formData, fiscalYearId, engagementId, tenantId);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, addContextSource calls redirect() — no further action needed.
  }

  const effectiveDefault = defaultSourceType ?? "technical_narrative";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* SR&ED narrative guidance — shown when arriving from a discovery run */}
      {showGuidance && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-5">
          <p className="text-sm font-semibold text-indigo-900 mb-1">
            What to write — SR&amp;ED context guide
          </p>
          <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
            The most common reason Project Discovery returns zero projects is missing
            narrative context. Claude needs to understand what was technically uncertain,
            what was tried, and what was learned — not just what was built.
            In your own words, answer as many of these as you can:
          </p>
          <ol className="space-y-2">
            {SRED_GUIDANCE_QUESTIONS.map((q, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-indigo-800">
                <span className="flex-shrink-0 w-4 font-semibold text-indigo-400 text-right">
                  {i + 1}.
                </span>
                <span className="leading-relaxed">{q}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-indigo-600 mt-3">
            You don&apos;t need to use formal SR&amp;ED language — write naturally.
            Claude will identify the qualifying elements.
          </p>
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="cs-title" className="block text-sm font-medium text-gray-700 mb-1.5">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="cs-title"
          name="title"
          type="text"
          required
          placeholder={
            showGuidance
              ? "e.g. SR&ED Context — ML Pipeline Uncertainty"
              : "e.g. Q3 Technical Discussion — ML Pipeline"
          }
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        />
      </div>

      {/* Source type */}
      <div>
        <label htmlFor="cs-type" className="block text-sm font-medium text-gray-700 mb-1.5">
          Source type <span className="text-red-500">*</span>
        </label>
        <select
          id="cs-type"
          name="source_type"
          required
          defaultValue={effectiveDefault}
          className="w-full sm:w-72 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        >
          {SOURCE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Helps the AI understand the nature of the source material.
        </p>
      </div>

      {/* File name (optional) */}
      <div>
        <label htmlFor="cs-filename" className="block text-sm font-medium text-gray-700 mb-1.5">
          Original file name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="cs-filename"
          name="file_name"
          type="text"
          placeholder="e.g. Q3_technical_review.docx"
          className="w-full sm:w-72 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        />
      </div>

      {/* Body */}
      <div>
        <label htmlFor="cs-body" className="block text-sm font-medium text-gray-700 mb-1.5">
          Content <span className="text-red-500">*</span>
        </label>
        <textarea
          id="cs-body"
          name="body"
          rows={showGuidance ? 18 : 14}
          required
          placeholder={
            showGuidance
              ? "Write in plain language — answer the questions above in any order. " +
                "You don't need headers or structure. A few paragraphs covering what was uncertain, " +
                "what was tried, and what was learned is usually enough.\n\n" +
                "Example:\n" +
                "We were trying to reduce false positives in our anomaly detection pipeline. " +
                "The core uncertainty was whether a transformer-based approach would outperform " +
                "our existing LSTM model on non-stationary time-series data — we had no prior " +
                "evidence either way. We ran 14 experiments over 3 months varying attention window " +
                "sizes, dropout rates, and positional encodings. Most configurations performed worse " +
                "than LSTM on precision. We eventually found that hybrid attention + convolution layers " +
                "improved recall by 18% but hurt precision — a trade-off we hadn't anticipated..."
              : "Paste or type the source material here. The AI will analyse the full text."
          }
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent resize-y font-mono leading-relaxed"
        />
        <p className="text-xs text-gray-400 mt-1">
          {showGuidance
            ? "Up to 50,000 characters. More detail gives Claude more to work with."
            : "Paste the full document text. Up to 50,000 characters per source."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2.5 border border-red-200">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#03CEA4" }}
        >
          {loading ? "Saving…" : "Save Source"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
