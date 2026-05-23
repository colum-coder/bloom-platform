"use client";

import { useState } from "react";
import { triggerAiRun } from "../phase3-actions";

interface Props {
  engagementId: string;
  tenantId: string;
  sourceCount: number;
}

export function TriggerAiRunButton({ engagementId, tenantId, sourceCount }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await triggerAiRun(engagementId, tenantId);
    // If triggerAiRun calls redirect() on success, this line is never reached.
    // If an error is returned, show it.
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || sourceCount === 0}
        className="rounded-lg px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
        style={{ backgroundColor: "#2B307E" }}
        title={
          sourceCount === 0
            ? "Add at least one context source before running AI analysis"
            : `Run AI analysis on ${sourceCount} source${sourceCount === 1 ? "" : "s"}`
        }
      >
        {loading ? "Running analysis…" : `Run AI Analysis (${sourceCount} source${sourceCount === 1 ? "" : "s"})`}
      </button>

      {loading && (
        <p className="text-xs text-gray-500">
          Analysing source material — this may take up to 30 seconds.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-200 max-w-xl">
          {error}
        </p>
      )}
    </div>
  );
}
