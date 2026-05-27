"use client";

import { useState, useTransition } from "react";
import { triggerDiscovery } from "../../discovery-actions";

// ── Size classification ───────────────────────────────────────────────────────
const SIZE_SMALL_MAX  =  50_000;
const SIZE_MEDIUM_MAX = 150_000;

function classifySize(chars: number): "small" | "medium" | "large" {
  if (chars <= SIZE_SMALL_MAX)  return "small";
  if (chars <= SIZE_MEDIUM_MAX) return "medium";
  return "large";
}

function formatChars(chars: number): string {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)} M chars`;
  if (chars >= 1_000)     return `${(chars / 1_000).toFixed(1)} k chars`;
  return `${chars} chars`;
}

interface Props {
  fiscalYearId:       string;
  engagementId:       string;
  tenantId:           string;
  documentCount:      number;
  contextSourceCount: number;
  lowQualityDocCount: number;
  totalAiTextChars:   number;
  // What-changed comparison against last run (null = no previous run)
  lastRunId:          string | null;
  newDocCount:        number;
  updatedDocCount:    number;
  newSourceCount:     number;
  nothingChanged:     boolean;
}

export function RunTriggerForm({
  fiscalYearId,
  engagementId,
  tenantId,
  documentCount,
  contextSourceCount,
  lowQualityDocCount,
  totalAiTextChars,
  lastRunId,
  newDocCount,
  updatedDocCount,
  newSourceCount,
  nothingChanged,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error,     setError]        = useState<string | null>(null);
  const [focusNote, setFocusNote]    = useState("");

  const hasInputs = documentCount > 0 || contextSourceCount > 0;
  const size = classifySize(totalAiTextChars);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await triggerDiscovery(
        fiscalYearId,
        engagementId,
        tenantId,
        focusNote.trim() || undefined
      );
      if (result?.error) setError(result.error);
    });
  }

  const hasChanges = newDocCount > 0 || updatedDocCount > 0 || newSourceCount > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── What changed since last run ──────────────────────────────────── */}
      {lastRunId !== null && (
        <div className={`rounded-xl border p-5 ${
          nothingChanged
            ? "bg-amber-50 border-amber-200"
            : "bg-emerald-50 border-emerald-200"
        }`}>
          <p className={`text-sm font-semibold mb-3 ${
            nothingChanged ? "text-amber-800" : "text-emerald-800"
          }`}>
            Since the last run
          </p>

          {nothingChanged ? (
            <>
              <p className="text-sm text-amber-700 leading-relaxed mb-3">
                No new documents, AI text updates, or context sources have been added.
                Re-running with the same materials will likely produce the same result.
              </p>
              <p className="text-xs text-amber-600">
                Consider adding a context source that describes the research in plain language
                before running again.
              </p>
            </>
          ) : (
            <div className="space-y-1.5">
              {newDocCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <span className="text-emerald-500 font-bold">+</span>
                  {newDocCount} new AI-ready document{newDocCount !== 1 ? "s" : ""}
                </div>
              )}
              {updatedDocCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <span className="text-emerald-500 font-bold">↑</span>
                  {updatedDocCount} document{updatedDocCount !== 1 ? "s" : ""} with updated AI text
                </div>
              )}
              {newSourceCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <span className="text-emerald-500 font-bold">+</span>
                  {newSourceCount} new context source{newSourceCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── What Claude will analyse ─────────────────────────────────────── */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-700">What Claude will analyse</p>

        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
            documentCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
          }`}>
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
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
            contextSourceCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
          }`}>
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

      {/* ── Size estimate ────────────────────────────────────────────────── */}
      {hasInputs && (
        <div className={`rounded-xl border p-5 ${
          size === "large" ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className={`text-sm font-semibold ${size === "large" ? "text-amber-800" : "text-gray-700"}`}>
              Estimated run size
            </p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              size === "small"  ? "bg-emerald-100 text-emerald-700" :
              size === "medium" ? "bg-blue-100 text-blue-700"       :
                                  "bg-amber-100 text-amber-800"
            }`}>
              {size === "small" ? "Small" : size === "medium" ? "Medium" : "Large"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center mb-3">
            <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
              <p className="text-lg font-bold text-gray-900">{documentCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">document{documentCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
              <p className="text-lg font-bold text-gray-900">{formatChars(totalAiTextChars)}</p>
              <p className="text-xs text-gray-500 mt-0.5">total text</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
              <p className="text-lg font-bold text-gray-900">{contextSourceCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">context source{contextSourceCount !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <p className={`text-xs ${size === "large" ? "text-amber-700" : "text-gray-500"}`}>
            {size === "small"  && "Estimated time: ~30–60 seconds."}
            {size === "medium" && "Estimated time: ~1–2 minutes."}
            {size === "large"  && (
              <><strong>This may take a few minutes.</strong>{" "}You can leave this page and return later — the run continues in the background.</>
            )}
          </p>
        </div>
      )}

      {/* ── What Claude will produce ─────────────────────────────────────── */}
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-5">
        <p className="text-sm font-semibold text-indigo-900 mb-2">What Claude will produce</p>
        <ul className="space-y-1.5 text-sm text-indigo-800">
          <li className="flex items-start gap-2"><span className="mt-0.5 text-indigo-400">→</span><span>1 to N SR&amp;ED project drafts — one per distinct technological challenge</span></li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-indigo-400">→</span><span><strong>Line 242</strong> — Scientific or technological uncertainty</span></li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-indigo-400">→</span><span><strong>Line 244</strong> — Work performed, one entry per fiscal year month</span></li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-indigo-400">→</span><span><strong>Line 246</strong> — Advancement achieved or attempted</span></li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-indigo-400">→</span><span>Section C evidence hints and document relationship mapping</span></li>
        </ul>
        <p className="text-xs text-indigo-600 mt-3">
          All output is saved as an AI draft. You can edit each line independently. Original drafts are never lost.
        </p>
      </div>

      {/* ── Optional run focus note ──────────────────────────────────────── */}
      <div>
        <label htmlFor="focus-note" className="block text-sm font-medium text-gray-700 mb-1.5">
          What changed, or what should Claude focus on?{" "}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="focus-note"
          rows={3}
          value={focusNote}
          onChange={(e) => setFocusNote(e.target.value)}
          placeholder={
            nothingChanged && lastRunId
              ? 'Explain what\'s different about this run, e.g. "The previous run missed the gradient descent work in Q3 — that\'s the core SR&ED activity."'
              : 'e.g. "We added context notes on the ML pipeline. Focus on the uncertainty around the transformer architecture in Q2–Q3."'
          }
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-blue focus:border-transparent resize-y leading-relaxed"
        />
        <p className="text-xs text-gray-400 mt-1">
          This note is appended to the prompt so Claude knows what to prioritise. Stored with the run for auditability.
        </p>
      </div>

      {/* ── Warnings ────────────────────────────────────────────────────── */}
      {lowQualityDocCount > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>{lowQualityDocCount} document{lowQualityDocCount !== 1 ? "s have" : " has"} short AI text (&lt; 500 characters).</strong>{" "}
          Poorly extracted documents may reduce quality. Consider supplementing the AI text before running.
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

      {/* ── Submit ───────────────────────────────────────────────────────── */}
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
            Creating run…
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
          Queuing run — you will be redirected to the run page momentarily.
        </p>
      )}
    </form>
  );
}
