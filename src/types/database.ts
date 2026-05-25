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

// Phase 3B enums
export type DocumentType =
  | "prior_claim"
  | "technical_narrative"
  | "meeting_notes"
  | "project_discussion"
  | "staff_note"
  | "client_background"
  | "technical_document"
  | "financial_summary"
  | "payroll_export"
  | "timesheet"
  | "contractor_invoice"
  | "material_invoice"
  | "email_thread"
  | "cra_review_context"
  | "other";

export type DocumentStatus =
  | "uploaded"
  | "needs_review"
  | "reviewed"
  | "accepted"
  | "superseded"
  | "archived";

export type AgreementStatus =
  | "draft"
  | "active"
  | "expired"
  | "terminated"
  | "pending_renewal";

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
  /** The engagement (contract) this claim year belongs to. Nullable at DB level. */
  engagement_id: string | null;
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
  /** fiscal_year_id removed — fiscal years now belong to engagements, not the reverse */
  engagement_type_id: string;
  title: string;
  status: EngagementStatus;
  notes: string | null;
  /** Contract fields — nullable, populated as the contract is formalised */
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_term_months: number | null;
  agreement_status: AgreementStatus | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Phase 3A table row types

export interface ContextSource {
  id: string;
  /** Primary anchor — the specific SR&ED claim year this source belongs to */
  fiscal_year_id: string;
  /** Denormalized convenience — the engagement (contract) */
  engagement_id: string;
  tenant_id: string;
  source_type: ContextSourceType;
  title: string;
  body: string;
  file_name: string | null;
  client_visible: boolean;
  status: ContextSourceStatus;
  uploaded_by: string | null;
  /**
   * Phase 3B: optional link to the uploaded document this source was created from.
   * Provides traceability: AI proposal → snippet → context source → document → file.
   */
  document_id: string | null;
  document_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiSuggestionRun {
  id: string;
  /** Primary anchor — the specific SR&ED claim year */
  fiscal_year_id: string;
  /** Denormalized convenience */
  engagement_id: string;
  tenant_id: string;
  triggered_by: string | null;
  context_source_ids: string[];
  model: string;
  /** Prompt template name+version, e.g. "sred_project_discovery_v1" */
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
  /** Primary anchor — the specific SR&ED claim year */
  fiscal_year_id: string;
  /** Denormalized convenience */
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
  /** Optional reason recorded when rejecting or deferring. Cleared on undo. */
  decision_reason: string | null;
  // Note: context_sources also has document_id and document_version_id (see ContextSource)
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
  /**
   * fiscal_year removed — fiscal years now belong to the engagement as a collection.
   * Load fiscal years separately: .from("fiscal_years").eq("engagement_id", id)
   */
  engagement_type: EngagementTypeWithServiceLine;
}

export interface FiscalYearWithEngagement extends FiscalYear {
  engagement: Pick<Engagement, "id" | "title" | "tenant_id">;
}

// Phase 3B table row types

export interface Document {
  id: string;
  /** Primary anchor — the specific SR&ED claim year */
  fiscal_year_id: string;
  /** Denormalized convenience */
  engagement_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  /**
   * The exact text Claude reads during Project Discovery analysis.
   * Auto-extracted on upload for .txt/.csv/.pdf/.docx.
   * Manually entered for other file types (images, spreadsheets, etc.).
   * NULL = "Needs Text" — document is not yet AI-ready.
   */
  ai_text: string | null;
  document_type: DocumentType;
  /** Free-form tags stored as a text array */
  tags: string[];
  status: DocumentStatus;
  client_visible: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  fiscal_year_id: string;
  engagement_id: string;
  tenant_id: string;
  version_number: number;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  /** Full path in the private 'documents' Supabase Storage bucket */
  storage_path: string;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
}

// Phase 3A joined types

export interface AiProposalWithSources extends AiProposal {
  ai_suggestion_sources: AiSuggestionSource[];
}

// Phase 3B joined types

export interface DocumentWithVersions extends Document {
  document_versions: DocumentVersion[];
}

export interface ContextSourceWithDocument extends ContextSource {
  document: Pick<Document, "id" | "title"> | null;
}

// ── Phase 3C enums ─────────────────────────────────────────────────────────

export type DiscoveryRunStatus = "pending" | "running" | "completed" | "failed";

export type SredProjectDecision = "pending" | "accepted" | "rejected" | "deferred";

export type DocumentRelationshipType =
  | "primary_evidence"
  | "supporting_evidence"
  | "financial_record"
  | "personnel_record"
  | "prior_art";

export type SupportedLine =
  | "line_242"
  | "line_244"
  | "line_246"
  | "section_c"
  | "multiple";

// ── Phase 3C T661 content schemas ─────────────────────────────────────────
//
// These are the jsonb field schemas stored in sred_projects.
// The *_ai_draft variants are immutable after creation.
// The *_edited variants start as null and are written by Bloom.

export interface Line242Content {
  /** Working hypothesis at the outset of the investigation */
  hypothesis: string;
  /** Prior art / state of existing knowledge that bounded the problem */
  background: string;
  /** Experimental methodology or approach used to resolve the uncertainty */
  methods: string;
  /** Direct statement of the scientific or technological uncertainty */
  uncertainty: string;
  /** Combined T661 Line 242 draft (≤ 350 words) weaving the above elements */
  combined_draft: string;
  /** Approximate word count of combined_draft */
  word_count: number;
  /**
   * @deprecated v1/v2 runs stored a single `narrative` string.
   * The read-only renderer falls back to this when the structured fields are absent.
   */
  narrative?: string;
}

export interface Line244MonthEntry {
  /** "YYYY-MM" */
  month: string;
  /** Description of SR&ED activities performed in this month, or the
   *  standard placeholder if no activity is evidenced. */
  activities: string;
  /**
   * Evidence basis for the timing of this entry:
   *  - "supported" — timing is directly stated or clearly evidenced in the source material
   *  - "inferred"  — timing is logically derived from project sequence, study duration,
   *                  publication context, or method chronology
   *  - "gap"       — no activity evidenced; standard placeholder text used
   */
  evidence_type: "supported" | "inferred" | "gap";
}

export interface Line244Content {
  /** One entry per fiscal year month, in chronological order. */
  monthly_breakdown: Line244MonthEntry[];
  /** 2–3 sentence summary of work performed across the full fiscal year. */
  summary: string;
}

export interface Line246Content {
  /** What was observed, measured, or produced — the direct experimental outcomes */
  results: string;
  /** What the results established — the scientific or technological finding */
  conclusions: string;
  /** What was tried and did not achieve the intended outcome */
  what_did_not_work: string;
  /** How findings inform or enable the next stage of investigation or development */
  future_research: string;
  /** 2–3 sentence statement of the advancement achieved or attempted */
  advancement_statement: string;
}

export interface SectionCHint {
  /** Technical Report section (e.g. "Work performed", "Results and conclusions") */
  section: string;
  /** Specific, actionable advice for the Bloom consultant */
  hint: string;
}

// ── Phase 3C table row types ───────────────────────────────────────────────

export interface DiscoveryRun {
  id: string;
  fiscal_year_id: string;
  engagement_id: string;
  tenant_id: string;
  triggered_by: string | null;
  /** IDs of AI-ready documents included in this run */
  document_ids: string[];
  /** IDs of active context sources included in this run */
  context_source_ids: string[];
  model: string;
  prompt_version: string | null;
  status: DiscoveryRunStatus;
  run_summary: string | null;
  error_message: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface SredProject {
  id: string;
  run_id: string;
  fiscal_year_id: string;
  engagement_id: string;
  tenant_id: string;
  project_name: string;
  /** AI-assigned confidence level for SR&ED qualification. NULL for pre-v3 runs. */
  confidence: "high" | "medium" | "low" | null;
  decision: SredProjectDecision;
  decision_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** T661 Part 2, Line 242 — AI draft (immutable) */
  line_242_ai_draft: Line242Content | null;
  /** T661 Part 2, Line 244 — AI draft (immutable) */
  line_244_ai_draft: Line244Content | null;
  /** T661 Part 2, Line 246 — AI draft (immutable) */
  line_246_ai_draft: Line246Content | null;
  /** Section C hints — AI draft (immutable) */
  section_c_hints_ai_draft: SectionCHint[] | null;
  /** Bloom-edited Line 242 — null until Bloom makes edits */
  line_242_edited: Line242Content | null;
  /** Bloom-edited Line 244 — null until Bloom makes edits */
  line_244_edited: Line244Content | null;
  /** Bloom-edited Line 246 — null until Bloom makes edits */
  line_246_edited: Line246Content | null;
  /** Bloom-edited Section C hints — null until Bloom makes edits */
  section_c_hints_edited: SectionCHint[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocumentRelationship {
  id: string;
  project_id: string;
  document_id: string;
  tenant_id: string;
  relationship_type: DocumentRelationshipType;
  supports_line: SupportedLine | null;
  supports_section: string | null;
  relevance_note: string | null;
  created_at: string;
}

// Phase 3C joined types

export interface SredProjectWithRelationships extends SredProject {
  project_document_relationships: Array<
    ProjectDocumentRelationship & {
      document: Pick<Document, "id" | "title" | "document_type"> | null;
    }
  >;
}

export interface DiscoveryRunWithProjects extends DiscoveryRun {
  sred_projects: SredProject[];
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
      // Phase 3B
      documents: {
        Row: Document;
        Insert: Omit<Document, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Document, "id">>;
      };
      document_versions: {
        Row: DocumentVersion;
        Insert: Omit<DocumentVersion, "id" | "created_at">;
        Update: Partial<Omit<DocumentVersion, "id">>;
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
        Returns: string;
      };
      get_user_id_by_email: {
        Args: { p_email: string };
        Returns: string | null;
      };
      has_agency_membership_in_tenant: {
        Args: { target_tenant_id: string };
        Returns: boolean;
      };
    };
  };
}
