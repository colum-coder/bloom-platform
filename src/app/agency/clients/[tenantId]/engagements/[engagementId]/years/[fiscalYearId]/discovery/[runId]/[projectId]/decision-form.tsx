"use client";

import { useState, useTransition } from "react";
import { updateProjectDecision } from "../../../discovery-actions";
import type { SredProjectDecision } from "@/types/database";

interface Props {
  projectId: string;
  runId: string;
  tenantId: string;
  engagementId: string;
  fiscalYearId: string;
  currentDecision: SredProjectDecision;
}

const DECISION_STYLES: Record<SredProjectDecision, string> = {
  pending:  "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
  accepted: "border-emerald-500 bg-emerald-50 text-emerald-700",
  rejected: "border-red-400 bg-red-50 text-red-700",
  deferred: "border-amber-400 bg-amber-50 text-amber-700",
};

const DECISION_LABELS: Record<SredProjectDecision, string> = {
  pending:  "Pending Review",
  accepted: "Accepted",
  rejected: "Rejected",
  deferred: "Deferred",
};

export function DecisionForm({
  projectId,
  runId,
  tenantId,
  engagementId,
  fiscalYearId,
  currentDecision,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reason, setReason] = useState("");
  const [pendingDecision, setPendingDecision] = useState<SredProjectDecision | null>(null);

  function handleDecisionClick(decision: SredProjectDecision) {
    if (decision === currentDecision) return;

    if (decision === "rejected" || decision === "deferred") {
      setPendingDecision(decision);
      setShowReasonInput(true);
      return;
    }

    // For "accepted" or reverting to "pending" — no reason needed
    applyDecision(decision, null);
  }

  function applyDecision(decision: SredProjectDecision, decisionReason: string | null) {
    setError(null);
    setSaved(false);
    setShowReasonInput(false);
    setPendingDecision(null);

    startTransition(async () => {
      const result = await updateProjectDecision(
        projectId,
        decision,
        tenantId,
        engagementId,
        fiscalYearId,
        runId,
        decisionReason
      );
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  const decisions: SredProjectDecision[] = ["accepted", "deferred", "rejected", "pending"];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {decisions.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handleDecisionClick(d)}
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
              currentDecision === d
                ? DECISION_STYLES[d]
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {currentDecision === d && (
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            )}
            {DECISION_LABELS[d]}
          </button>
        ))}
        {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
      </div>

      {/* Reason input for reject/defer */}
      {showReasonInput && pendingDecision && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-xs text-gray-600 font-medium">
            {pendingDecision === "rejected"
              ? "Why is this project being rejected? (optional)"
              : "Why is this project being deferred? (optional)"}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. insufficient evidence of technological uncertainty..."
            className="block w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => applyDecision(pendingDecision, reason || null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-50 ${
                pendingDecision === "rejected" ? "bg-red-500" : "bg-amber-500"
              }`}
            >
              {isPending
                ? "Saving…"
                : pendingDecision === "rejected"
                ? "Confirm Reject"
                : "Confirm Defer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReasonInput(false);
                setPendingDecision(null);
                setReason("");
              }}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
