"use client";

import { useRef, useState, useTransition } from "react";
import { updateAiText } from "../../document-actions";

interface Props {
  documentId: string;
  tenantId: string;
  engagementId: string;
  fiscalYearId: string;
  /** Current ai_text value — null means not yet populated */
  initialText: string | null;
}

export function AiTextForm({
  documentId,
  tenantId,
  engagementId,
  fiscalYearId,
  initialText,
}: Props) {
  const formRef        = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error,  setError]  = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);
  const [text,   setText]   = useState(initialText ?? "");
  const [editing, setEditing] = useState(!initialText); // open editor immediately if no text

  const isAiReady = !!initialText;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const formData = new FormData(formRef.current!);
    startTransition(async () => {
      const result = await updateAiText(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold ${
              isAiReady || text.trim()
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isAiReady || text.trim() ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {isAiReady || text.trim() ? "AI Ready" : "Needs Text"}
          </span>
          {saved && (
            <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {/* Notice about what this field does */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">
          This is the text Claude will use when analyzing this claim year.
        </span>{" "}
        Uploading a file alone does not guarantee the AI can read it. For PDFs, Word docs,
        and plain text files, text is extracted automatically. For all other types, paste a
        summary or relevant excerpt below.
      </div>

      {/* Text display / editor */}
      {editing ? (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <input type="hidden" name="documentId"   value={documentId} />
          <input type="hidden" name="tenantId"     value={tenantId} />
          <input type="hidden" name="engagementId" value={engagementId} />
          <input type="hidden" name="fiscalYearId" value={fiscalYearId} />

          <textarea
            name="ai_text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Paste a text excerpt from this document, or write a summary of what it contains and why it is relevant to this SR&ED claim year…"
            className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 resize-y
              font-mono leading-relaxed"
          />

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "#03CEA4" }}
            >
              {isPending ? "Saving…" : "Save AI Text"}
            </button>
            {initialText !== null && (
              <button
                type="button"
                onClick={() => {
                  setText(initialText ?? "");
                  setEditing(false);
                  setError(null);
                }}
                className="text-sm text-gray-400 hover:text-gray-700"
              >
                Cancel
              </button>
            )}
            {text.trim() && (
              <span className="text-xs text-gray-400 ml-auto">
                {text.trim().length.toLocaleString()} characters
              </span>
            )}
          </div>
        </form>
      ) : (
        /* Read-only view */
        initialText ? (
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-mono">
            {initialText}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No AI text entered yet.</p>
        )
      )}
    </div>
  );
}
