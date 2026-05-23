"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const supabase = createClient();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className={
        className ??
        "text-sm text-white/70 hover:text-white transition-colors"
      }
    >
      Sign out
    </button>
  );
}
