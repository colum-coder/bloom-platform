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

// Given a "YYYY-MM" month string (the fiscal year-end month), derive:
//   startDate: first day of the same calendar month, one year prior
//   endDate:   last day of the given month
//   label:     "FY {year}" where year is the end year
//
// Example: yearMonth = "2025-09" (September 2025)
//   → endDate   = 2025-09-30
//   → startDate = 2024-10-01  (October 1 of the prior year)
//   → label     = "FY 2025"
function deriveDates(yearMonth: string): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const [y, m] = yearMonth.split("-").map(Number);

  // Last day of the end month: day 0 of the following month rolls back to last day of this one
  const endObj = new Date(y, m, 0); // e.g. new Date(2025, 9, 0) = Sep 30, 2025

  // First day of the start month: same numeric month (0-indexed) of the prior year
  // Month m (1-indexed Sep=9) used as 0-indexed = October → Oct 1 of year-1
  const startObj = new Date(y - 1, m, 1); // e.g. new Date(2024, 9, 1) = Oct 1, 2024

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  return {
    startDate: fmt(startObj),
    endDate:   fmt(endObj),
    label:     `FY ${y}`,
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "";
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return `${MONTH_NAMES[sm - 1]} ${sy} – ${MONTH_NAMES[em - 1]} ${ey}`;
}

export function FiscalYearForm({ tenantId }: FiscalYearFormProps) {
  const router = useRouter();

  // yearEndMonth drives everything; label is auto-populated but editable
  const [yearEndMonth, setYearEndMonth] = useState("");
  const [label,        setLabel]        = useState("");
  const [labelEdited,  setLabelEdited]  = useState(false); // track if user manually changed label
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const [status,       setStatus]       = useState<FiscalYearStatus>("active");
  const [notes,        setNotes]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  function handleYearEndChange(value: string) {
    setYearEndMonth(value);
    if (!value) {
      setStartDate("");
      setEndDate("");
      if (!labelEdited) setLabel("");
      return;
    }
    const derived = deriveDates(value);
    setStartDate(derived.startDate);
    setEndDate(derived.endDate);
    // Only auto-update label if the user hasn't manually typed one
    if (!labelEdited) {
      setLabel(derived.label);
    }
  }

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

  const derivedRange = formatDateRange(startDate, endDate);
  const canSubmit = yearEndMonth && label && startDate && endDate;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Fiscal year-end month — primary input */}
      <div>
        <label
          htmlFor="year-end-month"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Fiscal year-end month <span className="text-red-500">*</span>
        </label>
        <input
          id="year-end-month"
          type="month"
          required
          value={yearEndMonth}
          onChange={(e) => handleYearEndChange(e.target.value)}
          className="w-full sm:w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          The month the fiscal year ends.
          {derivedRange
            ? <> The 12-month period will be <span className="text-gray-600 font-medium">{derivedRange}</span>.</>
            : <> Start and end dates are calculated automatically.</>
          }
        </p>
      </div>

      {/* Label — auto-filled, editable */}
      <div>
        <label
          htmlFor="fy-label"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Label <span className="text-red-500">*</span>
        </label>
        <input
          id="fy-label"
          type="text"
          required
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setLabelEdited(true);
          }}
          placeholder="e.g. FY 2025"
          className="w-full sm:w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          Auto-filled from the year-end month. Edit if needed.
        </p>
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
          disabled={loading || !canSubmit}
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
