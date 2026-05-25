"use client";

import { useState, useTransition } from "react";
import { triggerDiscovery } from "../../discovery-actions";

interface Props {
  fiscalYearId: string;
  engagementId: string;
  tenantId: string;
  documentCount: number;
  contextSourceCount: number;
  lowQualityDocCount: number;
}

export function RunTriggerForm({
  fiscalYearId,
  engagementId,
  tenantId,
  documentCount,
  contextSourceCount,
  lowQualityDocCount,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasInputs = documentCount > 0 || contextSourceCount > 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await triggerDiscovery(fiscalYearId, engagementId, tenantId);
      if (result?.error) setError(result.error);
      // On success, triggerDiscovery calls redirect() — the transition resolves
      // on the new page. If still here after transition, an error occurred.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* What will be included */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-700">What Claude will analyse</p>

        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              documentCount > 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {documentCount}
          </div>
          <div>
            <p className="text-sm text-gray-900 font-medium">
              AI-ready document{documentCount !== 1 ? "s" : ""}
            </p>
            {documentCount === 0 && (
              <p className="text-xs text-amber-600">
                No AI-ready documents. Upload documents with extracted text to include them.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              contextSourceCount > 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {contextSourceCount}
          </div>
          <div>
            <p className="text-sm text-gray-900 font-medium">
              Active context source{contextSourceCount !== 1 ? "s" : ""}
            </p>
            {contextSourceCount === 0 && documentCount > 0 && (
              <p className="text-xs text-gray-400">
                No context sources — analysis will rely on documents only.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* What Claude will produce */}
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-5">
        <p className="text-sm font-semibold text-indigo-900 mb-2">What Claude will produce</p>
        <ul className="space-y-1.5 text-sm text-indigo-800">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-400">→</span>
            <span>1 to N SR&amp;ED project drafts — one per distinct technological challenge</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-400">→</span>
            <span><strong>Line 242</strong> — Scientific or technological uncertainty (hypothesis · background · methods · combined draft ≤ 350 words)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-400">→</span>
            <span><strong>Line 244</strong> — Work performed — one entry per fiscal year month, each labelled Supported / Inferred / Gap</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-400">→</span>
            <span><strong>Line 246</strong> — Advancement achieved or attempted (results · conclusions · what did not work · future research)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-400">→</span>
            <span>Section C evidence hints and document relationship mapping</span>
          </li>
        </ul>
        <p className="text-xs text-indigo-600 mt-3">
          All output is saved as an AI draft. You can edit each line independently. Original drafts are never lost.
        </p>
      </div>

      {/* Low-quality document warning */}
      {lowQualityDocCount > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>{lowQualityDocCount} document{lowQualityDocCount !== 1 ? "s have" : " has"} short AI text (&lt; 500 characters).</strong>{" "}
          Poorly extracted documents may reduce analysis quality. Consider reviewing and supplementing
          the AI text on those documents before running.
        </div>
      )}

      {!hasInputs && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>No materials found.</strong> Upload at least one document with AI text or add
          a context source before running Project Discovery.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !hasInputs}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "#2B307E" }}
      >
        {isPending ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Claude is analysing… this may take 30–60 seconds
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Run Project Discovery
          </>
        )}
      </button>

      {isPending && (
        <p className="text-xs text-gray-400">
          Do not refresh or navigate away — Claude is processing your materials.
          You will be redirected automatically when done.
        </p>
      )}
    </form>
  );
}
