"use client";

/**
 * LineEditForm — inline editor for T661 Part 2 content fields.
 *
 * Handles all four editable lines:
 *   line_242      — structured sections: hypothesis / background / methods / uncertainty / combined_draft
 *   line_244      — monthly breakdown with evidence_type labels (supported / inferred / gap)
 *   line_246      — structured sections: results / conclusions / what_did_not_work / future_research / advancement_statement
 *   section_c_hints — list of {section, hint} pairs
 *
 * AI drafts are shown read-only. The edited version starts from the AI draft
 * on first edit, then diverges independently. Original AI drafts are never
 * modified.
 *
 * Backward-compatible with v1/v2 runs that stored Line 242 as { narrative }.
 */

import { useState, useTransition } from "react";
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

// Evidence type badge for Line 244
const EVIDENCE_TYPE_STYLES: Record<string, string> = {
  supported: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inferred:  "bg-amber-50  text-amber-700  border-amber-200",
  gap:       "bg-gray-100  text-gray-500   border-gray-200",
};
const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  supported: "Supported",
  inferred:  "Inferred",
  gap:       "Gap",
};

// ── Line 242 editor ────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

const LINE_242_FIELDS: Array<{
  key: keyof Line242Content;
  label: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: "hypothesis",
    label: "Hypothesis",
    placeholder:
      "What working hypothesis or research question drove the investigation? " +
      "What did the investigators believe might be achievable or determinable, and why?",
    rows: 3,
  },
  {
    key: "background",
    label: "Background",
    placeholder:
      "What was the prior state of knowledge at the outset? " +
      "What was already known, and what gaps made the uncertainty genuine?",
    rows: 3,
  },
  {
    key: "methods",
    label: "Methods",
    placeholder:
      "What experimental methodology or investigative approach was used? " +
      "What was designed, built, or tested? How was evidence gathered?",
    rows: 3,
  },
  {
    key: "uncertainty",
    label: "Scientific or Technological Uncertainty",
    placeholder:
      "It was uncertain whether… (a precise statement of what could not be determined " +
      "by standard practice or existing knowledge without performing the work)",
    rows: 3,
  },
  {
    key: "combined_draft",
    label: "Combined Line 242 Draft",
    placeholder:
      "Integrated 350-word narrative (hypothesis → background → uncertainty → methods) " +
      "written from the claimant's perspective…",
    rows: 8,
  },
];

function Line242Editor({
  value,
  onChange,
}: {
  value: Line242Content;
  onChange: (v: Line242Content) => void;
}) {
  const wordCount = countWords(value.combined_draft ?? "");
  const overLimit = wordCount > 350;

  return (
    <div className="space-y-4">
      {LINE_242_FIELDS.map(({ key, label, placeholder, rows }) => (
        <div key={key} className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600">{label}</label>
          <textarea
            value={(value[key] as string) ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                [key]: key === "word_count" ? Number(e.target.value) : e.target.value,
                ...(key === "combined_draft" ? { word_count: countWords(e.target.value) } : {}),
              })
            }
            rows={rows}
            className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
            placeholder={placeholder}
          />
          {key === "combined_draft" && (
            <p className={`text-xs ${overLimit ? "text-red-500 font-medium" : "text-gray-400"}`}>
              {wordCount} / 350 words{overLimit ? " — over limit" : ""}
            </p>
          )}
        </div>
      ))}
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
  function updateMonth(
    index: number,
    patch: Partial<Line244MonthEntry>
  ) {
    const updated = [...value.monthly_breakdown];
    updated[index] = { ...updated[index], ...patch };
    onChange({ ...value, monthly_breakdown: updated });
  }

  const totalWords = value.monthly_breakdown
    .reduce((sum, e) => sum + countWords(e.activities), 0);
  const overLimit = totalWords > 700;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600">Annual summary</label>
        <textarea
          value={value.summary}
          onChange={(e) => onChange({ ...value, summary: e.target.value })}
          rows={3}
          className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900
            placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
          placeholder="2–3 sentence summary of work performed across the fiscal year. Note timing assumptions if monthly entries are inferred…"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-600">Monthly breakdown</p>
          <p className={`text-xs ${overLimit ? "text-red-500 font-medium" : "text-gray-400"}`}>
            {totalWords} / 700 words total{overLimit ? " — over limit" : ""}
          </p>
        </div>
        <div className="space-y-4">
          {value.monthly_breakdown.map((entry, i) => (
            <div key={entry.month} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-gray-700">
                  {formatMonthLabel(entry.month)}{" "}
                  <span className="font-normal text-gray-400">({entry.month})</span>
                </label>
                <select
                  value={entry.evidence_type ?? "gap"}
                  onChange={(e) =>
                    updateMonth(i, { evidence_type: e.target.value as Line244MonthEntry["evidence_type"] })
                  }
                  className={`text-xs border rounded px-2 py-0.5 font-semibold focus:outline-none ${
                    EVIDENCE_TYPE_STYLES[entry.evidence_type ?? "gap"]
                  }`}
                >
                  <option value="supported">Supported</option>
                  <option value="inferred">Inferred</option>
                  <option value="gap">Gap</option>
                </select>
              </div>
              <textarea
                value={entry.activities}
                onChange={(e) => updateMonth(i, { activities: e.target.value })}
                rows={3}
                className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900
                  placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
                placeholder={
                  entry.evidence_type === "gap"
                    ? "No SR&ED activity evidenced in available materials for this period."
                    : entry.evidence_type === "inferred"
                    ? "Describe inferred activities and note the basis (e.g. 'Based on study duration...')"
                    : "Describe SR&ED work performed this month…"
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Line 246 editor ────────────────────────────────────────────────────────

const LINE_246_FIELDS: Array<{
  key: keyof Line246Content;
  label: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: "results",
    label: "Results",
    placeholder:
      "What was observed, measured, or produced? Describe the direct experimental outcomes…",
    rows: 4,
  },
  {
    key: "conclusions",
    label: "Conclusions",
    placeholder:
      "What did the results establish? What was learned, including negative findings?",
    rows: 3,
  },
  {
    key: "what_did_not_work",
    label: "What Did Not Work",
    placeholder:
      "What approaches, hypotheses, or methods failed or yielded no useful result?",
    rows: 3,
  },
  {
    key: "future_research",
    label: "Future Research / Next-Stage Experimentation",
    placeholder:
      "How do findings inform or enable the next stage? What remains unresolved?",
    rows: 3,
  },
  {
    key: "advancement_statement",
    label: "Advancement Achieved or Attempted",
    placeholder:
      "2–3 sentence statement of what the claimant now knows or can now do that was not known or achievable before the work began…",
    rows: 3,
  },
];

function Line246Editor({
  value,
  onChange,
}: {
  value: Line246Content;
  onChange: (v: Line246Content) => void;
}) {
  return (
    <div className="space-y-4">
      {LINE_246_FIELDS.map(({ key, label, placeholder, rows }) => (
        <div key={key} className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600">{label}</label>
          <textarea
            value={(value[key] as string) ?? ""}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            rows={rows}
            className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-y leading-relaxed"
            placeholder={placeholder}
          />
          {key === "advancement_statement" && (
            <p className="text-xs text-gray-400">
              {countWords(value.advancement_statement ?? "")} words
            </p>
          )}
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

// ── Read-only section block ────────────────────────────────────────────────

function SectionBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// ── Read-only display helpers ──────────────────────────────────────────────

function renderLine242ReadOnly(content: Line242Content) {
  // Backward-compat: v1/v2 runs stored { narrative }
  if (content.narrative && !content.combined_draft) {
    return (
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {content.narrative}
      </p>
    );
  }

  const wordCount = content.word_count ?? countWords(content.combined_draft ?? "");
  const overLimit = wordCount > 350;

  return (
    <div className="space-y-4">
      <SectionBlock label="Hypothesis"                             value={content.hypothesis ?? ""} />
      <SectionBlock label="Background"                            value={content.background ?? ""} />
      <SectionBlock label="Methods"                               value={content.methods ?? ""} />
      <SectionBlock label="Scientific or Technological Uncertainty" value={content.uncertainty ?? ""} />
      {content.combined_draft && (
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Combined Line 242 Draft
            </p>
            <span className={`text-xs ${overLimit ? "text-red-500 font-medium" : "text-gray-400"}`}>
              {wordCount} words
            </span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {content.combined_draft}
          </p>
        </div>
      )}
    </div>
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
        {content.monthly_breakdown.map((entry) => {
          const evType = entry.evidence_type ?? "gap";
          return (
            <div key={entry.month} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-[104px] pt-0.5">
                <span className="text-xs font-semibold text-gray-500 block leading-tight">
                  {formatMonthLabel(entry.month)}
                </span>
                <span
                  className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                    EVIDENCE_TYPE_STYLES[evType]
                  }`}
                >
                  {EVIDENCE_TYPE_LABELS[evType]}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed flex-1">{entry.activities}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderLine246ReadOnly(content: Line246Content) {
  return (
    <div className="space-y-4">
      <SectionBlock label="Results"                           value={content.results ?? (content as any).uncertainty_statement ?? ""} />
      <SectionBlock label="Conclusions"                       value={content.conclusions ?? (content as any).approach_description ?? ""} />
      <SectionBlock label="What Did Not Work"                 value={content.what_did_not_work ?? (content as any).standard_practice_gap ?? ""} />
      <SectionBlock label="Future Research"                   value={content.future_research ?? ""} />
      <SectionBlock label="Advancement Achieved or Attempted" value={content.advancement_statement ?? ""} />
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

function renderReadOnly(line: LineKey, content: unknown) {
  if (!content) return <p className="text-sm text-gray-400 italic">No content.</p>;
  if (line === "line_242")      return renderLine242ReadOnly(content as Line242Content);
  if (line === "line_244")      return renderLine244ReadOnly(content as Line244Content);
  if (line === "line_246")      return renderLine246ReadOnly(content as Line246Content);
  if (line === "section_c_hints") return renderSectionCHintsReadOnly(content as SectionCHint[]);
  return null;
}

// ── Blank value factories (new edit session from scratch) ──────────────────

function blankLine242(): Line242Content {
  return { hypothesis: "", background: "", methods: "", uncertainty: "", combined_draft: "", word_count: 0 };
}
function blankLine246(): Line246Content {
  return { results: "", conclusions: "", what_did_not_work: "", future_research: "", advancement_statement: "" };
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
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Determine initial editor value: edited → aiDraft → blank
  const initialEdited = edited ?? aiDraft;

  const [editorValue, setEditorValue] = useState<
    Line242Content | Line244Content | Line246Content | SectionCHint[] | null
  >(initialEdited);

  const hasAiDraft = aiDraft !== null;
  const hasEdited  = edited  !== null;

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

  function handleStartEdit() {
    // Migrate v1/v2 line_242 { narrative } → v3 shape if needed
    if (line === "line_242") {
      const draft = (edited ?? aiDraft) as Line242Content | null;
      if (draft && draft.narrative && !draft.combined_draft) {
        setEditorValue({ ...blankLine242(), combined_draft: draft.narrative, word_count: countWords(draft.narrative) });
      } else if (!draft) {
        setEditorValue(blankLine242());
      }
    }
    // Migrate v1/v2 line_246 { uncertainty_statement, approach_description, standard_practice_gap }
    if (line === "line_246") {
      const draft = (edited ?? aiDraft) as Line246Content | null;
      if (draft && !draft.results && (draft as any).uncertainty_statement) {
        const old = draft as any;
        setEditorValue({
          ...blankLine246(),
          results:              old.approach_description ?? "",
          conclusions:          old.uncertainty_statement ?? "",
          what_did_not_work:    old.standard_practice_gap ?? "",
          future_research:      "",
          advancement_statement: "",
        });
      } else if (!draft) {
        setEditorValue(blankLine246());
      }
    }
    setIsEditing(true);
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
            onClick={handleStartEdit}
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
                {renderReadOnly(line, aiDraft)}
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
                  // Reset local state to AI draft; user must Save to persist.
                  setEditorValue(aiDraft);
                }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
              >
                Reset to AI draft
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-4">
          {renderReadOnly(line, displayContent)}
        </div>
      )}
    </div>
  );
}
