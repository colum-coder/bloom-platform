"use client";

import { useState, useTransition } from "react";
import { updateDocumentStatus } from "../../document-actions";
import type { DocumentStatus } from "@/types/database";

interface StatusOption {
  value: DocumentStatus;
  label: string;
}

interface Props {
  documentId: string;
  currentStatus: DocumentStatus;
  tenantId: string;
  engagementId: string;
  fiscalYearId: string;
  statusOptions: StatusOption[];
}

export function StatusUpdateForm({
  documentId,
  currentStatus,
  tenantId,
  engagementId,
  fiscalYearId,
  statusOptions,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<DocumentStatus>(currentStatus);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as DocumentStatus;
    setSelected(next);
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateDocumentStatus(
        documentId,
        next,
        tenantId,
        engagementId,
        fiscalYearId
      );
      if (result.error) {
        setError(result.error);
        setSelected(currentStatus); // revert on failure
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs font-medium text-gray-500 flex-shrink-0">
        Status:
      </label>
      <select
        value={selected}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900
          focus:border-gray-400 focus:outline-none focus:ring-0 disabled:opacity-50"
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {isPending && <span className="text-xs text-gray-400">Saving…</span>}
      {saved    && <span className="text-xs text-emerald-600">Saved</span>}
      {error    && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
