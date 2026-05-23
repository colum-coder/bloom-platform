import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { TenantStatusBadge, RoleBadge } from "@/components/status-badge";
import { ModeBadge } from "@/components/mode-badge";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { MembershipWithTenant } from "@/types/database";

export default async function ClientWorkspace() {
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

  if (error || !memberships || memberships.length === 0) {
    redirect("/unauthorized");
  }

  const activeMemberships = memberships as MembershipWithTenant[];

  // Resolve active tenant from metadata
  const metaTenantId = user.user_metadata?.active_tenant_id as string | undefined;
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : activeMemberships[0].tenant_id;

  const activeMembership = activeMemberships.find(
    (m) => m.tenant_id === activeTenantId
  )!;

  // If the active membership is an agency role, the user is viewing
  // the workspace from agency mode — show a notice.
  const isAgencyUser = activeMemberships.some((m) => isAgencyRole(m.role));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top nav ── */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Bloom" className="h-7 w-auto" />
          </div>

          {/* Mode + tenant */}
          <div className="flex items-center gap-3">
            <ModeBadge
              mode="client"
              clientName={activeMembership.tenant.name}
            />
          </div>

          {/* User + sign out */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400 hidden sm:block truncate max-w-[160px]">
              {user.email}
            </span>
            {/* If an agency user is viewing workspace, offer to go back to agency */}
            {isAgencyUser && (
              <a
                href="/agency"
                className="text-sm font-medium text-white rounded-lg px-3 py-1.5 transition-opacity hover:opacity-80"
                style={{ backgroundColor: "#2B307E" }}
              >
                ← Agency
              </a>
            )}
            <SignOutButton className="text-sm text-gray-400 hover:text-gray-700 transition-colors" />
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {activeMembership.tenant.name}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Welcome,{" "}
            <span className="text-gray-700 font-medium">
              {user.user_metadata?.full_name ?? user.email}
            </span>
          </p>
        </div>

        {/* Workspace context card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Your Workspace
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Tenant</p>
              <p className="font-medium text-gray-800">{activeMembership.tenant.name}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Your Role</p>
              <RoleBadge role={activeMembership.role} />
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Status</p>
              <TenantStatusBadge status={activeMembership.tenant.status} />
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Mode</p>
              <ModeBadge mode="client" />
            </div>
          </div>
        </div>

        {/* Placeholder sections — Phase 2+ */}
        <div className="grid sm:grid-cols-2 gap-4">
          <PlaceholderSection
            title="Engagements"
            description="SR&ED engagements assigned to your organisation will appear here."
            icon="📋"
            phase="Phase 2"
          />
          <PlaceholderSection
            title="Documents"
            description="Documents requested by Bloom and your uploads will appear here."
            icon="📄"
            phase="Phase 2"
          />
          <PlaceholderSection
            title="Requests"
            description="Information requests and outstanding items from your Bloom consultant."
            icon="📬"
            phase="Phase 2"
          />
          <PlaceholderSection
            title="Messages"
            description="Comments and updates from your Bloom team will appear here."
            icon="💬"
            phase="Phase 2"
          />
        </div>

        {/* Agency note for agency users viewing workspace */}
        {isAgencyUser && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Bloom staff view:</strong> You are viewing this workspace as an
            agency user. Clients see the same interface without the ← Agency button.
          </div>
        )}
      </main>
    </div>
  );
}

function PlaceholderSection({
  title,
  description,
  icon,
  phase,
}: {
  title: string;
  description: string;
  icon: string;
  phase: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">{icon}</span>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          <span className="text-xs text-gray-400">{phase}</span>
        </div>
      </div>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}
