"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EngagementStatus, FiscalYearStatus } from "@/types/database";

// ── createFiscalYear ──────────────────────────────────────────────────────────
//
// Creates a new fiscal year for a client tenant.
// RLS: has_agency_membership_in_tenant enforced at the DB level.

export async function createFiscalYear(formData: FormData, tenantId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const label      = (formData.get("label") as string ?? "").trim();
  const start_date = (formData.get("start_date") as string ?? "").trim();
  const end_date   = (formData.get("end_date") as string ?? "").trim();
  const status     = (formData.get("status") as FiscalYearStatus) ?? "active";
  const notesRaw   = (formData.get("notes") as string ?? "").trim();
  const notes      = notesRaw.length > 0 ? notesRaw : null;

  if (!label)      return { error: "Label is required." };
  if (!start_date) return { error: "Start date is required." };
  if (!end_date)   return { error: "End date is required." };
  if (end_date <= start_date) return { error: "End date must be after start date." };

  const { error: insertError } = await supabase
    .from("fiscal_years")
    .insert({
      tenant_id: tenantId,
      label,
      start_date,
      end_date,
      status,
      notes,
      created_by: user.id,
    } as unknown as never);

  if (insertError) {
    if (insertError.code === "42501")
      return { error: "You do not have permission to add fiscal years to this client." };
    if (insertError.message.includes("fiscal_years_dates_check"))
      return { error: "End date must be after start date." };
    return { error: `Failed to create fiscal year: ${insertError.message}` };
  }

  redirect(`/agency/clients/${tenantId}`);
}

// ── createEngagement ──────────────────────────────────────────────────────────
//
// Creates a new engagement for a client tenant.
// fiscal_year_id is nullable at the DB level; the form enforces it for SR&ED types.
// RLS: has_agency_membership_in_tenant enforced at the DB level.

export async function createEngagement(formData: FormData, tenantId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title              = (formData.get("title") as string ?? "").trim();
  const engagement_type_id = (formData.get("engagement_type_id") as string ?? "").trim();
  const fiscalRaw          = (formData.get("fiscal_year_id") as string ?? "").trim();
  const fiscal_year_id     = fiscalRaw.length > 0 ? fiscalRaw : null;
  const status             = (formData.get("status") as EngagementStatus) ?? "draft";
  const notesRaw           = (formData.get("notes") as string ?? "").trim();
  const notes              = notesRaw.length > 0 ? notesRaw : null;

  if (!title)              return { error: "Title is required." };
  if (!engagement_type_id) return { error: "Engagement type is required." };

  const { data: inserted, error: insertError } = await supabase
    .from("engagements")
    .insert({
      tenant_id: tenantId,
      engagement_type_id,
      fiscal_year_id,
      title,
      status,
      notes,
      created_by: user.id,
    } as unknown as never)
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "42501")
      return { error: "You do not have permission to create engagements for this client." };
    return { error: `Failed to create engagement: ${insertError.message}` };
  }

  const engagementId = (inserted as unknown as { id: string }).id;
  redirect(`/agency/clients/${tenantId}/engagements/${engagementId}`);
}

// ── updateEngagementStatus ────────────────────────────────────────────────────
//
// Updates the status of an existing engagement.
// RLS: has_agency_membership_in_tenant enforced at the DB level.

export async function updateEngagementStatus(
  engagementId: string,
  tenantId: string,
  newStatus: EngagementStatus
): Promise<{ error?: string; success?: boolean }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("engagements")
    .update({ status: newStatus } as unknown as never)
    .eq("id", engagementId)
    .eq("tenant_id", tenantId);

  if (error) {
    if (error.code === "42501")
      return { error: "You do not have permission to update this engagement." };
    return { error: `Failed to update status: ${error.message}` };
  }

  return { success: true };
}
