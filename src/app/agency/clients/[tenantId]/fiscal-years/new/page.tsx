import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { FiscalYearForm } from "./fiscal-year-form";
import type { Tenant } from "@/types/database";

interface Props {
  params: { tenantId: string };
}

export default async function NewFiscalYearPage({ params }: Props) {
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
        <span className="text-gray-700 font-medium">New Fiscal Year</span>
      </nav>

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Add Fiscal Year</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          For <span className="font-medium text-gray-700">{tenantRow.name}</span>
        </p>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <FiscalYearForm tenantId={params.tenantId} />
      </div>
    </div>
  );
}
