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

  // Determine correct landing page server-side
  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("status", "active");

  const hasAgencyRole = memberships?.some((m) =>
    (AGENCY_ROLES as string[]).includes(m.role)
  );

  redirect(hasAgencyRole ? "/agency" : "/workspace");
}
