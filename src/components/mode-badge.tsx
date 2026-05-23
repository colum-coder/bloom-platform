interface ModeBadgeProps {
  mode: "agency" | "client";
  clientName?: string;
}

/**
 * Small pill that makes the current operational context unambiguous.
 * Agency Mode → orange.  Client Workspace → teal.
 */
export function ModeBadge({ mode, clientName }: ModeBadgeProps) {
  if (mode === "agency") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide"
        style={{ backgroundColor: "#FF6A4220", color: "#FF6A42" }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#FF6A42" }} />
        Agency Mode
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide"
      style={{ backgroundColor: "#03CEA420", color: "#03CEA4" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#03CEA4" }} />
      {clientName ? `Client: ${clientName}` : "Client Workspace"}
    </span>
  );
}
