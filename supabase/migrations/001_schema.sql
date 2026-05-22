-- ============================================================
-- Migration 001: Core schema for Phase 0
-- ============================================================

-- ──────────────────────────────────────────────
-- Enums
-- ──────────────────────────────────────────────

create type public.tenant_type as enum (
  'agency',
  'client'
);

create type public.tenant_status as enum (
  'active',
  'inactive',
  'archived'
);

create type public.membership_status as enum (
  'active',
  'invited',
  'suspended',
  'removed'
);

create type public.user_role as enum (
  -- Agency roles
  'agency_owner',
  'agency_admin',
  'agency_manager',
  'agency_consultant',
  'agency_reviewer',
  -- Client roles
  'client_owner',
  'client_admin',
  'client_contributor',
  'client_finance',
  'client_reviewer'
);

-- ──────────────────────────────────────────────
-- profiles
-- One row per auth.users entry.
-- ──────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Public-facing user metadata mirroring auth.users.';

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at on profiles
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ──────────────────────────────────────────────
-- tenants
-- ──────────────────────────────────────────────

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  type        public.tenant_type not null,
  status      public.tenant_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tenants is
  'Top-level tenant registry. One agency tenant (Bloom) plus one row per client organisation.';

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute procedure public.set_updated_at();

-- ──────────────────────────────────────────────
-- tenant_memberships
-- A user belongs to one or more tenants with a role.
-- Agency users gain client-tenant access via a membership
-- row on that client tenant (no separate staff table in Phase 0).
-- ──────────────────────────────────────────────

create table public.tenant_memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.user_role not null,
  status      public.membership_status not null default 'invited',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (tenant_id, user_id)
);

comment on table public.tenant_memberships is
  'Associates users with tenants. Only rows with status=''active'' confer data access.';

create trigger tenant_memberships_updated_at
  before update on public.tenant_memberships
  for each row execute procedure public.set_updated_at();

-- Indexes for common lookup patterns
create index on public.tenant_memberships (user_id, status);
create index on public.tenant_memberships (tenant_id, status);
