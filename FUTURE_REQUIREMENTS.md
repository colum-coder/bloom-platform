# Future Requirements — Deferred Backlog

This file captures product requirements that have been explicitly scoped out of the
current phase. Each entry records what was requested, why it was deferred, what it
depends on, and the constraint on when it may be revisited.

Do not build items in this file without explicit approval and a named phase assignment.

---

## FR-001 — Active Clients / Recently Active Workspaces (Agency Dashboard)

**Requested:** Phase 1.1 (2026-05-23)  
**Status:** Deferred — not built  
**Target location:** `/agency` — Agency Dashboard, below or replacing the current static client grid

---

### Description

For each logged-in Bloom staff member, the Agency Dashboard should show the client
workspaces where the user has an active membership **and** where meaningful activity
has occurred within the last 30 days.

The intent is to give consultants an at-a-glance view of what needs their attention
across all of their clients — replacing the current static grid of all assigned tenants
with a prioritised, activity-driven feed.

---

### Display requirements (per client card / row)

| Field | Notes |
|---|---|
| Client name | Link to `/agency/clients/[tenantId]` |
| Engagement name | If applicable; blank if no active engagement |
| Last activity date | Most recent event timestamp across all activity types below |
| Type of most recent activity | Human-readable label (e.g. "Document uploaded", "Request overdue") |
| Outstanding actions for the logged-in user | Count or list of items assigned to or awaiting action from this user |
| Items awaiting Bloom review | Unreviewed documents, AI outputs, extracted evidence, etc. |
| Overdue client requests | Count of requests past their due date with no response |
| Quick link | Direct link to the client workspace (`/workspace` with tenant context) |

---

### Qualifying activity types (what counts as "meaningful activity")

Any event on a record belonging to the client tenant within the last 30 days:

| Object | Events |
|---|---|
| Engagement | Created, updated, status changed |
| Fiscal year | Created, updated |
| Document | Uploaded, new version, reviewed |
| Request | Created, completed, marked overdue |
| Comment | Added (on any object) |
| Project | Created, updated |
| Work record | Created, updated |
| Hours record | Created, updated |
| AI output | Created, reviewed |
| Extracted evidence | Created, reviewed |
| Spreadsheet extraction | Created, approved |
| Risk flag | Added, resolved |

---

### Hard dependencies — must exist before this can be built

1. **Activity / audit log table** — a central `activity_log` (or equivalent) table that
   records events with `tenant_id`, `actor_id`, `object_type`, `object_id`, `event_type`,
   and `occurred_at`. Without this, computing "last activity" requires expensive
   `MAX(updated_at)` scans across every object table on every dashboard load.

2. **At least one loggable object** — the activity log only has value once engagements,
   documents, or requests exist. This feature has no content until Phase 2 objects land.

3. **RLS on the activity log** — agency staff must only see activity for tenants where
   they hold an active membership. The RLS design should mirror
   `has_agency_membership_in_tenant()` already in `003_phase1.sql`.

---

### Build constraint

> **Do not build in Phase 2** unless:
> 1. An activity log table is being introduced in that same phase **for another reason**, AND
> 2. The implementation can be completed without broadening Phase 2 scope.
>
> If Phase 2 introduces engagements only (no activity log), defer this to the phase
> that introduces the activity log. The current static client grid on the dashboard is
> a fully acceptable placeholder until then.

---

### Notes on query design (for when this is built)

- Query the `activity_log` grouped by `tenant_id`, filtered to `occurred_at > now() - interval '30 days'` and `tenant_id IN (user's active client memberships)`.
- Sort by `MAX(occurred_at) DESC` so the most recently active client surfaces first.
- Outstanding actions and overdue items will require joins to the relevant object tables — design those queries alongside the object schemas, not before.
- Consider a Postgres view or SECURITY DEFINER function (`get_dashboard_activity_summary`) rather than composing the query in application code, to keep RLS enforcement in one place.

---

*Added: 2026-05-23*  
*Phase assignment: TBD — pending activity log introduction*

---

<!-- Future requirements go below this line, in FR-NNN order -->
