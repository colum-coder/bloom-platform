/**
 * Shared constants for Phase 3B document upload.
 * No "use server" — safe to import on both server and client.
 */

import type { DocumentType, DocumentStatus } from "@/types/database";

// ── Allowed file extensions ────────────────────────────────────────────────
// Reject unsupported types with a clear error at the server action level.

export const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx",
  ".xls", ".xlsx", ".csv",
  ".ppt", ".pptx",
  ".txt", ".rtf",
  ".png", ".jpg", ".jpeg",
]);

// ── Document types ─────────────────────────────────────────────────────────

export const DOCUMENT_TYPE_OPTIONS: Array<{ value: DocumentType; label: string }> = [
  { value: "prior_claim",         label: "Prior SR&ED Claim" },
  { value: "technical_narrative", label: "Technical Narrative" },
  { value: "meeting_notes",       label: "Meeting Notes" },
  { value: "project_discussion",  label: "Project Discussion" },
  { value: "staff_note",          label: "Staff Note" },
  { value: "client_background",   label: "Client Background" },
  { value: "technical_document",  label: "Technical Document" },
  { value: "financial_summary",   label: "Financial Summary" },
  { value: "payroll_export",      label: "Payroll Export" },
  { value: "timesheet",           label: "Timesheet" },
  { value: "contractor_invoice",  label: "Contractor Invoice" },
  { value: "material_invoice",    label: "Material Invoice" },
  { value: "email_thread",        label: "Email Thread" },
  { value: "cra_review_context",  label: "CRA Review Context" },
  { value: "other",               label: "Other" },
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = Object.fromEntries(
  DOCUMENT_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<DocumentType, string>;

export const ALLOWED_DOCUMENT_TYPES = DOCUMENT_TYPE_OPTIONS.map((o) => o.value);

// ── Document statuses ──────────────────────────────────────────────────────

export const DOCUMENT_STATUS_OPTIONS: Array<{ value: DocumentStatus; label: string }> = [
  { value: "uploaded",     label: "Uploaded" },
  { value: "needs_review", label: "Needs Review" },
  { value: "reviewed",     label: "Reviewed" },
  { value: "accepted",     label: "Accepted" },
  { value: "superseded",   label: "Superseded" },
  { value: "archived",     label: "Archived" },
];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = Object.fromEntries(
  DOCUMENT_STATUS_OPTIONS.map((o) => [o.value, o.label])
) as Record<DocumentStatus, string>;

export const DOCUMENT_STATUS_STYLES: Record<DocumentStatus, string> = {
  uploaded:     "bg-blue-50 text-blue-700",
  needs_review: "bg-amber-50 text-amber-700",
  reviewed:     "bg-violet-50 text-violet-700",
  accepted:     "bg-emerald-50 text-emerald-700",
  superseded:   "bg-gray-100 text-gray-500",
  archived:     "bg-gray-100 text-gray-400",
};

// ── Context source type mapping from document type ─────────────────────────
// When pre-filling the context source type from a document type,
// this map provides the closest equivalent. Used in the upload form
// and on the document detail page.

export const DOCUMENT_TYPE_TO_SOURCE_TYPE: Record<DocumentType, string> = {
  prior_claim:         "prior_claim",
  technical_narrative: "technical_narrative",
  meeting_notes:       "meeting_notes",
  project_discussion:  "project_discussion",
  staff_note:          "staff_note",
  client_background:   "client_background",
  technical_document:  "technical_document_summary",
  financial_summary:   "financial_summary",
  payroll_export:      "payroll_export",
  timesheet:           "other",
  contractor_invoice:  "contractor_invoice",
  material_invoice:    "other",
  email_thread:        "email_thread",
  cra_review_context:  "cra_review_context",
  other:               "other",
};

// ── File size formatter ────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File extension helper ──────────────────────────────────────────────────

export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) return "";
  return fileName.slice(lastDot).toLowerCase();
}

// ── Filename sanitizer ─────────────────────────────────────────────────────
// Removes unsafe characters and path traversal sequences.
// Preserves the extension. Relies on document_id/version_id for uniqueness
// in the storage path — the filename is just for human readability.

export function sanitizeFileName(originalName: string): string {
  const lastDot = originalName.lastIndexOf(".");
  const ext  = lastDot > 0 ? originalName.slice(lastDot).toLowerCase() : "";
  const base = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;

  const safeBase = base
    .replace(/[/\\:*?"<>|]/g, "")   // remove path-unsafe chars
    .replace(/\.\./g, "")            // remove path traversal sequences
    .replace(/[^\w\s-]/g, "")        // keep word chars, whitespace, hyphen
    .replace(/\s+/g, "_")            // spaces → underscores
    .replace(/_{2,}/g, "_")          // collapse consecutive underscores
    .replace(/^_+|_+$/g, "")         // trim leading/trailing underscores
    .slice(0, 80);                   // limit base name length

  return `${safeBase || "document"}${ext}`;
}
