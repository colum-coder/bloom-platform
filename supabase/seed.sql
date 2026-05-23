-- ============================================================
-- Seed data for Phase 0 verification
--
-- Run AFTER the two migrations have been applied.
--
-- Test user accounts are created via Supabase Auth (Dashboard
-- or CLI invite) — see instructions below. This file inserts
-- the tenant rows and membership rows using the UUIDs that
-- will be assigned to those auth users.
--
-- ──────────────────────────────────────────────
-- STEP 1 — Create test users in Supabase Auth
-- ──────────────────────────────────────────────
-- Dashboard: Authentication > Users > Invite user (or set password directly)
--   colum@bloomfunding.ca  — agency owner
--   info@bloomfunding.ca   — client owner
--
-- STEP 2 — Replace the UUIDs below with the real UUIDs from
--          auth.users and run this file in the SQL editor.
-- ============================================================

-- ──────────────────────────────────────────────
-- Confirmed UUIDs (from auth.users, 2026-05-23)
-- ──────────────────────────────────────────────
-- colum@bloomfunding.ca : 73a5d1a2-a011-441c-a52a-e178ec1f5fb4
-- info@bloomfunding.ca  : adbcc147-2df8-4beb-b9c0-7cf3c2eeec69

do $$
declare
  v_agency_user_id   uuid := '73a5d1a2-a011-441c-a52a-e178ec1f5fb4';  -- colum@bloomfunding.ca
  v_client_user_id   uuid := 'adbcc147-2df8-4beb-b9c0-7cf3c2eeec69';  -- info@bloomfunding.ca

  v_bloom_tenant_id  uuid := gen_random_uuid();
  v_client_tenant_id uuid := gen_random_uuid();
begin

  -- ── Tenants ──────────────────────────────────

  insert into public.tenants (id, name, slug, type, status)
  values
    (v_bloom_tenant_id,  'Bloom Funding',   'bloom-funding',  'agency', 'active'),
    (v_client_tenant_id, 'Test Client Co.', 'test-client-co', 'client', 'active');

  -- ── Agency user: owner of the Bloom agency tenant ──

  insert into public.tenant_memberships
    (tenant_id, user_id, role, status, created_by)
  values
    (v_bloom_tenant_id, v_agency_user_id, 'agency_owner', 'active', v_agency_user_id);

  -- ── Agency user: also a member of the client tenant ──
  -- This represents Bloom staff assigned to work on this client.
  -- Role is agency_consultant; upgrade to agency_manager as needed.

  insert into public.tenant_memberships
    (tenant_id, user_id, role, status, created_by)
  values
    (v_client_tenant_id, v_agency_user_id, 'agency_consultant', 'active', v_agency_user_id);

  -- ── Client user: owner of the client tenant ──

  insert into public.tenant_memberships
    (tenant_id, user_id, role, status, created_by)
  values
    (v_client_tenant_id, v_client_user_id, 'client_owner', 'active', v_agency_user_id);

  raise notice 'Seed complete. Bloom tenant id: %, Client tenant id: %',
    v_bloom_tenant_id, v_client_tenant_id;

end;
$$;
