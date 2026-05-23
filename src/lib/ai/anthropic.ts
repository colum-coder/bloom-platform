/**
 * Anthropic SDK client — SERVER-SIDE ONLY.
 *
 * SECURITY RULES — do not violate these:
 *   1. Import this file ONLY from server actions, route handlers, and
 *      server components. NEVER import it from a "use client" file.
 *   2. process.env.ANTHROPIC_API_KEY is read here and NOWHERE else in
 *      the codebase. It is never passed to a client component as a prop,
 *      never logged, never stored in Supabase, and never prefixed with
 *      NEXT_PUBLIC_.
 *   3. process.env.ANTHROPIC_MODEL is the single configurable model
 *      override. DEFAULT_MODEL is the fallback. No other file should
 *      reference a model name string.
 *
 * Usage:
 *   import { createAnthropicClient, getModel } from "@/lib/ai/anthropic";
 *   const ai = createAnthropicClient();
 *   const model = getModel();
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Model configuration ────────────────────────────────────────────────────
//
// ONE place. No other file in the codebase should reference a model name.
// Override via ANTHROPIC_MODEL in .env.local or Railway environment variables.

const DEFAULT_MODEL = "claude-sonnet-4-5";

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}

// ── Client factory ─────────────────────────────────────────────────────────

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Fail loudly at call time rather than silently returning undefined.
    // The error appears in server logs only — never in the browser.
    throw new Error(
      "[Bloom] ANTHROPIC_API_KEY is not set. " +
        "Add it to .env.local for development or to Railway environment " +
        "variables for production. Never commit the key to git."
    );
  }
  return key;
}

export function createAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: requireApiKey() });
}
