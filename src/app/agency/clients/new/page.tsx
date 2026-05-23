"use client";

import { useState } from "react";
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
  const [name, setName]             = useState("");
  const [slug, setSlug]             = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [status, setStatus]         = useState<"active" | "inactive">("active");
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
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
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="px-6 sm:px-8 py-8 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
        <Link href="/agency/clients" className="hover:text-gray-700 transition-colors">
          Clients
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">New Client</span>
      </nav>

      <h1 className="text-xl font-semibold text-gray-900 mb-6">Create Client Tenant</h1>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Client organisation name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Acme Corporation"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent transition-shadow"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Slug <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-bloom-mint">
              <span className="px-3 py-2 text-sm text-gray-400 border-r border-gray-200 bg-gray-50 select-none flex-shrink-0">
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
                className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none font-mono"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Lowercase letters, numbers, and hyphens only. Auto-generated from name.
            </p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Initial status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-bloom-mint focus:border-transparent"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Active tenants are visible to their members. Inactive tenants are hidden
              from clients but visible to agency staff.
            </p>
          </div>

          {/* What will be created */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
            <p className="font-medium text-gray-700 mb-1">What this creates</p>
            <ul className="space-y-0.5 text-xs text-gray-500">
              <li>· A new client tenant with the name and slug above</li>
              <li>
                · Your membership in this tenant as{" "}
                <strong className="text-gray-700">Agency Manager</strong>
              </li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !name || !slug}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white bg-bloom-orange hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Client Tenant"}
            </button>
            <Link
              href="/agency/clients"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
