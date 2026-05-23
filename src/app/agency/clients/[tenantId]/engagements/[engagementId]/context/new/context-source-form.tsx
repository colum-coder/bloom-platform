"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addContextSource } from "../../phase3-actions";

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

interface Props {
  engagementId: string;
  tenantId: string;
}

export function ContextSourceForm({ engagementId, tenantId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await addContextSource(formData, engagementId, tenantId);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success addContextSource calls redirect() — no further action needed.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

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
          placeholder="e.g. Q3 Technical Discussion — ML Pipeline"
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
          className="w-full sm:w-72 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        >
          {SOURCE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
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
          rows={14}
          required
          placeholder="Paste or type the source material here. The AI will analyse the full text."
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent resize-y font-mono leading-relaxed"
        />
        <p className="text-xs text-gray-400 mt-1">
          Paste the full document text. Up to 50,000 characters per source.
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2.5 border border-red-200">
          {error}
        </p>
      )}

      {/* Actions */}
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
