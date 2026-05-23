# Phase 1.1 — Completion Report (2026-05-23)

Professional polish phase. No SR&ED features, no new database objects, no product
functionality. Visual layer only — making the current foundation feel like a
professional Bloom CRM before Phase 2 adds SR&ED complexity.

---

## 1. Commit Hash

| Item | Value |
|---|---|
| **Phase 1.1 commit** | `3a835e8` |
| **Future requirements doc** | `5460e9c` |
| **.gitignore fix** | committed alongside this report |
| **Branch** | `main` |
| **GitHub repo** | `colum-coder/bloom-platform` |

---

## 2. Railway Deployment Status

Pushed to `origin/main`. Railway auto-deploy triggered on push.

Verify at: Railway Dashboard → bloom-platform service → Deployments tab.
Expected status: **Deployed** for commit `3a835e8` or later.

---

## 3. Screens / Routes Updated

| Route | What changed |
|---|---|
| `/agency` (all routes) | Full layout swap: dark full-page → **256px dark sidebar + light content area**. Sidebar is fixed on desktop, hamburger overlay on mobile. |
| `/agency` | Dashboard: stat summary row (Your Clients / Active / Your Role), client grid cards with hover shadow, polished empty state with CTA |
| `/agency/clients` | CRM table: column headers (Client / Slug / Status / Members / Created), hover rows, active member count per tenant, empty state |
| `/agency/clients/new` | Clean form card: consistent input/select/button styles, `bg-gray-50` slug prefix, `border-gray-200` fields, teal focus rings |
| `/agency/clients/[tenantId]` | Account-record layout: header strip with status badge + detail grid, member list split into **Client Users** / **Bloom Staff** sections, avatar initials colour-coded by role type |
| `/workspace` | Refined top nav (white + border-b shadow), teal left-border accent on section placeholder cards, SVG icons per section, "Phase 2" chip badges |

Routes **not touched** (already clean): `/login`, `/unauthorized`, `/auth/callback`, `/auth/reset-password`.

---

## 4. Visual Improvements

### Architecture
- **Agency section**: converted from a full-dark (`bg-[#2B307E]`) single-surface layout
  to a **dark sidebar + light content area** — the standard enterprise CRM pattern.
  The sidebar is 256px wide, fixed, and sticky. The content area sits on `bg-gray-50`
  with white (`bg-white`) cards throughout.
- **Client workspace**: kept as a distinct top-nav layout — visually different from
  agency, which correctly signals a different user context.
- **Mobile**: sidebar collapses to a hamburger button in a dark `#2B307E` top bar;
  tapping it opens a full-height overlay with a backdrop dismiss.

### New shared components (design system primitives)
| Component | Purpose |
|---|---|
| `PageHeader` | Consistent page title, optional subtitle, right-aligned actions slot — used on every content page |
| `StatCard` | Summary metric card with optional left-border accent stripe — used on dashboard |
| `EmptyState` | Icon + title + description + CTA — used on client list and future empty views |

### Sidebar
- Bloom logomark + "Agency Portal" wordmark
- Dashboard and Clients nav links with inline SVG icons
- Active link: `bg-white/15` tint + teal dot indicator on the right
- Inactive link: `text-white/60`, brightens to `text-white` on hover
- Tenant switcher (dropdown opens **upward** — new `dropUp` prop) above user footer
- User avatar initial (first letter of email) + truncated email + sign out pinned at bottom
- Client-context amber banner when the active tenant is a client workspace

### Badge system (fully refined)
| Type | Old style | New style |
|---|---|---|
| Active | Solid teal fill | Emerald dot + `bg-emerald-50 text-emerald-700 border-emerald-200` |
| Inactive | Solid gray fill | Gray dot + `bg-gray-50 text-gray-500 border-gray-200` |
| Invited | Solid orange fill | Amber dot + `bg-amber-50 text-amber-700 border-amber-200` |
| Agency role | Dark blue fill | Blue dot + `bg-blue-50 text-blue-700 border-blue-200` |
| Client role | Teal fill | Teal dot + `bg-teal-50 text-teal-700 border-teal-200` |

### Typography and spacing
- All page titles: `text-xl font-semibold text-gray-900`
- Section headings: `text-sm font-semibold text-gray-900`
- Metadata labels: `text-xs font-semibold text-gray-400 uppercase tracking-wider`
- Cards: `bg-white rounded-xl border border-gray-100 shadow-sm` throughout
- Table rows: `divide-y divide-gray-100`, hover `bg-gray-50 transition-colors`
- Input fields: `border-gray-200`, teal focus ring (`focus:ring-bloom-mint`)
- Action buttons: Bloom orange primary, white/border secondary, consistent `rounded-lg`

### Workspace section cards
- Left `border-l-3` accent stripe in section colour (teal, blue, orange, purple)
- SVG icon per section (Engagements, Documents, Requests, Messages)
- "Phase 2" chip badge — intentional, not unfinished-looking
- Icon colour matches the left-border accent

---

## 5. Known Issues / Limitations

| Item | Severity | Notes |
|---|---|---|
| No collapsible sidebar | Low | Sidebar is always visible on desktop. No user preference to collapse it. Can be added in Phase 2 if requested. |
| Nunito font loaded via `@import` in `globals.css` | Low | Render-blocking Google Fonts request. Converting to `next/font/google` would eliminate the render block. Flagged as a future improvement; does not affect functionality. |
| No icon library | Low | Nav icons are inline SVGs (3 shapes). When the sidebar grows in Phase 2+, adding `lucide-react` (~1 kB tree-shaken per icon) is recommended over accumulating inline SVGs. |
| Tenant switcher on mobile requires scroll | Low | If a user has many tenant memberships, the sidebar footer switcher may require scrolling on small screens. Acceptable at current tenant count. |

No functional bugs known. Build is clean. TypeScript passes with zero errors.

---

## 6. Scope Confirmation

**Nothing in this list was built:**

| Item | Status |
|---|---|
| SR&ED engagements | ❌ Not built |
| Fiscal years | ❌ Not built |
| Projects / work records / hours records | ❌ Not built |
| Documents / file uploads | ❌ Not built |
| Information requests | ❌ Not built |
| Tasks | ❌ Not built |
| Comments | ❌ Not built |
| AI outputs / extracted evidence | ❌ Not built |
| Spreadsheet extraction | ❌ Not built |
| Workflow automation | ❌ Not built |
| Audit / activity log | ❌ Not built |
| New database tables | ❌ Not added |
| New RLS policies | ❌ Not added |
| Schema alterations | ❌ Not made |
| `SUPABASE_SERVICE_ROLE_KEY` usage | ❌ Not added |
| New auth flows | ❌ Not added |
| New npm dependencies | ❌ Not added |

All Phase 0 and Phase 1 auth/RLS behaviour is fully preserved.

---

## 7. Manual Verification Checklist

Test against the live Railway URL. Use both test users unless noted.

### Auth flows (regression — must not have broken)

- [ ] `colum@bloomfunding.ca` — password login → lands on `/agency`
- [ ] `info@bloomfunding.ca` — password login → lands on `/workspace`
- [ ] Magic link (either user) → correct landing page
- [ ] Sign out → redirected to `/login`
- [ ] Unauthenticated GET to `/agency` → `/login?redirectTo=…`
- [ ] `info@bloomfunding.ca` GET to `/agency` → `/unauthorized`

### Agency sidebar

- [ ] Desktop (≥ 1024px): sidebar visible on left, 256px wide, content scrolls independently
- [ ] Mobile (< 1024px): sidebar hidden, dark top bar visible, hamburger button present
- [ ] Hamburger tap → sidebar slides in as overlay with backdrop
- [ ] Backdrop tap → sidebar dismisses
- [ ] "Dashboard" link highlighted when on `/agency` exactly
- [ ] "Dashboard" link **not** highlighted when on `/agency/clients`
- [ ] "Clients" link highlighted when on `/agency/clients` and `/agency/clients/[id]`
- [ ] Teal dot visible on the active nav link
- [ ] Tenant switcher opens **upward** (dropdown appears above the button)
- [ ] Tenant switcher: switching to a client tenant navigates to `/workspace` and shows amber banner on return to `/agency`
- [ ] Amber client-context banner visible when active tenant is a client; shows client name and "Open workspace ↗" link
- [ ] User email truncates cleanly on narrow sidebar
- [ ] Sign out button works from the sidebar footer

### Agency Dashboard `/agency`

- [ ] Stat row shows: Your clients count, Active count, Your role
- [ ] Client tenant cards display: name, slug, status badge, role badge
- [ ] Cards link to `/agency/clients/[tenantId]`
- [ ] Hover state on cards (shadow increases)
- [ ] Empty state shown if no client tenants (unlikely with test data, but confirm layout is correct)
- [ ] "+ New Client" button links to `/agency/clients/new`

### Client List `/agency/clients`

- [ ] Table renders with column headers: Client / Slug / Status / Members / Created
- [ ] Each row links to `/agency/clients/[tenantId]`
- [ ] Status badge (emerald "Active" with dot) shown correctly
- [ ] Active member count shown in Members column
- [ ] Row hover highlights to `bg-gray-50`
- [ ] On screens < 768px: slug, status, members, created columns hidden; name and mobile slug visible

### Create Client `/agency/clients/new`

- [ ] Breadcrumb: "Clients / New Client"
- [ ] Name → slug auto-generation works
- [ ] Slug field has `/` prefix in `bg-gray-50` wrapper
- [ ] Teal focus ring on inputs
- [ ] Submit → creates tenant, redirects to detail page
- [ ] Cancel → returns to `/agency/clients`
- [ ] Duplicate slug → inline error shown correctly

### Client Detail `/agency/clients/[tenantId]`

- [ ] Breadcrumb: "Clients / [Tenant Name]"
- [ ] Header strip: tenant name, status badge, "Switch to Workspace" button (if current user is a member)
- [ ] Detail grid: Type / Slug / Created / Total members
- [ ] Member list: "Client Users" section and "Bloom Staff" section rendered separately
- [ ] Avatar initials: blue-tinted for agency roles, teal-tinted for client roles
- [ ] "(you)" label shown next to the current user's row
- [ ] Role badge and membership status badge shown per row
- [ ] Add member form: email input, role dropdown (Client Roles / Bloom Staff optgroups), status dropdown, Add button
- [ ] Inputs styled with white background, gray border, teal focus ring
- [ ] Add member success: green confirmation message
- [ ] Add member error (unknown email): red error message with instructions
- [ ] Duplicate member error: appropriate error message

### Client Workspace `/workspace`

- [ ] Top nav: Bloom logo, ModeBadge showing client name, user email, Sign Out
- [ ] Agency users: "← Agency" button visible; client-only users: button absent
- [ ] Welcome: tenant name as page title, user display name in subtitle
- [ ] Workspace context card: Organisation / Your Role / Status / Mode
- [ ] Four placeholder cards: Engagements, Documents, Requests, Messages
- [ ] Each card has left colour-accent border and SVG icon
- [ ] "Phase 2" chip badge on each placeholder card
- [ ] Amber staff notice at bottom for agency users
- [ ] `info@bloomfunding.ca`: no "← Agency" button, no amber notice

### RLS regression (spot check)

- [ ] `info@bloomfunding.ca` cannot reach `/agency` (redirected to `/unauthorized`)
- [ ] `info@bloomfunding.ca` in `/workspace` sees only Test Client Co. — no other tenants visible
- [ ] `colum@bloomfunding.ca` tenant switcher shows both tenants; client-only user has no switcher

---

*Phase 1.1 declared complete: 2026-05-23.*  
*Next action: begin Phase 2 only after explicit approval.*
