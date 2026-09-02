"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { can, hasModule, loadAuthorizationContext, readCachedAuthorizationContext, type AuthorizationContext } from "@/lib/authorization";

export default function PermissionGate({ permission, module, allowedRoles, children }: { permission: string; module?: string; allowedRoles?: string[]; children: React.ReactNode }) {
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    const cached = readCachedAuthorizationContext();
    if (cached) {
      setContext(cached);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadAuthorizationContext()
      .then((value) => { if (active) setContext(value); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="h-48 animate-pulse rounded-3xl bg-white" />;
  if (module && !hasModule(context, module)) return <div className="rounded-3xl border border-amber-100 bg-amber-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Module not licensed</p><h1 className="mt-3 text-2xl font-bold text-amber-950">{module[0].toUpperCase() + module.slice(1)} is not included in this workspace.</h1><p className="mt-2 text-sm text-amber-800">Contact your platform administrator to add this module to the tenant license.</p></div>;
  if (allowedRoles && (!context || !allowedRoles.includes(context.role))) return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Administrator access required</p><h1 className="mt-3 text-2xl font-bold text-rose-950">Only administrators can manage people and access</h1><p className="mt-2 text-sm text-rose-800">Ask an administrator or platform super administrator to make this change.</p></div>;
  if (!can(context, permission)) return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Access restricted</p><h1 className="mt-3 text-2xl font-bold text-rose-950">You do not have access to this workspace</h1><p className="mt-2 text-sm text-rose-800">Required permission: {permission}</p></div>;
  return <>{children}</>;
}
