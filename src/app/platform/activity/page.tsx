"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
import type { AuthorizationContext } from "@/lib/authorization";

type Tenant = { id: string; name: string };
type AuditEvent = { id: string; tenant_id: string; action: string; entity_type: string; entity_id: string; actor_id: string | null; reason: string | null; created_at: string };

export default function PlatformActivityPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => { try { const context = await api.get<AuthorizationContext>("/api/v1/auth/me/authorization"); if (context.role !== "platform_super_admin" || !context.is_global_role) return; setAllowed(true); const [tenantRows, eventRows] = await Promise.all([api.get<Tenant[]>("/api/v1/platform/tenants"), api.get<AuditEvent[]>("/api/v1/platform/audit")]); setTenants(tenantRows); setEvents(eventRows); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load platform activity."); } })(); }, []);
  return <DashboardShell title="Platform activity" subtitle="Auditable cross-tenant governance, licensing, and operational changes."><PermissionGate permission="tenant.read"><div className="mx-auto max-w-[1200px] space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Governance</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Platform activity</h1></div>{error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{allowed && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Audit trail</p><div className="mt-4 divide-y divide-slate-100">{events.map((event) => <article key={event.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold text-slate-800">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{event.entity_type} · {tenants.find((tenant) => tenant.id === event.tenant_id)?.name || event.tenant_id} · {event.entity_id}</p>{event.reason && <p className="mt-2 text-xs text-slate-500">Reason: {event.reason}</p>}</div><p className="text-xs text-slate-400">{new Date(event.created_at).toLocaleString()} · {event.actor_id || "System"}</p></article>)}{!events.length && <p className="py-8 text-center text-sm text-slate-500">No platform activity recorded.</p>}</div></section>}</div></PermissionGate></DashboardShell>;
}
