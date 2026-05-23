"use client";

/**
 * ProposalDecisionWidget
 *
 * Accepts/rejects/defers a proposal and optionally captures a decision_reason
 * for reject and defer — part of the Bloom Guidance Layer feedback capture.
 *
 * State machine:
 *   idle              → shows current decision badge + action buttons
 *   confirming_reject → shows reason input + "Confirm Rejection" + Cancel
 *   confirming_defer  → shows reason input + "Confirm Deferral" + Cancel
 *
 * Accept has no confirmation step (non-destructive, easily undone).
 * Undo (any → pending) clears the decision_reason automatically.
 *
 * The original AI proposal text is never modified here.
 */

import { useState } from "react";
import { updateProposalDecision } from "../../phase3-actions";
import type { ProposalDecision } from "@/types/database";

// Predefined reason suggestions surfaced via <datalist>.
// Staff can type any value — these are suggestions, not constraints.
// Vocabulary is intentionally open so natural categories can emerge
// before the schema is tightened in a future Guidance Mode phase.
const REASON_SUGGESTIONS = [
  "not SR&ED",
  "routine work",
  "too vague",
  "unsupported by source",
  "duplicate of another proposal",
  "wrong project",
  "needs client clarification",
  "useful later",
  "already in prior claim",
  "out of scope for this fiscal year",
];

interface Props {
  proposalId: string;
  tenantId: string;
  initialDecision: ProposalDecision;
  initialReason?: string | null;
}

type WidgetMode = "idle" | "confirming_reject" | "confirming_defer";

const DECISION_STYLES: Record<ProposalDecision, string> = {
  pending:  "bg-gray-100 text-gray-600",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  deferred: "bg-amber-50 text-amber-700",
};

const DECISION_LABELS: Record<ProposalDecision, string> = {
  pending:  "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
  deferred: "Deferred",
};

export function ProposalDecisionWidget({
  proposalId,
  tenantId,
  initialDecision,
  initialReason,
}: Props) {
  const [decision, setDecision] = useState<ProposalDecision>(initialDecision);
  const [reason,   setReason]   = useState<string>(initialReason ?? "");
  const [mode,     setMode]     = useState<WidgetMode>("idle");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function applyDecision(next: ProposalDecision, withReason: string | null = null) {
    setLoading(true);
    setError(null);
    const result = await updateProposalDecision(proposalId, next, tenantId, withReason);
    if (result?.error) {
      setError(result.error);
    } else {
      setDecision(next);
      setReason(next === "pending" ? "" : (withReason ?? ""));
      setMode("idle");
    }
    setLoading(false);
  }

  function cancelConfirm() {
    setMode("idle");
    setError(null);
  }

  const datalistId = `reasons-${proposalId}`;

  // ── Confirming reject or defer ──────────────────────────────────────────
  if (mode === "confirming_reject" || mode === "confirming_defer") {
    const isReject  = mode === "confirming_reject";
    const label     = isReject ? "Confirm Rejection" : "Confirm Deferral";
    const nextDecision: ProposalDecision = isReject ? "rejected" : "deferred";
    const btnStyle  = isReject
      ? "border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
      : "border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100";

    return (
      <div className="mt-3 space-y-2">
        <div>
          <label htmlFor={`reason-${proposalId}`} className="block text-xs font-medium text-gray-600 mb-1">
            Reason <span className="font-normal text-gray-400">(optional — helps improve future runs)</span>
          </label>
          <input
            id={`reason-${proposalId}`}
            type="text"
            list={datalistId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. routine work, not SR&ED, too vague…"
            className="w-full max-w-sm rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-bloom-mint"
            autoFocus
          />
          <datalist id={datalistId}>
            {REASON_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => applyDecision(nextDecision, reason.trim() || null)}
            disabled={loading}
            className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${btnStyle}`}
          >
            {loading ? "Saving…" : label}
          </button>
          <button
            type="button"
            onClick={cancelConfirm}
            disabled={loading}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── Idle: show badge + action buttons ──────────────────────────────────
  return (
    <div className="mt-3 space-y-1.5">
      {/* Current decision badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${DECISION_STYLES[decision]}`}>
          {DECISION_LABELS[decision]}
        </span>
        {/* Show recorded reason if present */}
        {decision !== "pending" && reason && (
          <span className="text-xs text-gray-400 italic">
            {reason}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {decision === "pending" && (
          <>
            {/* Accept — no confirmation needed */}
            <button
              type="button"
              onClick={() => applyDecision("accepted", null)}
              disabled={loading}
              className="rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-white hover:bg-emerald-50 transition-colors disabled:opacity-40"
            >
              {loading ? "Saving…" : "Accept"}
            </button>
            {/* Reject — shows confirmation + reason */}
            <button
              type="button"
              onClick={() => { setMode("confirming_reject"); setReason(""); }}
              disabled={loading}
              className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 bg-white hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              Reject
            </button>
            {/* Defer — shows confirmation + reason */}
            <button
              type="button"
              onClick={() => { setMode("confirming_defer"); setReason(""); }}
              disabled={loading}
              className="rounded-md border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700 bg-white hover:bg-amber-50 transition-colors disabled:opacity-40"
            >
              Defer
            </button>
          </>
        )}

        {/* Undo any non-pending decision → back to pending, clears reason */}
        {decision !== "pending" && (
          <button
            type="button"
            onClick={() => applyDecision("pending", null)}
            disabled={loading}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            {loading ? "Saving…" : "Undo"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
