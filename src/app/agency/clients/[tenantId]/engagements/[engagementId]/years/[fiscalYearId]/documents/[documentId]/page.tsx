import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";
import type { Document, DocumentVersion } from "@/types/database";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_STYLES,
  DOCUMENT_STATUS_OPTIONS,
  formatFileSize,
} from "../../document-constants";
import { DownloadButton }   from "./download-button";
import { StatusUpdateForm } from "./status-update-form";
import { AiTextForm }       from "./ai-text-form";

interface Props {
  params: {
    tenantId: string;
    engagementId: string;
    fiscalYearId: string;
    documentId: string;
  };
}

export default async function DocumentDetailPage({ params }: Props) {
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

  // Load document — triple-ownership check baked into the query
  const { data: rawDoc, error: docError } = await supabase
    .from("documents")
    .select(
      `id, title, description, document_type, tags, status, ai_text, client_visible,
       uploaded_by, created_at, updated_at,
       document_versions(id, version_number, file_name, file_type, file_size_bytes,
         storage_path, notes, created_at)`
    )
    .eq("id", params.documentId)
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("engagement_id", params.engagementId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (docError || !rawDoc) notFound();

  type DocWithVersions = Document & { document_versions: DocumentVersion[] };
  const doc      = rawDoc as unknown as DocWithVersions;
  const versions = [...doc.document_versions].sort(
    (a, b) => b.version_number - a.version_number
  );
  const latest = versions[0];

  // Breadcrumb names
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

  const { data: fyData } = await supabase
    .from("fiscal_years")
    .select("label")
    .eq("id", params.fiscalYearId)
    .eq("tenant_id", params.tenantId)
    .single();
  const fyLabel =
    (fyData as unknown as { label: string } | null)?.label ?? "Claim Year";

  const isAiReady    = !!doc.ai_text;
  const isLowQuality = isAiReady && doc.ai_text!.length < 500;
  const yearBase     = `/agency/clients/${params.tenantId}/engagements/${params.engagementId}/years/${params.fiscalYearId}`;

  return (
    <div className="px-6 sm:px-8 py-8 max-w-4xl mx-auto">
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
          {fyLabel}
        </Link>
        <span>/</span>
        <Link
          href={`${yearBase}/documents`}
          className="hover:text-gray-700 transition-colors"
        >
          Documents
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium truncate max-w-[160px]">
          {doc.title}
        </span>
      </nav>

      {/* ── Document header card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">{doc.title}</h1>
            {doc.description && (
              <p className="text-sm text-gray-400 mt-1">{doc.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold ${
                isAiReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isAiReady ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {isAiReady ? "AI Ready" : "Needs Text"}
            </span>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                DOCUMENT_STATUS_STYLES[doc.status]
              }`}
            >
              {DOCUMENT_STATUS_LABELS[doc.status]}
            </span>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Type
            </p>
            <p className="text-xs text-gray-900">
              {DOCUMENT_TYPE_LABELS[
                doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS
              ] ?? doc.document_type}
            </p>
          </div>
          {latest && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  File
                </p>
                <p className="text-xs text-gray-900 font-mono truncate">{latest.file_name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Size
                </p>
                <p className="text-xs text-gray-900">
                  {formatFileSize(latest.file_size_bytes)}
                </p>
              </div>
            </>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Uploaded
            </p>
            <p className="text-xs text-gray-900">
              {new Date(doc.created_at).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Tags */}
        {doc.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-4 flex-wrap">
            {doc.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 border border-gray-200"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Download + status controls */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4 flex-wrap">
          {latest && (
            <DownloadButton
              versionId={latest.id}
              documentId={doc.id}
              tenantId={params.tenantId}
              engagementId={params.engagementId}
              fiscalYearId={params.fiscalYearId}
              fileName={latest.file_name}
            />
          )}
          <StatusUpdateForm
            documentId={doc.id}
            currentStatus={doc.status}
            tenantId={params.tenantId}
            engagementId={params.engagementId}
            fiscalYearId={params.fiscalYearId}
            statusOptions={DOCUMENT_STATUS_OPTIONS}
          />
        </div>
      </div>

      {/* ── Extraction quality warning ────────────────────────────────────── */}
      {isLowQuality && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 mb-5 flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Short AI text — extraction may be incomplete</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This document has only {doc.ai_text!.length} characters of extracted text. For best results,
              Project Discovery needs at least 500 characters. Check the extracted text below and
              supplement it manually if important content is missing (e.g. scanned PDFs, image-heavy documents).
            </p>
          </div>
        </div>
      )}

      {/* ── AI Text card ─────────────────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5"
        style={{
          borderLeftWidth: 3,
          borderLeftColor: isAiReady ? "#03CEA4" : "#F59E0B",
        }}
      >
        <h2 className="text-sm font-semibold text-gray-900 mb-4">AI Text</h2>
        <AiTextForm
          documentId={doc.id}
          tenantId={params.tenantId}
          engagementId={params.engagementId}
          fiscalYearId={params.fiscalYearId}
          initialText={doc.ai_text}
        />
      </div>

      {/* ── Version history ───────────────────────────────────────────────── */}
      {versions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              File Versions{" "}
              <span className="text-gray-400 font-normal">({versions.length})</span>
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-4 px-5 py-3">
                <span className="text-xs font-semibold text-gray-400 w-6 flex-shrink-0">
                  v{v.version_number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-mono truncate">{v.file_name}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(v.file_size_bytes)} ·{" "}
                    {new Date(v.created_at).toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {v.notes && <> · {v.notes}</>}
                  </p>
                </div>
                <DownloadButton
                  versionId={v.id}
                  documentId={doc.id}
                  tenantId={params.tenantId}
                  engagementId={params.engagementId}
                  fiscalYearId={params.fiscalYearId}
                  fileName={v.file_name}
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4 text-sm">
        <Link
          href={`${yearBase}/documents`}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Back to Documents
        </Link>
        <Link
          href={`${yearBase}/context`}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          Context Sources →
        </Link>
      </div>
    </div>
  );
}
