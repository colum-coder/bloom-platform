// ── Enums ──────────────────────────────────────────────────────────────────
// Phase 3A enums

export type ContextSourceStatus = "active" | "archived";

export type ContextSourceType =
  | "prior_claim"
  | "meeting_notes"
  | "project_discussion"
  | "staff_note"
  | "client_background"
  | "discovery_call_note"
  | "email_thread"
  | "technical_narrative"
  | "technical_document_summary"
  | "financial_summary"
  | "payroll_export"
  | "contractor_invoice"
  | "cra_review_context"
  | "other";

export type AiRunStatus = "pending" | "running" | "completed" | "failed";

export type ProposalType =
  | "project"
  | "person"
  | "evidence"
  | "hours"
  | "contractor"
  | "material"
  | "government_support"
  | "gap";

export type ProposalDecision = "pending" | "accepted" | "rejected" | "deferred";

export type ProposalRunStatus =
  | "new"
  | "resurfacing"
  | "possible_duplicate"
  | "confirmed"
  | "superseded";

export type ProposalConfidence = "high" | "medium" | "low";

// ── Phase 3A row types ─────────────────────────────────────────────────────

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

// Phase 2 enums
export type FiscalYearStatus = "active" | "closed" | "archived";

export type EngagementStatus =
  | "draft"
  | "active"
  | "in_review"
  | "submitted"
  | "closed"
  | "archived";

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

// Phase 2 table row types

export interface ServiceLine {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface EngagementType {
  id: string;
  service_line_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface FiscalYear {
  id: string;
  tenant_id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: FiscalYearStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Engagement {
  id: string;
  tenant_id: string;
  fiscal_year_id: string | null;
  engagement_type_id: string;
  title: string;
  status: EngagementStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Phase 3A table row types

export interface ContextSource {
  id: string;
  engagement_id: string;
  tenant_id: string;
  source_type: ContextSourceType;
  title: string;
  body: string;
  file_name: string | null;
  client_visible: boolean;
  status: ContextSourceStatus;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiSuggestionRun {
  id: string;
  engagement_id: string;
  tenant_id: string;
  triggered_by: string | null;
  context_source_ids: string[];
  model: string;
  /** Prompt template name+version, e.g. "sred_project_discovery_v1". Added in migration 006. */
  prompt_version: string | null;
  status: AiRunStatus;
  summary: string | null;
  activity_months: string[] | null;
  tr_sections_supported: string[] | null;
  tr_sections_unsupported: string[] | null;
  truncation_warning: boolean;
  error_message: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface AiProposal {
  id: string;
  run_id: string;
  engagement_id: string;
  tenant_id: string;
  proposal_type: ProposalType;
  title: string;
  description: string | null;
  proposed_project: string | null;
  proposed_person: string | null;
  claim_component: string | null;
  section_or_area: string | null;
  confidence: ProposalConfidence;
  reason: string | null;
  decision: ProposalDecision;
  /** Optional reason recorded when rejecting or deferring. Cleared on undo. Added in migration 006. */
  decision_reason: string | null;
  run_status: ProposalRunStatus;
  duplicate_of: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AiSuggestionSource {
  id: string;
  proposal_id: string;
  context_source_id: string | null;
  tenant_id: string;
  snippet: string;
  relevance_note: string | null;
  created_at: string;
}

// ── Joined / enriched types ────────────────────────────────────────────────

export interface MembershipWithTenant extends TenantMembership {
  tenant: Tenant;
}

export interface MembershipWithProfile extends TenantMembership {
  profile: Pick<Profile, "full_name"> | null;
}

export interface TenantWithMemberships extends Tenant {
  /** Filtered to active memberships by the query; use .length for count. */
  tenant_memberships: Array<Pick<TenantMembership, "id" | "status">>;
}

// Phase 2 joined types

export interface EngagementTypeWithServiceLine extends EngagementType {
  service_line: ServiceLine;
}

export interface EngagementWithDetails extends Engagement {
  fiscal_year: FiscalYear | null;
  engagement_type: EngagementTypeWithServiceLine;
}

// Phase 3A joined types

export interface AiProposalWithSources extends AiProposal {
  ai_suggestion_sources: AiSuggestionSource[];
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
      // Phase 3A
      context_sources: {
        Row: ContextSource;
        Insert: Omit<ContextSource, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ContextSource, "id">>;
      };
      ai_suggestion_runs: {
        Row: AiSuggestionRun;
        Insert: Omit<AiSuggestionRun, "id" | "created_at">;
        Update: Partial<Omit<AiSuggestionRun, "id">>;
      };
      ai_proposals: {
        Row: AiProposal;
        Insert: Omit<AiProposal, "id" | "created_at">;
        Update: Partial<Omit<AiProposal, "id">>;
      };
      ai_suggestion_sources: {
        Row: AiSuggestionSource;
        Insert: Omit<AiSuggestionSource, "id" | "created_at">;
        Update: Partial<Omit<AiSuggestionSource, "id">>;
      };
      // Phase 2
      service_lines: {
        Row: ServiceLine;
        Insert: Omit<ServiceLine, "id" | "created_at">;
        Update: Partial<Omit<ServiceLine, "id">>;
      };
      engagement_types: {
        Row: EngagementType;
        Insert: Omit<EngagementType, "id" | "created_at">;
        Update: Partial<Omit<EngagementType, "id">>;
      };
      fiscal_years: {
        Row: FiscalYear;
        Insert: Omit<FiscalYear, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<FiscalYear, "id">>;
      };
      engagements: {
        Row: Engagement;
        Insert: Omit<Engagement, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Engagement, "id">>;
      };
    };
    Enums: {
      tenant_type: TenantType;
      tenant_status: TenantStatus;
      membership_status: MembershipStatus;
      user_role: UserRole;
      // Phase 2
      fiscal_year_status: FiscalYearStatus;
      engagement_status: EngagementStatus;
    };
    Functions: {
      create_client_tenant: {
        Args: { p_name: string; p_slug: string; p_status?: TenantStatus };
        Returns: string; // uuid
      };
      get_user_id_by_email: {
        Args: { p_email: string };
        Returns: string | null; // uuid or null
      };
      has_agency_membership_in_tenant: {
        Args: { target_tenant_id: string };
        Returns: boolean;
      };
    };
  };
}
