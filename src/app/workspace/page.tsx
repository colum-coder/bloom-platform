import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import type { MembershipWithTenant } from "@/types/database";

export default async function ClientWorkspace() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load active memberships
  const { data: memberships, error } = await supabase
    .from("tenant_memberships")
    .select("*, tenant:tenants(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberships || memberships.length === 0) {
    redirect("/unauthorized");
  }

  const activeMemberships = memberships as MembershipWithTenant[];

  // Active tenant: prefer metadata, fall back to first membership
  const metaTenantId = user.user_metadata?.active_tenant_id as string | undefined;
  const activeTenantId =
    metaTenantId && activeMemberships.some((m) => m.tenant_id === metaTenantId)
      ? metaTenantId
      : activeMemberships[0].tenant_id;

  const activeMembership = activeMemberships.find(
    (m) => m.tenant_id === activeTenantId
  )!;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Bloom" className="h-7 w-auto" />
          </div>

          {/* Active tenant indicator */}
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#03CEA4" }}
            />
            <span className="text-sm font-medium text-gray-700">
              {activeMembership.tenant.name}
            </span>
          </div>

          {/* User + sign out */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400 hidden sm:block truncate max-w-[160px]">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Welcome section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {activeMembership.tenant.name}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Welcome,{" "}
            <span className="text-gray-700 font-medium">
              {user.user_metadata?.full_name ?? user.email}
            </span>
            {" "}· {activeMembership.role.replace(/_/g, " ")}
          </p>
        </div>

        {/* Tenant context card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "#03CEA415" }}
            >
              <svg
                className="w-5 h-5"
                style={{ color: "#03CEA4" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">{activeMembership.tenant.name}</p>
              <p className="text-xs text-gray-400">
                Tenant · {activeMembership.tenant.slug}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Your role</p>
              <p className="font-medium text-gray-700 capitalize">
                {activeMembership.role.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Tenant type</p>
              <p className="font-medium text-gray-700 capitalize">
                {activeMembership.tenant.type}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Status</p>
              <span
                className="inline-block text-xs font-semibold rounded-full px-2 py-0.5"
                style={{
                  backgroundColor: "#03CEA415",
                  color: "#03CEA4",
                }}
              >
                {activeMembership.status}
              </span>
            </div>
          </div>
        </div>

        {/* Phase 0 placeholder */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Your workspace
          </h2>
          <p className="text-sm text-gray-400">
            Engagements, document requests, and tasks will appear here once
            Bloom sets up your workspace. If you have outstanding items, your
            Bloom consultant will be in touch.
          </p>
        </div>
      </main>
    </div>
  );
}
