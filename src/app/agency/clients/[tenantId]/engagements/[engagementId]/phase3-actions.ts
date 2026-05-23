"use server";

/**
 * Engagement-level server actions.
 *
 * Covers: fiscal year (claim year) management.
 * Per-year actions (context sources, AI runs, proposals) live in:
 *   years/[fiscalYearId]/year-actions.ts
 *
 * requireAgencyUser is exported so year-actions.ts can import it
 * without duplicating the auth logic.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole } from "@/lib/auth/permissions";

// ── Shared auth helper ────────────────────────────────────────────────────

export async function requireAgencyUser(tenantId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("role, tenant_id, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  const rows = (memberships ?? []) as Array<{
    role: string;
    tenant_id: string;
    status: string;
  }>;

  const isAgency = rows.some((m) => isAgencyRole(m.role as never));
  if (!isAgency) redirect("/unauthorized");

  return { supabase, user };
}

// ─────────────────────────────────────────────────────────────────────────
// addFiscalYear
//
// Creates a new SR&ED claim year under an engagement.
// Verifies that the engagement belongs to the correct tenant before inserting.
// ─────────────────────────────────────────────────────────────────────────

export async function addFiscalYear(
  formData: FormData,
  engagementId: string,
  tenantId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAgencyUser(tenantId);

  const label      = (formData.get("label") as string ?? "").trim();
  const start_date = (formData.get("start_date") as string ?? "").trim();
  const end_date   = (formData.get("end_date") as string ?? "").trim();
  const notes      = (formData.get("notes") as string ?? "").trim() || null;

  if (!label)      return { error: "Label is required." };
  if (!start_date) return { error: "Start date is required." };
  if (!end_date)   return { error: "End date is required." };
  if (end_date <= start_date) return { error: "End date must be after start date." };

  // Verify engagement belongs to this tenant
  const { data: eng, error: engError } = await supabase
    .from("engagements")
    .select("id")
    .eq("id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  if (engError || !eng) return { error: "Engagement not found." };

  const { error: insertError } = await supabase
    .from("fiscal_years")
    .insert({
      engagement_id: engagementId,
      tenant_id:     tenantId,
      label,
      start_date,
      end_date,
      notes,
      status:        "active",
      created_by:    user.id,
    } as unknown as never);

  if (insertError) {
    if (insertError.code === "42501")
      return { error: "You do not have permission to add claim years to this engagement." };
    return { error: `Failed to add claim year: ${insertError.message}` };
  }

  redirect(`/agency/clients/${tenantId}/engagements/${engagementId}`);
}
