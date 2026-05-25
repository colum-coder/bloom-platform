-- ============================================================
-- Migration 009: Phase 3C — Project Discovery
--
-- Run AFTER 008_phase3b_documents.sql.
--
-- Creates:
--   1. discovery_runs         — one record per "Run Project Discovery" invocation
--   2. sred_projects          — SR&ED projects drafted by Claude, one per project
--   3. project_document_relationships — many-to-many: projects ↔ documents
--
-- Design decisions:
--   - AI drafts (*_ai_draft jsonb) are written once on creation and NEVER updated.
--     They are the immutable record of what Claude said.
--   - Bloom edits (*_edited jsonb) start NULL and are updated independently.
--     The UI shows the edited version if present, otherwise the AI draft.
--   - Multiple discovery runs can exist per fiscal year; older runs are preserved.
--   - sred_projects.decision tracks Bloom's review outcome per project.
--   - No client-visible columns — all discovery data is agency-internal.
--   - No hard DELETE policies — use decision='rejected' to discard a project.
--
-- T661 Part 2 line structure (CRA form):
--   line_242 → Description of advancement sought (narrative)
--   line_244 → Monthly work description (breakdown by fiscal year month)
--   line_246 → Technological uncertainty statement (structured fields)
--   section_c_hints → Supporting evidence hints for Section C
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. discovery_runs
-- ──────────────────────────────────────────────────────────

create table public.discovery_runs (
  id                 uuid        primary key default gen_random_uuid(),
  fiscal_year_id     uuid        not null references public.fiscal_years(id) on delete cascade,
  engagement_id      uuid        not null references public.engagements(id),
  tenant_id          uuid        not null references public.tenants(id),
  triggered_by       uuid        references auth.users(id) on delete set null,

  -- Which documents and context sources were included in this run.
  -- Stored as arrays for reproducibility — shows what Claude had access to.
  document_ids       uuid[]      not null default '{}',
  context_source_ids uuid[]      not null default '{}',

  model              text        not null,
  prompt_version     text,

  status             text        not null default 'pending',
  run_summary        text,
  error_message      text,
  prompt_tokens      integer,
  completion_tokens  integer,

  created_at         timestamptz not null default now(),
  completed_at       timestamptz,

  constraint discovery_runs_status_check check (status in (
    'pending', 'running', 'completed', 'failed'
  ))
);

comment on table public.discovery_runs is
  'One record per "Run Project Discovery" invocation for a claim year. '
  'Stores metadata about what Claude was given and what it produced. '
  'Multiple runs per fiscal year are preserved — never overwritten.';

comment on column public.discovery_runs.document_ids is
  'IDs of AI-ready documents included in this run. '
  'Snapshot at run time; documents may be updated after the run.';

comment on column public.discovery_runs.context_source_ids is
  'IDs of active context sources included in this run.';

create index on public.discovery_runs (fiscal_year_id, created_at desc);
create index on public.discovery_runs (tenant_id);

alter table public.discovery_runs enable row level security;

create policy "discovery_runs: agency can select"
  on public.discovery_runs for select
  using (public.has_agency_membership_in_tenant(tenant_id));

create policy "discovery_runs: agency can insert"
  on public.discovery_runs for insert
  with check (public.has_agency_membership_in_tenant(tenant_id));

create policy "discovery_runs: agency can update"
  on public.discovery_runs for update
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));


-- ──────────────────────────────────────────────────────────
-- 2. sred_projects
-- ──────────────────────────────────────────────────────────

create table public.sred_projects (
  id             uuid        primary key default gen_random_uuid(),
  run_id         uuid        not null references public.discovery_runs(id) on delete cascade,
  fiscal_year_id uuid        not null references public.fiscal_years(id),
  engagement_id  uuid        not null references public.engagements(id),
  tenant_id      uuid        not null references public.tenants(id),

  project_name   text        not null,

  -- Bloom review outcome
  decision       text        not null default 'pending',
  decision_reason text,
  reviewed_by    uuid        references auth.users(id) on delete set null,
  reviewed_at    timestamptz,

  -- ── T661 Part 2 — AI drafts (immutable after creation) ──────────────────
  --
  -- line_242_ai_draft jsonb schema:
  --   { "narrative": "..." }
  --   — Advancement sought: what new scientific/technological knowledge was the
  --     project trying to achieve?
  --
  -- line_244_ai_draft jsonb schema:
  --   { "monthly_breakdown": [{ "month": "YYYY-MM", "activities": "..." }, ...],
  --     "summary": "..." }
  --   — Monthly work description for each month of the fiscal year.
  --
  -- line_246_ai_draft jsonb schema:
  --   { "uncertainty_statement": "...",
  --     "approach_description": "...",
  --     "standard_practice_gap": "..." }
  --   — Technological uncertainty: what obstacle existed and why standard practice
  --     could not solve it?
  --
  -- section_c_hints_ai_draft jsonb schema:
  --   [ { "section": "...", "hint": "..." }, ... ]
  --   — Supporting evidence hints for Section C of the Technical Report.

  line_242_ai_draft        jsonb,
  line_244_ai_draft        jsonb,
  line_246_ai_draft        jsonb,
  section_c_hints_ai_draft jsonb,

  -- ── Bloom edits (mutable — same schema as AI draft counterparts) ─────────
  -- NULL means "not yet edited" — use the AI draft for display.

  line_242_edited        jsonb,
  line_244_edited        jsonb,
  line_246_edited        jsonb,
  section_c_hints_edited jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sred_projects_decision_check check (decision in (
    'pending', 'accepted', 'rejected', 'deferred'
  ))
);

comment on table public.sred_projects is
  'SR&ED projects identified by Claude during a Project Discovery run. '
  'AI drafts (*_ai_draft) are immutable — never updated after creation. '
  'Bloom edits (*_edited) are written independently; NULL = not yet edited. '
  'Decision tracks Bloom review outcome. No client-visible columns in Phase 3C.';

create trigger sred_projects_updated_at
  before update on public.sred_projects
  for each row execute procedure public.set_updated_at();

create index on public.sred_projects (run_id);
create index on public.sred_projects (fiscal_year_id, decision);
create index on public.sred_projects (tenant_id);

alter table public.sred_projects enable row level security;

create policy "sred_projects: agency can select"
  on public.sred_projects for select
  using (public.has_agency_membership_in_tenant(tenant_id));

create policy "sred_projects: agency can insert"
  on public.sred_projects for insert
  with check (public.has_agency_membership_in_tenant(tenant_id));

create policy "sred_projects: agency can update"
  on public.sred_projects for update
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));


-- ──────────────────────────────────────────────────────────
-- 3. project_document_relationships
-- ──────────────────────────────────────────────────────────

create table public.project_document_relationships (
  id                uuid        primary key default gen_random_uuid(),
  project_id        uuid        not null references public.sred_projects(id) on delete cascade,
  document_id       uuid        not null references public.documents(id) on delete cascade,
  tenant_id         uuid        not null references public.tenants(id),

  -- How this document supports the project
  relationship_type text        not null,
  -- Which T661 line(s) this document supports
  supports_line     text,
  -- Which TR section this document evidences (free text, e.g. "Systematic investigation")
  supports_section  text,
  -- One-sentence explanation of why this document is relevant to this project
  relevance_note    text,

  created_at timestamptz not null default now(),

  constraint project_document_rel_type_check check (relationship_type in (
    'primary_evidence',
    'supporting_evidence',
    'financial_record',
    'personnel_record',
    'prior_art'
  )),
  constraint project_document_rel_line_check check (
    supports_line is null or supports_line in (
      'line_242', 'line_244', 'line_246', 'section_c', 'multiple'
    )
  ),
  unique (project_id, document_id)
);

comment on table public.project_document_relationships is
  'Many-to-many relationship between SR&ED projects and uploaded documents. '
  'Created by the discovery run action based on Claude''s output. '
  'relationship_type describes how the document supports the project. '
  'supports_line identifies which T661 Part 2 line the document evidences.';

create index on public.project_document_relationships (project_id);
create index on public.project_document_relationships (document_id);
create index on public.project_document_relationships (tenant_id);

alter table public.project_document_relationships enable row level security;

create policy "project_document_rel: agency can select"
  on public.project_document_relationships for select
  using (public.has_agency_membership_in_tenant(tenant_id));

create policy "project_document_rel: agency can insert"
  on public.project_document_relationships for insert
  with check (public.has_agency_membership_in_tenant(tenant_id));

-- No UPDATE or DELETE policies — relationships are written once by the discovery
-- action and are immutable. A new discovery run creates new relationships.
