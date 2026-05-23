# Phase 0 — Verified Baseline (2026-05-23)

This document is the authoritative record of what was built, tested, and confirmed
before Phase 1 work begins. Do not alter the foundational schema, RLS policies, or
auth flow without reviewing this document first.

---

## 1. Live URL

| Item | Value |
|---|---|
| **Railway service** | `https://<bloom-platform>.up.railway.app` — confirm exact slug in Railway dashboard |
| **Supabase project** | Confirm in Supabase Dashboard → Settings → General |
| **Supabase Auth site URL** | Set to Railway URL above |
| **Supabase redirect allow-list** | `<railway-url>/auth/callback` |

> **Note:** The exact Railway URL is not committed to the repo for security reasons.
> It is stored in `NEXT_PUBLIC_APP_URL` in Railway's service Variables panel.

---

## 2. Current Commit

| Item | Value |
|---|---|
| **Commit** | `dc685ea` (`dc685eacb767680fa7ffe0c2713d698513577d61`) |
| **Branch** | `main` |
| **Deployed** | 2026-05-23 via Railway auto-deploy on push |
| **GitHub repo** | `colum-coder/bloom-platform` |

### Phase 0 + 0.5 commit log

| Hash | Description |
|---|---|
| `dc685ea` | Fix sign-out button text invisible on light workspace background |
| `49607be` | Fix login redirect: return URL from action, hard-redirect on client |
| `28fe272` | Fix middleware: remove tenant JOIN to resolve /unauthorized for client users |
| `de39f14` | Update seed.sql comments with confirmed user emails and UUIDs |
| `a6c25b1` | Remove orphaned empty button in workspace header |
| `c1a0cea` | Remove /api/debug-auth before any client access |
| `18e0fb0` | Fix auth email redirects pointing to localhost |
| `2cd8a5d` | Fix magic link + add forgot-password flow |
| `3e0fad0` | Fix TypeScript build: escape Supabase v2 generic collapse on union columns |
| `c3ccc48` | Fix login redirect loop: smart root page + middleware cookie propagation |

---

## 3. Confirmed Test Users

| Email | UUID | Role | Tenant | Tenant Type |
|---|---|---|---|---|
| `colum@bloomfunding.ca` | `73a5d1a2-a011-441c-a52a-e178ec1f5fb4` | `agency_owner` | Bloom Funding | `agency` |
| `colum@bloomfunding.ca` | same | `agency_consultant` | Test Client Co. | `client` |
| `info@bloomfunding.ca` | `adbcc147-2df8-4beb-b9c0-7cf3c2eeec69` | `client_owner` | Test Client Co. | `client` |

Both users have passwords set and have been confirmed in Supabase Auth.

### Auth flows tested (against Railway, not localhost)

| Flow | User | Result |
|---|---|---|
| Password login → `/agency` | `colum@bloomfunding.ca` | ✅ Pass |
| Password login → `/workspace` | `info@bloomfunding.ca` | ✅ Pass |
| Magic link → correct landing page | `info@bloomfunding.ca` | ✅ Pass |
| Forgot / set password email flow | `info@bloomfunding.ca` | ✅ Pass |
| Sign out → `/login` | both | ✅ Pass |

---

## 4. Confirmed Tenant Isolation

### Route-level isolation (middleware + page guards)

| Test | User | Expected | Result |
|---|---|---|---|
| GET `/agency` | `info@bloomfunding.ca` (client_owner) | `/unauthorized` | ✅ Pass |
| GET `/workspace` | `colum@bloomfunding.ca` (agency_owner) | allowed (has active membership) | ✅ Pass |
| GET `/agency` | `colum@bloomfunding.ca` (agency_owner) | allowed | ✅ Pass |
| GET any protected route | unauthenticated | `/login?redirectTo=…` | ✅ Pass |

### RLS data isolation (confirmed via SQL in Supabase SQL editor)

**As `colum@bloomfunding.ca`:**
- `SELECT * FROM tenants` → 2 rows (Bloom Funding + Test Client Co.) ✅
- `SELECT * FROM tenant_memberships` → 2 rows (own memberships only) ✅

**As `info@bloomfunding.ca`:**
- `SELECT * FROM tenants` → 1 row (Test Client Co. only; Bloom Funding not visible) ✅
- `SELECT * FROM tenant_memberships` → 1 row (own membership only) ✅

### Tenant switcher isolation
- `colum@bloomfunding.ca` sees both tenants in the switcher ✅
- `info@bloomfunding.ca` sees no switcher (single tenant) ✅
- Switching to a tenant requires an active membership row; no bypass via URL or metadata ✅

### Service role key
- `SUPABASE_SERVICE_ROLE_KEY` is defined only in Railway Variables and `.env.local`
- It is **not** referenced in any client-side code, public bundle, or committed file ✅
- Phase 0 requires only the anon key at runtime ✅

---

## 5. Known Limitations

### Email rate limit (Supabase free tier)
- Supabase free tier caps outbound auth emails at ~3–4 per hour per project.
- Hit during Phase 0.5 verification testing.
- **Workaround used:** Set `info@bloomfunding.ca`'s password directly via SQL:
  ```sql
  UPDATE auth.users
  SET encrypted_password = crypt('<password>', gen_salt('bf'))
  WHERE email = 'info@bloomfunding.ca';
  ```
- **Recommended fix before client onboarding:** Configure custom SMTP in
  Supabase Dashboard → Project Settings → Authentication → SMTP Settings.
  Resend (resend.com) works well and has a generous free tier.

### No multi-device / session management UI
- Users cannot see or revoke active sessions from the app.
- Supabase handles session expiry automatically; no Phase 0 exposure.

### Tenant switcher persists in `user_metadata`
- The active tenant choice is stored in `auth.users.user_metadata.active_tenant_id`.
- This is best-effort UX state, not a security boundary. Security is enforced by
  RLS and the middleware role check, not by the metadata value.

### Single test client tenant
- Only one client tenant (`Test Client Co.`) exists. Multi-client agency workflows
  are architecturally supported but untested until a second client is onboarded.

### No SMTP confirmation for new invites
- New users currently receive Supabase's default invite emails.
- Branded transactional email requires custom SMTP (see above).

---

## 6. Recommendation for Narrow Phase 1 Scope

Phase 0 has proven multi-tenant auth and RLS isolation. Phase 1 should introduce
exactly one vertical slice of SR&ED-specific functionality — enough to validate the
engagement model — before adding breadth.

### Recommended Phase 1 scope (narrow slice)

**Goal:** A Bloom staff member can create an SR&ED engagement for a client tenant,
and the client can see it in their workspace.

| Item | Detail |
|---|---|
| `engagements` table | `id`, `tenant_id`, `name`, `fiscal_year_end`, `status` (`draft`/`active`/`closed`), `created_by`, timestamps |
| RLS on `engagements` | Agency members see all engagements for tenants they belong to; client members see only their own tenant's engagements |
| Agency UI | Simple "Engagements" list on `/agency` with a create form (name + fiscal year end + client tenant selector) |
| Client UI | "Your engagements" list on `/workspace` — read-only, shows name + status |
| No file uploads yet | Document requests are Phase 2 |
| No tasks yet | Task assignments are Phase 2 |
| No AI yet | SR&ED analysis is Phase 3+ |

### What must not change in Phase 1

| Item | Reason |
|---|---|
| `tenants`, `tenant_memberships` schema | All RLS policies and the entire auth layer depend on these exact column names and enum values |
| `002_rls.sql` helper functions | `is_active_member()`, `has_tenant_role()` etc. are referenced by every policy; rename = breakage |
| Middleware auth logic | The Edge Runtime cookie flow is delicate; the current implementation is the result of multiple diagnosed race conditions |
| `SUPABASE_SERVICE_ROLE_KEY` usage | Must remain server-only and not required at runtime; Phase 1 features must be achievable with the anon key + RLS |
| `auth/callback` route | The PKCE exchange is precise; any change risks breaking magic link and password reset flows |

### Do not build in Phase 1

- Document uploads / file storage
- Task assignments
- SR&ED eligibility analysis or AI
- Spreadsheet extraction
- Workflow automation
- Client self-registration (all users are invited by Bloom for now)

---

*Phase 0 declared complete and verified: 2026-05-23.*
*Next action: begin Phase 1 only after explicit approval.*
