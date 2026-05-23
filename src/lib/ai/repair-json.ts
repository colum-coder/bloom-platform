/**
 * repairTruncatedJson
 *
 * Attempts to parse a JSON string. If parsing fails (e.g. because the
 * Anthropic API response was cut off at max_tokens), this function walks
 * the string character-by-character to find the last fully-closed object
 * inside the top-level proposals array, then closes the array and the
 * wrapping object so the partial result can be parsed.
 *
 * Returns { data, truncationWarning }.
 * Throws a descriptive Error if all recovery attempts fail — the caller
 * should catch this and mark the run as "failed".
 *
 * This function is pure — it has no side-effects and no I/O.
 */

export interface RepairResult<T = unknown> {
  data: T;
  truncationWarning: boolean;
}

export function repairTruncatedJson<T = unknown>(raw: string): RepairResult<T> {
  // ── Fast path: valid JSON ─────────────────────────────────────────────────
  try {
    return { data: JSON.parse(raw) as T, truncationWarning: false };
  } catch {
    // Fall through to repair logic.
  }

  // ── Locate the proposals array ────────────────────────────────────────────
  //
  // The AI tool input looks like:
  //   { "proposals": [ {...}, {...}, ... ], "run_summary": {...} }
  //
  // If truncated, the proposals array or the objects inside it may be
  // incomplete. We find the start of the proposals array, then scan forward
  // to find the last fully-closed { } object at depth 1.

  // Use a non-dotAll pattern so we stay compatible with the tsconfig target.
  // [\s\S]* matches any character including newlines.
  const proposalsMatch = raw.match(/^(\s*\{\s*"proposals"\s*:\s*\[)/);
  if (!proposalsMatch) {
    throw new Error(
      "repairTruncatedJson: cannot locate the proposals array in the truncated response."
    );
  }

  const arrayContentStart = proposalsMatch[0].length; // index just after `[`
  const arrayContent = raw.slice(arrayContentStart);

  // Walk the array content to find the last complete top-level object.
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteObjectEnd = -1; // index in arrayContent after last `}` at depth 0

  for (let i = 0; i < arrayContent.length; i++) {
    const ch = arrayContent[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      // A top-level object closes when depth returns to 0 via a `}`.
      if (depth === 0 && ch === "}") {
        lastCompleteObjectEnd = i;
      }
    }
  }

  if (lastCompleteObjectEnd === -1) {
    throw new Error(
      "repairTruncatedJson: no complete proposal object found in truncated response."
    );
  }

  // ── Reconstruct and parse ─────────────────────────────────────────────────
  //
  // We take everything up to (and including) the last complete object, close
  // the proposals array, then provide an empty run_summary so the outer
  // object is valid JSON. The caller checks truncationWarning to decide
  // whether to show a warning to the user.

  const repairedJson =
    proposalsMatch[0] +
    arrayContent.slice(0, lastCompleteObjectEnd + 1) +
    '], "run_summary": {"summary": "", "activity_months": [], "tr_sections_supported": [], "tr_sections_unsupported": []} }';

  try {
    return { data: JSON.parse(repairedJson) as T, truncationWarning: true };
  } catch {
    throw new Error(
      "repairTruncatedJson: partial recovery produced invalid JSON. " +
        "The response may be too corrupted to recover."
    );
  }
}
