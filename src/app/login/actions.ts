"use server";

import { redirect } from "next/navigation";
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
  const membershipResult = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("status", "active");
  const memberships = (membershipResult.data ?? []) as unknown as Array<{ role: string }>;

  const hasAgencyRole = memberships.some((m) =>
    (AGENCY_ROLES as string[]).includes(m.role)
  );

  redirect(hasAgencyRole ? "/agency" : "/workspace");
}
