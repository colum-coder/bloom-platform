"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signInWithPassword } from "./actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    authError === "auth_callback_failed" ? "Authentication failed. Please try again." : null
  );
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await signInWithPassword(formData);

    // If signInWithPassword returned an error (didn't redirect), show it
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, the server action calls redirect() — no further handling needed
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  async function handleMagicLink() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Sign in</h1>

      {(magicLinkSent || resetSent) ? (
        <div className="text-center py-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: "#03CEA410" }}
          >
            <svg className="w-6 h-6" style={{ color: "#03CEA4" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">Check your email</p>
          <p className="text-sm text-gray-500 mt-1">
            {resetSent
              ? <>We sent a password reset link to <strong>{email}</strong></>
              : <>We sent a sign-in link to <strong>{email}</strong></>}
          </p>
          <button
            className="mt-4 text-sm underline text-gray-400 hover:text-gray-600"
            onClick={() => { setMagicLinkSent(false); setResetSent(false); }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bloom-blue focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bloom-blue focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#2B307E" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400">
              <span className="bg-white px-2">or</span>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleMagicLink}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Send magic link
          </button>

          <div className="text-center">
            <button
              type="button"
              disabled={loading}
              onClick={handleForgotPassword}
              className="text-sm text-gray-400 hover:text-gray-600 underline disabled:opacity-60"
            >
              Forgot or never set a password?
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="Bloom" className="h-10 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Client Delivery Platform</p>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
