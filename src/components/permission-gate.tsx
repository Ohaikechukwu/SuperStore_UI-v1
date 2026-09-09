"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { can, hasModule, loadAuthorizationContext, readCachedAuthorizationContext, type AuthorizationContext } from "@/lib/authorization";

export default function PermissionGate({ permission, module, allowedRoles, gateMessage, children }: { permission?: string; module?: string; allowedRoles?: string[]; gateMessage?: string; children: React.ReactNode }) {
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  if (loading) return <div role="status" className="h-48 animate-pulse rounded-3xl border border-slate-200 bg-white"><span className="sr-only">Checking workspace access…</span></div>;
  if (loadError && !context) return <section role="alert" className="rounded-3xl border border-amber-200 bg-amber-50 p-8"><h1 className="text-xl font-bold text-amber-950">We couldn’t verify your access</h1><p className="mt-2 text-sm leading-6 text-amber-900">Check your connection and try again. This does not necessarily mean your permissions have changed.</p><button onClick={() => { setLoading(true); setAttempt((value) => value + 1); }} className="mt-5 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-950">Try again</button></section>;
  if (module && !hasModule(context, module)) return <div className="rounded-3xl border border-amber-100 bg-amber-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Module not licensed</p><h1 className="mt-3 text-2xl font-bold text-amber-950">{module[0].toUpperCase() + module.slice(1)} is not included in this workspace.</h1><p className="mt-2 text-sm text-amber-800">Contact your platform administrator to add this module to the tenant license.</p></div>;
  // allowedRoles is deprecated: permission codes are the source of truth the
  // backend enforces (role drift here caused three owner lockouts). The prop
  // survives solely for the platform control-plane pages whose APIs are
  // genuinely role-gated; a lint rule blocks new uses.
  if (allowedRoles && (!context || !allowedRoles.includes(context.role))) return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Administrator access required</p><h1 className="mt-3 text-2xl font-bold text-rose-950">{gateMessage || "Only administrators can open this page"}</h1><p className="mt-2 text-sm text-rose-800">Ask an administrator to make this change.</p></div>;
  if (permission && !can(context, permission)) return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Access restricted</p><h1 className="mt-3 text-2xl font-bold text-rose-950">{gateMessage || "You do not have access to this workspace"}</h1><p className="mt-2 text-sm text-rose-800">Required permission: {permission}</p></div>;
  return <>{children}</>;
}
