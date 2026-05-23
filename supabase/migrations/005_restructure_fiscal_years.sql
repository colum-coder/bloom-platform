-- ============================================================
-- Migration 005: Restructure — Fiscal Years Belong to Engagements
--
-- Run AFTER 004_phase2.sql.
-- Run BEFORE 006_phase3a.sql.
--
-- The original Phase 2 model had fiscal_years belonging to tenants
-- (fiscal_years.tenant_id) with engagements optionally referencing
-- one fiscal year (engagements.fiscal_year_id). This was incorrect
-- for the Bloom SR&ED workflow, where:
--
--   Engagement = the client contract (may span multiple fiscal years)
--   FiscalYear  = a specific SR&ED claim year within that engagement
--
-- This migration:
--   1. Adds engagement_id to fiscal_years (fiscal year now belongs to engagement)
--   2. Removes fiscal_year_id from engagements (relationship reversal)
--   3. Adds optional contract fields to engagements for future use
--   4. Updates indexes and table comments
--
-- DESIGN NOTE — fiscal_years as a "work period" concept:
--   fiscal_years is the SR&ED-specific implementation of a broader
--   "work period" concept. Future service lines may introduce equivalent
--   period types (grant period, campaign phase, reporting period) rather
--   than extending this table. Document this intent; do not over-generalise now.
--
-- SAFE TO RUN when fiscal_years and engagements are empty or test-only.
-- If existing fiscal_year rows exist without engagement_id they will
-- remain with engagement_id = NULL. Populate them before enforcing
-- NOT NULL at the application layer.
-- ============================================================

-- ── 1. Add engagement_id to fiscal_years ─────────────────────────────────
-- Nullable at DB level to handle migration safety.
-- Application enforces: every fiscal year must belong to an engagement.

alter table public.fiscal_years
  add column engagement_id uuid references public.engagements(id) on delete cascade;

comment on column public.fiscal_years.engagement_id is
  'The engagement (contract) this SR&ED claim year belongs to. '
  'Nullable at the DB level for migration safety; enforced NOT NULL by '
  'the application. All Phase 3A claim-building work (context sources, '
  'AI runs, proposals) anchors to the fiscal year, not the engagement directly.';

-- Index for efficient lookup of fiscal years by engagement
create index on public.fiscal_years (engagement_id);


-- ── 2. Remove fiscal_year_id from engagements ─────────────────────────────
-- The relationship now goes the other direction:
-- engagements have many fiscal_years; fiscal_years belong to one engagement.

alter table public.engagements
  drop column if exists fiscal_year_id;


-- ── 3. Add contract fields to engagements ─────────────────────────────────
-- All nullable — populated as the contract is formalised.
-- Near-term follow-up: populate these fields in the engagement create/edit UI.

alter table public.engagements
  add column if not exists contract_start_date   date,
  add column if not exists contract_end_date     date,
  add column if not exists contract_term_months  integer,
  add column if not exists agreement_status      text
    check (agreement_status in ('draft', 'active', 'expired', 'terminated', 'pending_renewal'));

comment on column public.engagements.contract_start_date  is 'Start date of the signed contract. Nullable — not always known at engagement creation.';
comment on column public.engagements.contract_end_date    is 'End date of the signed contract. Nullable.';
comment on column public.engagements.contract_term_months is 'Contract term in months (e.g. 36 for a 3-year deal). Nullable.';
comment on column public.engagements.agreement_status     is
  'Status of the commercial agreement: draft, active, expired, terminated, pending_renewal. '
  'Distinct from engagement.status which tracks claim-work progress.';


-- ── 4. Update table comments ───────────────────────────────────────────────

comment on table public.fiscal_years is
  'SR&ED claim years belonging to an engagement (contract). '
  'This table is the SR&ED-specific implementation of a broader "work period" concept — '
  'future service lines may introduce equivalent period types (grant period, '
  'campaign phase, reporting period) rather than extending this table. '
  'Context sources, AI runs, and proposals all anchor to a fiscal year. '
  'Rows are never hard-deleted; use status=''archived'' instead. '
  'tenant_id is retained for RLS simplicity.';

comment on table public.engagements is
  'A client engagement or service contract. Bloom typically signs 3-year SR&ED '
  'engagements but terms vary. One engagement covers multiple fiscal/claim years. '
  'Claim-building work happens at the fiscal year level (see fiscal_years), not here. '
  'contract_start_date, contract_end_date, contract_term_months, and agreement_status '
  'capture the commercial relationship and should be populated as contracts are formalised.';
