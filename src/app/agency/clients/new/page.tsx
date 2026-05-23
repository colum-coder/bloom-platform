"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClientTenant } from "../actions";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewClientTenantPage() {
  const router = useRouter();
  const [name, setName]       = useState("");
  const [slug, setSlug]       = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [status, setStatus]   = useState<"active" | "inactive">("active");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugEdited(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("slug", slug);
    formData.set("status", status);

    const result = await createClientTenant(formData);

    // createClientTenant either redirects (success) or returns { error }
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success the server action calls redirect() — no additional handling needed
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-white/40 mb-6">
        <Link href="/agency/clients" className="hover:text-white transition-colors">
          Client Tenants
        </Link>
        <span>/</span>
        <span className="text-white/70">New Client</span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-8">Create Client Tenant</h1>

      <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client name */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">
              Client organisation name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Acme Corporation"
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ "--tw-ring-color": "#03CEA4" } as React.CSSProperties}
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">
              Slug <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-0 rounded-lg border border-white/20 bg-white/10 overflow-hidden focus-within:ring-2"
                 style={{ "--tw-ring-color": "#03CEA4" } as React.CSSProperties}>
              <span className="px-3 py-2 text-sm text-white/30 border-r border-white/20 flex-shrink-0">
                /
              </span>
              <input
                type="text"
                required
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers, and hyphens only"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="acme-corporation"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none font-mono"
              />
            </div>
            <p className="mt-1 text-xs text-white/40">
              Lowercase letters, numbers, and hyphens only. Auto-generated from name.
            </p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">
              Initial status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ "--tw-ring-color": "#03CEA4" } as React.CSSProperties}
            >
              <option value="active" className="bg-[#2B307E]">Active</option>
              <option value="inactive" className="bg-[#2B307E]">Inactive</option>
            </select>
            <p className="mt-1 text-xs text-white/40">
              Active tenants are visible to their members. Inactive tenants are
              hidden from clients but visible to agency staff.
            </p>
          </div>

          {/* What will be created note */}
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
            <p className="font-medium text-white/80 mb-1">What this creates</p>
            <ul className="space-y-0.5 text-xs">
              <li>· A new client tenant with the name and slug above</li>
              <li>· Your membership in this tenant as <strong className="text-white/80">Agency Manager</strong></li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !name || !slug}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "#FF6A42" }}
            >
              {loading ? "Creating…" : "Create Client Tenant"}
            </button>
            <Link
              href="/agency/clients"
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
