import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { DocumentUploadForm } from "./document-upload-form";

interface Props {
  params: { tenantId: string; engagementId: string; fiscalYearId: string };
}

export default async function NewDocumentPage({ params }: Props) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const rows = (memberships ?? []) as Array<{ role: string }>;
  if (!rows.some((m) => isAgencyRole(m.role as never))) redirect("/unauthorized");

  // Triple-ownership check on the fiscal year
  const { data: rawFy, error: fyError } = await supabase
    .from("fiscal_years")
    .select("label")
    .eq("id", params.fiscalYearId)
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (fyError || !rawFy) notFound();
  const fy = rawFy as unknown as { label: string };

  const { data: engData } = await supabase
    .from("engagements")
    .select("title")
    .eq("id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();
  const engTitle =
    (engData as unknown as { title: string } | null)?.title ?? "Engagement";

  const { data: tenantData } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", params.tenantId)
    .single();
  const tenantName =
    (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  const yearBase = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">
          Clients
        </Link>
        <span>/</span>
        <Link
          href={`/agency/clients/${params.tenantId}`}
          className="hover:text-gray-700 transition-colors truncate max-w-[100px]"
        >
          {tenantName}
        </Link>
        <span>/</span>
        <Link
          href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`}
          className="hover:text-gray-700 transition-colors truncate max-w-[140px]"
        >
          {engTitle}
        </Link>
        <span>/</span>
        <Link href={yearBase} className="hover:text-gray-700 transition-colors">
          {fy.label}
        </Link>
        <span>/</span>
        <Link
          href={`${yearBase}/documents`}
          className="hover:text-gray-700 transition-colors"
        >
          Documents
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Upload</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Upload Document</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Add a file to the{" "}
          <span className="text-gray-600 font-medium">{fy.label}</span> claim year.
        </p>
      </div>

      <DocumentUploadForm
        fiscalYearId={params.fiscalYearId}
        engagementId={params.engagementId}
        tenantId={params.tenantId}
        cancelHref={`${yearBase}/documents`}
      />
    </div>
  );
}
