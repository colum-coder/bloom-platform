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
-- Option A (Dashboard):
--   Authentication > Users > Invite user
--   agency@bloomfunding.ca  — note the UUID assigned
--   client@testclient.ca    — note the UUID assigned
--
-- Option B (Supabase CLI):
--   supabase functions invoke admin-invite-user \
--     --body '{"email":"agency@bloomfunding.ca"}'
--
-- STEP 2 — Replace the placeholder UUIDs below with the real
--          UUIDs from the users created in Step 1, then run
--          this file in the SQL editor.
-- ============================================================

-- ──────────────────────────────────────────────
-- Placeholder UUIDs — REPLACE before running
-- ──────────────────────────────────────────────
-- AGENCY_USER_UUID   : the auth.users.id for agency@bloomfunding.ca
-- CLIENT_USER_UUID   : the auth.users.id for client@testclient.ca

do $$
declare
  v_agency_user_id   uuid := 'f8e92271-ddd7-499b-a6ce-45193a4e175c';
  v_client_user_id   uuid := 'f7538f45-75cd-4f15-a0da-9c1350942790';

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
