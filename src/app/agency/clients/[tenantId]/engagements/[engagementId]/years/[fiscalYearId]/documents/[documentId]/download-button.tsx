"use client";

import { useState, useTransition } from "react";
import { getSignedDownloadUrl } from "../../document-actions";

interface Props {
  versionId: string;
  documentId: string;
  tenantId: string;
  engagementId: string;
  fiscalYearId: string;
  fileName: string;
  /** Renders a compact text link instead of a full button */
  compact?: boolean;
}

export function DownloadButton({
  versionId,
  documentId,
  tenantId,
  engagementId,
  fiscalYearId,
  fileName,
  compact = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await getSignedDownloadUrl(
        versionId,
        documentId,
        tenantId,
        engagementId,
        fiscalYearId
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.url) {
        // Trigger download via a temporary anchor. The signed URL expires in 60s
        // so we open it immediately rather than navigating to a new page.
        const a = document.createElement("a");
        a.href       = result.url;
        a.download   = fileName;
        a.target     = "_blank";
        a.rel        = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDownload}
        disabled={isPending}
        className={
          compact
            ? "text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            : "rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        }
        style={compact ? undefined : { backgroundColor: "#2B307E" }}
      >
        {isPending ? "Preparing…" : compact ? "Download" : "Download File"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
