"use server";

/**
 * Phase 3B document server actions.
 *
 * SECURITY:
 *   - All actions verify agency membership via requireAgencyUser.
 *   - Triple-ownership check (fiscal_year_id + engagement_id + tenant_id) on
 *     every mutation.
 *   - Signed URLs are 60-second server-generated; no public storage access.
 *   - Files are extension-validated and filename-sanitized before storage.
 *
 * TEXT EXTRACTION:
 *   - .txt, .csv  → Buffer.toString("utf-8")
 *   - .pdf        → pdf-parse (text-layer only; scanned PDFs → ai_text = null)
 *   - .docx       → mammoth.extractRawText
 *   - all others  → ai_text = null (Bloom enters manually)
 *
 * SCOPE (Phase 3B):
 *   - No OCR, no spreadsheet extraction, no client portal, no AI analysis.
 *   - Phase 3C will add "Run Project Discovery" which reads documents.ai_text.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyUser } from "../../phase3-actions";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_DOCUMENT_TYPES,
  sanitizeFileName,
  getFileExtension,
} from "./document-constants";
import type { DocumentStatus, DocumentType } from "@/types/database";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ── Triple-ownership verification ─────────────────────────────────────────

async function verifyFYOwnership(
  fiscalYearId: string,
  engagementId: string,
  tenantId: string,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("id")
    .eq("id", fiscalYearId)
    .eq("engagement_id", engagementId)
    .eq("tenant_id", tenantId)
    .single();
  return !error && !!data;
}

// ── Text extraction ────────────────────────────────────────────────────────
// Returns extracted text or null on failure / unsupported type.
// Never throws — extraction failures are silent; Bloom fills in manually.

async function extractText(buffer: Buffer, ext: string): Promise<string | null> {
  try {
    if (ext === ".txt" || ext === ".csv") {
      const text = buffer.toString("utf-8").trim();
      return text || null;
    }

    if (ext === ".pdf") {
      // Use the internal lib path to avoid the test-file loading that happens in
      // pdf-parse's main index.js — those test files don't exist in production
      // containers (Railway) and cause a silent failure when required normally.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        b: Buffer
      ) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      const text = result.text?.trim();
      return text || null; // empty = scanned PDF → Bloom enters manually
    }

    if (ext === ".docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.trim();
      return text || null;
    }

    // .doc, .xls, .xlsx, .ppt, .pptx, .rtf, .png, .jpg, .jpeg → manual
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// uploadDocument
//
// 1. Triple-ownership check
// 2. Validate file (size, extension)
// 3. Extract text for supported types
// 4. Sanitize filename, generate IDs
// 5. Insert document row (with ai_text)
// 6. Insert version row; rollback document on failure
// 7. Upload to storage; rollback document on failure (versions cascade)
// 8. redirect() to document detail — OUTSIDE any try/catch
// ─────────────────────────────────────────────────────────────────────────

export async function uploadDocument(
  formData: FormData,
  fiscalYearId: string,
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  const owned = await verifyFYOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!owned) return { error: "Claim year not found or access denied." };

  // ── File validation ─────────────────────────────────────────────────────
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file to upload." };

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { error: `File is too large (${mb} MB). Maximum is 50 MB.` };
  }

  const ext = getFileExtension(file.name);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      error: `File type "${ext || "unknown"}" is not supported. Allowed: PDF, Word, Excel, PowerPoint, CSV, text, images.`,
    };
  }

  // ── Form fields ─────────────────────────────────────────────────────────
  const title        = (formData.get("title") as string ?? "").trim();
  const description  = (formData.get("description") as string ?? "").trim() || null;
  const documentType = (formData.get("document_type") as string ?? "").trim();
  const tagsRaw      = (formData.get("tags") as string ?? "").trim();
  const versionNotes = (formData.get("version_notes") as string ?? "").trim() || null;

  if (!title) return { error: "Document title is required." };
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType as DocumentType))
    return { error: "Invalid document type." };

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // ── Prepare file bytes + extract text ──────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  // Text extraction is best-effort — null means "Needs Text" in the UI
  const ai_text = await extractText(buffer, ext);

  // ── Storage path ────────────────────────────────────────────────────────
  const safeFileName = sanitizeFileName(file.name);
  const documentId   = randomUUID();
  const versionId    = randomUUID();
  const storagePath  = [
    "tenants", tenantId,
    "engagements", engagementId,
    "years", fiscalYearId,
    "documents", documentId,
    "versions", versionId,
    safeFileName,
  ].join("/");

  // ── Insert document row ─────────────────────────────────────────────────
  const { error: docInsertError } = await supabase
    .from("documents")
    .insert({
      id:             documentId,
      fiscal_year_id: fiscalYearId,
      engagement_id:  engagementId,
      tenant_id:      tenantId,
      title,
      description,
      ai_text,
      document_type:  documentType,
      tags,
      status:         "uploaded",
      client_visible: false,
      uploaded_by:    user.id,
    } as unknown as never);

  if (docInsertError) {
    if (docInsertError.code === "42501")
      return { error: "You do not have permission to upload documents." };
    return { error: `Failed to create document record: ${docInsertError.message}` };
  }

  // ── Insert version row ──────────────────────────────────────────────────
  const { error: versionInsertError } = await supabase
    .from("document_versions")
    .insert({
      id:              versionId,
      document_id:     documentId,
      fiscal_year_id:  fiscalYearId,
      engagement_id:   engagementId,
      tenant_id:       tenantId,
      version_number:  1,
      file_name:       safeFileName,
      file_type:       ext,
      file_size_bytes: file.size,
      storage_path:    storagePath,
      uploaded_by:     user.id,
      notes:           versionNotes,
    } as unknown as never);

  if (versionInsertError) {
    // Manual rollback — delete document (no version to cascade yet)
    await supabase.from("documents").delete().eq("id", documentId);
    return { error: `Failed to create version record: ${versionInsertError.message}` };
  }

  // ── Upload file to storage ──────────────────────────────────────────────
  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert:      false,
    });

  if (storageError) {
    // Manual rollback — delete document row (version cascades)
    await supabase.from("documents").delete().eq("id", documentId);
    return { error: `Failed to upload file: ${storageError.message}` };
  }

  // redirect() is outside any try/catch — NEXT_REDIRECT must not be caught
  redirect(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/documents/${documentId}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// updateAiText
//
// Called from the document detail page. Allows Bloom to enter or edit the
// text Claude will use during Project Discovery.
// ─────────────────────────────────────────────────────────────────────────

export async function updateAiText(formData: FormData): Promise<{ error?: string }> {
  const documentId   = formData.get("documentId") as string;
  const tenantId     = formData.get("tenantId") as string;
  const engagementId = formData.get("engagementId") as string;
  const fiscalYearId = formData.get("fiscalYearId") as string;
  const ai_text      = (formData.get("ai_text") as string ?? "").trim() || null;

  if (!documentId || !tenantId || !engagementId || !fiscalYearId)
    return { error: "Missing required context." };

  const { supabase } = await requireAgencyUser(tenantId);

  const owned = await verifyFYOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!owned) return { error: "Access denied." };

  // Verify document belongs to this fiscal year and tenant
  const { data: docRow, error: docError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId)
    .single();

  if (docError || !docRow) return { error: "Document not found or access denied." };

  const { error: updateError } = await supabase
    .from("documents")
    .update({ ai_text } as unknown as never)
    .eq("id", documentId)
    .eq("tenant_id", tenantId);

  if (updateError)
    return { error: `Failed to save AI text: ${updateError.message}` };

  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/documents/${documentId}`
  );
  return {};
}

// ─────────────────────────────────────────────────────────────────────────
// updateDocumentStatus
// ─────────────────────────────────────────────────────────────────────────

export async function updateDocumentStatus(
  documentId: string,
  status: DocumentStatus,
  tenantId: string,
  engagementId: string,
  fiscalYearId: string
): Promise<{ error?: string }> {
  const VALID: DocumentStatus[] = [
    "uploaded", "needs_review", "reviewed", "accepted", "superseded", "archived",
  ];
  if (!VALID.includes(status)) return { error: "Invalid status value." };

  const { supabase } = await requireAgencyUser(tenantId);

  const owned = await verifyFYOwnership(fiscalYearId, engagementId, tenantId, supabase);
  if (!owned) return { error: "Access denied." };

  const { error: updateError } = await supabase
    .from("documents")
    .update({ status } as unknown as never)
    .eq("id", documentId)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId);

  if (updateError) return { error: `Failed to update status: ${updateError.message}` };

  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/documents/${documentId}`
  );
  return {};
}

// ─────────────────────────────────────────────────────────────────────────
// archiveDocument
// Form action — stays on list page via revalidatePath.
// ─────────────────────────────────────────────────────────────────────────

export async function archiveDocument(formData: FormData): Promise<void> {
  const documentId   = formData.get("documentId") as string;
  const tenantId     = formData.get("tenantId") as string;
  const engagementId = formData.get("engagementId") as string;
  const fiscalYearId = formData.get("fiscalYearId") as string;

  if (!documentId || !tenantId || !engagementId || !fiscalYearId) return;

  const { supabase } = await requireAgencyUser(tenantId);

  await supabase
    .from("documents")
    .update({ status: "archived" } as unknown as never)
    .eq("id", documentId)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("tenant_id", tenantId);

  revalidatePath(
    `/agency/clients/${tenantId}/engagements/${engagementId}/years/${fiscalYearId}/documents`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// getSignedDownloadUrl
//
// Full verification chain: agency membership → document triple-ownership →
// version belongs to document. Returns a 60-second signed URL.
// Never returns a public URL.
// ─────────────────────────────────────────────────────────────────────────

export async function getSignedDownloadUrl(
  versionId: string,
  documentId: string,
  tenantId: string,
  engagementId: string,
  fiscalYearId: string
): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireAgencyUser(tenantId);

  // Verify document triple-ownership
  const { data: docRow, error: docError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("fiscal_year_id", fiscalYearId)
    .eq("engagement_id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  if (docError || !docRow)
    return { error: "Document not found or access denied." };

  // Verify version belongs to this document + tenant
  const { data: versionRow, error: versionError } = await supabase
    .from("document_versions")
    .select("storage_path")
    .eq("id", versionId)
    .eq("document_id", documentId)
    .eq("tenant_id", tenantId)
    .single();

  if (versionError || !versionRow)
    return { error: "Document version not found." };

  const storagePath = (versionRow as unknown as { storage_path: string }).storage_path;

  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 60);

  if (signError || !signed?.signedUrl)
    return { error: "Failed to generate download link. Please try again." };

  return { url: signed.signedUrl };
}
