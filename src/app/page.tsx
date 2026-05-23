// Root page — middleware normally intercepts this and redirects before
// this component renders. This is a server-side safety net in case the
// middleware passes through (e.g., Edge Runtime cold-start edge case).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AGENCY_ROLES } from "@/lib/auth/permissions";

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Same Supabase v2 generic collapse workaround as actions.ts
  const membershipResult = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");
  const memberships = (membershipResult.data ?? []) as unknown as Array<{ role: string }>;

  const hasAgencyRole = memberships.some((m) =>
    (AGENCY_ROLES as string[]).includes(m.role)
  );

  redirect(hasAgencyRole ? "/agency" : "/workspace");
}
