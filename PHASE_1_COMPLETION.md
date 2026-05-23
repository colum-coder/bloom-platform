# Phase 1 — Completion Report (2026-05-23)

This document is the authoritative record of what was built, tested, and verified for
Phase 1 (Agency Client Management). Read alongside `PHASE_0_BASELINE.md`.

---

## 1. Phase 1 Scope Summary

**Goal:** Bloom staff can create and manage client tenants, add members, and switch
between agency and client workspace contexts. No SR&ED or Phase 2 functionality was
introduced.

### Features delivered

| Feature | Route(s) | Notes |
|---|---|---|
| Shared agency layout (nav, tenant switcher, mode banner) | all `/agency/*` | Server Component layout wrapping all agency pages |
| Agency dashboard with client tenant grid | `/agency` | Shows agency context card + assigned client tenants |
| Client tenant list | `/agency/clients` | Table with slug, status, type, member count, created date |
| Create client tenant | `/agency/clients/new` | Auto-generates slug from name; calls `create_client_tenant()` RPC |
| Client tenant detail + member list | `/agency/clients/[tenantId]` | Two-query profile merge (no direct FK); avatar initials; "Switch to Workspace" link |
| Add / assign member form | `/agency/clients/[tenantId]` | Grouped optgroup (Client Roles / Bloom Staff); magic-link note for missing accounts |
| Improved workspace shell | `/workspace` | Four placeholder sections; ← Agency link for agency users; amber staff notice |
| `ModeBadge` component | all | Orange pill (Agency Mode) / teal pill (Client Workspace) |
| `TenantStatusBadge`, `MembershipStatusBadge`, `RoleBadge` | multiple | Consistent status colouring across all views |
| Grouped `TenantSwitcher` | layout | Separates "Agency" from "Client Tenants" with a divider |

### Supabase migration (003_phase1.sql)

| Object | Type | Purpose |
|---|---|---|
| `has_agency_membership_in_tenant(uuid)` | SECURITY DEFINER function | Checks if caller holds any active agency role in a given tenant |
| `memberships: agency staff can view all in their client tenants` | RLS policy | Allows agency staff to read all membership rows for tenants they are assigned to |
| `create_client_tenant(name, slug, status)` | SECURITY DEFINER function | Atomic: creates tenant + `agency_manager` membership for caller; checks `is_agency_admin()` |
| `get_user_id_by_email(email)` | SECURITY DEFINER function | Resolves auth user UUID from email without service role key; restricted to `is_agency_admin()` |

---

## 2. Commits

| Hash | Description |
|---|---|
| `69f0f4d` | Phase 1: agency client management + workspace improvements |
| `a95c460` | Trigger Railway redeploy (migration applied) |
| `4a35837` | Fix member list on client tenant detail page (two-query profile merge) |
| `9ad965e` | **fix: remove onClick from Server Component Link — production crash fix** |

---

## 3. Production Error — Post-Deployment

### Error

| Field | Value |
|---|---|
| **Digest** | `3664276054` |
| **Next.js message** | Application error: a server-side exception has occurred |
| **Affected route** | `/agency/clients/[tenantId]` |
| **Trigger condition** | Viewing a client tenant detail page when the current user has an active membership in that tenant (i.e., `myMembershipHere` is truthy) |

### Root Cause

`src/app/agency/clients/[tenantId]/page.tsx` is a **Server Component**, but it passed
`onClick={async () => {}}` as a prop to `<Link>` (a Client Component). In Next.js App
Router, functions cannot be serialized across the Server → Client boundary. Next.js
throws an unhandled runtime exception at the point of render whenever the `<Link>` with
the `onClick` is included in the output tree.

The `onClick` body was entirely empty — a comment noted that the link navigates normally
and middleware handles the tenant context. The handler had no effect and should never
have been added.

The error was not caught at build time; Next.js does not fail the build for this pattern.
It only throws at render time, which is why the Railway deployment succeeded but the
page crashed on load.

### Fix Applied

**Commit `9ad965e`** — `fix: remove onClick from Server Component Link causing production crash`

Four files changed:

| File | Change |
|---|---|
| `src/app/agency/clients/[tenantId]/page.tsx` | Removed `onClick={async () => {}}` from the `<Link href="/workspace">` — the link works correctly without it |
| `src/app/agency/clients/page.tsx` | Removed dead first query (executed `!inner` join, result was never consumed; now a single clean query) |
| `src/app/agency/layout.tsx` | Replaced `!` non-null assertion with `?? activeMemberships[0]` fallback + optional chaining on `?.tenant?.type` |
| `src/app/agency/page.tsx` | Same non-null assertion fix as layout |

### Verification

Production error **confirmed fixed** on Railway after `9ad965e` deployed.

---

## 4. Routes Manually Re-tested After Fix Deployment

Tested against the live Railway URL as `colum@bloomfunding.ca` (agency_owner) unless noted.

| Route | Action | Expected | Result |
|---|---|---|---|
| `/agency` | Page load | Agency dashboard renders with client tenant grid | ✅ Pass |
| `/agency/clients` | Page load | Client tenant list renders with member counts | ✅ Pass |
| `/agency/clients/new` | Fill form + submit | Creates tenant, redirects to detail page | ✅ Pass |
| `/agency/clients/[tenantId]` | Page load (user IS a member) | Page renders without error; "Switch to Workspace" visible | ✅ Pass |
| `/agency/clients/[tenantId]` | Add member form | Adds existing user; success message shown | ✅ Pass |
| `/workspace` | Page load | Workspace shell renders with placeholder sections and ← Agency link | ✅ Pass |
| `/workspace` | As `info@bloomfunding.ca` (client_owner) | Workspace renders; no ← Agency button visible | ✅ Pass |
| Tenant switcher | Switch from agency → client context | Mode banner updates; ModeBadge updates | ✅ Pass |

---

## 5. Phase 2 Scope Confirmation

Phase 1 remains strictly within the agreed scope. The following were **not** built:

| Item | Status |
|---|---|
| SR&ED engagements, fiscal years, projects | ❌ Not built |
| Document uploads / Supabase Storage | ❌ Not built |
| Information requests, tasks, comments | ❌ Not built |
| AI analysis / extracted evidence | ❌ Not built |
| Spreadsheet extraction / workflow automation | ❌ Not built |
| Email notifications beyond Supabase Auth flows | ❌ Not built |
| Audit logs | ❌ Not built |
| `SUPABASE_SERVICE_ROLE_KEY` usage at runtime | ❌ Not added |
| Client self-registration | ❌ Not built |

### Known Phase 1 limitations (carry forward to Phase 2)

| Limitation | Detail |
|---|---|
| `create_client_tenant` assigns the creating user as `agency_manager` | This is the intended Phase 1 default. Phase 2 can allow the creator to choose the role or assign a different user. |
| Adding a member requires an existing Supabase Auth account | If the target user has no account, the form shows a clear error with instructions to use the magic link flow. Phase 2 can use the service role key for true invite-and-create. |
| No member edit / remove UI | Members can be added but not edited or removed from the UI. Agency admins can update `status` directly in Supabase for now. |
| Tenant switcher writes to `user_metadata` on the client | This is a best-effort UX shortcut, not a security boundary. RLS and middleware role checks enforce real isolation. |

---

## 6. Stable Baseline for Phase 2

| Item | Value |
|---|---|
| **Final Phase 1 commit** | `9ad965e` |
| **Branch** | `main` |
| **Deployed** | 2026-05-23 via Railway auto-deploy |
| **Supabase migrations applied** | `001_schema.sql`, `002_rls.sql`, `003_phase1.sql` |
| **No schema changes permitted** | `tenants`, `tenant_memberships`, `profiles` tables and all RLS helper functions from `002_rls.sql` are stable; Phase 2 adds new tables, never alters existing ones without explicit review |

---

*Phase 1 declared complete and verified: 2026-05-23.*
*Next action: begin Phase 2 only after explicit approval.*
