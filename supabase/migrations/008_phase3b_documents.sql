-- ============================================================
-- Migration 008: Phase 3B — Document Upload and AI-Readable Text
--
-- Run AFTER 007_phase3a_feedback.sql.
--
-- Creates:
--   1. documents          — uploaded files, metadata, ai_text
--   2. document_versions  — file versions with storage paths
--   3. Alters context_sources to optionally link to a document
--
-- Design decisions:
--   - documents.ai_text is the text Claude reads during Project Discovery.
--     Populated by automatic extraction (txt/csv/pdf/docx) or manual entry.
--   - documents anchor to fiscal_year_id (same triple-anchor pattern as Phase 3A)
--   - storage_path on document_versions is the full path in the 'documents'
--     bucket. Format:
--     tenants/{tenant_id}/engagements/{engagement_id}/years/{fiscal_year_id}/
--       documents/{document_id}/versions/{version_id}/{safe_filename}
--   - context_sources.document_id / document_version_id are nullable FKs —
--     optional traceability from a typed note back to its source file.
--   - client_visible defaults to false — no client-facing document UI in Phase 3B.
--   - No DELETE RLS policy on documents — use status='archived'.
--   - Storage bucket 'documents' must be created manually in the Supabase
--     dashboard (private / not public). Storage RLS policies are in this file.
--
-- Phase 3C will build:
--   - Run Project Discovery button that reads documents.ai_text
--   - Structured SR&ED project proposals (new data model)
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. documents
-- ──────────────────────────────────────────────────────────

create table public.documents (
  id             uuid        primary key default gen_random_uuid(),
  fiscal_year_id uuid        not null references public.fiscal_years(id) on delete cascade,
  engagement_id  uuid        not null references public.engagements(id),
  tenant_id      uuid        not null references public.tenants(id),
  title          text        not null,
  description    text,

  -- The text Claude will use during Project Discovery analysis.
  -- Populated by automatic extraction (txt/csv/pdf/docx) on upload,
  -- or manually entered/edited by Bloom staff.
  -- NULL means "Needs Text" — not yet AI-ready.
  ai_text        text,

  document_type  text        not null,
  tags           text[]      not null default '{}',
  status         text        not null default 'uploaded',
  client_visible boolean     not null default false,
  uploaded_by    uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint documents_type_check check (document_type in (
    'prior_claim', 'technical_narrative', 'meeting_notes', 'project_discussion',
    'staff_note', 'client_background', 'technical_document', 'financial_summary',
    'payroll_export', 'timesheet', 'contractor_invoice', 'material_invoice',
    'email_thread', 'cra_review_context', 'other'
  )),
  constraint documents_status_check check (status in (
    'uploaded', 'needs_review', 'reviewed', 'accepted', 'superseded', 'archived'
  ))
);

comment on table public.documents is
  'Uploaded documents for a specific SR&ED claim year. '
  'fiscal_year_id is the primary anchor; engagement_id and tenant_id are denormalized. '
  'ai_text is what Claude reads during Project Discovery — auto-extracted for txt/csv/pdf/docx, '
  'or manually entered for other file types. NULL means the document is not yet AI-ready. '
  'Files are stored in Supabase Storage under the path recorded in document_versions.storage_path. '
  'Rows are never hard-deleted — use status=''archived''. '
  'No client-facing document UI in Phase 3B; client_visible defaults to false.';

comment on column public.documents.ai_text is
  'The exact text Claude will use when analyzing this claim year. '
  'Auto-extracted on upload for .txt, .csv, .pdf (text-layer), .docx. '
  'For all other file types (images, spreadsheets, presentations, scanned PDFs), '
  'this must be entered manually by Bloom staff. '
  'NULL = document is not yet AI-ready (shows ''Needs Text'' indicator in the UI).';

create trigger documents_updated_at
  before update on public.documents
  for each row execute procedure public.set_updated_at();

create index on public.documents (fiscal_year_id, status);
create index on public.documents (engagement_id);
create index on public.documents (tenant_id);
-- Partial index for quickly finding AI-ready documents during Project Discovery
create index on public.documents (fiscal_year_id)
  where ai_text is not null and status != 'archived';

alter table public.documents enable row level security;

-- Agency: full read/write access
create policy "documents: agency can select"
  on public.documents for select
  using (public.has_agency_membership_in_tenant(tenant_id));

create policy "documents: agency can insert"
  on public.documents for insert
  with check (public.has_agency_membership_in_tenant(tenant_id));

create policy "documents: agency can update"
  on public.documents for update
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));

-- Client: only client_visible documents (no client UI in Phase 3B, but policy ready)
create policy "documents: clients see published only"
  on public.documents for select
  using (public.is_active_member(tenant_id) and client_visible = true);

-- No DELETE policy — archive only.


-- ──────────────────────────────────────────────────────────
-- 2. document_versions
-- ──────────────────────────────────────────────────────────

create table public.document_versions (
  id              uuid        primary key default gen_random_uuid(),
  document_id     uuid        not null references public.documents(id) on delete cascade,
  fiscal_year_id  uuid        not null references public.fiscal_years(id),
  engagement_id   uuid        not null references public.engagements(id),
  tenant_id       uuid        not null references public.tenants(id),
  version_number  integer     not null default 1,
  file_name       text        not null,
  file_type       text        not null,
  file_size_bytes integer     not null,
  /** Full path in the private 'documents' Supabase Storage bucket */
  storage_path    text        not null,
  uploaded_by     uuid        references auth.users(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now()
);

comment on table public.document_versions is
  'File versions for an uploaded document. storage_path is the full object path '
  'in the private ''documents'' Supabase Storage bucket. '
  'Format: tenants/{tenant_id}/engagements/{engagement_id}/years/{fiscal_year_id}/'
  '  documents/{document_id}/versions/{version_id}/{safe_filename}. '
  'Signed URLs are generated server-side at download time (60s expiry). '
  'Agency-only in Phase 3B.';

create index on public.document_versions (document_id);
create index on public.document_versions (tenant_id);
create index on public.document_versions (fiscal_year_id);

alter table public.document_versions enable row level security;

-- Agency-only for all operations in Phase 3B.
-- Client access to specific versions is served via server-generated signed URLs
-- after checking documents.client_visible — not via direct RLS.
create policy "document_versions: agency only"
  on public.document_versions for all
  using  (public.has_agency_membership_in_tenant(tenant_id))
  with check (public.has_agency_membership_in_tenant(tenant_id));


-- ──────────────────────────────────────────────────────────
-- 3. Update context_sources — add optional document links
--
-- Optional traceability: a context source (typed note) can
-- reference the document it came from. Not required — existing
-- context sources are unaffected.
-- ──────────────────────────────────────────────────────────

alter table public.context_sources
  add column if not exists document_id         uuid references public.documents(id)         on delete set null,
  add column if not exists document_version_id uuid references public.document_versions(id) on delete set null;

comment on column public.context_sources.document_id is
  'Optional link to the document this context source was created from. '
  'NULL for context sources created without an uploaded document.';

comment on column public.context_sources.document_version_id is
  'The specific document version this context source was created from. '
  'SET NULL if the version is deleted (the snippet text is always preserved).';

create index if not exists on public.context_sources (document_id)
  where document_id is not null;


-- ──────────────────────────────────────────────────────────
-- 4. Storage bucket RLS policies
--
-- NOTE: The 'documents' bucket must be created manually in the
-- Supabase dashboard before these policies take effect.
-- Bucket settings: name = 'documents', public = false.
--
-- These policies provide a secondary storage-level guard.
-- Primary authorization is always enforced by server actions
-- (membership check + ownership verification) before any
-- storage operation or signed URL generation.
-- ──────────────────────────────────────────────────────────

-- Agency users can upload files to their tenant's path
create policy "documents bucket: agency can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and public.has_agency_membership_in_tenant(
      split_part(name, '/', 2)::uuid   -- extracts tenant_id from path
    )
  );

-- Agency users can read files from their tenant's path
create policy "documents bucket: agency can read"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and public.has_agency_membership_in_tenant(
      split_part(name, '/', 2)::uuid
    )
  );

-- No client storage policy — clients access files via server-generated
-- signed URLs only, after server-side client_visible check.
