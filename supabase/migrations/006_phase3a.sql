-- ============================================================
-- Migration 006: Phase 3A — Context Intake and AI Proposal Infrastructure
--
-- Run AFTER 005_restructure_fiscal_years.sql.
-- Does NOT alter existing tables, enums, or RLS policies.
-- Adds:
--   1. context_sources       — source material fed to AI runs
--   2. ai_suggestion_runs    — one row per AI analysis run
--   3. ai_proposals          — AI-proposed projects, people, evidence, etc.
--   4. ai_suggestion_sources — verbatim snippets linking proposals to sources
--   5. RLS policies (split for context_sources; agency-only for AI tables)
--   6. Indexes and updated_at triggers
--
-- All four tables anchor to fiscal_year_id (the specific SR&ED claim year).
-- engagement_id and tenant_id are also stored on each table:
--   - tenant_id     : for RLS (simple lookup, no subqueries)
--   - engagement_id : denormalized convenience for cross-year queries
-- Server actions verify that fiscal_year_id, engagement_id, and tenant_id
-- are mutually consistent before any insert.
--
-- Design decisions:
--   - context_sources uses status='active'|'archived' — NEVER hard-deleted,
--     because ai_suggestion_sources.context_source_id must remain traceable.
--     There is no DELETE RLS policy on context_sources by design.
--   - context_sources has a client_visible column and a client SELECT policy
--     (WHERE client_visible = true), but Phase 3A workspace UI does NOT
--     query this table. All rows default to client_visible = false.
--   - ai_suggestion_runs, ai_proposals, ai_suggestion_sources are
--     agency-only — no client RLS policy exists on these tables.
--   - The projects table is Phase 3B and is not created here.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. context_sources
-- ──────────────────────────────────────────────────────────

create table public.context_sources (
  id             uuid        primary key default gen_random_uuid(),
  fiscal_year_id uuid        not null references public.fiscal_years(id) on delete cascade,
  engagement_id  uuid        not null references public.engagements(id),
  tenant_id      uuid        not null references public.tenants(id),
  source_type    text        not null,
  title          text        not null,
  body           text        not null,
  file_name      text,
  client_visible boolean     not null default false,
  status         text        not null default 'active',
  uploaded_by    uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint context_sources_source_type_check check (source_type in (
    'prior_claim', 'meeting_notes', 'project_discussion', 'staff_note',
    'client_background', 'discovery_call_note', 'email_thread',
    'technical_narrative', 'technical_document_summary', 'financial_summary',
    'payroll_export', 'contractor_invoice', 'cra_review_context', 'other'
  )),
  constraint context_sources_status_check check (status in ('active', 'archived'))
);

comment on table public.context_sources is
  'Source material fed to AI analysis runs, anchored to a specific fiscal year (SR&ED claim year). '
  'fiscal_year_id is the primary anchor; engagement_id and tenant_id are denormalized for convenience. '
  'Rows are NEVER hard-deleted — archiving (status=archived) is the only removal mechanism, '
  'so that ai_suggestion_sources snippets remain traceable to their origin. '
  'No DELETE RLS policy exists by design.';

create trigger context_sources_updated_at
  before update on public.context_sources
  for each row execute procedure public.set_updated_at();

create index on public.context_sources (fiscal_year_id, status);
create index on public.context_sources (engagement_id);
create index on public.context_sources (tenant_id);

alter table public.context_sources enable row level security;

-- Agency SELECT — all rows for tenants where the user has an agency membership
create policy "context_sources: agency can select"
  on public.context_sources for select
  using (public.has_agency_membership_in_tenant(tenant_id));

-- Client SELECT — only client_visible rows (Phase 3A workspace does NOT query this)
create policy "context_sources: clients see published only"
  on public.context_sources for select
  using (public.is_active_member(tenant_id) and client_visible = true);

create policy "context_sources: agency can insert"
  on public.context_sources for insert
  with check (public.has_agency_membership_in_tenant(tenant_id));

-- Agency UPDATE — includes the archive action (status='archived'). No DELETE policy.
create policy "context_sources: agency can update"
  on public.context_sources for update
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));


-- ──────────────────────────────────────────────────────────
-- 2. ai_suggestion_runs
-- ──────────────────────────────────────────────────────────

create table public.ai_suggestion_runs (
  id                      uuid        primary key default gen_random_uuid(),
  fiscal_year_id          uuid        not null references public.fiscal_years(id) on delete cascade,
  engagement_id           uuid        not null references public.engagements(id),
  tenant_id               uuid        not null references public.tenants(id),
  triggered_by            uuid        references auth.users(id) on delete set null,
  context_source_ids      uuid[]      not null,
  model                   text        not null,
  prompt_version          text,
  status                  text        not null default 'pending',
  summary                 text,
  activity_months         text[],
  tr_sections_supported   text[],
  tr_sections_unsupported text[],
  truncation_warning      boolean     not null default false,
  error_message           text,
  prompt_tokens           integer,
  completion_tokens       integer,
  created_at              timestamptz not null default now(),
  completed_at            timestamptz,

  constraint ai_suggestion_runs_status_check check (
    status in ('pending', 'running', 'completed', 'failed')
  )
);

comment on table public.ai_suggestion_runs is
  'One row per AI analysis run, anchored to a specific fiscal year (SR&ED claim year). '
  'fiscal_year_id is the primary anchor; engagement_id and tenant_id are denormalized. '
  'prompt_version records the template name+version used (e.g. "sred_project_discovery_v1"). '
  'truncation_warning=true means the AI response hit max_tokens and partial recovery was used. '
  'Agency-only — no client RLS policy.';

create index on public.ai_suggestion_runs (fiscal_year_id);
create index on public.ai_suggestion_runs (engagement_id);
create index on public.ai_suggestion_runs (tenant_id, status);

alter table public.ai_suggestion_runs enable row level security;

create policy "ai_suggestion_runs: agency only"
  on public.ai_suggestion_runs for all
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));


-- ──────────────────────────────────────────────────────────
-- 3. ai_proposals
-- ──────────────────────────────────────────────────────────

create table public.ai_proposals (
  id               uuid        primary key default gen_random_uuid(),
  run_id           uuid        not null references public.ai_suggestion_runs(id) on delete cascade,
  fiscal_year_id   uuid        not null references public.fiscal_years(id),
  engagement_id    uuid        not null references public.engagements(id),
  tenant_id        uuid        not null references public.tenants(id),
  proposal_type    text        not null,
  title            text        not null,
  description      text,
  proposed_project text,
  proposed_person  text,
  claim_component  text,
  section_or_area  text,
  confidence       text        not null default 'medium',
  reason           text,
  decision         text        not null default 'pending',
  decision_reason  text,
  run_status       text        not null default 'new',
  duplicate_of     uuid        references public.ai_proposals(id) on delete set null,
  reviewed_by      uuid        references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),

  constraint ai_proposals_type_check check (proposal_type in (
    'project', 'person', 'evidence', 'hours',
    'contractor', 'material', 'government_support', 'gap'
  )),
  constraint ai_proposals_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint ai_proposals_decision_check check (decision in ('pending', 'accepted', 'rejected', 'deferred')),
  constraint ai_proposals_run_status_check check (
    run_status in ('new', 'resurfacing', 'possible_duplicate', 'confirmed', 'superseded')
  )
);

comment on table public.ai_proposals is
  'AI-generated proposals (projects, people, evidence, costs, gaps), anchored to a fiscal year. '
  'Never overwritten on re-run — run_status classifies each new proposal relative to existing ones. '
  'decision_reason captures optional staff feedback when rejecting or deferring (Guidance Layer). '
  'The original AI fields (title, description, confidence, reason) are read-only after creation. '
  'Clients never see this table. Agency-only.';

create index on public.ai_proposals (fiscal_year_id, decision);
create index on public.ai_proposals (engagement_id);
create index on public.ai_proposals (run_id);
create index on public.ai_proposals (tenant_id);

alter table public.ai_proposals enable row level security;

create policy "ai_proposals: agency only"
  on public.ai_proposals for all
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));


-- ──────────────────────────────────────────────────────────
-- 4. ai_suggestion_sources
-- ──────────────────────────────────────────────────────────

create table public.ai_suggestion_sources (
  id                uuid        primary key default gen_random_uuid(),
  proposal_id       uuid        not null references public.ai_proposals(id) on delete cascade,
  context_source_id uuid        references public.context_sources(id) on delete set null,
  tenant_id         uuid        not null references public.tenants(id),
  snippet           text        not null,
  relevance_note    text,
  created_at        timestamptz not null default now()
);

comment on table public.ai_suggestion_sources is
  'Verbatim excerpts (~200 chars) linking a proposal to the context source passage that supports it. '
  'context_source_id is SET NULL on context source deletion so archiving a source does not '
  'cascade-delete the evidence trail. The snippet text is always preserved. Agency-only.';

create index on public.ai_suggestion_sources (proposal_id);
create index on public.ai_suggestion_sources (context_source_id);
create index on public.ai_suggestion_sources (tenant_id);

alter table public.ai_suggestion_sources enable row level security;

create policy "ai_suggestion_sources: agency only"
  on public.ai_suggestion_sources for all
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));
