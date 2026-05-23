import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Temporary debug endpoint — remove before Phase 1
// BUILD_TIME lets us verify Railway deployed the latest code.
const BUILD_TIME = new Date().toISOString();

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  const { data: memberships } = user
    ? await supabase
        .from("tenant_memberships")
        .select("role, status, tenant_id")
        .eq("user_id", user.id)
        .eq("status", "active")
    : { data: null };

  return NextResponse.json({
    buildTime: BUILD_TIME,
    user: user ? { id: user.id, email: user.email } : null,
    memberships: memberships ?? [],
    error: error?.message ?? null,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "NOT SET",
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
