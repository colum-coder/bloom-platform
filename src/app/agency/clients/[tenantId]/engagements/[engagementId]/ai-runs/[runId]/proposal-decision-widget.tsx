"use client";

import { useState } from "react";
import { updateProposalDecision } from "../../phase3-actions";
import type { ProposalDecision } from "@/types/database";

interface Props {
  proposalId: string;
  tenantId: string;
  initialDecision: ProposalDecision;
}

const DECISION_STYLES: Record<ProposalDecision, string> = {
  pending:  "bg-gray-100 text-gray-600",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  deferred: "bg-amber-50 text-amber-700",
};

export function ProposalDecisionWidget({ proposalId, tenantId, initialDecision }: Props) {
  const [decision, setDecision] = useState<ProposalDecision>(initialDecision);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function apply(next: ProposalDecision) {
    if (next === decision) return;
    setLoading(true);
    setError(null);
    const result = await updateProposalDecision(proposalId, next, tenantId);
    if (result?.error) {
      setError(result.error);
    } else {
      setDecision(next);
    }
    setLoading(false);
  }

  return (
    <div className="mt-3 space-y-1.5">
      {/* Current decision badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${DECISION_STYLES[decision]}`}>
          {decision === "pending" ? "Pending review" : decision.charAt(0).toUpperCase() + decision.slice(1)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {decision === "pending" && (
          <>
            <DecisionButton
              label="Accept"
              color="emerald"
              onClick={() => apply("accepted")}
              disabled={loading}
            />
            <DecisionButton
              label="Reject"
              color="red"
              onClick={() => apply("rejected")}
              disabled={loading}
            />
            <DecisionButton
              label="Defer"
              color="amber"
              onClick={() => apply("deferred")}
              disabled={loading}
            />
          </>
        )}

        {decision !== "pending" && (
          <DecisionButton
            label="Undo"
            color="gray"
            onClick={() => apply("pending")}
            disabled={loading}
          />
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

function DecisionButton({
  label,
  color,
  onClick,
  disabled,
}: {
  label: string;
  color: "emerald" | "red" | "amber" | "gray";
  onClick: () => void;
  disabled: boolean;
}) {
  const styles: Record<string, string> = {
    emerald: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
    red:     "border-red-200 text-red-700 hover:bg-red-50",
    amber:   "border-amber-200 text-amber-700 hover:bg-amber-50",
    gray:    "border-gray-200 text-gray-600 hover:bg-gray-50",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium bg-white transition-colors disabled:opacity-40 ${styles[color]}`}
    >
      {label}
    </button>
  );
}
