import { redirect } from "next/navigation";
import Link from "next/link";
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

  if (error || !memberships || memberships.length === 0) redirect("/unauthorized");

  const activeMemberships = memberships as MembershipWithTenant[];

  // Resolve active tenant from metadata
  const metaTenantId = user.user_metadata?.active_tenant_id as string | undefined;
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : activeMemberships[0].tenant_id;

  const activeMembership = activeMemberships.find(
    (m) => m.tenant_id === activeTenantId
  ) ?? activeMemberships[0];

  const isAgencyUser = activeMemberships.some((m) => isAgencyRole(m.role));
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link href="/workspace" className="flex items-center gap-2.5 flex-shrink-0">
            <img src="/logo.svg" alt="Bloom" className="h-7 w-auto" />
          </Link>

          {/* Mode badge */}
          <div className="flex-1 flex items-center">
            <ModeBadge mode="client" clientName={activeMembership.tenant.name} />
          </div>

          {/* User actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-gray-400 hidden sm:block truncate max-w-[160px]">
              {user.email}
            </span>
            {isAgencyUser && (
              <Link
                href="/agency"
                className="text-xs font-semibold text-white rounded-lg px-3 py-1.5 transition-opacity hover:opacity-80 bg-bloom-blue"
              >
                ← Agency
              </Link>
            )}
            <SignOutButton className="text-sm text-gray-400 hover:text-gray-700 transition-colors" />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-900">
            {activeMembership.tenant.name}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back,{" "}
            <span className="text-gray-700 font-medium">{displayName}</span>
          </p>
        </div>

        {/* Workspace context card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Your Workspace
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Organisation
              </p>
              <p className="font-medium text-gray-900 truncate">
                {activeMembership.tenant.name}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Your Role
              </p>
              <RoleBadge role={activeMembership.role} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Status
              </p>
              <TenantStatusBadge status={activeMembership.tenant.status} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Mode
              </p>
              <ModeBadge mode="client" />
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="grid sm:grid-cols-2 gap-4">
          <WorkspaceSection
            title="Engagements"
            description="Your SR&ED engagements and claim status will appear here."
            phase="Phase 2"
            color="#03CEA4"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <WorkspaceSection
            title="Documents"
            description="Documents requested by Bloom and your uploads will appear here."
            phase="Phase 2"
            color="#2B307E"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
          />
          <WorkspaceSection
            title="Requests"
            description="Information requests and outstanding items from your Bloom consultant."
            phase="Phase 2"
            color="#FF6A42"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            }
          />
          <WorkspaceSection
            title="Messages"
            description="Updates and comments from your Bloom team will appear here."
            phase="Phase 2"
            color="#8B5CF6"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          />
        </div>

        {/* Agency staff notice */}
        {isAgencyUser && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <strong>Bloom staff view:</strong> You are previewing this workspace as an
            agency user. Clients see the same interface without the ← Agency button.
          </div>
        )}
      </main>
    </div>
  );
}

// ── WorkspaceSection ───────────────────────────────────────────────────────

function WorkspaceSection({
  title,
  description,
  phase,
  color,
  icon,
}: {
  title: string;
  description: string;
  phase: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="flex items-start gap-3 mb-2">
        <span style={{ color }} className="flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              {phase}
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-400 leading-relaxed ml-8">{description}</p>
    </div>
  );
}
