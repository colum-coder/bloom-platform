// ── Enums ──────────────────────────────────────────────────────────────────

export type TenantType = "agency" | "client";

export type TenantStatus = "active" | "inactive" | "archived";

export type MembershipStatus = "active" | "invited" | "suspended" | "removed";

export type UserRole =
  | "agency_owner"
  | "agency_admin"
  | "agency_manager"
  | "agency_consultant"
  | "agency_reviewer"
  | "client_owner"
  | "client_admin"
  | "client_contributor"
  | "client_finance"
  | "client_reviewer";

// ── Table row types ────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  status: MembershipStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Joined / enriched types ────────────────────────────────────────────────

export interface MembershipWithTenant extends TenantMembership {
  tenant: Tenant;
}

// ── Supabase Database generic type (used with createClient<Database>) ──────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id">>;
      };
      tenants: {
        Row: Tenant;
        Insert: Omit<Tenant, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Tenant, "id">>;
      };
      tenant_memberships: {
        Row: TenantMembership;
        Insert: Omit<TenantMembership, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<TenantMembership, "id">>;
      };
    };
    Enums: {
      tenant_type: TenantType;
      tenant_status: TenantStatus;
      membership_status: MembershipStatus;
      user_role: UserRole;
    };
  };
}
