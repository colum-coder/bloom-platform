# Phase 0 — Deployment Guide

## Supabase setup

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note the **Project URL** and **anon key** from Settings > API.
3. Note the **service_role key** (keep server-side only).

### 2. Run migrations
In the Supabase Dashboard > SQL editor, run in order:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`

### 3. Configure Auth
In Authentication > URL Configuration:
- **Site URL**: your Railway app URL (e.g. `https://bloom-platform.up.railway.app`)
- **Redirect URLs**: add `https://bloom-platform.up.railway.app/auth/callback`

For local dev also add: `http://localhost:3000/auth/callback`

### 4. Create test users
In Authentication > Users, invite:
- `agency@bloomfunding.ca` — note the UUID assigned
- `client@testclient.ca` — note the UUID assigned

Then set passwords via the Supabase dashboard (Users > ⋯ > Send password reset).

### 5. Run the seed
1. Open `supabase/seed.sql`
2. Replace `AGENCY_USER_UUID` and `CLIENT_USER_UUID` with the real UUIDs
3. Run in Supabase SQL editor

---

## Railway deployment

### Environment variables required

Set these in Railway > your service > Variables:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Settings > API > anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API > service_role key — **keep private** |
| `NEXT_PUBLIC_APP_URL` | Your Railway service URL (available after first deploy) |

Railway auto-detects Next.js and sets `PORT` automatically; no additional config needed.

### Deploy steps
1. Push this repo to GitHub.
2. In Railway: New Project > Deploy from GitHub repo.
3. Select the `bloom-platform` repo/directory.
4. Add the four environment variables above.
5. Railway will build and deploy automatically on every push to `main`.

---

## Phase 0 manual verification steps

Run these checks after deploying (or locally with `npm run dev`).

### A — Agency user flow
1. Navigate to the app root. Confirm redirect to `/login`.
2. Sign in as `agency@bloomfunding.ca`.
3. Confirm redirect to `/agency` (not `/workspace`).
4. Confirm the top nav shows **Bloom Funding** as the active tenant.
5. Confirm the tenant switcher dropdown lists **Test Client Co.** as a second option.

### B — Tenant switch
6. Click the tenant switcher and select **Test Client Co.**
7. Confirm the active tenant label in the nav updates to **Test Client Co.**
8. Confirm the orange "Viewing client workspace" banner appears.
9. Switch back to **Bloom Funding**; confirm the banner disappears.

### C — Client user flow
10. Sign out. Sign in as `client@testclient.ca`.
11. Confirm redirect to `/workspace` (not `/agency`).
12. Confirm the nav shows **Test Client Co.** as the active tenant.
13. Confirm no tenant switcher dropdown is present (only one tenant).

### D — Route isolation
14. While signed in as `client@testclient.ca`, navigate directly to `/agency`.
15. Confirm redirect to `/unauthorized`.

### E — RLS data isolation (Supabase SQL editor)
Run as each user's authenticated session (or simulate with Supabase's RLS
tester using their JWT):

**As agency user:**
```sql
select id, name, type from tenants;
-- Expected: 2 rows (Bloom Funding + Test Client Co.)

select tenant_id, role from tenant_memberships;
-- Expected: 2 rows (Bloom agency membership + client-tenant membership)
```

**As client user:**
```sql
select id, name, type from tenants;
-- Expected: 1 row (Test Client Co. only — Bloom Funding NOT visible)

select tenant_id, role from tenant_memberships;
-- Expected: 1 row (own membership on Test Client Co. only)
```

---

## Local development

```bash
cd bloom-platform
npm install
# fill in .env.local with your Supabase values
npm run dev
# open http://localhost:3000
```
