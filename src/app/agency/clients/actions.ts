"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MembershipStatus, TenantStatus, UserRole } from "@/types/database";

// Supabase v2 TypeScript generics do not reliably resolve Database['public']['Functions']
// through the typed client's .rpc() overloads, causing the args type to collapse to
// undefined. Pattern: cast the entire .rpc() call through unknown, then re-type the
// result. This is the same escape hatch used in Phase 0 for .eq() on union columns.
type RpcResult<T> = Promise<{ data: T | null; error: { message: string; code?: string } | null }>;

function rpc<T>(
  supabase: ReturnType<typeof createClient>,
  fn: string,
  args: Record<string, unknown>
): RpcResult<T> {
  return (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => RpcResult<T>;
  }).rpc(fn, args);
}

// ── Create a new client tenant ─────────────────────────────────────────────
// Calls the create_client_tenant() SECURITY DEFINER function which atomically:
//   1. Creates the tenant row (type = client)
//   2. Creates an agency_manager membership for the calling user

export async function createClientTenant(formData: FormData) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name   = (formData.get("name") as string ?? "").trim();
  const slug   = (formData.get("slug") as string ?? "").trim();
  const status = (formData.get("status") as TenantStatus) ?? "active";

  if (!name) return { error: "Client name is required." };
  if (!slug) return { error: "Slug is required." };
  if (!/^[a-z0-9-]+$/.test(slug))
    return { error: "Slug may only contain lowercase letters, numbers, and hyphens." };

  const { data: tenantId, error } = await rpc<string>(supabase, "create_client_tenant", {
    p_name:   name,
    p_slug:   slug,
    p_status: status,
  });

  if (error) {
    if (error.message.includes("slug_taken"))
      return { error: `The slug "${slug}" is already in use. Choose a different one.` };
    if (error.message.includes("permission_denied"))
      return { error: "You do not have permission to create client tenants." };
    return { error: `Unexpected error: ${error.message}` };
  }

  redirect(`/agency/clients/${tenantId}`);
}

// ── Add a member to a tenant by email ─────────────────────────────────────
// Uses get_user_id_by_email() to resolve the auth user without the service
// role key, then inserts a membership row directly (permitted by RLS for
// agency_owner / agency_admin).
//
// Phase 1 limitation: if the email has no Supabase Auth account, the
// function returns NULL and we show a clear error with instructions.

export async function addTenantMember(formData: FormData, tenantId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email  = (formData.get("email") as string ?? "").trim().toLowerCase();
  const role   = formData.get("role") as UserRole;
  const status = (formData.get("status") as MembershipStatus) ?? "active";

  if (!email) return { error: "Email is required." };
  if (!role)  return { error: "Role is required." };

  // Resolve the auth user ID from email via SECURITY DEFINER function
  const { data: targetUserId, error: lookupError } = await rpc<string>(
    supabase,
    "get_user_id_by_email",
    { p_email: email }
  );

  if (lookupError) {
    if (lookupError.message.includes("permission_denied"))
      return { error: "You do not have permission to add members." };
    return { error: `Lookup failed: ${lookupError.message}` };
  }

  if (!targetUserId) {
    return {
      error:
        `No Bloom account found for "${email}". ` +
        `Ask them to visit the login page and click "Send magic link" — ` +
        `this creates their account. Then try adding them here again.`,
    };
  }

  // Insert the membership (RLS: is_agency_admin() required).
  // Use unknown cast — same as Phase 0's escape for Supabase v2 .insert() type collapse.
  const { error: insertError } = await supabase
    .from("tenant_memberships")
    .insert({
      tenant_id:  tenantId,
      user_id:    targetUserId as string,
      role:       role as UserRole,
      status:     status as MembershipStatus,
      created_by: user.id,
    } as unknown as never);

  if (insertError) {
    // unique_violation = membership already exists
    if (insertError.code === "23505")
      return {
        error:
          `${email} already has a membership in this tenant. ` +
          `Update their role from the member list if needed.`,
      };
    return { error: `Failed to add member: ${insertError.message}` };
  }

  return { success: true };
}
