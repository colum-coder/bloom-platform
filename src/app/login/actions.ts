"use server";

import { createClient } from "@/lib/supabase/server";
import { AGENCY_ROLES } from "@/lib/auth/permissions";

export async function signInWithPassword(formData: FormData) {
  const supabase = createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Determine correct landing page server-side.
  // Supabase v2 TypeScript generics collapse to 'never' when .eq() is
  // chained on a custom string-union column; escape via unknown cast.
  // We also add .eq("user_id", user.id) as belt-and-suspenders alongside RLS.
  const { data: { user } } = await supabase.auth.getUser();
  const membershipResult = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .eq("status", "active");
  const memberships = (membershipResult.data ?? []) as unknown as Array<{ role: string }>;

  const hasAgencyRole = memberships.some((m) =>
    (AGENCY_ROLES as string[]).includes(m.role)
  );

  // Return the destination instead of calling redirect().
  // Calling redirect() from a Server Action invoked programmatically
  // triggers a client-side soft navigation (router.push) which can race
  // against the Set-Cookie headers being written to the browser. Returning
  // the URL and letting the client do window.location.href forces a full
  // HTTP request that carries all cookies without any timing ambiguity.
  return { redirectTo: hasAgencyRole ? "/agency" : "/workspace" };
}
