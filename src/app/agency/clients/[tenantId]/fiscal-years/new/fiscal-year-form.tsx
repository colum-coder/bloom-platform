"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFiscalYear } from "../../engagement-actions";
import type { FiscalYearStatus } from "@/types/database";

interface FiscalYearFormProps {
  tenantId: string;
}

const STATUS_OPTIONS: Array<{ value: FiscalYearStatus; label: string }> = [
  { value: "active",   label: "Active" },
  { value: "closed",   label: "Closed" },
  { value: "archived", label: "Archived" },
];

export function FiscalYearForm({ tenantId }: FiscalYearFormProps) {
  const router = useRouter();

  const [label,     setLabel]     = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [status,    setStatus]    = useState<FiscalYearStatus>("active");
  const [notes,     setNotes]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("label",      label);
    formData.set("start_date", startDate);
    formData.set("end_date",   endDate);
    formData.set("status",     status);
    formData.set("notes",      notes);

    const result = await createFiscalYear(formData, tenantId);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, createFiscalYear calls redirect() — no further action needed
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Label */}
      <div>
        <label
          htmlFor="label"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Label <span className="text-red-500">*</span>
        </label>
        <input
          id="label"
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. FY 2024 or 2023–2024"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          A short, human-readable label for this fiscal year.
        </p>
      </div>

      {/* Date range */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="start_date"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            Start date <span className="text-red-500">*</span>
          </label>
          <input
            id="start_date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="end_date"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            End date <span className="text-red-500">*</span>
          </label>
          <input
            id="end_date"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
          />
        </div>
      </div>

      {/* Status */}
      <div>
        <label
          htmlFor="fy-status"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Status
        </label>
        <select
          id="fy-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as FiscalYearStatus)}
          className="w-full sm:w-48 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="fy-notes"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="fy-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any relevant context for this fiscal year…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2.5 border border-red-200">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={loading || !label || !startDate || !endDate}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#03CEA4" }}
        >
          {loading ? "Creating…" : "Create Fiscal Year"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/agency/clients/${tenantId}`)}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
