# Guided Workflow UX Plan — SR&ED Claim Journey

**Document type:** UX and workflow planning only. No code. No schema changes.  
**Purpose:** Define how a Bloom consultant experiences the SR&ED claim process end-to-end,
so that Phase 3+ builds feel like a guided workflow rather than a database admin tool.  
**Date:** 2026-05-23

---

## Guiding Principles

Before describing each step, these principles should govern every screen in the workflow:

1. **One primary action per screen.** Each page should have a clear, single next step.
   Secondary actions exist but should not compete visually with the primary one.

2. **The system should know where you are.** If a claim has projects but no work records,
   the UI should surface that gap — not wait for the user to notice.

3. **Progressive disclosure.** Show only what is needed at the current stage. Advanced
   fields (e.g. SR&ED percentages, ITC calculations, technical narrative) appear only
   when the user is ready for them. Never show an empty form with 20 fields.

4. **Status drives available actions.** A draft engagement shows "Add projects."
   A submitted engagement shows "View submission." The UI adapts to where the claim is.

5. **Client-facing vs. Bloom-internal is a hard boundary.** Some fields (qualification
   reasoning, ITC calculations, internal notes) must never appear in the client workspace.
   This is not a permission system — it is a design decision. If it is internal, it does
   not exist in the client UI at all.

6. **Bloom staff initiate; clients confirm and contribute.** The consultant drives the
   workflow. The client receives requests, reviews summaries, uploads documents, and
   responds — but never navigates the workflow itself.

7. **Suggested next actions always visible.** Every engagement, project, and request
   page should show a contextual "Next step" banner or callout so the consultant never
   has to think "what do I do now?"

---

## The Claim Journey — Overview

```
[Engagement created]
        ↓
[Fiscal year confirmed]
        ↓
[Candidate projects added]
        ↓
[Each project qualified]
        ↓
[Monthly work records captured]
        ↓
[Employee hours quantified]
        ↓
[Documents / context sources attached]
        ↓
[Client information requests sent & resolved]
        ↓
[Claim readiness reviewed]
        ↓
[Engagement marked Submitted]
```

Each step below defines what the user sees and experiences at that stage.

---

## Step 1 — Starting a Claim

### What the user sees

The Bloom consultant is on the client detail page (`/agency/clients/[tenantId]`).
They click **+ New** in the Engagements section.

The "Create Engagement" form currently asks for title, type, fiscal year, status, and notes.
This is functional but generic. It should feel more like a guided start.

**Improvement:** When the engagement type is in the SR&ED service line, the form should
shift into a "Start SR&ED Claim" mode — the heading, helper text, and field order
should reflect that this is beginning a formal SR&ED process, not just creating a
database record.

### Primary action

**"Start SR&ED Claim"** — a single teal button that creates the engagement and lands
the user on the claim workspace.

### What should be pre-filled or suggested

- **Fiscal year:** If only one non-archived fiscal year exists for this client, pre-select
  it automatically. If multiple exist, default to the most recently created one but allow
  changing it.
- **Title:** Suggest a default: `[Client Name] — SR&ED Claim [Fiscal Year Label]`
  (e.g. "Acme Corp — SR&ED Claim September 2025"). Editable.
- **Status:** Always start as `draft`. The consultant should not need to think about this.
- **Engagement type:** If the user clicked a contextual "Start SR&ED Claim" button
  (rather than the generic "+ New"), pre-select "Full SR&ED Claim" automatically.

### What should be hidden unless needed

- Notes field — collapsed behind an "Add notes" toggle. Most claims do not need notes
  at creation time.
- Status field — not shown at all. Draft is the only valid starting state.

### What the system creates behind the scenes

- An `engagements` row with `status = 'draft'`, linked to the selected fiscal year
  and engagement type.
- A claim progress state (not a new table — derived from the completeness of linked
  objects: projects, work records, hours, documents, requests).

### What the next best action should be

After the engagement is created, land on the **Claim Workspace** (the engagement
detail page, redesigned — see Step 9 for its full form). The page should immediately
show a **Claim Setup Checklist** with the first incomplete item highlighted:

```
✓ Fiscal year confirmed       — September 2025 (Oct 1, 2024 – Sep 30, 2025)
→ Add candidate projects      ← HIGHLIGHTED: primary CTA
  Capture work records
  Quantify employee hours
  Attach documents
  Send client requests
  Review readiness
```

### Optional vs. required

| Field | Required |
|---|---|
| Engagement type | Required |
| Fiscal year | Required (SR&ED) |
| Title | Required (suggest default) |
| Notes | Optional |
| Status | Not shown (always draft) |

### Client-facing vs. Bloom-internal

The engagement itself becomes client-visible when status moves to `active` or later.
At `draft`, nothing is visible to the client.

---

## Step 2 — Adding or Confirming Fiscal Year Information

### What the user sees

The claim workspace shows the linked fiscal year in a summary card:

```
Fiscal Year
September 2025
Oct 1, 2024 – Sep 30, 2025 · Active
```

For most claims this is enough. No action needed — the fiscal year was already
confirmed when the engagement was created.

**When action is needed:** If the fiscal year dates are wrong, or if a client's fiscal
year is non-standard (e.g. 53-week year), the consultant may need to edit it.

### Primary action

"Edit fiscal year" — a small, low-prominence link next to the fiscal year card.
Not a prominent button, because in most cases nothing needs to change.

### What should be pre-filled or suggested

- All fields from the existing fiscal year record.
- If the fiscal year end is within 90 days of today, show a subtle reminder:
  "This fiscal year ends soon. Ensure all work records are captured before [date]."

### What should be hidden unless needed

- The fiscal year edit form itself — only shown when "Edit" is clicked.
- Notes — collapsed by default.

### What the system does

No new objects created. The fiscal year record is updated if edited.

### Optional vs. required

Confirmation is implicit — if a fiscal year is linked, it is considered confirmed.
Editing is optional.

### Client-facing vs. Bloom-internal

The fiscal year period is client-visible (it scopes the claim). The notes and
status fields are Bloom-internal.

---

## Step 3 — Adding Candidate Projects

### What the user sees

The Claim Workspace shows an empty "Projects" section with a clear prompt:

```
No projects yet.
SR&ED claims are built around the R&D projects your client worked on during
this fiscal year. Add each candidate project, then qualify each one.

[+ Add Project]
```

After one or more projects are added, the section shows a project list with
their qualification status:

```
Projects (3)
────────────────────────────────────────────────
Project Name              Type              Status
────────────────────────────────────────────────
AI Model Training v2      Development       Qualified ✓
Custom Sensor Protocol    Applied Research  Needs review
New Manufacturing Process Development       Not started
```

Each row is clickable → goes to the project qualification screen (Step 4).

### Primary action

**"+ Add Project"** — opens an inline form or slide-over with:
- Project name (required)
- Brief description of the work (1–3 sentences) (required)
- Project type: Development / Applied Research / Basic Research (required)
- Estimated SR&ED start and end dates within the fiscal year (optional, defaults to full FY)

### What should be pre-filled or suggested

- SR&ED dates: default to the full fiscal year period. Consultant adjusts if the project
  started mid-year.
- Project type: Default to "Development" (most common). One click to change.

### What should be hidden unless needed

- Technical narrative — not at creation time. Added during qualification (Step 4).
- ITC eligible amount — not shown until hours and financials are entered.
- Internal qualification notes — Bloom-internal, never in the client view.

### What the system creates behind the scenes

- A `projects` row linked to `engagement_id` and `fiscal_year_id`.
- Default `qualification_status = 'not_started'`.

### What the next best action should be

After adding a project, the project list reappears with the new row. The row's
qualification status is "Not started" with a "Qualify →" action link.
The Claim Checklist updates to show "1 project added, 0 qualified."

### Optional vs. required

| Field | Required |
|---|---|
| Project name | Required |
| Brief description | Required |
| Project type | Required |
| SR&ED date range | Optional (defaults to full FY) |
| Technical narrative | Optional at this stage |

### Client-facing vs. Bloom-internal

Project names and brief descriptions are client-visible (for review/confirmation).
Qualification fields, technical narrative, and internal notes are Bloom-internal.

---

## Step 4 — Qualifying Each Project

### What the user sees

The project detail page. This is the most substantive screen in the workflow.

At the top: project name, type, fiscal year, SR&ED date range.

Below: a structured **Three-Part Qualification Panel**:

```
SR&ED Qualification
─────────────────────────────────────────────────────────────
Part 1 — Technological Uncertainty                    ○ Pass  ○ Fail
Was there a technological uncertainty the client was trying to resolve?

[Text area: Describe the uncertainty...]

Part 2 — Technological Advancement
Was the work aimed at achieving a technological advancement?

[Text area: Describe the intended advancement...]

Part 3 — Systematic Investigation
Was the work conducted through a systematic process of experimentation?

[Text area: Describe the process...]

─────────────────────────────────────────────────────────────
Qualification status:  [Not started]  →  [Qualified]  [Does not qualify]
```

### Primary action

Work through all three parts and set the qualification status to **Qualified** or
**Does not qualify**.

### What should be pre-filled or suggested

- Nothing at first open — the consultant fills this from their interview notes.
- Future enhancement: if an information request response was submitted by the client
  describing the project, surface it here as a reference panel on the right.

### What should be hidden unless needed

- "Does not qualify" path details — if a project doesn't qualify, a simple note
  field appears. No need to show the full technical narrative workflow for a
  non-qualifying project.
- ITC eligibility percentage — hidden until the project is qualified and hours exist.
- Advanced CRA guidance references — collapsed behind a "CRA guidance" toggle for
  consultants who need it.

### What the system creates behind the scenes

- Updates `projects.qualification_status`.
- Saves three qualification text fields (uncertainty, advancement, systematic investigation)
  as `projects` columns or a linked `project_qualifications` record.
- If status set to "Qualified" → the project becomes eligible for work records and hours.

### What the next best action should be

If qualified:
```
✓ Project qualified.
Next: Add work records for this project → [Add Work Records]
```

If does not qualify:
```
This project has been marked as not qualifying for SR&ED.
It will be excluded from the claim. You can re-open it at any time.
[Return to claim]
```

### Optional vs. required

| Field | Required to qualify |
|---|---|
| Part 1 (Uncertainty) text | Required |
| Part 2 (Advancement) text | Required |
| Part 3 (Systematic Investigation) text | Required |
| Qualification status | Required |
| ITC percentage estimate | Optional (added later) |
| Supporting notes | Optional |

### Client-facing vs. Bloom-internal

The qualification decision (qualified / not qualified) is eventually client-visible
as a summary. The full qualification text (uncertainty, advancement, systematic
investigation) is **Bloom-internal** — it is the consultant's working draft, not
a client-facing document. A finalised technical narrative may be shared later
as part of the deliverable, but that is a separate object.

---

## Step 5 — Capturing Monthly Work Performed

### What the user sees

On the project detail page (post-qualification), a "Work Records" section appears.
The system pre-generates a row for each calendar month within the fiscal year period:

```
Work Records — AI Model Training v2
─────────────────────────────────────────────────────────────
Month            Work description               Hours logged
─────────────────────────────────────────────────────────────
Oct 2024         [Empty — click to add]         —
Nov 2024         [Empty — click to add]         —
Dec 2024         Training loop redesign...      42 hrs  ✓
Jan 2025         [Empty — click to add]         —
...
```

Months within the fiscal year are pre-listed. The consultant clicks a month row
to expand it and add the work description and hours.

### Primary action

Click any month row → inline expand → type a description of the SR&ED work
performed that month → save. Hours are added in Step 6 but the row stays editable.

### What should be pre-filled or suggested

- The month list is auto-generated from the fiscal year's start and end dates.
  The consultant does not need to manually create month rows.
- If a project's SR&ED date range is shorter than the full FY, only the in-scope
  months are shown (greyed out months with "Outside SR&ED period" label).

### What should be hidden unless needed

- SR&ED percentage split — not shown until hours are entered (Step 6).
- ITC dollar amounts — not shown until wages and percentages are in.
- Months with no work — collapsed by default with a "Show empty months" toggle.
  The consultant only sees months that need attention.

### What the system creates behind the scenes

- `work_records` rows: one per project per month, linked to `project_id`,
  `fiscal_year_id`, and `engagement_id`.
- Work records exist as soon as a month is expanded and saved — even with
  just a description and no hours yet.

### What the next best action should be

After saving a work description:
- The row collapses and shows a summary + an "Add hours →" link.
- A progress indicator shows: "3 of 12 months have work records."

### Optional vs. required

| Field | Required |
|---|---|
| Month | Auto-generated, not entered manually |
| Work description | Required per month (if the month is in SR&ED scope) |
| Hours | Entered in Step 6 — not required to save a work record |

### Client-facing vs. Bloom-internal

Work descriptions are eventually shared with the client for review and confirmation
(a key part of SR&ED documentation). Mark them as **client-reviewable** once the
consultant has polished them. In draft state, they are Bloom-internal.

---

## Step 6 — Quantifying Employee Hours

### What the user sees

Inside each work record (a specific month for a specific project), an "Employees"
sub-section:

```
December 2024 — AI Model Training v2
Work: Training loop redesign and hyperparameter optimisation.

Employees
────────────────────────────────────────────────────────
Name / Role              SR&ED Hours    % of total time
────────────────────────────────────────────────────────
Sarah Chen / ML Engineer    36 hrs         80%
James Park / Dev Lead        6 hrs         20%
                          ──────
Total SR&ED hours:          42 hrs

[+ Add Employee]
```

### Primary action

**"+ Add Employee"** → inline form:
- Employee name (text, or select from previously added employees)
- Role / title
- SR&ED hours for this month on this project
- Percentage of their total time that was SR&ED (used to calculate eligible salary)

### What should be pre-filled or suggested

- **Employee name:** After the first entry, the system builds a local employee list
  for this client. Subsequent months suggest the same employees. The consultant
  selects from the list or adds a new person.
- **Role:** Carried over from the employee's previous entries.
- **SR&ED %:** Not pre-filled — must be entered by the consultant based on the
  client's time records.

### What should be hidden unless needed

- Wage / salary information — toggle-revealed per employee, optional in Phase 3,
  required for full ITC calculation in a later phase.
- T4 / payroll details — hidden until a financial data entry phase is active.
- Total ITC calculation — shown only in the readiness review (Step 9), not
  per-row during data entry.

### What the system creates behind the scenes

- `hour_records` rows: one per employee per work record, linked to `work_record_id`.
- An `employees` reference list scoped to the client tenant, built implicitly as
  hours are entered. (Not a separate UI — just deduplicated from entered names.)

### What the next best action should be

After hours are entered for all employees in a work record:
```
✓ Hours logged for December 2024.
Next month without hours: January 2025 → [Go to January]
```

The system can navigate the consultant directly to the next month that still needs
attention, rather than returning to the project overview each time.

### Optional vs. required

| Field | Required |
|---|---|
| Employee name | Required |
| Role | Required |
| SR&ED hours | Required |
| % of total time | Required (needed for eligible salary calc) |
| Wage / salary | Optional in Phase 3; required for ITC in a later phase |

### Client-facing vs. Bloom-internal

Individual employee names and hours are **Bloom-internal**. The client sees only
aggregate totals (total SR&ED hours per project per month) — never individual
employee records. Wages are strictly Bloom-internal under all circumstances.

---

## Step 7 — Adding Documents and Context Sources

### What the user sees

On the engagement or project detail page, a "Supporting Evidence" section:

```
Supporting Evidence
────────────────────────────────────────────────────────────
Suggested for this project:
  ○ Technical design documents or architecture diagrams
  ○ Meeting notes or experiment logs
  ○ Code repository / commit history reference
  ○ Testing results or failure records
  ○ Photos or lab notes

Attached (2)
  • Training_Architecture_v3.pdf         [Design doc]  ✓
  • Experiment_Log_Q4_2024.xlsx          [Lab notes]   ✓

[+ Attach Document]  [+ Add Context Source]
```

### Primary action

**"+ Attach Document"** — file upload, linked to a specific project or engagement,
with a required document type tag.

**"+ Add Context Source"** — a structured reference that is not a file: a URL,
a repository link, a description of where evidence lives (e.g. "Git commit history
in client's GitHub repo under /src/ml — available on request").

### What should be pre-filled or suggested

- **Document type suggestions:** Based on the engagement type (SR&ED), the system
  shows a checklist of commonly required evidence types. As documents are added,
  the checklist marks them off.
- **Project link:** If opened from a project page, pre-select that project.

### What should be hidden unless needed

- Advanced metadata (document hash, version, expiry) — not shown during upload.
  These are stored automatically.
- CRA document category codes — shown only in the readiness review step.

### What the system creates behind the scenes

- `documents` row (file upload) or `context_sources` row (reference), both linked
  to `engagement_id` and optionally `project_id`.
- Document hash stored at upload time (supports FR-002 future audit trail).

### What the next best action should be

After attaching evidence:
- The evidence checklist updates. If all suggested types are covered:
  ```
  ✓ Evidence looks complete for this project.
  Consider sending a document request to the client for any items you don't have.
  [Send request to client →]
  ```

### Optional vs. required

| Item | Required |
|---|---|
| At least one document per qualified project | Strongly recommended (shown as warning) |
| Document type tag | Required (for readiness review) |
| Project link | Optional (can be engagement-level) |
| Context source description | Required if no file is uploaded |

### Client-facing vs. Bloom-internal

**Client-uploaded documents** are client-visible (they uploaded them).
**Bloom-prepared documents** (draft technical narratives, qualification notes)
are Bloom-internal until explicitly marked as "client-visible."
Context sources are Bloom-internal.

---

## Step 8 — Asking the Client for Missing Information

### What the user sees

An "Information Requests" section on the engagement workspace (visible on both
the agency side and the client workspace):

**Agency side:**
```
Information Requests (4)
────────────────────────────────────────────────────────────
#  Question                                   Status     Due
────────────────────────────────────────────────────────────
1  Please confirm the start date for the      Answered ✓  —
   sensor protocol project
2  What percentage of John's time was spent   Pending    Nov 15
   on R&D vs. production support in Dec?
3  Please upload any experiment logs for      Pending    Nov 15
   Q4 2024 (AI Training project)
4  Can you confirm the fiscal year end         Answered ✓  —
   is September 30, 2025?

[+ New Request]
```

**Client workspace:**
Same list, but showing only client-facing requests (no internal notes,
no Bloom-internal priority flags). The client sees:
- The question
- An answer/upload field
- The due date
- Whether they've already responded

### Primary action

**"+ New Request"** → a form:
- Question / request text (required)
- Assignee (which client contact receives this)
- Due date (optional but recommended)
- Template picker: common SR&ED requests available as one-click templates

### Template library (suggested one-click templates)

Rather than typing from scratch every time, the consultant sees a template picker:

```
Common SR&ED requests:
○ Confirm project dates within fiscal year
○ Provide percentage of time on SR&ED vs. non-SR&ED activities
○ Upload experiment or lab notes
○ Upload technical design documents
○ Confirm employee roles and involvement
○ Describe the technological uncertainty in the client's own words
○ Confirm fiscal year dates
```

Selecting a template pre-fills the question text. The consultant can edit
before sending.

### What should be pre-filled or suggested

- **Assignee:** Default to the primary client contact (client_owner role) if
  only one exists.
- **Due date:** Suggest 7 days from today by default.
- **Request text:** Pre-filled from template if selected.

### What should be hidden unless needed

- Internal notes / priority — toggle-revealed, Bloom-internal only.
- Bulk request creation — hidden unless the consultant clicks "Add multiple requests."

### What the system creates behind the scenes

- `information_requests` row linked to `engagement_id`, with optional `project_id`.
- Notification trigger: when a request is created, a notification is queued for
  the assigned client contact (requires future notification system).

### What the next best action should be

After a request is answered:
- The row updates to "Answered ✓"
- If the answer includes a file upload, it is attached to the related project
  automatically if a project is linked.
- The consultant sees: "Request answered. Review the response and mark as resolved."

### Optional vs. required

| Field | Required |
|---|---|
| Question text | Required |
| Assignee | Required |
| Due date | Optional |
| Project link | Optional |
| Internal notes | Optional (Bloom-internal) |

### Client-facing vs. Bloom-internal

All information requests are **client-facing by definition** — that is the entire
purpose. Internal notes on a request are Bloom-internal. The request question,
due date, and response are client-visible.

---

## Step 9 — Reviewing Claim Readiness

### What the user sees

The **Claim Workspace** — the engagement detail page — doubles as the readiness
dashboard. This is the most important screen in the entire workflow.

It replaces the current bare engagement detail page with a structured, stateful
view of the claim's completeness:

```
┌─────────────────────────────────────────────────────────────┐
│  Acme Corp — SR&ED Claim September 2025                     │
│  Full SR&ED Claim · FY Sep 2025 · [Active] ▼               │
└─────────────────────────────────────────────────────────────┘

Claim Progress
─────────────────────────────────────────────────────────────
✓  Fiscal year confirmed        Sep 2025 (Oct 1 – Sep 30)
✓  Projects added               3 projects
⚠  Projects qualified           2 of 3 qualified  [Review →]
✓  Work records complete        All 24 months covered
⚠  Employee hours               2 months missing hours  [Fix →]
○  Documents                    4 attached, 2 suggested types missing
⚠  Information requests         1 pending client response
○  Readiness review             Not started

────────────────────────────────────────────────────────────
Overall: Not ready — 3 items need attention before submission
─────────────────────────────────────────────────────────────

[Review outstanding items]
```

Below the progress panel, each section (Projects, Work Records, Hours, Documents,
Requests) is shown in a compact summary table.

### Primary action

If items are outstanding: **"Review outstanding items"** — scrolls to or highlights
the first incomplete item.

If all items are complete: **"Mark ready for review"** — moves engagement status
from `active` to `in_review`. This is a significant action that should require
confirmation:
```
Are you sure? Once marked In Review, this claim will be
locked from further edits until you return it to Active.
[Cancel]  [Yes, mark In Review]
```

### What should be pre-filled or suggested

Everything on this screen is derived from existing data — nothing is entered here.

### What should be hidden unless needed

- ITC calculation summary — shown only when wages have been entered (future phase).
- CRA form reference numbers — shown only in submission prep phase (future).
- Audit log — collapsed behind "View history."

### What the system does

No new objects created. The readiness state is **computed** from existing records:
- Projects qualified? Count qualified vs. total.
- Work records complete? Count months with records vs. FY months.
- Hours entered? Count work records with at least one hour record.
- Documents attached? Check against the suggested evidence checklist.
- Requests resolved? Count pending vs. total.

The system does not store a "readiness score" — it derives it live. This means
the score updates automatically as work is done, with no manual step to "recalculate."

### What the next best action should be

When all items are complete:
```
✓ This claim looks ready for review.
All projects are qualified, work records are complete, hours are logged,
and no client requests are outstanding.

[Mark ready for review →]
```

### Optional vs. required (for submission readiness)

| Item | Required for "In Review" |
|---|---|
| All projects qualified or excluded | Required |
| Work records for all in-scope months | Required |
| Hours entered for all work records | Required |
| At least one document per qualified project | Recommended (warning, not block) |
| All client requests answered | Required |
| Wages entered | Optional in Phase 3, required later |

### Client-facing vs. Bloom-internal

**Client-visible summary (workspace):**
- Claim status (Active, In Review, Submitted)
- Project names (not qualification details)
- Outstanding requests assigned to them
- Documents they uploaded

**Bloom-internal:**
- Qualification details
- Hour records and wages
- Readiness checklist detail
- ITC calculations
- Internal notes and priority flags

---

## Key UX Patterns to Implement Across All Steps

### 1. Claim Progress Checklist (Persistent)

The engagement detail page (Claim Workspace) always shows a compact progress
checklist at the top. Checked items are ✓ green. Incomplete but blocked items
are ⚠ amber. Not-yet-started items are ○ grey.

The checklist is not a separate page — it is always visible at the top of the
claim workspace, updating live as work is done.

### 2. Contextual "Next Step" Banner

Every page in the workflow ends with a "Next step" suggestion:
```
Next: Add work records for this project →
```
This is a low-friction, one-click shortcut to the next logical action. It reduces
the need for the consultant to mentally track where they are.

### 3. Empty State Prompts (Not Blank Sections)

Empty sections should never show a blank space. They should always explain what
belongs there and offer a primary CTA:
```
No work records yet.
SR&ED claims require a description of work performed each month.
[+ Add work records for this project]
```

### 4. Inline Editing Where Possible

Short fields (work descriptions, qualification pass/fail, employee hours) should
be editable inline — click the row, edit in place, save. Full-page forms should
be reserved for creating new records with many fields (new project, new engagement).

### 5. Warnings, Not Blockers

The system should warn about missing items but generally not block the consultant
from continuing. Exceptions:
- Cannot mark `in_review` if critical items are missing (hard block with explanation).
- Cannot create an SR&ED engagement without a fiscal year (already enforced).

Everything else is a warning: amber callout, not a modal blocker.

### 6. Client vs. Agency Visual Language

When agency users preview the client workspace (viewing as staff), they should
see a persistent amber "You are viewing as Bloom staff" banner. Fields that are
Bloom-internal should never render in that view — not greyed out, not hidden with
a lock icon, simply absent. The client workspace is a separate, clean surface.

---

## What This Plan Does Not Address

The following are intentionally out of scope for this planning document and should
be captured as future requirements when the time comes:

- ITC calculation engine (eligible expenditures, investment tax credit percentages)
- CRA T661 form preparation and export
- Multi-claimant / partnership SR&ED scenarios
- SR&ED claim amendment workflow (re-filing)
- Provincial R&D credits (Ontario Innovation Tax Credit, etc.)
- Notification / email system for client request delivery
- E-signature workflow for deliverable sign-off (captured in FR-002)
- Mobile-first experience for client users

---

*Authored: 2026-05-23*  
*This document governs UX decisions for Phase 3 and beyond.*  
*Do not start building until Phase 2 is verified and this plan is approved.*
