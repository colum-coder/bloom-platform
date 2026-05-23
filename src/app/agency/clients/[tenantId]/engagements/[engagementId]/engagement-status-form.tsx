"use client";

import { useState } from "react";
import { updateEngagementStatus } from "../../engagement-actions";
import type { EngagementStatus } from "@/types/database";

interface EngagementStatusFormProps {
  engagementId: string;
  tenantId: string;
  currentStatus: EngagementStatus;
}

const ALL_STATUSES: Array<{ value: EngagementStatus; label: string }> = [
  { value: "draft",     label: "Draft" },
  { value: "active",    label: "Active" },
  { value: "in_review", label: "In Review" },
  { value: "submitted", label: "Submitted" },
  { value: "closed",    label: "Closed" },
  { value: "archived",  label: "Archived" },
];

export function EngagementStatusForm({
  engagementId,
  tenantId,
  currentStatus,
}: EngagementStatusFormProps) {
  const [status,   setStatus]   = useState<EngagementStatus>(currentStatus);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  const hasChanged = status !== currentStatus;

  async function handleSave() {
    if (!hasChanged) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    const result = await updateEngagementStatus(engagementId, tenantId, status);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as EngagementStatus);
            setSuccess(false);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !hasChanged}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: "#03CEA4" }}
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
          ✓ Status updated to <strong>{status.replace("_", " ")}</strong>.
          Refresh the page to see the updated badge.
        </p>
      )}
    </div>
  );
}
