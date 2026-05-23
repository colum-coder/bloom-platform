import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Temporary debug endpoint — remove before Phase 1
export async function GET() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    error: error?.message ?? null,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "NOT SET",
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
