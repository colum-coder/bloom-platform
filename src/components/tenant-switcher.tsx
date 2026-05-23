"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MembershipWithTenant } from "@/types/database";
import { isAgencyRole } from "@/lib/auth/permissions";

interface TenantSwitcherProps {
  memberships: MembershipWithTenant[];
  activeTenantId: string;
}

export function TenantSwitcher({ memberships, activeTenantId }: TenantSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeMembership = memberships.find((m) => m.tenant_id === activeTenantId);
  const otherMemberships = memberships.filter((m) => m.tenant_id !== activeTenantId);

  // Split others into agency vs client for grouped display
  const agencyOptions = otherMemberships.filter((m) => m.tenant.type === "agency");
  const clientOptions = otherMemberships.filter((m) => m.tenant.type === "client");

  function switchTenant(membership: MembershipWithTenant) {
    setOpen(false);
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { active_tenant_id: membership.tenant_id },
      });
      const destination = isAgencyRole(membership.role) ? "/agency" : "/workspace";
      router.push(destination);
      router.refresh();
    });
  }

  if (!activeMembership) return null;

  const isAgency = activeMembership.tenant.type === "agency";
  const dotColor = isAgency ? "#FF6A42" : "#03CEA4";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-60"
      >
        {/* Mode dot */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />

        {/* Context label */}
        <span className="truncate max-w-[180px]">
          {isAgency ? (
            <span className="opacity-80">Agency</span>
          ) : (
            <>
              <span className="opacity-60 mr-1">Client:</span>
              {activeMembership.tenant.name}
            </>
          )}
        </span>

        {/* Role chip */}
        <span className="text-xs opacity-50 hidden sm:inline">
          {activeMembership.role.replace(/_/g, " ")}
        </span>

        {otherMemberships.length > 0 && (
          <svg
            className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && otherMemberships.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-1 overflow-hidden">

            {/* Agency options */}
            {agencyOptions.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Agency
                </p>
                {agencyOptions.map((m) => (
                  <SwitcherOption key={m.tenant_id} membership={m} onSwitch={switchTenant} />
                ))}
              </>
            )}

            {/* Divider between sections */}
            {agencyOptions.length > 0 && clientOptions.length > 0 && (
              <div className="border-t border-gray-100 my-1" />
            )}

            {/* Client tenant options */}
            {clientOptions.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Client Tenants
                </p>
                {clientOptions.map((m) => (
                  <SwitcherOption key={m.tenant_id} membership={m} onSwitch={switchTenant} />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SwitcherOption({
  membership,
  onSwitch,
}: {
  membership: MembershipWithTenant;
  onSwitch: (m: MembershipWithTenant) => void;
}) {
  const isAgency = membership.tenant.type === "agency";
  return (
    <button
      onClick={() => onSwitch(membership)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left"
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: isAgency ? "#FF6A42" : "#03CEA4" }}
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{membership.tenant.name}</p>
        <p className="text-xs text-gray-400 truncate">
          {membership.role.replace(/_/g, " ")} · {isAgency ? "Agency" : "Client"}
        </p>
      </div>
    </button>
  );
}
