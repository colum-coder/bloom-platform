"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { TenantSwitcher } from "./tenant-switcher";
import { SignOutButton } from "./sign-out-button";
import type { MembershipWithTenant } from "@/types/database";

// ── Inline SVG icons (no external dependency) ────────────────────────────

function DashboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon,
  currentPath,
  exact = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  currentPath: string;
  exact?: boolean;
}) {
  const isActive = exact
    ? currentPath === href
    : currentPath === href || currentPath.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-white/15 text-white"
          : "text-white/60 hover:text-white hover:bg-white/10",
      ].join(" ")}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {isActive && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: "#03CEA4" }}
        />
      )}
    </Link>
  );
}

// ── Sidebar content (reused in desktop fixed panel + mobile overlay) ──────

function SidebarContent({
  email,
  memberships,
  activeTenantId,
}: {
  email: string;
  memberships: MembershipWithTenant[];
  activeTenantId: string;
}) {
  const pathname = usePathname();
  const initial = email ? email[0].toUpperCase() : "?";

  return (
    <div className="flex flex-col h-full">
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 h-16 px-5 border-b border-white/10 flex-shrink-0">
        <img src="/logo-mark.svg" alt="Bloom" className="h-7 w-auto" />
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold leading-tight">Bloom</p>
          <p className="text-white/40 text-xs leading-tight">Agency Portal</p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-xs font-semibold text-white/25 uppercase tracking-widest">
          Navigation
        </p>
        <NavItem
          href="/agency"
          label="Dashboard"
          icon={<DashboardIcon />}
          currentPath={pathname}
          exact
        />
        <NavItem
          href="/agency/clients"
          label="Clients"
          icon={<UsersIcon />}
          currentPath={pathname}
        />
      </nav>

      {/* ── Footer: tenant context + user ── */}
      <div className="border-t border-white/10 p-3 flex-shrink-0 space-y-3">
        <TenantSwitcher
          memberships={memberships}
          activeTenantId={activeTenantId}
          dropUp
        />

        {/* User row */}
        <div className="flex items-center gap-2.5 px-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            {initial}
          </div>
          <span className="text-white/50 text-xs truncate flex-1 min-w-0">{email}</span>
          <SignOutButton className="text-white/40 hover:text-white text-xs transition-colors flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

// ── AgencySidebarShell ────────────────────────────────────────────────────

interface AgencySidebarShellProps {
  email: string;
  memberships: MembershipWithTenant[];
  activeTenantId: string;
  isViewingClient: boolean;
  clientName?: string;
  children: React.ReactNode;
}

/**
 * Full-page shell for all /agency/* routes.
 * Renders a fixed dark sidebar (desktop) and a hamburger overlay (mobile),
 * plus a slim client-context banner when the active tenant is a client.
 *
 * Children are server-rendered RSC content — no serialization boundary issues.
 */
export function AgencySidebarShell({
  email,
  memberships,
  activeTenantId,
  isViewingClient,
  clientName,
  children,
}: AgencySidebarShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar — fixed */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col lg:w-64 bg-[#2B307E] z-30">
        <SidebarContent
          email={email}
          memberships={memberships}
          activeTenantId={activeTenantId}
        />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-[#2B307E] flex flex-col shadow-xl">
            <SidebarContent
              email={email}
              memberships={memberships}
              activeTenantId={activeTenantId}
            />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 bg-[#2B307E] sticky top-0 z-20 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-white/70 hover:text-white transition-colors -ml-1 p-1 rounded"
            aria-label="Open navigation"
          >
            <HamburgerIcon />
          </button>
          <img src="/logo-mark.svg" alt="Bloom" className="h-6 w-auto" />
          <span className="text-white text-sm font-semibold">Bloom Agency</span>
        </header>

        {/* Client-context banner */}
        {isViewingClient && (
          <div className="flex items-center justify-between px-5 py-2 bg-amber-50 border-b border-amber-100 flex-shrink-0">
            <p className="text-xs text-amber-700">
              <span className="font-semibold">Agency view —</span>{" "}
              viewing context for{" "}
              <span className="font-medium">{clientName}</span>
            </p>
            <Link
              href="/workspace"
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 flex-shrink-0 ml-4 transition-colors"
            >
              Open workspace ↗
            </Link>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
