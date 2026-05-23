"use client";

import { useState } from "react";
import { addTenantMember } from "../actions";
import type { UserRole } from "@/types/database";

const CLIENT_ROLES: Array<{ value: UserRole; label: string }> = [
  { value: "client_owner",       label: "Client Owner" },
  { value: "client_admin",       label: "Client Admin" },
  { value: "client_contributor", label: "Client Contributor" },
  { value: "client_finance",     label: "Client Finance" },
  { value: "client_reviewer",    label: "Client Reviewer" },
];

const AGENCY_ROLES: Array<{ value: UserRole; label: string }> = [
  { value: "agency_manager",    label: "Agency Manager" },
  { value: "agency_consultant", label: "Agency Consultant" },
  { value: "agency_reviewer",   label: "Agency Reviewer" },
];

interface AddMemberFormProps {
  tenantId: string;
  onSuccess?: () => void;
}

export function AddMemberForm({ tenantId }: AddMemberFormProps) {
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState<UserRole>("client_contributor");
  const [status, setStatus]   = useState<"active" | "invited">("active");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("role", role);
    formData.set("status", status);

    const result = await addTenantMember(formData, tenantId);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(`${email} has been added. Refresh the page to see them in the member list.`);
      setEmail("");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div className="grid sm:grid-cols-[1fr_180px_140px_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-lg border border-white/20 bg-[#2B307E] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2"
          >
            <optgroup label="Client Roles">
              {CLIENT_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </optgroup>
            <optgroup label="Bloom Staff">
              {AGENCY_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "invited")}
            className="w-full rounded-lg border border-white/20 bg-[#2B307E] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2"
          >
            <option value="active">Active</option>
            <option value="invited">Invited</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !email}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-80 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#03CEA4" }}
        >
          {loading ? "Adding…" : "Add"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-300 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-300 bg-green-500/10 rounded-lg px-3 py-2 border border-green-500/20">
          ✓ {success}
        </p>
      )}

      <p className="text-xs text-white/30">
        <strong className="text-white/50">Note:</strong> The user must already have a Bloom account.
        If they don&apos;t, ask them to visit the login page and click{" "}
        <em>Send magic link</em> — this creates their account. Then add them here.
      </p>
    </form>
  );
}
