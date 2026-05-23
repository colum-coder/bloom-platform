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

---

## FR-002 — Agreement and Signature Workflow

**Requested:** Phase 2 (2026-05-23)  
**Status:** Deferred — not built  
**Target location:** New `agreements` table + agency UI under `/agency/clients/[tenantId]/engagements/[engagementId]` + client UI under `/workspace`

---

### Description

The platform should support the full lifecycle of client agreements: engagement letters,
service agreements, statements of work, NDAs, change orders, renewals, authorization
forms, and final deliverable approvals.

Bloom staff create and send agreements from the agency side. Clients review and sign
from the workspace. The system must be fully auditable and integration-ready for
established e-signature providers. Do not build legal e-signature infrastructure
from scratch — prefer integrating with an existing provider.

---

### Agreement record — links

Each agreement record should reference:

| Field | Notes |
|---|---|
| `tenant_id` | The client organisation |
| `engagement_id` | The engagement this agreement belongs to (nullable — some agreements may be tenant-level) |
| `service_line_id` | Denormalised from engagement for filtering and audit |
| `engagement_type_id` | Denormalised from engagement for filtering and audit |
| `client_signer_id` | The auth user who will sign on the client side |
| `bloom_signer_id` | The Bloom staff member who countersigns (if applicable) |
| `document_version_id` | FK to the specific document version being signed |
| `agreement_type` | Enum or reference value (see types below) |

---

### Agreement types (example values — use a reference table, not an enum)

- Engagement Letter
- Service Agreement
- Statement of Work
- NDA
- Change Order
- Renewal
- Authorization Form
- Final Deliverable Approval

Use a reference table (`agreement_types`) rather than a Postgres enum — the list
will grow and vary by service line.

---

### Agreement statuses

Use a Postgres enum `agreement_status`:

```
draft
sent_for_review
sent_for_signature
signed
declined
expired
superseded
archived
```

---

### Versioning

Each agreement should support multiple document versions with distinct roles:

| Version type | Notes |
|---|---|
| Draft version | Internal working copy; not yet sent to client |
| Sent version | The version delivered to the client for review or signature |
| Signed version | The executed copy returned by the signer |
| Superseded versions | Prior versions retained for audit; status = `superseded` |

Versions should be stored as a child table (`agreement_versions`) with a FK back
to the parent `agreements` record. Each version has its own file reference,
document hash, and status.

---

### Auditability — required fields

| Field | Notes |
|---|---|
| `created_by` | User who created the agreement record |
| `sent_by` | User who sent it for review / signature |
| `sent_at` | Timestamp of send action |
| `signed_by` | User who completed the signature action |
| `signed_at` | Timestamp of signature |
| `document_hash` | SHA-256 or equivalent hash of the signed file for tamper evidence |
| `signed_file_path` | Storage location of the executed signed copy |
| `provider_reference_id` | External ID from the e-signature provider (DocuSign envelope ID, etc.) |
| `ip_address` | IP of the signer at signing time, if available from the provider |
| `declined_reason` | Free text captured when a signer declines |
| `expired_at` | Timestamp at which an unsigned agreement expires |

---

### E-signature integration readiness

Design the schema so that any of the following providers can be wired in later
without a schema migration:

| Provider | Notes |
|---|---|
| DocuSign | Market leader; envelope-based model |
| Dropbox Sign (formerly HelloSign) | API-first; lighter integration |
| Adobe Sign | Common in enterprise contexts |
| Other / future | `provider` column should be a free text or enum field |

The `provider_reference_id` column on `agreement_versions` stores the external
identifier (e.g., DocuSign envelope ID). The `provider` column identifies which
service created it. Webhook handling for status updates (signed, declined, expired)
should be designed as a single route handler that branches on `provider`.

---

### Manual MVP option (build-first path, no provider integration)

If an e-signature provider is not ready when agreements are needed, a manual MVP
is acceptable as a first pass:

1. Upload an agreement PDF (via the existing document/file infrastructure, not yet built)
2. Mark the agreement as `requires_signature`
3. Assign a client signer
4. Notify the signer (email, manual or via future notification system)
5. Signer uploads the signed copy manually or Bloom uploads it on their behalf
6. Bloom manually updates the status to `signed`
7. Signed copy is linked to the engagement record

The schema should be designed for the full e-signature integration from the start,
so the manual MVP is just a thin UI layer over the same data model. Do not create
a separate "simple" schema that would require a migration later.

---

### Hard dependencies — must exist before this can be built

1. **File / document storage** — agreements require uploading, storing, and retrieving
   PDF files. A document/file storage layer (S3-compatible or Supabase Storage) must
   exist before this feature can be built.

2. **Engagements (Phase 2)** — agreements are linked to engagement records. ✓ Done.

3. **Notification system** — sending agreements for review or signature requires
   notifying the recipient. At minimum, a transactional email trigger is needed.

4. **RLS design** — the signer (a client user) must be able to read the agreement
   record and the associated document version, but must not be able to modify the
   agreement status directly. Status transitions must go through server actions or
   SECURITY DEFINER functions to prevent tampering.

---

### Build constraint

> **Do not build in Phase 3** unless the document/file storage layer is also being
> introduced in that phase. The agreement schema is tightly coupled to file storage.
>
> The manual MVP is acceptable as a Phase 3 addition if file storage lands in Phase 3.
> The full e-signature provider integration should be a named sub-phase of its own.
>
> When built, implement the provider integration first for DocuSign or Dropbox Sign
> — do not build legal signing logic from scratch.

---

### Notes on schema design (for when this is built)

- `agreements` is the parent record (one per agreement instance).
- `agreement_versions` is the child table (many versions per agreement).
- The current active version is denoted by a `is_current` boolean or a `current_version_id`
  FK on the parent — choose one pattern and document it clearly.
- Soft-delete only — never hard-delete agreement or version records. Use `status = 'archived'`.
- The signed file should be stored in immutable storage (no overwrite) with the
  document hash recorded at upload time.
- Consider a Postgres function `advance_agreement_status(agreement_id, new_status)`
  that validates the transition (e.g., cannot go from `signed` back to `draft`) and
  records the audit fields atomically.

---

*Added: 2026-05-23*  
*Phase assignment: TBD — pending document/file storage introduction*
