// Root page — middleware handles the redirect to /agency or /workspace.
// If middleware allows through (no session), redirect to login.
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}
