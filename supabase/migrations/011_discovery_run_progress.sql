-- Migration 011: Progress-tracking fields for background discovery processing
--
-- These columns support the Option A in-process fire-and-forget architecture
-- described in src/lib/ai/run-discovery.ts.
--
-- started_at              — when the processor actually began work (≠ created_at which is queue time)
-- progress_message        — optional human-readable status shown on the run detail page while running
-- processed_document_count — documents processed so far (reserved for future per-document mode)
-- total_document_count    — total documents queued, set at trigger time, used for size/ETA display

ALTER TABLE discovery_runs
  ADD COLUMN IF NOT EXISTS started_at               timestamptz,
  ADD COLUMN IF NOT EXISTS progress_message         text,
  ADD COLUMN IF NOT EXISTS processed_document_count integer,
  ADD COLUMN IF NOT EXISTS total_document_count     integer;

COMMENT ON COLUMN discovery_runs.started_at IS
  'When the background processor marked the run as running. NULL = still queued.';
COMMENT ON COLUMN discovery_runs.progress_message IS
  'Optional human-readable status for display during processing, e.g. "Analysing 7 documents…"';
COMMENT ON COLUMN discovery_runs.processed_document_count IS
  'Documents processed so far (reserved for future per-document streaming mode).';
COMMENT ON COLUMN discovery_runs.total_document_count IS
  'Total AI-ready documents included in this run. Set at trigger time for size/ETA display.';
