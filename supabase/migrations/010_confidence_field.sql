-- Migration 010: Add confidence field to sred_projects
--
-- Phase 3C: Claude returns a confidence level with each SR&ED project
-- (high | medium | low). This column stores it alongside the AI draft.
-- The field is nullable — older runs that pre-date v3 will be NULL.
--
-- The confidence value is written once by discovery-actions.ts and
-- never mutated by Bloom editors (immutable, like *_ai_draft fields).

ALTER TABLE sred_projects
  ADD COLUMN IF NOT EXISTS confidence text
    CHECK (confidence IN ('high', 'medium', 'low'));

COMMENT ON COLUMN sred_projects.confidence IS
  'AI-assigned confidence level for SR&ED qualification. Written once at run time. NULL for pre-v3 runs.';
