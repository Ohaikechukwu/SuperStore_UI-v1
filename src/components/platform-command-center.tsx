"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, Building2, Check, ChevronRight,
  CirclePlus, CreditCard, KeyRound, PackageCheck, Power, Search, ShieldCheck, X,
} from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import FormSelect from "@/components/form-select";
import PermissionGate from "@/components/permission-gate";
import { platformConsolePath } from "@/auth";
import { api, ApiError } from "@/lib/api";
import type { AuthorizationContext } from "@/lib/authorization";

const modules = ["store", "inventory", "stock", "accounting", "hospital", "pharmacy", "laboratory"] as const;
type Module = typeof modules[number];
type OperatingMode = "online" | "offline" | "hybrid";
type Tenant = { id: string; public_id: string; name: string; slug: string; currency: string; active: boolean; brand_name: string; owner_email: string | null; cash_point_limit: number; license_plan_id: string | null; license_plan_name: string | null; license_plan_expires_at: string | null; licensed_modules: Module[]; operating_mode: OperatingMode; active_store_node_count: number; healthy_store_node_count: number; offline_setup_status: "not_required" | "setup_required" | "awaiting_connection" | "bootstrap_required" | "synchronizing" | "backup_required" | "restore_verification_required" | "approval_required" | "ready" };
type Plan = { id: string; name: string; company_limit: number; cash_point_limit: number; modules: Module[]; active: boolean };
type Member = { user_id: string; full_name: string; email: string; role: string; active: boolean; licensed_modules: Module[]; system_license: { company_limit: number; expires_at: string; active: boolean } | null };
type Panel = "overview" | "subscription" | "deployment" | "access";
type PortalTenant = { id: string; public_id: string; name: string; slug: string; active: boolean };

function PortalRecoveryDirectory({ tenants }: { tenants: PortalTenant[] }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">Tenant portal recovery</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Find a tenant&apos;s portal ID</h1><p className="mt-2 text-sm text-slate-500">Give the tenant their full sign-in address. This view is read-only for platform administrators.</p><div className="mt-6 space-y-3">{tenants.map((tenant) => <article key={tenant.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-900">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{tenant.slug} · {tenant.active ? "Active" : "Suspended"}</p></div><Link href={`/t/${tenant.public_id}/login`} className="text-xs font-bold text-teal-700">Open login page</Link></div><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Portal ID</p><code className="mt-1 block overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 text-sm text-teal-200">{tenant.public_id}</code><p className="mt-3 break-all text-xs font-semibold text-slate-600">http://localhost:3000/t/{tenant.public_id}/login</p></article>)}{!tenants.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No tenant portals found.</p>}</div></section>;
}

function isExpiring(tenant: Tenant) {
  if (!tenant.license_plan_expires_at) return false;
  const days = new Date(tenant.license_plan_expires_at).getTime() - Date.now();
  return days >= 0 && days < 30 * 24 * 60 * 60 * 1000;
}

export default function PlatformCommandCenter() {
  const [authorization, setAuthorization] = useState<AuthorizationContext | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [portalTenants, setPortalTenants] = useState<PortalTenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [panel, setPanel] = useState<Panel>("overview");
  const [members, setMembers] = useState<Member[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "active">("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const allowed = authorization?.role === "platform_super_admin" && authorization.is_global_role;
  const canRecoverPortal = allowed || authorization?.role === "platform_admin";
  const activePlans = plans.filter((plan) => plan.active && plan.company_limit > 0);
  const attention = tenants.filter((tenant) => !tenant.active || !tenant.license_plan_id || isExpiring(tenant));
  const displayed = useMemo(() => tenants.filter((tenant) => {
    const search = `${tenant.name} ${tenant.slug} ${tenant.owner_email || ""}`.toLowerCase();
    const matchesQuery = search.includes(query.trim().toLowerCase());
    const matchesFilter = filter === "all" || filter === "active" && tenant.active || filter === "attention" && attention.some((item) => item.id === tenant.id);
    return matchesQuery && matchesFilter;
  }), [attention, filter, query, tenants]);

  const load = useCallback(async () => {
    try {
      setError("");
      const context = await api.get<AuthorizationContext>("/api/v1/auth/me/authorization");
      setAuthorization(context);
      if (context.role === "platform_admin") {
        setPortalTenants(await api.get<PortalTenant[]>("/api/v1/platform/tenant-portals"));
        return;
      }
      if (context.role !== "platform_super_admin" || !context.is_global_role) return;
      const [tenantRows, planRows] = await Promise.all([
        api.get<Tenant[]>("/api/v1/platform/tenants"),
        api.get<Plan[]>("/api/v1/platform/license-plans"),
      ]);
      setTenants(tenantRows); setPlans(planRows);
      setSelected((current) => current ? tenantRows.find((tenant) => tenant.id === current.id) || null : null);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load the command centre."); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function openTenant(tenant: Tenant, nextPanel: Panel = "overview") {
    setSelected(tenant); setPanel(nextPanel); setMembers([]);
    if (nextPanel === "access") await loadMembers(tenant);
  }

  async function loadMembers(tenant = selected) {
    if (!tenant) return;
    try { setMembers(await api.get<Member[]>(`/api/v1/platform/tenants/${tenant.id}/members`)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load tenant access."); }
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const operating_mode = String(form.get("operating_mode")) as OperatingMode;
      const created = await api.post<Tenant>("/api/v1/platform/tenants", { tenant_name: String(form.get("tenant_name")), tenant_slug: String(form.get("tenant_slug") || "") || null, currency: String(form.get("currency")), owner_full_name: String(form.get("owner_full_name")), owner_email: String(form.get("owner_email")), owner_password: String(form.get("owner_password")), license_plan_id: String(form.get("license_plan_id")), operating_mode });
      setCreateOpen(false); setNotice(created.offline_setup_status === "setup_required" ? "Tenant created. Enrol its local store node before offline operation." : "Tenant created and ready for cloud onboarding."); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to create tenant."); }
  }

  async function assignPlan(tenant: Tenant, planId: string) {
    try { await api.patch(`/api/v1/platform/tenants/${tenant.id}/subscription-plan`, { license_plan_id: planId }); setNotice(`${tenant.name}'s subscription was updated.`); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update the subscription."); }
  }

  async function toggleTenant(tenant: Tenant) {
    try { await api.patch(`/api/v1/platform/tenants/${tenant.id}/status`, { active: !tenant.active }); setNotice(`${tenant.name} is now ${tenant.active ? "suspended" : "active"}.`); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update tenant status."); }
  }

  async function updateOperatingMode(tenant: Tenant, operating_mode: OperatingMode) {
    try {
      const updated = await api.patch<Pick<Tenant, "operating_mode" | "offline_setup_status" | "active_store_node_count" | "healthy_store_node_count">>(`/api/v1/platform/tenants/${tenant.id}/operating-mode`, { operating_mode });
      const message = updated.offline_setup_status === "setup_required"
        ? `${tenant.name} is set to ${operating_mode}. Enrol a local store node before offline operation.`
        : updated.offline_setup_status === "awaiting_connection"
          ? `${tenant.name} is set to ${operating_mode}. The enrolled node must complete a healthy heartbeat before go-live.`
          : `${tenant.name} is now configured for ${operating_mode} operation.`;
      setNotice(message); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update the tenant deployment mode."); }
  }

  async function toggleModule(tenant: Tenant, module: Module) {
    const licensed_modules = tenant.licensed_modules.includes(module) ? tenant.licensed_modules.filter((item) => item !== module) : [...tenant.licensed_modules, module];
    try { await api.patch(`/api/v1/platform/tenants/${tenant.id}/license`, { licensed_modules }); setNotice(`${module} licensing updated for ${tenant.name}.`); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update module licensing."); }
  }

  async function toggleMemberModule(member: Member, module: Module) {
    if (!selected) return;
    const licensed_modules = member.licensed_modules.includes(module) ? member.licensed_modules.filter((item) => item !== module) : [...member.licensed_modules, module];
    try { await api.patch(`/api/v1/platform/tenants/${selected.id}/members/${member.user_id}/modules`, { licensed_modules }); setMembers((current) => current.map((item) => item.user_id === member.user_id ? { ...item, licensed_modules } : item)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update member access."); }
  }

  async function saveSystemLicense(member: Member, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const company_limit = Number(new FormData(event.currentTarget).get("company_limit"));
    try { await api.put(`/api/v1/platform/users/${member.user_id}/system-license`, { company_limit }); setNotice(`System license updated for ${member.full_name}.`); await loadMembers(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update the system license."); }
  }

  return <DashboardShell title="Command centre" subtitle="Tenant lifecycle, licensing, access and support—organized around the next decision."><PermissionGate permission="tenant.read"><main className="mx-auto max-w-[1360px] space-y-6">
    {!allowed && canRecoverPortal ? <PortalRecoveryDirectory tenants={portalTenants} /> : !allowed && authorization ? <NotFound /> : <>
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl shadow-slate-950/10 sm:p-9"><div className="relative z-10 flex flex-col justify-between gap-7 lg:flex-row lg:items-end"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-300">Platform operations</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Run the tenant network with less noise.</h1><p className="mt-3 text-sm leading-6 text-slate-300">Start with exceptions, then open one workspace to adjust its plan, modules, access, or lifecycle status.</p></div><div className="flex flex-wrap gap-3"><Link href={platformConsolePath()} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">Tenant dashboard</Link><button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950"><CirclePlus size={17} /> New tenant</button></div></div><div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" /></section>
      {error && <Banner tone="error" text={error} />}{notice && <Banner tone="success" text={notice} />}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Building2 size={19} />} label="All tenants" value={String(tenants.length)} detail="Registered workspaces" /><Metric icon={<BadgeCheck size={19} />} label="Operating normally" value={String(tenants.filter((tenant) => tenant.active && tenant.license_plan_id && !isExpiring(tenant)).length)} detail="Active and current" tone="teal" /><Metric icon={<AlertTriangle size={19} />} label="Needs review" value={String(attention.length)} detail="Lifecycle or subscription action" tone="amber" /><Metric icon={<CreditCard size={19} />} label="Published plans" value={String(activePlans.length)} detail="Available for assignment" tone="indigo" /></section>
      <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><AttentionQueue tenants={attention} openTenant={openTenant} /><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">Control path</p><h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">One tenant, one focused workspace.</h2><div className="mt-5 grid gap-3 sm:grid-cols-3"><QuickStep icon={<CreditCard size={18} />} title="Subscription" text="Set plan and terminal capacity" /><QuickStep icon={<PackageCheck size={18} />} title="Modules" text="License only what is needed" /><QuickStep icon={<KeyRound size={18} />} title="Access" text="Grant member entitlements" /></div><p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">Use the tenant directory below to open the relevant control panel. Settings stay hidden until a tenant is selected.</p></section></section>
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">Tenant directory</p><h2 className="mt-2 text-xl font-bold text-slate-950">Find a workspace, then act with context.</h2></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tenant, slug, or owner" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-500 sm:w-64" /></label><div className="flex rounded-xl bg-slate-100 p-1">{(["all", "attention", "active"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${filter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{value}</button>)}</div></div></div><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-6 py-3">Tenant</th><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Health</th><th className="px-4 py-3">Modules</th><th className="px-6 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{displayed.map((tenant) => <tr key={tenant.id} className="hover:bg-slate-50/80"><td className="px-6 py-4"><p className="font-bold text-slate-900">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{tenant.slug} · {tenant.owner_email || "No owner assigned"}</p></td><td className="px-4 py-4"><p className="font-semibold text-slate-700">{tenant.license_plan_name || "No plan assigned"}</p><p className="mt-1 text-xs text-slate-500">{tenant.cash_point_limit} POS terminal{tenant.cash_point_limit === 1 ? "" : "s"}</p></td><td className="px-4 py-4"><Health tenant={tenant} /></td><td className="px-4 py-4"><p className="max-w-44 truncate text-xs font-semibold capitalize text-slate-600">{tenant.licensed_modules.join(" · ") || "No modules"}</p></td><td className="px-6 py-4 text-right"><button onClick={() => void openTenant(tenant)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-teal-700 hover:border-teal-200 hover:bg-teal-50">Manage <ChevronRight size={15} /></button></td></tr>)}{!displayed.length && <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">No tenants match this view.</td></tr>}</tbody></table></div></section>
    </>}
    {createOpen && <CreateTenant plans={activePlans} close={() => setCreateOpen(false)} submit={createTenant} />}
    {selected && <TenantPanel tenant={selected} panel={panel} setPanel={async (next) => { setPanel(next); if (next === "access") await loadMembers(selected); }} close={() => setSelected(null)} plans={activePlans} members={members} assignPlan={assignPlan} updateOperatingMode={updateOperatingMode} toggleTenant={toggleTenant} toggleModule={toggleModule} toggleMemberModule={toggleMemberModule} saveSystemLicense={saveSystemLicense} />}
  </main></PermissionGate></DashboardShell>;
}

function AttentionQueue({ tenants, openTenant }: { tenants: Tenant[]; openTenant: (tenant: Tenant, panel?: Panel) => Promise<void> }) { return <section className="rounded-3xl border border-amber-100 bg-amber-50 p-6 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-amber-700">Attention queue</p><h2 className="mt-2 text-xl font-bold text-slate-950">Resolve the next important thing.</h2></div><span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-700"><AlertTriangle size={19} /></span></div><div className="mt-5 space-y-3">{tenants.slice(0, 4).map((tenant) => <button key={tenant.id} onClick={() => void openTenant(tenant, !tenant.license_plan_id || isExpiring(tenant) ? "subscription" : "overview")} className="flex w-full items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 text-left transition hover:ring-2 hover:ring-amber-200"><div><p className="font-bold text-slate-900">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{!tenant.active ? "Suspended workspace" : !tenant.license_plan_id ? "Subscription plan needed" : "Subscription expires within 30 days"}</p></div><ChevronRight className="shrink-0 text-amber-700" size={18} /></button>)}{!tenants.length && <div className="rounded-2xl bg-white px-4 py-7 text-center text-sm text-emerald-700"><Check size={19} className="mx-auto mb-2" />No tenant actions need attention.</div>}</div></section>; }
function Metric({ icon, label, value, detail, tone = "slate" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: "slate" | "teal" | "amber" | "indigo" }) { const colors = { slate: "border-slate-200 bg-white", teal: "border-teal-100 bg-teal-50", amber: "border-amber-100 bg-amber-50", indigo: "border-indigo-100 bg-indigo-50" }; return <article className={`rounded-2xl border p-5 ${colors[tone]}`}><div className="flex items-center justify-between text-teal-700"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/70">{icon}</span><span className="text-3xl font-bold text-slate-950">{value}</span></div><p className="mt-4 text-sm font-bold text-slate-800">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>; }
function QuickStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><span className="text-teal-700">{icon}</span><p className="mt-3 text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>; }
function Health({ tenant }: { tenant: Tenant }) { const label = !tenant.active ? "Suspended" : !tenant.license_plan_id ? "Plan needed" : isExpiring(tenant) ? "Expiring soon" : "Healthy"; const colors = !tenant.active ? "bg-rose-50 text-rose-700" : !tenant.license_plan_id || isExpiring(tenant) ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"; return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>{label}</span>; }
function Banner({ tone, text }: { tone: "error" | "success"; text: string }) { return <p className={`rounded-2xl border px-4 py-3 text-sm ${tone === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{text}</p>; }
function NotFound() { return <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm"><p className="text-5xl font-bold text-slate-900">404</p><h1 className="mt-3 text-xl font-bold">Page not found</h1></div>; }

function CreateTenant({ plans, close, submit }: { plans: Plan[]; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><form onSubmit={(event) => void submit(event)} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">Provision workspace</p><h2 className="mt-2 text-2xl font-bold">Create a new tenant</h2><p className="mt-2 text-sm text-slate-500">Give the owner access, select a plan, then choose how the company will operate.</p></div><button type="button" onClick={close} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Input name="tenant_name" label="Tenant name" required /><Input name="tenant_slug" label="Workspace slug" /><Input name="currency" label="Currency" defaultValue="NGN" required /><Input name="owner_full_name" label="Owner name" required /><Input name="owner_email" label="Owner email" type="email" required /><Input name="owner_password" label="Temporary password" type="password" required /></div><label className="mt-4 block text-xs font-bold text-slate-600">Company plan<FormSelect required name="license_plan_id" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Select a published plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.cash_point_limit} POS</option>)}</FormSelect></label><label className="mt-4 block text-xs font-bold text-slate-600">Operating mode<FormSelect name="operating_mode" defaultValue="online" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="online">Online only — cloud workspace</option><option value="offline">Offline only — local store node required</option><option value="hybrid">Both — cloud plus local store node</option></FormSelect><span className="mt-1 block font-normal leading-5 text-slate-500">Offline and hybrid tenants are created with a node-provisioning task. Their cloud identity and data remain the same.</span></label>{!plans.length && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Create a published company plan before provisioning a tenant.</p>}<button disabled={!plans.length} className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Create tenant</button></form></div>; }
function Input({ name, label, type = "text", defaultValue = "", required = false }: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) { return <label className="text-xs font-bold text-slate-600">{label}<input name={name} type={type} defaultValue={defaultValue} required={required} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>; }

function TenantPanel({ tenant, panel, setPanel, close, plans, members, assignPlan, updateOperatingMode, toggleTenant, toggleModule, toggleMemberModule, saveSystemLicense }: { tenant: Tenant; panel: Panel; setPanel: (panel: Panel) => Promise<void>; close: () => void; plans: Plan[]; members: Member[]; assignPlan: (tenant: Tenant, planId: string) => Promise<void>; updateOperatingMode: (tenant: Tenant, mode: OperatingMode) => Promise<void>; toggleTenant: (tenant: Tenant) => Promise<void>; toggleModule: (tenant: Tenant, module: Module) => Promise<void>; toggleMemberModule: (member: Member, module: Module) => Promise<void>; saveSystemLicense: (member: Member, event: FormEvent<HTMLFormElement>) => Promise<void> }) { return <div className="fixed inset-0 z-50 bg-slate-950/45"><aside className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"><header className="border-b border-slate-100 px-6 py-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">Tenant workspace</p><h2 className="mt-2 text-2xl font-bold text-slate-950">{tenant.name}</h2><p className="mt-1 text-sm text-slate-500">{tenant.slug} · {tenant.owner_email || "No owner assigned"}</p></div><button onClick={close} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div><div className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">{(["overview", "subscription", "deployment", "access"] as Panel[]).map((item) => <button key={item} onClick={() => void setPanel(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold capitalize ${panel === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{item === "access" ? "Access & support" : item}</button>)}</div></header><div className="flex-1 overflow-y-auto p-6">{panel === "overview" && <><section className="grid gap-3 sm:grid-cols-2"><Info label="Status" value={tenant.active ? "Active" : "Suspended"} /><Info label="Subscription" value={tenant.license_plan_name || "Not assigned"} /><Info label="POS capacity" value={`${tenant.cash_point_limit} terminal${tenant.cash_point_limit === 1 ? "" : "s"}`} /><Info label="Brand" value={tenant.brand_name || tenant.name} /></section><section className="mt-6 rounded-2xl border border-slate-200 p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Support actions</p><div className="mt-4 flex flex-wrap gap-3"><Link href={`/t/${tenant.public_id}/`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Open workspace <ArrowUpRight size={16} /></Link><button onClick={() => void toggleTenant(tenant)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">{tenant.active ? <Power size={16} /> : <Check size={16} />}{tenant.active ? "Suspend tenant" : "Activate tenant"}</button></div></section></>}{panel === "subscription" && <><section className="rounded-2xl bg-teal-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-teal-700">Company subscription</p><h3 className="mt-2 text-lg font-bold">Capacity comes from the assigned plan.</h3><p className="mt-2 text-sm leading-6 text-slate-600">Choose the plan before deciding which modules should be licensed for this tenant.</p><form onSubmit={(event) => { event.preventDefault(); void assignPlan(tenant, String(new FormData(event.currentTarget).get("plan_id"))); }} className="mt-5 flex gap-3"><FormSelect name="plan_id" defaultValue={tenant.license_plan_id || ""} className="h-11 min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3 text-sm"><option value="" disabled>Select plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.cash_point_limit} POS</option>)}</FormSelect><button className="rounded-xl bg-teal-600 px-4 text-sm font-bold text-white">Save</button></form></section><section className="mt-6"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Licensed modules</p><p className="mt-2 text-sm text-slate-500">Toggle only the modules the company is entitled to operate.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{modules.map((module) => { const enabled = tenant.licensed_modules.includes(module); return <button key={module} onClick={() => void toggleModule(tenant, module)} className={`flex items-center justify-between rounded-2xl border p-4 text-left ${enabled ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-white"}`}><span className="text-sm font-bold capitalize text-slate-800">{module}</span><span className={`grid h-6 w-6 place-items-center rounded-full ${enabled ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>{enabled ? <Check size={14} /> : "+"}</span></button>; })}</div></section></>}{panel === "deployment" && <DeploymentPanel tenant={tenant} updateOperatingMode={updateOperatingMode} />}{panel === "access" && <section><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Member entitlements</p><p className="mt-2 text-sm text-slate-500">Grant access only to modules already licensed for this tenant.</p><div className="mt-5 space-y-4">{members.map((member) => <article key={member.user_id} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="font-bold text-slate-900">{member.full_name}</p><p className="mt-1 text-xs text-slate-500">{member.email} · {member.role.replaceAll("_", " ")}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${member.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{member.active ? "Active" : "Inactive"}</span></div><div className="mt-4 flex flex-wrap gap-2">{modules.map((module) => { const tenantLicensed = tenant.licensed_modules.includes(module); const enabled = member.licensed_modules.includes(module); return <button key={module} disabled={!tenantLicensed} onClick={() => void toggleMemberModule(member, module)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize disabled:opacity-35 ${enabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "✓ " : "+ "}{module}</button>; })}</div><form onSubmit={(event) => void saveSystemLicense(member, event)} className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3"><ShieldCheck size={15} className="text-teal-600" /><span className="text-xs font-bold text-slate-600">System license</span><input name="company_limit" type="number" min="1" defaultValue={member.system_license?.company_limit || 1} className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-xs" /><span className="text-xs text-slate-500">company slots</span><button className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-bold text-teal-700">Save</button></form></article>)}{!members.length && <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Loading access details or no members found.</p>}</div></section>}</div></aside></div>; }
function DeploymentPanel({ tenant, updateOperatingMode }: { tenant: Tenant; updateOperatingMode: (tenant: Tenant, mode: OperatingMode) => Promise<void> }) {
  const ready = tenant.offline_setup_status === "ready";
  const awaitingConnection = tenant.offline_setup_status === "awaiting_connection";
  const readinessCopy: Record<Tenant["offline_setup_status"], { title: string; summary: string }> = {
    not_required: { title: "Cloud-only deployment", summary: "No local node is required while this tenant operates online only." },
    setup_required: { title: "Local store node setup required", summary: "Enrol the physical site and configure its protected node secret before staff rely on offline operation." },
    awaiting_connection: { title: "Waiting for node health", summary: `${tenant.active_store_node_count} enrolled node${tenant.active_store_node_count === 1 ? " is" : "s are"} awaiting a healthy heartbeat. Check the local API, database, edge agent, and node secret.` },
    bootstrap_required: { title: "Bootstrap evidence required", summary: "The node must complete its initial protected reference-data bootstrap before offline go-live." },
    synchronizing: { title: "Outbox reconciliation required", summary: "The node has local work awaiting cloud acknowledgement. Keep it in synchronization until the pending outbox reaches zero." },
    backup_required: { title: "Acknowledged backup required", summary: "Create a fresh local PostgreSQL backup and confirm that its acknowledged manifest is in the configured object storage." },
    restore_verification_required: { title: "Backup restore verification required", summary: "An operator must successfully restore the latest acknowledged backup and record that verification in Store nodes." },
    approval_required: { title: "Platform go-live approval required", summary: "Technical evidence is complete. A platform super administrator must approve this node before staff rely on offline operation." },
    ready: { title: "Local store node ready", summary: `${tenant.healthy_store_node_count} healthy local node${tenant.healthy_store_node_count === 1 ? " is" : "s are"} reporting within the last five minutes with approved offline evidence.` },
  };
  const nodeCopy = readinessCopy[tenant.offline_setup_status];
  return <section className="space-y-5"><div className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-teal-300">Deployment policy</p><h3 className="mt-2 text-xl font-bold">Choose where this company can operate.</h3><p className="mt-2 text-sm leading-6 text-slate-300">Changing modes keeps the same tenant, users, subscriptions, and cloud record. It never creates a second company.</p><label className="mt-5 block text-xs font-bold text-slate-200">Operating mode<FormSelect value={tenant.operating_mode} onChange={(event) => void updateOperatingMode(tenant, event.target.value as OperatingMode)} className="mt-1 h-11 w-full rounded-xl border border-white/20 bg-white px-3 text-sm font-semibold text-slate-900"><option value="online">Online only — cloud workspace</option><option value="offline">Offline only — store node is required</option><option value="hybrid">Both — cloud plus store node</option></FormSelect></label></div>{tenant.operating_mode === "online" ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-900"><p className="font-bold">Cloud-only deployment</p><p className="mt-1 leading-6">This tenant uses the online platform. To add local continuity later, change the mode to Both, then enrol the store node.</p></div> : <div className={`rounded-2xl border p-5 text-sm ${ready ? "border-emerald-100 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><p className="font-bold">{nodeCopy.title}</p><p className="mt-1 leading-6">{nodeCopy.summary}</p>{!ready && <Link href={platformConsolePath("/store-nodes")} className="mt-4 inline-flex rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">{awaitingConnection ? "Inspect store node" : "Open store node checklist"}</Link>}</div>}<ol className="space-y-2 rounded-2xl border border-slate-200 p-5 text-sm text-slate-600"><li><strong className="text-slate-900">1. Enrol:</strong> assign the node to the tenant&apos;s active branches.</li><li><strong className="text-slate-900">2. Install:</strong> run the local API, PostgreSQL database, and edge agent at the site.</li><li><strong className="text-slate-900">3. Verify:</strong> wait for bootstrap, an empty outbox, a fresh restored backup, and platform approval before go-live.</li></ol></section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 truncate text-sm font-bold text-slate-900">{value}</p></div>; }
