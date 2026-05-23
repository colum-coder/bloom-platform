-- ============================================================
-- Migration 004: Phase 2 — Scalable Engagement Framework
--
-- Run AFTER 001_schema.sql, 002_rls.sql, 003_phase1.sql.
-- Does NOT alter existing tables, enums, or RLS policies.
-- Adds:
--   1. New enums: fiscal_year_status, engagement_status
--   2. Reference tables: service_lines, engagement_types
--   3. Data tables: fiscal_years, engagements
--   4. RLS policies for all new tables
--   5. updated_at triggers (reuses set_updated_at() from 001)
--   6. Seed data: SR&ED service line + four engagement types
--
-- Design decisions:
--   - fiscal_year_id is NULLABLE on engagements at the DB level.
--     The UI enforces it for SR&ED Claim types. Other service
--     lines may not require a fiscal year.
--   - Draft engagement visibility is filtered at the application
--     layer (workspace applies .neq('status','draft')). RLS
--     allows all active members to SELECT all engagements,
--     including drafts. This is a known Phase 2 limitation.
--   - service_lines and engagement_types are catalog tables
--     managed via migrations. No app INSERT/UPDATE in Phase 2.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. New enums
-- ──────────────────────────────────────────────────────────

create type public.fiscal_year_status as enum (
  'active',
  'closed',
  'archived'
);

create type public.engagement_status as enum (
  'draft',
  'active',
  'in_review',
  'submitted',
  'closed',
  'archived'
);

-- ──────────────────────────────────────────────────────────
-- 2. service_lines
--    Catalog of service verticals (e.g. SR&ED, Innovation Consulting).
--    Managed via migrations; no app write access in Phase 2.
--    The platform must not hardcode any single service line —
--    this table is the runtime source of truth.
-- ──────────────────────────────────────────────────────────

create table public.service_lines (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.service_lines is
  'Reference catalog of service verticals. Managed via migrations. '
  'Use the slug field (not UUIDs or names) to distinguish service lines '
  'in application code. SR&ED is the initial active line; others are '
  'seeded inactive for future activation.';

alter table public.service_lines enable row level security;

-- Any authenticated user can read the service-line catalog
create policy "service_lines: authenticated read"
  on public.service_lines
  for select
  using (auth.uid() is not null);

-- ──────────────────────────────────────────────────────────
-- 3. engagement_types
--    Named engagement formats within a service line.
--    Managed via migrations; no app write access in Phase 2.
-- ──────────────────────────────────────────────────────────

create table public.engagement_types (
  id              uuid primary key default gen_random_uuid(),
  service_line_id uuid not null references public.service_lines (id),
  name            text not null,
  slug            text not null unique,
  description     text,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

comment on table public.engagement_types is
  'Named engagement formats within a service line '
  '(e.g. "Full SR&ED Claim" under "SR&ED Tax Credit"). '
  'Managed via migrations. Use the slug field in application code.';

alter table public.engagement_types enable row level security;

create policy "engagement_types: authenticated read"
  on public.engagement_types
  for select
  using (auth.uid() is not null);

-- ──────────────────────────────────────────────────────────
-- 4. fiscal_years
--    Fiscal year windows for client tenants.
--    Created and managed by Bloom agency staff.
--    Referenced (optionally) by engagements.
-- ──────────────────────────────────────────────────────────

create table public.fiscal_years (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  label       text not null,
  start_date  date not null,
  end_date    date not null,
  status      public.fiscal_year_status not null default 'active',
  notes       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint fiscal_years_dates_check check (end_date > start_date)
);

comment on table public.fiscal_years is
  'Fiscal year windows for a client tenant. SR&ED engagements are '
  'typically anchored to a fiscal year; the fiscal_year_id column on '
  'engagements is nullable at the DB level. The UI enforces a fiscal '
  'year for SR&ED Claim engagement types.';

create trigger fiscal_years_updated_at
  before update on public.fiscal_years
  for each row execute procedure public.set_updated_at();

create index on public.fiscal_years (tenant_id, status);

alter table public.fiscal_years enable row level security;

-- Any active tenant member can read their tenant's fiscal years
create policy "fiscal_years: active members can read"
  on public.fiscal_years
  for select
  using (public.is_active_member(tenant_id));

-- Only Bloom agency staff assigned to the tenant can create fiscal years
create policy "fiscal_years: agency staff can insert"
  on public.fiscal_years
  for insert
  with check (public.has_agency_membership_in_tenant(tenant_id));

-- Only Bloom agency staff assigned to the tenant can update fiscal years
create policy "fiscal_years: agency staff can update"
  on public.fiscal_years
  for update
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));

-- ──────────────────────────────────────────────────────────
-- 5. engagements
--    An active client engagement within a service line.
--
--    Draft visibility: RLS allows all active members to SELECT
--    all rows (including drafts). The workspace page applies
--    .neq('status','draft') at the application layer to hide
--    drafts from client users. This is a known Phase 2
--    limitation; a proper draft gate can be added later.
-- ──────────────────────────────────────────────────────────

create table public.engagements (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  fiscal_year_id      uuid references public.fiscal_years (id) on delete set null,
  engagement_type_id  uuid not null references public.engagement_types (id),
  title               text not null,
  status              public.engagement_status not null default 'draft',
  notes               text,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.engagements is
  'A client engagement instance. Belongs to a tenant, references an '
  'engagement type (and therefore a service line), and optionally a '
  'fiscal year. fiscal_year_id is nullable; the UI enforces it for '
  'SR&ED Claim types. Draft rows are visible to all active members '
  'at the DB level — the workspace hides them at the app layer.';

create trigger engagements_updated_at
  before update on public.engagements
  for each row execute procedure public.set_updated_at();

create index on public.engagements (tenant_id, status);
create index on public.engagements (fiscal_year_id);

alter table public.engagements enable row level security;

-- Any active tenant member can read engagements (incl. drafts — filtered at app layer)
create policy "engagements: active members can read"
  on public.engagements
  for select
  using (public.is_active_member(tenant_id));

-- Only Bloom agency staff assigned to the tenant can create engagements
create policy "engagements: agency staff can insert"
  on public.engagements
  for insert
  with check (public.has_agency_membership_in_tenant(tenant_id));

-- Only Bloom agency staff assigned to the tenant can update engagements
create policy "engagements: agency staff can update"
  on public.engagements
  for update
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));

-- ──────────────────────────────────────────────────────────
-- 6. Seed data
--    SR&ED Tax Credit is the initial active service line.
--    Innovation Consulting is seeded inactive as a placeholder
--    for future activation via a subsequent migration.
--
--    Do not hardcode SR&ED assumptions into application code —
--    use the slug field ('sred') to identify the service line.
-- ──────────────────────────────────────────────────────────

insert into public.service_lines (name, slug, description, is_active, sort_order)
values
  (
    'SR&ED Tax Credit',
    'sred',
    'Scientific Research & Experimental Development tax incentive program administered by the CRA.',
    true,
    1
  ),
  (
    'Innovation Consulting',
    'innovation-consulting',
    'Strategic consulting for R&D-driven organisations. Not yet active.',
    false,
    2
  );

-- SR&ED engagement types
with sred_sl as (
  select id from public.service_lines where slug = 'sred'
)
insert into public.engagement_types (service_line_id, name, slug, description, is_active, sort_order)
select
  sred_sl.id,
  et.name,
  et.slug,
  et.description,
  et.is_active,
  et.sort_order
from sred_sl,
(values
  (
    'Full SR&ED Claim',
    'sred-full-claim',
    'End-to-end preparation and filing of an SR&ED claim for a fiscal year.',
    true,
    1
  ),
  (
    'Pre-Claim Review',
    'sred-pre-claim-review',
    'Review of qualifying R&D activities prior to fiscal year end.',
    true,
    2
  ),
  (
    'SR&ED Readiness Assessment',
    'sred-readiness-assessment',
    'Assessment of an organisation''s R&D processes and SR&ED claim readiness.',
    true,
    3
  ),
  (
    'CRA Audit Support',
    'sred-cra-audit-support',
    'Support during a CRA review or audit of a previously filed SR&ED claim.',
    true,
    4
  )
) as et(name, slug, description, is_active, sort_order);
