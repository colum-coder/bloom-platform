import type { MembershipStatus, TenantStatus, UserRole } from "@/types/database";

// ── Tenant status ─────────────────────────────────────────────────────────

const TENANT_STATUS_STYLES: Record<TenantStatus, { bg: string; text: string; label: string }> = {
  active:   { bg: "#03CEA415", text: "#03CEA4", label: "Active" },
  inactive: { bg: "#6B728015", text: "#6B7280", label: "Inactive" },
  archived: { bg: "#EF444415", text: "#EF4444", label: "Archived" },
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const s = TENANT_STATUS_STYLES[status] ?? TENANT_STATUS_STYLES.inactive;
  return (
    <span
      className="inline-block text-xs font-semibold rounded-full px-2 py-0.5"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ── Membership status ─────────────────────────────────────────────────────

const MEMBERSHIP_STATUS_STYLES: Record<
  MembershipStatus,
  { bg: string; text: string; label: string }
> = {
  active:    { bg: "#03CEA415", text: "#03CEA4", label: "Active" },
  invited:   { bg: "#FF6A4215", text: "#FF6A42", label: "Invited" },
  suspended: { bg: "#EAB30815", text: "#D97706", label: "Suspended" },
  removed:   { bg: "#EF444415", text: "#EF4444", label: "Removed" },
};

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  const s = MEMBERSHIP_STATUS_STYLES[status] ?? MEMBERSHIP_STATUS_STYLES.suspended;
  return (
    <span
      className="inline-block text-xs font-semibold rounded-full px-2 py-0.5"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────

export function RoleBadge({ role }: { role: UserRole }) {
  const isAgency = role.startsWith("agency_");
  return (
    <span
      className="inline-block text-xs font-medium rounded-full px-2 py-0.5"
      style={
        isAgency
          ? { backgroundColor: "#2B307E15", color: "#2B307E" }
          : { backgroundColor: "#03CEA415", color: "#03CEA4" }
      }
    >
      {role.replace(/_/g, " ")}
    </span>
  );
}
