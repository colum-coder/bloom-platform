-- ============================================================
-- Migration 006: Phase 3A Feedback Layer
--
-- Run AFTER 005_phase3a.sql.
-- Adds two columns that support the Bloom Guidance Layer:
--
--   1. ai_suggestion_runs.prompt_version
--      The name+version of the prompt template used for the run
--      (e.g. "sred_project_discovery_v1"). Stored at run time so
--      output quality can be compared as prompts improve over time.
--
--   2. ai_proposals.decision_reason
--      Optional free text captured when Bloom staff reject or defer
--      a proposal (e.g. "not SR&ED", "routine work", "too vague").
--      Provides a feedback signal without requiring a full training
--      mode. Original AI proposal text is never overwritten.
--
-- Design decisions:
--   - Both columns are nullable. Existing rows remain valid.
--   - ADD COLUMN IF NOT EXISTS makes the migration idempotent.
--   - No enum for decision_reason — free text (with UI suggestions)
--     allows Bloom to discover natural categories before constraining
--     the schema. A reference table can be added in a later phase
--     once the vocabulary stabilises.
--   - No training infrastructure is built here. These columns are
--     purely for data capture. A Guidance / Training Mode is a
--     future phase requirement.
-- ============================================================

alter table public.ai_suggestion_runs
  add column if not exists prompt_version text;

comment on column public.ai_suggestion_runs.prompt_version is
  'Name and version of the prompt template used for this run '
  '(e.g. "sred_project_discovery_v1"). Enables comparison of AI '
  'output quality across prompt iterations.';

alter table public.ai_proposals
  add column if not exists decision_reason text;

comment on column public.ai_proposals.decision_reason is
  'Optional reason recorded by Bloom staff when rejecting or deferring '
  'a proposal (e.g. "not SR&ED", "routine work", "too vague"). '
  'Cleared (set to null) when a decision is undone back to pending. '
  'The original AI proposal text (title, description, reason) is never '
  'overwritten — only decision, reviewed_by, reviewed_at, and this '
  'column are mutable after creation.';
