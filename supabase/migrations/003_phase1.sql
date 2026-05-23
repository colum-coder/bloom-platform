-- ============================================================
-- Migration 003: Phase 1 — agency management functions
--
-- Run AFTER 001_schema.sql and 002_rls.sql.
-- Does NOT alter existing tables, enums, or RLS policies.
-- Adds:
--   1. has_agency_membership_in_tenant() helper
--   2. RLS policy so agency staff can view all members of
--      client tenants where they hold any active agency role
--   3. create_client_tenant() — atomic tenant + membership creation
--   4. get_user_id_by_email() — agency-admin-only email lookup
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. Helper: does the calling user hold any active agency
--    role in the given tenant?
--    Used by the new membership SELECT policy below.
-- ──────────────────────────────────────────────────────────

create or replace function public.has_agency_membership_in_tenant(
  target_tenant_id uuid
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
      and role in (
        'agency_owner',
        'agency_admin',
        'agency_manager',
        'agency_consultant',
        'agency_reviewer'
      )
  );
$$;

comment on function public.has_agency_membership_in_tenant(uuid) is
  'Returns true when the current user holds any active agency role in the
   given tenant. Used to let agency staff see all members of client tenants
   they are assigned to.';

-- ──────────────────────────────────────────────────────────
-- 2. RLS: agency staff can view all membership rows for
--    tenants where they hold an active agency role.
--    Complements the existing "memberships: tenant admins
--    can view all in tenant" policy (which covers
--    agency_owner/admin and client_owner/admin only).
-- ──────────────────────────────────────────────────────────

create policy "memberships: agency staff can view all in their client tenants"
  on public.tenant_memberships
  for select
  using (public.has_agency_membership_in_tenant(tenant_id));

-- ──────────────────────────────────────────────────────────
-- 3. Atomic client-tenant creation
--    Creates the tenant row and the calling user's membership
--    in a single transaction.  Only callable by is_agency_admin()
--    (agency_owner or agency_admin).
--
--    Error codes raised (caught by server action):
--      'permission_denied' — caller is not an agency admin
--      'slug_taken'        — a tenant with this slug exists
-- ──────────────────────────────────────────────────────────

create or replace function public.create_client_tenant(
  p_name   text,
  p_slug   text,
  p_status public.tenant_status default 'active'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  -- Only agency_owner / agency_admin may create client tenants
  if not public.is_agency_admin() then
    raise exception 'permission_denied';
  end if;

  -- Enforce unique slug
  if exists (select 1 from public.tenants where slug = p_slug) then
    raise exception 'slug_taken';
  end if;

  -- Create the tenant
  insert into public.tenants (name, slug, type, status)
  values (p_name, trim(p_slug), 'client', p_status)
  returning id into v_tenant_id;

  -- Give the creating user an agency_manager membership in
  -- the new client tenant so they can immediately manage it.
  insert into public.tenant_memberships
    (tenant_id, user_id, role, status, created_by)
  values
    (v_tenant_id, auth.uid(), 'agency_manager', 'active', auth.uid());

  return v_tenant_id;
end;
$$;

comment on function public.create_client_tenant(text, text, public.tenant_status) is
  'Atomically creates a client tenant and an agency_manager membership for
   the calling user. Restricted to agency_owner and agency_admin roles.';

-- ──────────────────────────────────────────────────────────
-- 4. Email → user_id lookup (agency admins only)
--    Lets server actions resolve a Supabase auth user by
--    email without the service role key.
--    Returns NULL when no account exists for that email.
--
--    Phase 1 limitation: creating brand-new auth users
--    (invite emails) requires the service role key and is
--    deferred to Phase 2.  If NULL is returned, the calling
--    code should prompt the client to sign in once via magic
--    link at the app login page to create their account.
-- ──────────────────────────────────────────────────────────

create or replace function public.get_user_id_by_email(
  p_email text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  -- Restrict to agency_owner / agency_admin
  if not public.is_agency_admin() then
    raise exception 'permission_denied';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  return v_user_id; -- NULL when not found
end;
$$;

comment on function public.get_user_id_by_email(text) is
  'Resolves a Supabase auth user UUID from an email address.
   Restricted to agency admins. Returns NULL when no account exists.
   Requires no service role key because it runs SECURITY DEFINER.';
