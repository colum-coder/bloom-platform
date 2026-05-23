// Force dynamic rendering — this layout reads user session cookies on every request.
// Static prerendering would fail because there is no request context at build time.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { AgencySidebarShell } from "@/components/agency-sidebar";
import type { MembershipWithTenant } from "@/types/database";

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("tenant_memberships")
    .select("*, tenant:tenants(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberships) redirect("/unauthorized");

  const activeMemberships = memberships as MembershipWithTenant[];
  const hasAgencyRole = activeMemberships.some((m) => isAgencyRole(m.role));
  if (!hasAgencyRole) redirect("/unauthorized");

  // Resolve active tenant from metadata, falling back to the agency tenant
  const metaTenantId = user.user_metadata?.active_tenant_id as string | undefined;
  const agencyMembership = activeMemberships.find((m) => m.tenant?.type === "agency");
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : agencyMembership?.tenant_id ?? activeMemberships[0].tenant_id;

  const activeMembership =
    activeMemberships.find((m) => m.tenant_id === activeTenantId) ??
    activeMemberships[0];

  const isViewingClient = activeMembership?.tenant?.type === "client";

  return (
    <AgencySidebarShell
      email={user.email ?? ""}
      memberships={activeMemberships}
      activeTenantId={activeTenantId}
      isViewingClient={isViewingClient}
      clientName={isViewingClient ? activeMembership?.tenant?.name : undefined}
    >
      {children}
    </AgencySidebarShell>
  );
}
