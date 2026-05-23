import type { MembershipStatus, TenantStatus, UserRole } from "@/types/database";

// ── Shared badge primitive ─────────────────────────────────────────────────

function Badge({
  label,
  dot,
  dotColor,
  className,
}: {
  label: string;
  dot?: boolean;
  dotColor?: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={dotColor ? { backgroundColor: dotColor } : undefined}
        />
      )}
      {label}
    </span>
  );
}

// ── Tenant status ──────────────────────────────────────────────────────────

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  switch (status) {
    case "active":
      return (
        <Badge
          label="Active"
          dot
          dotColor="#10b981"
          className="bg-emerald-50 text-emerald-700 border-emerald-200"
        />
      );
    case "inactive":
      return (
        <Badge
          label="Inactive"
          dot
          dotColor="#9ca3af"
          className="bg-gray-50 text-gray-500 border-gray-200"
        />
      );
    case "archived":
      return (
        <Badge
          label="Archived"
          className="bg-red-50 text-red-600 border-red-200"
        />
      );
    default:
      return (
        <Badge
          label={status}
          className="bg-gray-50 text-gray-500 border-gray-200"
        />
      );
  }
}

// ── Membership status ──────────────────────────────────────────────────────

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  switch (status) {
    case "active":
      return (
        <Badge
          label="Active"
          dot
          dotColor="#10b981"
          className="bg-emerald-50 text-emerald-700 border-emerald-200"
        />
      );
    case "invited":
      return (
        <Badge
          label="Invited"
          dot
          dotColor="#f59e0b"
          className="bg-amber-50 text-amber-700 border-amber-200"
        />
      );
    case "suspended":
      return (
        <Badge
          label="Suspended"
          className="bg-amber-50 text-amber-700 border-amber-200"
        />
      );
    case "removed":
      return (
        <Badge
          label="Removed"
          className="bg-gray-50 text-gray-500 border-gray-200"
        />
      );
    default:
      return (
        <Badge
          label={status}
          className="bg-gray-50 text-gray-500 border-gray-200"
        />
      );
  }
}

// ── Role badge ─────────────────────────────────────────────────────────────

export function RoleBadge({ role }: { role: UserRole }) {
  const isAgency = role.startsWith("agency_");
  const label = role.replace(/_/g, " ");

  if (isAgency) {
    return (
      <Badge
        label={label}
        dot
        dotColor="#2B307E"
        className="bg-blue-50 text-blue-700 border-blue-200"
      />
    );
  }

  return (
    <Badge
      label={label}
      dot
      dotColor="#03CEA4"
      className="bg-teal-50 text-teal-700 border-teal-200"
    />
  );
}
