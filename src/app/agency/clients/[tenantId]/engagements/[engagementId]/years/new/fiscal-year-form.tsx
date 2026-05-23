"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFiscalYear } from "../../phase3-actions";

interface Props {
  engagementId: string;
  tenantId: string;
}

export function FiscalYearForm({ engagementId, tenantId }: Props) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await addFiscalYear(formData, engagementId, tenantId);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, addFiscalYear calls redirect() — no further action needed.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Label */}
      <div>
        <label htmlFor="fy-label" className="block text-sm font-medium text-gray-700 mb-1.5">
          Label <span className="text-red-500">*</span>
        </label>
        <input
          id="fy-label"
          name="label"
          type="text"
          required
          placeholder="e.g. FY2023, 2022–2023, Year 1"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          A short label used throughout the platform to identify this claim year.
        </p>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="fy-start" className="block text-sm font-medium text-gray-700 mb-1.5">
            Start date <span className="text-red-500">*</span>
          </label>
          <input
            id="fy-start"
            name="start_date"
            type="date"
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="fy-end" className="block text-sm font-medium text-gray-700 mb-1.5">
            End date <span className="text-red-500">*</span>
          </label>
          <input
            id="fy-end"
            name="end_date"
            type="date"
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="fy-notes" className="block text-sm font-medium text-gray-700 mb-1.5">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="fy-notes"
          name="notes"
          rows={3}
          placeholder="Any notes about this claim year…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent resize-y"
        />
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2.5 border border-red-200">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#2B307E" }}
        >
          {loading ? "Adding…" : "Add Claim Year"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
