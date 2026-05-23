import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { ContextSourceForm } from "./context-source-form";

interface Props {
  params: { tenantId: string; engagementId: string };
}

export default async function NewContextSourcePage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const rows = (memberships ?? []) as Array<{ role: string }>;
  if (!rows.some((m) => isAgencyRole(m.role as never))) redirect("/unauthorized");

  // Load engagement title for breadcrumb
  const { data: eng } = await supabase
    .from("engagements")
    .select("title")
    .eq("id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  const engTitle = (eng as unknown as { title: string } | null)?.title ?? "Engagement";

  // Load tenant name
  const { data: tenantData } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", params.tenantId)
    .single();

  const tenantName = (tenantData as unknown as { name: string } | null)?.name ?? "Client";

  return (
    <div className="px-6 sm:px-8 py-8 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">Clients</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}`} className="hover:text-gray-700 transition-colors truncate max-w-[120px]">{tenantName}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}`} className="hover:text-gray-700 transition-colors truncate max-w-[160px]">{engTitle}</Link>
        <span>/</span>
        <Link href={`/agency/clients/${params.tenantId}/engagements/${params.engagementId}/context`} className="hover:text-gray-700 transition-colors">Context</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Add Source</span>
      </nav>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Add Context Source</h1>
        <p className="text-sm text-gray-400 mb-6">
          Paste or type source material. The AI will analyse the full text during the next run.
        </p>
        <ContextSourceForm
          engagementId={params.engagementId}
          tenantId={params.tenantId}
        />
      </div>
    </div>
  );
}
