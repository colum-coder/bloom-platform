import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { EngagementForm } from "./engagement-form";
import type { Tenant, FiscalYear, EngagementType, ServiceLine } from "@/types/database";

interface Props {
  params: { tenantId: string };
}

export default async function NewEngagementPage({ params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Confirm agency role
  const { data: myMemberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const myRoles = (myMemberships ?? []) as unknown as Array<{ role: string }>;
  if (!myRoles.some((m) => isAgencyRole(m.role as never)))
    redirect("/unauthorized");

  // Load the target tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", params.tenantId)
    .eq("type", "client")
    .single();

  if (tenantError || !tenant) notFound();

  const tenantRow = tenant as Tenant;

  // Load active engagement types with their service lines
  const { data: rawTypes } = await supabase
    .from("engagement_types")
    .select("*, service_line:service_lines(*)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  type RawEngagementType = EngagementType & { service_line: ServiceLine };
  const engagementTypes = ((rawTypes ?? []) as unknown as RawEngagementType[]).map(
    (t) => ({
      id:              t.id,
      name:            t.name,
      serviceLineName: t.service_line.name,
      serviceLineSlug: t.service_line.slug,
    })
  );

  // Load non-archived fiscal years for this tenant
  const { data: rawFiscalYears } = await supabase
    .from("fiscal_years")
    .select("id, label, status")
    .eq("tenant_id", params.tenantId)
    .neq("status", "archived")
    .order("start_date", { ascending: false });

  const fiscalYears = (rawFiscalYears ?? []) as unknown as Pick<
    FiscalYear,
    "id" | "label" | "status"
  >[];

  return (
    <div className="px-6 sm:px-8 py-8 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">
          Clients
        </Link>
        <span>/</span>
        <Link
          href={`/agency/clients/${params.tenantId}`}
          className="hover:text-gray-700 transition-colors truncate max-w-[180px]"
        >
          {tenantRow.name}
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">New Engagement</span>
      </nav>

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Create Engagement</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          For <span className="font-medium text-gray-700">{tenantRow.name}</span>
        </p>
      </div>

      {engagementTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <p className="text-sm text-gray-400">
            No active engagement types are configured. Run the Phase 2 migration and seed data first.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <EngagementForm
            tenantId={params.tenantId}
            engagementTypes={engagementTypes}
            fiscalYears={fiscalYears}
          />
        </div>
      )}
    </div>
  );
}
