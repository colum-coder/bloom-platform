/**
 * Supabase service-role client — bypasses Row Level Security.
 *
 * SERVER ONLY. Use exclusively in:
 *   - Background processors (run-discovery.ts)
 *   - Internal API routes (never exposed to browser)
 *
 * NEVER import from client components, pages, or server actions that
 * handle user input directly. User-facing server actions must use
 * the cookie-based createClient() from @/lib/supabase/server.
 *
 * SECURITY: SUPABASE_SERVICE_ROLE_KEY must never be committed to git
 * or logged. It is set only in Railway and local .env.local.
 */

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "Set it in Railway environment variables and local .env.local."
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
