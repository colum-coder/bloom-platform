import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Handles the OAuth / magic-link / password-reset callback from Supabase Auth.
//
// IMPORTANT: We do NOT use createClient() from @/lib/supabase/server here.
// That helper writes cookies via next/headers, which only works when Next.js
// controls the response implicitly (Server Actions, Server Components).
// Route Handlers return an explicit NextResponse, so we must write session
// cookies directly onto that response object — otherwise the browser never
// receives them and the user appears logged out after the redirect.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    // Build the redirect response first so the Supabase client can attach
    // Set-Cookie headers directly to it.
    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response; // carries the session cookies
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
