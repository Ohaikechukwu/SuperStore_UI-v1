"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Search } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type PortalTenant = { id: string; public_id: string; name: string; slug: string; active: boolean };

export default function TenantPortalDirectory() {
  const [tenants, setTenants] = useState<PortalTenant[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    void api.get<PortalTenant[]>("/api/v1/platform/tenant-portals")
      .then(setTenants)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load tenant portals."));
  }, []);

  const visible = tenants.filter((tenant) => `${tenant.name} ${tenant.slug} ${tenant.public_id}`.toLowerCase().includes(query.toLowerCase()));
  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(""), 1800);
  }

  return <DashboardShell title="Tenant portal IDs" subtitle="Recover a tenant's sign-in link without changing their workspace."><PermissionGate permission="tenant.read"><main className="mx-auto max-w-5xl space-y-6"><section className="rounded-3xl border border-teal-100 bg-teal-50 p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">Support directory</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Find a tenant&apos;s portal ID</h1><p className="mt-2 text-sm leading-6 text-slate-600">Share the generated portal login link with a tenant who has misplaced it. This is read-only and does not grant access to their workspace.</p></section>{error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}<label className="relative block max-w-md"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, slug, or portal ID" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm" /></label><section className="space-y-3">{visible.map((tenant) => { const loginUrl = `/t/${tenant.public_id}/login`; return <article key={tenant.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="font-bold text-slate-950">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{tenant.slug} · {tenant.active ? "Active" : "Suspended"}</p></div><Link href={loginUrl} className="inline-flex items-center gap-1 text-xs font-bold text-teal-700">Open login <ExternalLink size={14} /></Link></div><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Portal ID</p><div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-slate-950 px-3 py-2.5 text-sm text-teal-200">{tenant.public_id}</code><button type="button" onClick={() => void copy(tenant.public_id)} className="rounded-xl border border-slate-200 px-3 text-slate-600" aria-label="Copy portal ID"><Copy size={16} /></button></div><p className="mt-3 break-all text-xs font-semibold text-slate-600">http://localhost:3000{loginUrl}</p><button type="button" onClick={() => void copy(`http://localhost:3000${loginUrl}`)} className="mt-2 text-xs font-bold text-teal-700">{copied === `http://localhost:3000${loginUrl}` ? "Login link copied" : "Copy login link"}</button></article>; })}{!visible.length && <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">No tenant portal matches your search.</p>}</section></main></PermissionGate></DashboardShell>;
}
