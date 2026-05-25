"use client";

/**
 * LineEditForm — inline editor for T661 Part 2 content fields.
 *
 * Handles all four editable lines:
 *   line_242      — single narrative textarea
 *   line_244      — monthly breakdown (one textarea per month)
 *   line_246      — three structured textareas
 *   section_c_hints — list of {section, hint} pairs
 *
 * AI drafts are shown read-only. The edited version starts from the AI draft
 * on first edit, then diverges independently. Original AI drafts are never
 * modified.
 */

import { useRef, useState, useTransition } from "react";
import { updateProjectLineContent } from "../../../discovery-actions";
import type {
  Line242Content,
  Line244Content,
  Line244MonthEntry,
  Line246Content,
  SectionCHint,
} from "@/types/database";

type LineKey = "line_242" | "line_244" | "line_246" | "section_c_hints";

interface Props {
  projectId: string;
  runId: string;
  tenantId: string;
  engagementId: string;
  fiscalYearId: string;
  line: LineKey;
  lineLabel: string;
  aiDraft: Line242Content | Line244Content | Line246Content | SectionCHint[] | null;
  edited: Line242Content | Line244Content | Line246Content | SectionCHint[] | null;
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
  });
}

// ── Line 242 editor ────────────────────────────────────────────────────────

function Line242Editor({
  value,
  onChange,
}: {
  value: Line242Content;
  onChange: (v: Line242Content) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600">Advancement sought</label>
      <textarea
        value={value.narrative}
        onChange={(e) => onChange({ narrative: e.target.value })}
        rows={8}
        className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900
          placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
        placeholder="Describe the scientific or technological advancement the project was seeking to achieve…"
      />
      <p className="text-xs text-gray-400">{value.narrative.length.toLocaleString()} characters</p>
    </div>
  );
}

// ── Line 244 editor ────────────────────────────────────────────────────────

function Line244Editor({
  value,
  onChange,
}: {
  value: Line244Content;
  onChange: (v: Line244Content) => void;
}) {
  function updateMonth(index: number, activities: string) {
    const updated = [...value.monthly_breakdown];
    updated[index] = { ...updated[index], activities };
    onChange({ ...value, monthly_breakdown: updated });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">Annual summary</label>
        <textarea
          value={value.summary}
          onChange={(e) => onChange({ ...value, summary: e.target.value })}
          rows={3}
          className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900
            placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
          placeholder="2–3 sentence overall summary of work performed across the fiscal year…"
        />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-600">Monthly breakdown</p>
        {value.monthly_breakdown.map((entry, i) => (
          <div key={entry.month} className="space-y-1">
            <label className="block text-xs font-semibold text-gray-500">
              {formatMonthLabel(entry.month)}{" "}
              <span className="font-normal text-gray-400">({entry.month})</span>
            </label>
            <textarea
              value={entry.activities}
              onChange={(e) => updateMonth(i, e.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900
                placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
              placeholder="Describe SR&ED work performed in this month, or enter the standard placeholder…"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Line 246 editor ────────────────────────────────────────────────────────

function Line246Editor({
  value,
  onChange,
}: {
  value: Line246Content;
  onChange: (v: Line246Content) => void;
}) {
  const fields: Array<{ key: keyof Line246Content; label: string; placeholder: string; rows: number }> = [
    {
      key: "uncertainty_statement",
      label: "Uncertainty statement",
      placeholder: "It was uncertain whether… (state the specific technological obstacle)",
      rows: 4,
    },
    {
      key: "approach_description",
      label: "Approach description",
      placeholder: "Describe the hypothesis formed and the experimental or investigative methodology used…",
      rows: 4,
    },
    {
      key: "standard_practice_gap",
      label: "Why standard practice was insufficient",
      placeholder: "Explain which existing tools, frameworks, or methods were considered and why they fell short…",
      rows: 4,
    },
  ];

  return (
    <div className="space-y-4">
      {fields.map(({ key, label, placeholder, rows }) => (
        <div key={key} className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-600">{label}</label>
          <textarea
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            rows={rows}
            className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
            placeholder={placeholder}
          />
          <p className="text-xs text-gray-400">{value[key].length.toLocaleString()} characters</p>
        </div>
      ))}
    </div>
  );
}

// ── Section C hints editor ────────────────────────────────────────────────

function SectionCHintsEditor({
  value,
  onChange,
}: {
  value: SectionCHint[];
  onChange: (v: SectionCHint[]) => void;
}) {
  function updateHint(index: number, field: keyof SectionCHint, text: string) {
    const updated = [...value];
    updated[index] = { ...updated[index], [field]: text };
    onChange(updated);
  }

  function addHint() {
    onChange([...value, { section: "", hint: "" }]);
  }

  function removeHint(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {value.map((hint, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={hint.section}
              onChange={(e) => updateHint(i, "section", e.target.value)}
              placeholder="TR section (e.g. Work performed)"
              className="flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeHint(i)}
              className="text-gray-300 hover:text-gray-500 text-xs"
            >
              Remove
            </button>
          </div>
          <textarea
            value={hint.hint}
            onChange={(e) => updateHint(i, "hint", e.target.value)}
            rows={2}
            placeholder="Specific, actionable advice for the Bloom consultant…"
            className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none resize-none"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addHint}
        className="text-xs text-gray-500 hover:text-gray-900 border border-dashed border-gray-200 rounded-lg px-3 py-2 w-full"
      >
        + Add hint
      </button>
    </div>
  );
}

// ── Main LineEditForm ──────────────────────────────────────────────────────

export function LineEditForm({
  projectId,
  runId,
  tenantId,
  engagementId,
  fiscalYearId,
  line,
  lineLabel,
  aiDraft,
  edited,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Determine effective initial value for the editor
  const initialEdited = edited ?? aiDraft;

  // Local state for the editor content
  const [editorValue, setEditorValue] = useState<
    Line242Content | Line244Content | Line246Content | SectionCHint[] | null
  >(initialEdited);

  const hasAiDraft = aiDraft !== null;
  const hasEdited = edited !== null;

  function handleSave() {
    if (!editorValue) return;
    setError(null);
    setSaved(false);

    const formData = new FormData();
    formData.set("projectId",    projectId);
    formData.set("runId",        runId);
    formData.set("tenantId",     tenantId);
    formData.set("engagementId", engagementId);
    formData.set("fiscalYearId", fiscalYearId);
    formData.set("line",         line);
    formData.set("content",      JSON.stringify(editorValue));

    startTransition(async () => {
      const result = await updateProjectLineContent(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setIsEditing(false);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  function handleCancelEdit() {
    setEditorValue(edited ?? aiDraft);
    setIsEditing(false);
    setError(null);
  }

  // ── Read-only display helpers ────────────────────────────────────────────

  function renderLine242ReadOnly(content: Line242Content) {
    return (
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {content.narrative}
      </p>
    );
  }

  function renderLine244ReadOnly(content: Line244Content) {
    return (
      <div className="space-y-3">
        {content.summary && (
          <p className="text-sm text-gray-700 leading-relaxed italic border-b border-gray-100 pb-3">
            {content.summary}
          </p>
        )}
        <div className="space-y-2">
          {content.monthly_breakdown.map((entry) => (
            <div key={entry.month} className="grid grid-cols-[100px_1fr] gap-3">
              <span className="text-xs font-semibold text-gray-500 pt-0.5">
                {formatMonthLabel(entry.month)}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">{entry.activities}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderLine246ReadOnly(content: Line246Content) {
    return (
      <div className="space-y-4">
        {[
          { label: "Uncertainty statement", value: content.uncertainty_statement },
          { label: "Approach description", value: content.approach_description },
          { label: "Why standard practice was insufficient", value: content.standard_practice_gap },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{value}</p>
          </div>
        ))}
      </div>
    );
  }

  function renderSectionCHintsReadOnly(hints: SectionCHint[]) {
    return (
      <div className="space-y-2">
        {hints.map((hint, i) => (
          <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
            <p className="text-xs font-semibold text-indigo-600 mb-1">{hint.section}</p>
            <p className="text-sm text-gray-700 leading-relaxed">{hint.hint}</p>
          </div>
        ))}
      </div>
    );
  }

  function renderReadOnly(content: unknown) {
    if (!content) return <p className="text-sm text-gray-400 italic">No content.</p>;
    if (line === "line_242") return renderLine242ReadOnly(content as Line242Content);
    if (line === "line_244") return renderLine244ReadOnly(content as Line244Content);
    if (line === "line_246") return renderLine246ReadOnly(content as Line246Content);
    if (line === "section_c_hints") return renderSectionCHintsReadOnly(content as SectionCHint[]);
    return null;
  }

  // ── Editor renderer ──────────────────────────────────────────────────────

  function renderEditor() {
    if (!editorValue) return null;
    if (line === "line_242") {
      return (
        <Line242Editor
          value={editorValue as Line242Content}
          onChange={(v) => setEditorValue(v)}
        />
      );
    }
    if (line === "line_244") {
      return (
        <Line244Editor
          value={editorValue as Line244Content}
          onChange={(v) => setEditorValue(v)}
        />
      );
    }
    if (line === "line_246") {
      return (
        <Line246Editor
          value={editorValue as Line246Content}
          onChange={(v) => setEditorValue(v)}
        />
      );
    }
    if (line === "section_c_hints") {
      return (
        <SectionCHintsEditor
          value={editorValue as SectionCHint[]}
          onChange={(v) => setEditorValue(v)}
        />
      );
    }
    return null;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const displayContent = hasEdited ? edited : aiDraft;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{lineLabel}</h3>
          {hasEdited && (
            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Edited
            </span>
          )}
          {!hasEdited && hasAiDraft && (
            <span className="text-xs text-gray-400">AI draft</span>
          )}
          {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
        </div>
        {!isEditing && hasAiDraft && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {!hasAiDraft && !isEditing && (
        <p className="text-sm text-gray-400 italic">No AI draft available for this section.</p>
      )}

      {isEditing ? (
        <div className="space-y-4">
          {/* Show AI draft for reference while editing */}
          {hasAiDraft && hasEdited && (
            <details className="rounded-lg bg-gray-50 border border-gray-200">
              <summary className="px-3 py-2 text-xs text-gray-500 cursor-pointer select-none hover:text-gray-700">
                View AI draft (reference only)
              </summary>
              <div className="px-3 pb-3 pt-1 text-xs text-gray-500 leading-relaxed border-t border-gray-200">
                {renderReadOnly(aiDraft)}
              </div>
            </details>
          )}

          {renderEditor()}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "#03CEA4" }}
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={isPending}
              className="text-sm text-gray-400 hover:text-gray-700"
            >
              Cancel
            </button>
            {hasEdited && (
              <button
                type="button"
                onClick={() => {
                  setEditorValue(aiDraft);
                  // Note: clicking "Revert" just resets local state;
                  // user still needs to click Save to persist the revert.
                }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
              >
                Reset to AI draft
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
          {renderReadOnly(displayContent)}
        </div>
      )}
    </div>
  );
}
