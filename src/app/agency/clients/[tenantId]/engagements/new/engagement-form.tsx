"use client";

import { useState } from "react";
import { createEngagement } from "../../engagement-actions";
import type { EngagementStatus, FiscalYear } from "@/types/database";

// Flat representation of engagement type options, grouped by service line
export interface EngagementTypeOption {
  id: string;
  name: string;
  serviceLineName: string;
  serviceLineSlug: string;
}

interface EngagementFormProps {
  tenantId: string;
  engagementTypes: EngagementTypeOption[];
  fiscalYears: Pick<FiscalYear, "id" | "label" | "status">[];
}

const STATUS_OPTIONS: Array<{ value: EngagementStatus; label: string }> = [
  { value: "draft",     label: "Draft" },
  { value: "active",    label: "Active" },
  { value: "in_review", label: "In Review" },
  { value: "submitted", label: "Submitted" },
];

// SR&ED types require a fiscal year — identified by service line slug
const SRED_SLUG = "sred";

export function EngagementForm({
  tenantId,
  engagementTypes,
  fiscalYears,
}: EngagementFormProps) {
  const firstType = engagementTypes[0];

  const [title,          setTitle]          = useState("");
  const [typeId,         setTypeId]         = useState(firstType?.id ?? "");
  const [fiscalYearId,   setFiscalYearId]   = useState("");
  const [status,         setStatus]         = useState<EngagementStatus>("draft");
  const [notes,          setNotes]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // Determine if the selected type is SR&ED (fiscal year required)
  const selectedType = engagementTypes.find((t) => t.id === typeId);
  const isSRED = selectedType?.serviceLineSlug === SRED_SLUG;
  const fiscalYearRequired = isSRED;

  // Group types by service line for the select optgroups
  const groups = engagementTypes.reduce<
    Record<string, { serviceLineName: string; types: EngagementTypeOption[] }>
  >((acc, t) => {
    if (!acc[t.serviceLineSlug]) {
      acc[t.serviceLineSlug] = { serviceLineName: t.serviceLineName, types: [] };
    }
    acc[t.serviceLineSlug].types.push(t);
    return acc;
  }, {});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (fiscalYearRequired && !fiscalYearId) {
      setError("Fiscal year is required for SR&ED engagements.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("title",              title);
    formData.set("engagement_type_id", typeId);
    formData.set("fiscal_year_id",     fiscalYearId);
    formData.set("status",             status);
    formData.set("notes",              notes);

    const result = await createEngagement(formData, tenantId);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, createEngagement calls redirect() — no further action needed
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label
          htmlFor="eng-title"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Engagement title <span className="text-red-500">*</span>
        </label>
        <input
          id="eng-title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Acme Corp — SR&ED Claim FY 2024"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        />
      </div>

      {/* Engagement type */}
      <div>
        <label
          htmlFor="eng-type"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Engagement type <span className="text-red-500">*</span>
        </label>
        <select
          id="eng-type"
          required
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            // Clear fiscal year when switching away from SR&ED
            const newType = engagementTypes.find((t) => t.id === e.target.value);
            if (newType?.serviceLineSlug !== SRED_SLUG) {
              setFiscalYearId("");
            }
          }}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        >
          {Object.entries(groups).map(([slug, group]) => (
            <optgroup key={slug} label={group.serviceLineName}>
              {group.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedType && (
          <p className="text-xs text-gray-400 mt-1">
            Service line:{" "}
            <span className="text-gray-600">{selectedType.serviceLineName}</span>
          </p>
        )}
      </div>

      {/* Fiscal year — shown always, required when SR&ED */}
      <div>
        <label
          htmlFor="eng-fy"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Fiscal year{" "}
          {fiscalYearRequired ? (
            <span className="text-red-500">*</span>
          ) : (
            <span className="text-gray-400 font-normal">(optional)</span>
          )}
        </label>
        <select
          id="eng-fy"
          value={fiscalYearId}
          onChange={(e) => setFiscalYearId(e.target.value)}
          required={fiscalYearRequired}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        >
          <option value="">— No fiscal year —</option>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.label}
              {fy.status !== "active" ? ` (${fy.status})` : ""}
            </option>
          ))}
        </select>
        {fiscalYears.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            No fiscal years found for this client. Add one from the client detail page first.
          </p>
        )}
        {fiscalYearRequired && fiscalYears.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            Required for SR&ED engagements.
          </p>
        )}
      </div>

      {/* Status */}
      <div>
        <label
          htmlFor="eng-status"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Initial status
        </label>
        <select
          id="eng-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as EngagementStatus)}
          className="w-full sm:w-48 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {status === "draft" && (
          <p className="text-xs text-gray-400 mt-1">
            Draft engagements are only visible to Bloom staff, not to the client.
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="eng-notes"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="eng-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any context about this engagement…"
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
          disabled={loading || !title || !typeId}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#03CEA4" }}
        >
          {loading ? "Creating…" : "Create Engagement"}
        </button>
        <a
          href={`/agency/clients/${tenantId}`}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
