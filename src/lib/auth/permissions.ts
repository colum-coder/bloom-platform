import type { UserRole, MembershipWithTenant } from "@/types/database";

// ── Role classification ────────────────────────────────────────────────────

export const AGENCY_ROLES: UserRole[] = [
  "agency_owner",
  "agency_admin",
  "agency_manager",
  "agency_consultant",
  "agency_reviewer",
];

export const CLIENT_ROLES: UserRole[] = [
  "client_owner",
  "client_admin",
  "client_contributor",
  "client_finance",
  "client_reviewer",
];

export const AGENCY_ADMIN_ROLES: UserRole[] = ["agency_owner", "agency_admin"];

export const TENANT_ADMIN_ROLES: UserRole[] = [
  "agency_owner",
  "agency_admin",
  "client_owner",
  "client_admin",
];

// ── Predicate helpers (operate on in-memory membership data) ──────────────
// These mirror the SQL helper functions in 002_rls.sql for use in
// Next.js middleware and server components without additional round-trips.

export function isAgencyRole(role: UserRole): boolean {
  return AGENCY_ROLES.includes(role);
}

export function isClientRole(role: UserRole): boolean {
  return CLIENT_ROLES.includes(role);
}

/** True when the user has an admin-level role in any active agency tenant. */
export function isAgencyAdmin(memberships: MembershipWithTenant[]): boolean {
  return memberships.some(
    (m) =>
      m.status === "active" &&
      m.tenant.type === "agency" &&
      (AGENCY_ADMIN_ROLES as UserRole[]).includes(m.role)
  );
}

/** True when the user has an active membership for the given tenant. */
export function isActiveMember(
  memberships: MembershipWithTenant[],
  tenantId: string
): boolean {
  return memberships.some(
    (m) => m.tenant_id === tenantId && m.status === "active"
  );
}

/** True when the user's active role in the tenant is in the allowed list. */
export function hasTenantRole(
  memberships: MembershipWithTenant[],
  tenantId: string,
  allowedRoles: UserRole[]
): boolean {
  return memberships.some(
    (m) =>
      m.tenant_id === tenantId &&
      m.status === "active" &&
      allowedRoles.includes(m.role)
  );
}

/** True when the user holds an admin-level role in the given tenant. */
export function hasTenantAdminRole(
  memberships: MembershipWithTenant[],
  tenantId: string
): boolean {
  return hasTenantRole(memberships, tenantId, TENANT_ADMIN_ROLES);
}

// ── Route-based permission helpers ────────────────────────────────────────

/** Determine the default landing path for a user given their memberships. */
export function getDefaultRedirect(memberships: MembershipWithTenant[]): string {
  const hasActiveAgencyMembership = memberships.some(
    (m) => m.status === "active" && m.tenant.type === "agency"
  );
  return hasActiveAgencyMembership ? "/agency" : "/workspace";
}
