-- Migration 012: Consultant-provided focus note on discovery runs
--
-- run_focus_note is an optional free-text field filled in on the
-- "Run Project Discovery" page. It is appended to the Anthropic prompt
-- as a === CONSULTANT NOTE === section so Claude knows what changed or
-- what to focus on relative to the previous run.
--
-- Storing it on the run row means it is auditable alongside the output.

ALTER TABLE discovery_runs
  ADD COLUMN IF NOT EXISTS run_focus_note text;

COMMENT ON COLUMN discovery_runs.run_focus_note IS
  'Optional consultant note added at trigger time: what changed, what to focus on. Injected into the Claude prompt.';
