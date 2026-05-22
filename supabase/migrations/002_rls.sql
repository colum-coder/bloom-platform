-- ============================================================
-- Migration 002: Row Level Security
-- ============================================================

-- ──────────────────────────────────────────────
-- Helper functions
-- All are SECURITY DEFINER so they can query the memberships
-- table without recursing through RLS.
-- ──────────────────────────────────────────────

-- Returns true when the current user has an active membership
-- for the given tenant.
create or replace function public.is_active_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships
    where tenant_id = target_tenant_id
      and user_id   = auth.uid()
      and status    = 'active'
  );
$$;

-- Returns true when the current user has an active membership
-- for the given tenant AND their role is in the provided list.
create or replace function public.has_tenant_role(
  target_tenant_id uuid,
  allowed_roles    public.user_role[]
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships
    where tenant_id = target_tenant_id
      and user_id   = auth.uid()
      and status    = 'active'
      and role      = any(allowed_roles)
  );
$$;

-- Returns true when the current user holds an agency owner or
-- agency admin role in ANY active tenant of type 'agency'.
create or replace function public.is_agency_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = auth.uid()
      and tm.status  = 'active'
      and t.type     = 'agency'
      and tm.role    in ('agency_owner', 'agency_admin')
  );
$$;

-- Returns true when the current user has an admin-level role
-- in the given tenant (agency admin/owner for agency tenants,
-- client_owner/client_admin for client tenants).
create or replace function public.has_tenant_admin_role(target_tenant_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships
    where tenant_id = target_tenant_id
      and user_id   = auth.uid()
      and status    = 'active'
      and role      in (
            'agency_owner', 'agency_admin',
            'client_owner', 'client_admin'
          )
  );
$$;

-- ──────────────────────────────────────────────
-- Enable RLS on all tables
-- ──────────────────────────────────────────────

alter table public.profiles            enable row level security;
alter table public.tenants             enable row level security;
alter table public.tenant_memberships  enable row level security;

-- ──────────────────────────────────────────────
-- profiles policies
--
-- A user can see their own profile plus the profiles of
-- anyone who shares at least one active tenant with them.
-- ──────────────────────────────────────────────

create policy "profiles: own row"
  on public.profiles
  for select
  using (id = auth.uid());

create policy "profiles: shared tenant members"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.tenant_memberships tm_other
      join public.tenant_memberships tm_self
        on  tm_self.tenant_id = tm_other.tenant_id
        and tm_self.user_id   = auth.uid()
        and tm_self.status    = 'active'
      where tm_other.user_id = profiles.id
        and tm_other.status  = 'active'
    )
  );

create policy "profiles: update own row"
  on public.profiles
  for update
  using (id = auth.uid());

-- ──────────────────────────────────────────────
-- tenants policies
--
-- A user can see any tenant for which they hold an active
-- membership. Agency admins can also see inactive/archived
-- tenants they are a member of (needed for management views).
-- ──────────────────────────────────────────────

create policy "tenants: visible to active members"
  on public.tenants
  for select
  using (public.is_active_member(id));

-- Agency admins can insert new client tenants
create policy "tenants: agency admins can insert"
  on public.tenants
  for insert
  with check (public.is_agency_admin());

-- Agency admins can update any tenant they are a member of
create policy "tenants: agency admins can update"
  on public.tenants
  for update
  using  (public.is_agency_admin() and public.is_active_member(id))
  with check (public.is_agency_admin());

-- ──────────────────────────────────────────────
-- tenant_memberships policies
--
-- Users can read their own memberships.
-- Tenant admins can read all memberships for their tenants.
-- Agency admins can also write memberships.
-- ──────────────────────────────────────────────

create policy "memberships: own rows"
  on public.tenant_memberships
  for select
  using (user_id = auth.uid());

create policy "memberships: tenant admins can view all in tenant"
  on public.tenant_memberships
  for select
  using (public.has_tenant_admin_role(tenant_id));

create policy "memberships: agency admins can insert"
  on public.tenant_memberships
  for insert
  with check (public.is_agency_admin());

create policy "memberships: tenant admins can update"
  on public.tenant_memberships
  for update
  using  (public.has_tenant_admin_role(tenant_id))
  with check (public.has_tenant_admin_role(tenant_id));

-- Only agency admins can hard-delete memberships; others use
-- status='removed' via the update policy above.
create policy "memberships: agency admins can delete"
  on public.tenant_memberships
  for delete
  using (public.is_agency_admin());
