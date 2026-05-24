import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import { archiveDocument } from "../document-actions";
import type { Document, DocumentVersion } from "@/types/database";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_STYLES,
  formatFileSize,
} from "../document-constants";

interface Props {
  params: { tenantId: string; engagementId: string; fiscalYearId: string };
}

export default async function DocumentsPage({ params }: Props) {
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

  // Load non-archived documents with their latest version
  const { data: rawDocs } = await supabase
    .from("documents")
    .select(
      "id, title, description, document_type, tags, status, ai_text, created_at, document_versions(id, version_number, file_name, file_type, file_size_bytes, created_at)"
    )
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("tenant_id", params.tenantId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  type DocRow = Pick<Document, "id" | "title" | "document_type" | "tags" | "status" | "ai_text" | "created_at"> & {
    document_versions: Pick<DocumentVersion, "id" | "version_number" | "file_name" | "file_type" | "file_size_bytes" | "created_at">[];
  };
  const docs = (rawDocs ?? []) as unknown as DocRow[];

  const yearBase = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;

  const aiReadyCount = docs.filter((d) => d.ai_text).length;
  const needsTextCount = docs.length - aiReadyCount;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-5xl mx-auto">
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
        <span className="text-gray-700 font-medium">Documents</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Uploaded files for the{" "}
            <span className="text-gray-600 font-medium">{fy.label}</span> claim year.
          </p>
        </div>
        <Link
          href={`${yearBase}/documents/new`}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity flex-shrink-0"
          style={{ backgroundColor: "#FF6A42" }}
        >
          + Upload Document
        </Link>
      </div>

      {/* AI readiness summary */}
      {docs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">{aiReadyCount}</span> AI Ready
            </span>
          </div>
          {needsTextCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-sm text-gray-700">
                <span className="font-semibold">{needsTextCount}</span> Needs Text
              </span>
            </div>
          )}
          <p className="text-xs text-gray-400 ml-auto">
            Documents marked AI Ready will be included in future Project Discovery analysis.
          </p>
        </div>
      )}

      {/* Document list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Documents{" "}
            <span className="text-gray-400 font-normal ml-1">({docs.length})</span>
          </h2>
        </div>

        {docs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-500 mb-1">No documents uploaded yet.</p>
            <p className="text-xs text-gray-400">
              <Link
                href={`${yearBase}/documents/new`}
                className="text-orange-500 hover:underline"
              >
                Upload the first document
              </Link>{" "}
              to start building the claim year document library.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {docs.map((doc) => {
              const latest = (doc.document_versions ?? []).sort(
                (a, b) => b.version_number - a.version_number
              )[0];
              const isAiReady = !!doc.ai_text;

              return (
                <div key={doc.id} className="flex items-start gap-4 px-5 py-4">
                  {/* File type chip */}
                  <div className="flex-shrink-0 w-8 h-8 rounded bg-gray-100 flex items-center justify-center mt-0.5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      {latest?.file_type?.replace(".", "").slice(0, 4) ?? "?"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title + status badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <Link
                        href={`${yearBase}/documents/${doc.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-gray-600 truncate"
                      >
                        {doc.title}
                      </Link>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          DOCUMENT_STATUS_STYLES[doc.status]
                        }`}
                      >
                        {DOCUMENT_STATUS_LABELS[doc.status]}
                      </span>
                      {/* AI readiness indicator */}
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                          isAiReady
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isAiReady ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                        {isAiReady ? "AI Ready" : "Needs Text"}
                      </span>
                    </div>

                    {/* Metadata row */}
                    <p className="text-xs text-gray-400">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 mr-2">
                        {DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS] ??
                          doc.document_type}
                      </span>
                      {latest && (
                        <>
                          <span className="font-mono mr-2">{latest.file_name}</span>
                          <span className="mr-2">{formatFileSize(latest.file_size_bytes)}</span>
                        </>
                      )}
                      {new Date(doc.created_at).toLocaleDateString("en-CA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>

                    {/* Tags */}
                    {doc.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex px-1.5 py-0.5 rounded text-xs bg-gray-50 text-gray-500 border border-gray-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`${yearBase}/documents/${doc.id}`}
                      className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:bg-gray-50 transition-colors"
                    >
                      {isAiReady ? "View" : "Add Text"}
                    </Link>
                    <form action={archiveDocument}>
                      <input type="hidden" name="documentId"   value={doc.id} />
                      <input type="hidden" name="tenantId"     value={params.tenantId} />
                      <input type="hidden" name="engagementId" value={params.engagementId} />
                      <input type="hidden" name="fiscalYearId" value={params.fiscalYearId} />
                      <button
                        type="submit"
                        className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:bg-gray-50 transition-colors"
                        title="Archive this document"
                      >
                        Archive
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Back link */}
      <div className="mt-5">
        <Link
          href={yearBase}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Back to Claim Year
        </Link>
      </div>
    </div>
  );
}
