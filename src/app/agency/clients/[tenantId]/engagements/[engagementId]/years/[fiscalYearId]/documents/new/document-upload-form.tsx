"use client";

import { useRef, useState, useTransition } from "react";
import { uploadDocument } from "../../document-actions";
import {
  DOCUMENT_TYPE_OPTIONS,
  ALLOWED_EXTENSIONS,
  formatFileSize,
  getFileExtension,
} from "../../document-constants";

// File types where automatic text extraction succeeds
const AUTO_EXTRACT_TYPES = new Set([".txt", ".csv", ".pdf", ".docx"]);

interface Props {
  fiscalYearId: string;
  engagementId: string;
  tenantId: string;
  cancelHref: string;
}

export function DocumentUploadForm({
  fiscalYearId,
  engagementId,
  tenantId,
  cancelHref,
}: Props) {
  const formRef    = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error,     setError]        = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError,    setFileError]    = useState<string | null>(null);
  const [docTitle,     setDocTitle]     = useState("");
  const [documentType, setDocumentType] = useState("other");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setFileError(null);

    if (!file) return;

    const ext = getFileExtension(file.name);
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      setFileError(
        `"${ext || "unknown"}" is not a supported file type. Allowed: PDF, Word, Excel, PowerPoint, CSV, text, RTF, PNG, JPG.`
      );
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setFileError(
        `File is too large (${formatFileSize(file.size)}). Maximum is 50 MB.`
      );
      return;
    }

    // Pre-fill title from filename
    if (!docTitle) {
      const base =
        file.name.lastIndexOf(".") > 0
          ? file.name.slice(0, file.name.lastIndexOf("."))
          : file.name;
      setDocTitle(
        base
          .replace(/[_-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (fileError)    return;
    if (!selectedFile) { setError("Please select a file."); return; }
    if (!docTitle.trim()) { setError("Document title is required."); return; }

    const formData = new FormData(formRef.current!);
    startTransition(async () => {
      const result = await uploadDocument(formData, fiscalYearId, engagementId, tenantId);
      if (result?.error) setError(result.error);
    });
  }

  const willAutoExtract =
    selectedFile && AUTO_EXTRACT_TYPES.has(getFileExtension(selectedFile.name));

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── File ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">File</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Select file <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            name="file"
            required
            onChange={handleFileChange}
            accept={Array.from(ALLOWED_EXTENSIONS).join(",")}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0
              file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700
              hover:file:bg-gray-200 transition-colors"
          />
          {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
          {selectedFile && !fileError && (
            <p className="mt-1 text-xs text-gray-400">
              {selectedFile.name} · {formatFileSize(selectedFile.size)}
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-400">
            PDF, Word, Excel, PowerPoint, CSV, text, RTF, PNG, JPG. Max 50 MB.
          </p>
        </div>

        {/* AI extraction notice */}
        {selectedFile && !fileError && (
          <div
            className={`rounded-lg border px-3 py-2.5 text-xs ${
              willAutoExtract
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}
          >
            {willAutoExtract ? (
              <>
                <span className="font-semibold">Text will be extracted automatically</span>{" "}
                from this file type. You can review and edit the extracted text after uploading.
              </>
            ) : (
              <>
                <span className="font-semibold">This file type requires manual text entry.</span>{" "}
                After uploading, open the document and paste a summary or relevant excerpt so the AI can read it.
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Version notes{" "}
            <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            name="version_notes"
            placeholder="e.g. Initial upload, updated Q3 payroll"
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {/* ── Document details ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Document Details</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            required
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="e.g. Q3 2024 Payroll Export"
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Document type <span className="text-red-500">*</span>
          </label>
          <select
            name="document_type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900
              focus:border-gray-400 focus:outline-none focus:ring-0"
          >
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Description{" "}
            <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            name="description"
            rows={2}
            placeholder="Brief description of what this document contains"
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Tags{" "}
            <span className="text-gray-400">(optional, comma-separated)</span>
          </label>
          <input
            type="text"
            name="tags"
            placeholder="e.g. software, Q3, payroll"
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900
              placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {/* ── Note about AI text ────────────────────────────────────────────── */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">About AI Text:</span>{" "}
        This is the text Claude will use when analyzing this claim year. Uploading a file alone does not guarantee the AI can read it — you can review and edit the AI text on the document page after upload.
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 justify-end">
        <a
          href={cancelHref}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending || !!fileError || !selectedFile}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#FF6A42" }}
        >
          {isPending ? "Uploading…" : "Upload Document"}
        </button>
      </div>
    </form>
  );
}
