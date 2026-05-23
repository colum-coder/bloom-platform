// Root page — middleware normally intercepts this and redirects before
// this component renders. This is a server-side safety net in case the
// middleware passes through (e.g., Edge Runtime cold-start edge case).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AGENCY_ROLES } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/database";

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const hasAgencyRole = (memberships ?? []).some((m) =>
    (AGENCY_ROLES as UserRole[]).includes(m.role as UserRole)
  );

  redirect(hasAgencyRole ? "/agency" : "/workspace");
}
