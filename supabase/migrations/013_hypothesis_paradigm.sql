-- Migration 013: SR&ED hypothesis paradigm
-- Adds likelihood (tier) and hypothesis_data (jsonb blob) to sred_projects.
-- Both columns are nullable so all existing rows continue to work unchanged.
-- Old runs: likelihood=NULL, hypothesis_data=NULL (confidence/line_*_ai_draft still populated).
-- New runs: likelihood + hypothesis_data populated; confidence kept for backward-compat display.

ALTER TABLE sred_projects
  ADD COLUMN IF NOT EXISTS likelihood text,
  ADD COLUMN IF NOT EXISTS hypothesis_data jsonb;

-- Guard against re-run: ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sred_projects_likelihood_check'
      AND conrelid = 'public.sred_projects'::regclass
  ) THEN
    ALTER TABLE sred_projects
      ADD CONSTRAINT sred_projects_likelihood_check
      CHECK (likelihood IS NULL OR likelihood IN ('likely', 'plausible', 'unlikely'));
  END IF;
END
$$;
