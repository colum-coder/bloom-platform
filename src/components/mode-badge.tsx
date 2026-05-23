interface ModeBadgeProps {
  mode: "agency" | "client";
  clientName?: string;
}

/**
 * Small pill indicating the current operational context.
 * Agency → orange tint.  Client workspace → teal tint.
 * Designed for use on light backgrounds (workspace top nav, dashboard).
 */
export function ModeBadge({ mode, clientName }: ModeBadgeProps) {
  if (mode === "agency") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border bg-orange-50 text-orange-700 border-orange-200">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
        Agency
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border bg-teal-50 text-teal-700 border-teal-200">
      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
      {clientName ? clientName : "Client Workspace"}
    </span>
  );
}
