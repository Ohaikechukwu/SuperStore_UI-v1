"use client";

import FormSelect from "@/components/form-select";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CheckCircle2, Globe2, Plus, Power, ShieldCheck, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { platformConsolePath } from "@/auth";
import { api, ApiError } from "@/lib/api";
import type { AuthorizationContext } from "@/lib/authorization";

const licensedModules = ["store", "inventory", "stock", "accounting", "hospital", "pharmacy", "laboratory"] as const;
type LicensedModule = typeof licensedModules[number];
type Tenant = { id: string; public_id: string; name: string; slug: string; currency: string; active: boolean; brand_name: string; owner_email: string | null; cash_point_limit: number; license_plan_id: string | null; license_plan_name: string | null; license_plan_expires_at: string | null; branding_licensed: boolean; branding_license_expires_at: string | null; licensed_modules: LicensedModule[] };
type TenantMember = { user_id: string; full_name: string; email: string; role: string; active: boolean; licensed_modules: LicensedModule[]; system_license: { company_limit: number; expires_at: string; active: boolean } | null };

function TenantManagementPage() {
  const [auth, setAuth] = useState<AuthorizationContext | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<PlatformLicensePlan[]>([]);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [memberTenant, setMemberTenant] = useState<Tenant | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);

  async function load() {
    try {
      const context = await api.get<AuthorizationContext>("/api/v1/auth/me/authorization");
      setAuth(context);
      if (context.is_global_role && context.role === "platform_super_admin") {
        const [tenantRows, planRows] = await Promise.all([
          api.get<Tenant[]>("/api/v1/platform/tenants"),
          api.get<PlatformLicensePlan[]>("/api/v1/platform/license-plans"),
        ]);
        setTenants(tenantRows); setPlans(planRows);
      }
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load platform administration."); }
  }
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const operating_mode = String(form.get("operating_mode") || "online");
      await api.post("/api/v1/platform/tenants", { tenant_name: String(form.get("tenant_name")), tenant_slug: String(form.get("tenant_slug") || "") || null, currency: String(form.get("currency")), owner_full_name: String(form.get("owner_full_name")), owner_email: String(form.get("owner_email")), owner_password: String(form.get("owner_password")), license_plan_id: String(form.get("license_plan_id")), branding_enabled: form.get("branding_enabled") === "on", operating_mode });
      setModal(false); setNotice(operating_mode === "online" ? "Tenant created successfully." : "Tenant created. Enrol its local store node before offline operation."); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to create tenant."); }
  }

  async function toggle(tenant: Tenant) {
    try { await api.patch(`/api/v1/platform/tenants/${tenant.id}/status`, { active: !tenant.active }); setNotice(`${tenant.name} ${tenant.active ? "suspended" : "activated"}.`); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update tenant status."); }
  }

  async function toggleLicense(tenant: Tenant, module: LicensedModule) {
    const currentlyLicensed = tenant.licensed_modules.includes(module);
    const next = currentlyLicensed ? tenant.licensed_modules.filter((item) => item !== module) : [...tenant.licensed_modules, module];
    try { await api.patch(`/api/v1/platform/tenants/${tenant.id}/license`, { licensed_modules: next }); setNotice(`${module[0].toUpperCase() + module.slice(1)} ${currentlyLicensed ? "removed from" : "added to"} ${tenant.name}'s license.`); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update tenant license."); }
  }

  async function assignSubscriptionPlan(tenant: Tenant, licensePlanId: string) {
    try {
      await api.patch(`/api/v1/platform/tenants/${tenant.id}/subscription-plan`, { license_plan_id: licensePlanId });
      setNotice(`${tenant.name}'s subscription plan was updated.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update the company subscription plan.");
    }
  }

  async function openMemberAccess(tenant: Tenant) {
    try { setMemberTenant(tenant); setMembers(await api.get<TenantMember[]>(`/api/v1/platform/tenants/${tenant.id}/members`)); }
    catch (caught) { setMemberTenant(null); setError(caught instanceof ApiError ? caught.message : "Unable to load tenant users."); }
  }

  async function toggleMemberModule(member: TenantMember, module: LicensedModule) {
    if (!memberTenant) return;
    const enabled = member.licensed_modules.includes(module);
    const next = enabled ? member.licensed_modules.filter((item) => item !== module) : [...member.licensed_modules, module];
    try { await api.patch(`/api/v1/platform/tenants/${memberTenant.id}/members/${member.user_id}/modules`, { licensed_modules: next }); setMembers((current) => current.map((item) => item.user_id === member.user_id ? { ...item, licensed_modules: next } : item)); setNotice(`${module[0].toUpperCase() + module.slice(1)} ${enabled ? "revoked from" : "granted to"} ${member.full_name}.`); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update member module access."); }
  }

  async function updateSystemLicense(member: TenantMember, companyLimit: number) {
    try { await api.put(`/api/v1/platform/users/${member.user_id}/system-license`, { company_limit: companyLimit }); setNotice(`System license updated for ${member.full_name}.`); if (memberTenant) await openMemberAccess(memberTenant); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update system license."); }
  }

  return <DashboardShell title="Tenants dashboard" subtitle="Tenant lifecycle, access, subscriptions, and support workspace entry."><PermissionGate permission="tenant.read"><div className="mx-auto max-w-[1280px] space-y-6">
    {auth?.role !== "platform_super_admin" ? <AccessDenied /> : <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Tenant operations</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Tenants dashboard</h1><p className="mt-2 text-sm text-slate-500">Create and support client workspaces, manage access, and maintain subscriptions.</p></div><div className="flex flex-wrap gap-2"><Link href={platformConsolePath("/store-nodes")} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Store nodes</Link><button onClick={() => setModal(true)} className="inline-flex items-center gap-2 self-start rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Create tenant</button></div></div>
      {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}{notice && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Tenants" value={String(tenants.length)} /><Metric label="Active" value={String(tenants.filter((tenant) => tenant.active).length)} /><Metric label="Suspended" value={String(tenants.filter((tenant) => !tenant.active).length)} /></div>
      <TenantSubscriptionManager tenants={tenants} plans={plans} assign={assignSubscriptionPlan} />
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><Globe2 className="text-teal-600" size={21} /><div><h2 className="text-xl font-bold">Tenant directory</h2><p className="mt-1 text-xs text-slate-400">License modules, manage access, or open a tenant workspace in support mode.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2">{tenants.map((tenant) => <div key={tenant.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{tenant.name}</p><p className="mt-1 text-xs text-slate-400">{tenant.slug} · {tenant.currency}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tenant.active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{tenant.active ? "Active" : "Suspended"}</span></div><p className="mt-4 text-sm text-slate-500">Owner: {tenant.owner_email || "Not assigned"}</p><div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Licensed modules</p><div className="mt-2 flex flex-wrap gap-2">{licensedModules.map((module) => { const enabled = tenant.licensed_modules.includes(module); return <button key={module} onClick={() => void toggleLicense(tenant, module)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${enabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "✓ " : "+ "}{module}</button>; })}</div></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400"><Building2 size={14} />{tenant.brand_name}</span><div className="flex items-center gap-3"><Link href={`/t/${tenant.public_id}/`} className="text-xs font-bold text-indigo-700">Open workspace</Link><button onClick={() => void openMemberAccess(tenant)} className="text-xs font-bold text-teal-700">Manage user access</button><button onClick={() => void toggle(tenant)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">{tenant.active ? <Power size={14} /> : <CheckCircle2 size={14} />}{tenant.active ? "Suspend" : "Activate"}</button></div></div></div>)}{!tenants.length && <p className="py-8 text-sm text-slate-500">No tenants found.</p>}</div></section>
    </>}
    {modal && <CreateTenantModal close={() => setModal(false)} create={create} plans={plans} />}
    {memberTenant && <MemberAccessModal tenant={memberTenant} members={members} close={() => setMemberTenant(null)} toggleModule={toggleMemberModule} updateSystemLicense={updateSystemLicense} />}
  </div></PermissionGate></DashboardShell>;
}

function TenantSubscriptionManager({ tenants, plans, assign }: { tenants: Tenant[]; plans: PlatformLicensePlan[]; assign: (tenant: Tenant, planId: string) => Promise<void> }) { const activePlans = plans.filter((plan) => plan.active && plan.company_limit > 0); return <section className="rounded-3xl border border-teal-100 bg-teal-50 p-6 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-700">Company subscriptions</p><h2 className="mt-1 text-xl font-bold">POS terminal capacity comes from the pricing plan</h2><p className="mt-1 text-sm text-slate-600">Assign a company plan here. Its POS-terminal allowance is shared across every branch; terminal numbers are unique within the company.</p></div><div className="mt-5 grid gap-3 md:grid-cols-2">{tenants.map((tenant) => <form key={tenant.id} onSubmit={(event) => { event.preventDefault(); void assign(tenant, String(new FormData(event.currentTarget).get("license_plan_id"))); }} className="rounded-2xl border border-teal-100 bg-white p-4"><p className="font-bold text-slate-900">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{tenant.license_plan_name || "No plan assigned"} · {tenant.cash_point_limit} POS terminal{tenant.cash_point_limit === 1 ? "" : "s"}</p>{tenant.license_plan_expires_at && <p className="mt-1 text-xs text-slate-400">Valid to {new Date(tenant.license_plan_expires_at).toLocaleDateString()}</p>}<div className="mt-3 flex gap-3"><FormSelect name="license_plan_id" defaultValue={tenant.license_plan_id || ""} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="" disabled>Select a company plan</option>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.cash_point_limit} POS</option>)}</FormSelect><button disabled={!activePlans.length} className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Assign</button></div></form>)}{!tenants.length && <p className="text-sm text-slate-500">No tenants found.</p>}</div></section>; }
function AccessDenied() { return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8"><p className="text-xs font-bold uppercase tracking-wider text-rose-600">Platform access required</p><h1 className="mt-3 text-2xl font-bold text-rose-950">This workspace is restricted to platform super administrators.</h1></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>; }
function Field({ name, label, type = "text", defaultValue = "", required = false }: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) { return <label className="text-xs font-bold text-slate-600">{label}<input name={name} type={type} defaultValue={defaultValue} required={required} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>; }
function CreateTenantModal({ close, create, plans }: { close: () => void; create: (event: FormEvent<HTMLFormElement>) => Promise<void>; plans: PlatformLicensePlan[] }) { const companyPlans = plans.filter((plan) => plan.active && plan.company_limit > 0); return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void create(event)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Create tenant</h2><button type="button" onClick={close}><X size={18} /></button></div><p className="mt-2 text-sm text-slate-500">The selected company plan sets this tenant’s POS-terminal capacity and included modules.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="tenant_name" label="Tenant name" required /><Field name="tenant_slug" label="Tenant slug" /><Field name="currency" label="Currency" defaultValue="NGN" required /><Field name="owner_full_name" label="Owner full name" required /><Field name="owner_email" label="Owner email" type="email" required /><Field name="owner_password" label="Owner temporary password" type="password" required /></div><label className="mt-4 block text-xs font-bold text-slate-600">Company pricing plan<FormSelect required name="license_plan_id" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Select a company plan</option>{companyPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.cash_point_limit} POS terminal{plan.cash_point_limit === 1 ? "" : "s"}</option>)}</FormSelect></label><label className="mt-4 block text-xs font-bold text-slate-600">Operating mode<FormSelect name="operating_mode" defaultValue="online" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="online">Online only — cloud workspace</option><option value="offline">Offline only — local store node required</option><option value="hybrid">Both — cloud plus local store node</option></FormSelect><span className="mt-1 block font-normal leading-5 text-slate-500">Offline and hybrid tenants retain one cloud identity, then receive a local-node provisioning task.</span></label>{!companyPlans.length && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Create an active company pricing plan before adding a tenant.</p>}<button disabled={!companyPlans.length} className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Create tenant and owner</button></form></div>; }
function MemberAccessModal({ tenant, members, close, toggleModule, updateSystemLicense }: { tenant: Tenant; members: TenantMember[]; close: () => void; toggleModule: (member: TenantMember, module: LicensedModule) => Promise<void>; updateSystemLicense: (member: TenantMember, companyLimit: number) => Promise<void> }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">User module and system access</h2><p className="mt-1 text-sm text-slate-500">{tenant.name}</p></div><button onClick={close}><X size={18} /></button></div><p className="mt-4 text-xs text-slate-400">Grant tenant modules here. System-license capacity is a separate platform entitlement, valid for one year after update.</p><div className="mt-5 divide-y divide-slate-100">{members.map((member) => <div key={member.user_id} className="py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{member.full_name}</p><p className="text-xs text-slate-400">{member.email} · {member.role.replaceAll("_", " ")}</p></div><div className="flex flex-wrap gap-2">{licensedModules.map((module) => { const tenantLicensed = tenant.licensed_modules.includes(module); const granted = member.licensed_modules.includes(module); return <button key={module} disabled={!tenantLicensed} onClick={() => void toggleModule(member, module)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize disabled:cursor-not-allowed disabled:opacity-40 ${granted ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>{granted ? "✓ " : "+ "}{module}</button>; })}</div></div><form onSubmit={(event) => { event.preventDefault(); void updateSystemLicense(member, Number(new FormData(event.currentTarget).get("company_limit"))); }} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3"><ShieldCheck size={15} className="text-teal-600" /><span className="text-xs font-bold text-slate-600">System license</span><input name="company_limit" type="number" min="1" max="1000" defaultValue={member.system_license?.company_limit || 1} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /><span className="text-xs text-slate-500">companies{member.system_license ? ` · ${member.system_license.active ? "active" : "inactive"} to ${new Date(member.system_license.expires_at).toLocaleDateString()}` : " · not assigned"}</span><button className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-bold text-teal-700">Save</button></form></div>)}{!members.length && <p className="py-8 text-center text-sm text-slate-500">No users found for this tenant.</p>}</div></div></div>; }

type PlatformAuditEvent = { id: string; tenant_id: string; action: string; entity_type: string; entity_id: string; actor_id: string | null; reason: string | null; created_at: string };
function PlatformAuditPanel({ tenants }: { tenants: Tenant[] }) { const [events, setEvents] = useState<PlatformAuditEvent[]>([]); const [query, setQuery] = useState(""); const [error, setError] = useState(""); useEffect(() => { void api.get<PlatformAuditEvent[]>("/api/v1/platform/audit").then(setEvents).catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load platform audit trail.")); }, []); const visible = events.filter((event) => `${event.action} ${event.entity_type} ${event.entity_id} ${tenants.find((tenant) => tenant.id === event.tenant_id)?.name || event.tenant_id}`.toLowerCase().includes(query.toLowerCase())); return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Platform audit trail</p><h2 className="mt-1 text-xl font-bold">Cross-tenant governance history</h2><p className="mt-1 text-sm text-slate-500">The latest 1,000 platform events, including tenant, license, member, release, and node actions.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter audit events" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>{error && <p className="mt-4 text-sm text-rose-700">{error}</p>}<div className="mt-5 max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">{visible.map((event) => <article key={event.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold text-slate-800">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{event.entity_type} · {event.entity_id} · {tenants.find((tenant) => tenant.id === event.tenant_id)?.name || event.tenant_id}</p>{event.reason && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">Reason: {event.reason}</p>}</div><div className="text-right text-xs text-slate-400"><p>{new Date(event.created_at).toLocaleString()}</p><p className="mt-1">Actor: {event.actor_id || "System"}</p></div></article>)}{!visible.length && <p className="py-8 text-sm text-slate-500">No platform audit events match this filter.</p>}</div></section>; }

type PlatformLicensePlan = { id: string; name: string; description: string; company_limit: number; cash_point_limit: number; modules: LicensedModule[]; amount: number; currency: string; branding_available: boolean; branding_addon_amount: number; active: boolean; sort_order: number };
function PricingPlanManager() { const [plans, setPlans] = useState<PlatformLicensePlan[]>([]); const [modal, setModal] = useState(false); const [error, setError] = useState(""); const load = async () => { try { setPlans(await api.get<PlatformLicensePlan[]>("/api/v1/platform/license-plans")); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load pricing plans."); } }; useEffect(() => { void load(); }, []); const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api.post("/api/v1/platform/license-plans", { name: String(form.get("name")), description: String(form.get("description") || ""), company_limit: Number(form.get("company_limit") || 0), modules: licensedModules.filter((module) => form.get(`module_${module}`) === "on"), amount: Number(form.get("amount")), currency: String(form.get("currency")), active: true, sort_order: Number(form.get("sort_order") || 0) }); setModal(false); await load(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to save pricing plan."); } }; const toggle = async (plan: PlatformLicensePlan) => { try { await api.put(`/api/v1/platform/license-plans/${plan.id}`, { ...plan, active: !plan.active }); await load(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update pricing plan."); } }; return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Billing catalog</p><h2 className="mt-1 text-xl font-bold">Annual pricing plans</h2><p className="mt-1 text-sm text-slate-500">Set a yearly price, company capacity, and any included modules.</p></div><button onClick={() => setModal(true)} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">New plan</button></div>{error && <p className="mt-4 text-sm text-rose-700">{error}</p>}<div className="mt-5 grid gap-3 md:grid-cols-2">{plans.map((plan) => <div key={plan.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-bold">{plan.name}</p><p className="mt-1 text-xs text-slate-500">{plan.company_limit ? `${plan.company_limit} companies` : "Module add-on"}{plan.modules.length ? ` · ${plan.modules.join(", ")}` : ""}</p></div><p className="text-sm font-bold">{plan.currency} {plan.amount}</p></div><button onClick={() => void toggle(plan)} className="mt-4 text-xs font-bold text-teal-700">{plan.active ? "Deactivate" : "Activate"}</button></div>)}{!plans.length && <p className="text-sm text-slate-500">No pricing plans yet.</p>}</div>{modal && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void create(event)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">New annual pricing plan</h2><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="Plan name" required /><Field name="amount" label="Price (smallest currency unit)" type="number" required /><Field name="currency" label="Currency" defaultValue="NGN" required /><Field name="company_limit" label="Company capacity (0 for add-on)" type="number" defaultValue="0" /><Field name="sort_order" label="Display order" type="number" defaultValue="0" /></div><label className="mt-4 block text-xs font-bold text-slate-600">Description<textarea name="description" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Included modules</p><div className="mt-2 flex flex-wrap gap-3">{licensedModules.map((module) => <label key={module} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold capitalize"><input name={`module_${module}`} type="checkbox" />{module}</label>)}</div><button className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Save annual pricing plan</button></form></div>}</section>; }

function PricingPlanEditor() { const [plans, setPlans] = useState<PlatformLicensePlan[]>([]); const [editing, setEditing] = useState<PlatformLicensePlan | null>(null); const [open, setOpen] = useState(false); const [error, setError] = useState(""); const load = async () => { try { setPlans(await api.get<PlatformLicensePlan[]>("/api/v1/platform/license-plans")); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load pricing plans."); } }; useEffect(() => { void load(); }, []); const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const payload = { name: String(form.get("name")), description: String(form.get("description") || ""), company_limit: Number(form.get("company_limit") || 0), cash_point_limit: Number(form.get("cash_point_limit") || 1), modules: licensedModules.filter((module) => form.get(`module_${module}`) === "on"), amount: Number(form.get("amount")), currency: String(form.get("currency")), active: form.get("active") === "on", sort_order: Number(form.get("sort_order") || 0) }; try { if (editing) await api.put(`/api/v1/platform/license-plans/${editing.id}`, payload); else await api.post("/api/v1/platform/license-plans", payload); setOpen(false); setEditing(null); await load(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to save pricing plan."); } }; const edit = (plan: PlatformLicensePlan) => { setEditing(plan); setOpen(true); }; return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Billing catalog</p><h2 className="mt-1 text-xl font-bold">Annual pricing plans</h2><p className="mt-1 text-sm text-slate-500">Each plan sets the company’s POS-terminal capacity, price, modules, and status.</p></div><button onClick={() => { setEditing(null); setOpen(true); }} className="self-start rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">New plan</button></div>{error && <p className="mt-4 text-sm text-rose-700">{error}</p>}<div className="mt-5 grid gap-4 md:grid-cols-2">{plans.map((plan) => <div key={plan.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{plan.name}</p><p className="mt-1 text-xs text-slate-500">{plan.company_limit ? `${plan.company_limit} companies` : "Module add-on"} · {plan.cash_point_limit} POS terminal{plan.cash_point_limit === 1 ? "" : "s"}{plan.modules.length ? ` · ${plan.modules.join(", ")}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${plan.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{plan.active ? "Active" : "Inactive"}</span></div><p className="mt-5 text-lg font-bold">{formatPlanPrice(plan.amount, plan.currency)}</p><button onClick={() => edit(plan)} className="mt-4 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-teal-700">Edit plan</button></div>)}{!plans.length && <p className="text-sm text-slate-500">No pricing plans yet.</p>}</div>{open && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"><form key={editing?.id || "new"} onSubmit={(event) => void save(event)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{editing ? "Edit annual pricing plan" : "New annual pricing plan"}</h2><p className="mt-1 text-xs text-slate-400">For NGN, enter kobo: ₦1,500,000 is 150000000.</p></div><button type="button" onClick={() => setOpen(false)}><X size={18} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="Plan name" defaultValue={editing?.name || ""} required /><Field name="amount" label="Price (smallest unit)" type="number" defaultValue={String(editing?.amount || "")} required /><Field name="currency" label="Currency" defaultValue={editing?.currency || "NGN"} required /><Field name="company_limit" label="Company capacity (0 for add-on)" type="number" defaultValue={String(editing?.company_limit || 0)} /><Field name="cash_point_limit" label="POS-terminal capacity" type="number" defaultValue={String(editing?.cash_point_limit || 1)} required /><Field name="sort_order" label="Display order" type="number" defaultValue={String(editing?.sort_order || 0)} /></div><label className="mt-4 block text-xs font-bold text-slate-600">Description<textarea name="description" defaultValue={editing?.description || ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Included modules</p><div className="mt-2 flex flex-wrap gap-3">{licensedModules.map((module) => <label key={module} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold capitalize"><input name={`module_${module}`} type="checkbox" defaultChecked={editing?.modules.includes(module)} />{module}</label>)}</div><label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />Make this plan available for purchase</label><button className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">{editing ? "Update pricing plan" : "Create pricing plan"}</button></form></div>}</section>; }

function PricingPlanEditorV2() {
  const [plans, setPlans] = useState<PlatformLicensePlan[]>([]);
  const [editing, setEditing] = useState<PlatformLicensePlan | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPlans() {
    try {
      setPlans(await api.get<PlatformLicensePlan[]>("/api/v1/platform/license-plans"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load pricing plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadPlans(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function openCreate() {
    setEditing(null);
    setFormError("");
    setOpen(true);
  }

  function openEdit(plan: PlatformLicensePlan) {
    setEditing(plan);
    setFormError("");
    setOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setOpen(false);
    setEditing(null);
    setFormError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const modules = licensedModules.filter((module) => form.get(`module_${module}`) === "on");
    const payload = {
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || "").trim(),
      company_limit: Number(form.get("company_limit") || 0),
      cash_point_limit: Number(form.get("cash_point_limit") || 1),
      modules,
      amount: Number(form.get("amount") || 0),
      currency: String(form.get("currency") || "NGN").trim().toUpperCase(),
      branding_available: form.get("branding_available") === "on",
      branding_addon_amount: Number(form.get("branding_addon_amount") || 0),
      active: form.get("active") === "on",
      sort_order: Number(form.get("sort_order") || 0),
    };
    if (payload.branding_available && payload.branding_addon_amount <= 0) {
      setFormError("Enter a positive yearly branding price before offering the add-on. For NGN, ₦25,000 is 2500000 kobo.");
      return;
    }
    setSaving(true);
    setError("");
    setFormError("");
    try {
      const saved = editing
        ? await api.put<PlatformLicensePlan>(`/api/v1/platform/license-plans/${editing.id}`, payload)
        : await api.post<PlatformLicensePlan>("/api/v1/platform/license-plans", payload);
      setPlans((current) => editing
        ? current.map((plan) => plan.id === saved.id ? saved : plan)
        : [...current, saved].sort((left, right) => left.sort_order - right.sort_order || left.amount - right.amount || left.name.localeCompare(right.name)));
      setNotice(`${saved.name} was ${editing ? "updated" : "created"}.`);
      setOpen(false);
      setEditing(null);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Unable to save pricing plan.";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Billing catalog</p><h2 className="mt-1 text-xl font-bold">Annual pricing plans</h2><p className="mt-1 text-sm text-slate-500">Set the price, POS-terminal allowance, and every licensed module included in each plan.</p></div><button type="button" onClick={openCreate} className="self-start rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">New plan</button></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
    <div className="mt-5 grid gap-4 md:grid-cols-2">{plans.map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{plan.name}</p><p className="mt-1 text-xs text-slate-500">{plan.company_limit ? `${plan.company_limit} companies` : "Module add-on"} · {plan.cash_point_limit} POS terminal{plan.cash_point_limit === 1 ? "" : "s"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${plan.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{plan.active ? "Active" : "Inactive"}</span></div><p className="mt-3 text-xs font-semibold capitalize text-teal-700">{plan.modules.length ? plan.modules.join(" · ") : "No modules included"}</p><p className="mt-5 text-lg font-bold">{formatPlanPrice(plan.amount, plan.currency)}</p>{plan.branding_available && <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">+ {formatPlanPrice(plan.branding_addon_amount, plan.currency)}/year when custom branding is selected</p>}<button type="button" onClick={() => openEdit(plan)} className="mt-4 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-teal-700">Edit plan</button></article>)}{!loading && !plans.length && <p className="text-sm text-slate-500">No pricing plans yet.</p>}{loading && <p className="text-sm text-slate-500">Loading pricing plans…</p>}</div>
    {open && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"><form key={editing?.id || "new"} onSubmit={(event) => void save(event)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{editing ? "Edit annual pricing plan" : "New annual pricing plan"}</h2><p className="mt-1 text-xs text-slate-400">For NGN, enter the amount in kobo: ₦1,500,000 is 150000000.</p></div><button type="button" disabled={saving} onClick={closeEditor} aria-label="Close pricing plan editor"><X size={18} /></button></div>{formError && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</p>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="Plan name" defaultValue={editing?.name || ""} required /><Field name="amount" label="Base plan price (smallest unit)" type="number" defaultValue={String(editing?.amount || "")} required /><Field name="currency" label="Currency" defaultValue={editing?.currency || "NGN"} required /><Field name="company_limit" label="Company capacity (0 for add-on)" type="number" defaultValue={String(editing?.company_limit || 0)} /><Field name="cash_point_limit" label="POS-terminal capacity" type="number" defaultValue={String(editing?.cash_point_limit || 1)} required /><Field name="sort_order" label="Display order" type="number" defaultValue={String(editing?.sort_order || 0)} /><Field name="branding_addon_amount" label="Branding add-on price/year (smallest unit)" type="number" defaultValue={String(editing?.branding_addon_amount || 0)} /></div><label className="mt-4 block text-xs font-bold text-slate-600">Description<textarea name="description" defaultValue={editing?.description || ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Included modules</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{licensedModules.map((module) => <label key={module} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold capitalize"><input name={`module_${module}`} type="checkbox" defaultChecked={editing?.modules.includes(module)} />{module}</label>)}</div><label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input name="branding_available" type="checkbox" defaultChecked={editing?.branding_available ?? false} />Offer custom tenant branding as a paid annual add-on</label><label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />Make this plan available for purchase</label><button type="submit" disabled={saving} className="mt-6 flex w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? "Saving pricing plan…" : editing ? "Update pricing plan" : "Create pricing plan"}</button></form></div>}
  </section>;
}

function formatPlanPrice(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount / 100);
}

/** Lightweight landing page for the global control plane. */
export default function PlatformDashboard() {
  const pathname = usePathname();
  const consoleBase = pathname.match(/^\/a\/[0-9a-f-]+/i)?.[0] || "/login";
  const [auth, setAuth] = useState<AuthorizationContext | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [events, setEvents] = useState<PlatformAuditEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const context = await api.get<AuthorizationContext>("/api/v1/auth/me/authorization");
        setAuth(context);
        if (context.role !== "platform_super_admin" || !context.is_global_role) return;
        const [tenantRows, eventRows] = await Promise.all([
          api.get<Tenant[]>("/api/v1/platform/tenants"),
          api.get<PlatformAuditEvent[]>("/api/v1/platform/audit"),
        ]);
        setTenants(tenantRows);
        setEvents(eventRows);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Unable to load platform command centre.");
      }
    })();
  }, []);

  const activeTenants = tenants.filter((tenant) => tenant.active);
  const expiringSoon = activeTenants.filter((tenant) => tenant.license_plan_expires_at
    && new Date(tenant.license_plan_expires_at).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000);
  const needsAttention = tenants.filter((tenant) => !tenant.active || !tenant.license_plan_id || expiringSoon.some((item) => item.id === tenant.id));
  const tenantName = (tenantId: string) => tenants.find((tenant) => tenant.id === tenantId)?.name || "Platform";
  const route = (suffix: string) => `${consoleBase}${suffix}`;

  return <DashboardShell title="Tenants dashboard" subtitle="An at-a-glance view of tenant health, governance activity, and platform operations."><PermissionGate permission="tenant.read"><div className="mx-auto max-w-[1280px] space-y-7">
    {auth?.role !== "platform_super_admin" && auth ? <AccessDenied /> : <>
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 p-7 text-white shadow-xl shadow-slate-900/10 sm:p-9"><div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-300">Tenant network overview</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">See every tenant at a glance.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Monitor tenant health, licensing, and governance here; open Command Centre only when you need to make a lifecycle or access change.</p></div><div className="flex flex-wrap gap-3"><Link href={route("/tenants")} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950">Open Command centre</Link><Link href={route("/plans")} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white">Plans & licensing</Link></div></div><div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" /></section>
      {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary label="Total tenants" value={String(tenants.length)} detail="All registered workspaces" /><Summary label="Healthy" value={String(activeTenants.length - expiringSoon.length)} detail="Active with time remaining" tone="teal" /><Summary label="Needs attention" value={String(needsAttention.length)} detail="Suspended, unlicensed, or expiring" tone="amber" /><Summary label="Recent activity" value={String(events.length)} detail="Latest governance events" tone="indigo" /></section>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Tenant health</p><h2 className="mt-1 text-xl font-bold">Items needing review</h2></div><Link href={route("/tenants")} className="text-sm font-bold text-teal-700">View tenants</Link></div><div className="mt-5 space-y-3">{needsAttention.slice(0, 5).map((tenant) => <article key={tenant.id} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3"><div className="min-w-0"><p className="truncate font-bold text-slate-800">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{!tenant.active ? "Suspended" : !tenant.license_plan_id ? "No subscription plan" : "Subscription expires within 30 days"}</p></div><Link href={route("/tenants")} className="shrink-0 text-xs font-bold text-teal-700">Review</Link></article>)}{!needsAttention.length && <p className="rounded-2xl bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-800">All active tenants have a current subscription.</p>}</div></section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Governance activity</p><h2 className="mt-1 text-xl font-bold">Latest changes</h2></div><Link href={route("/activity")} className="text-sm font-bold text-teal-700">View activity</Link></div><div className="mt-5 divide-y divide-slate-100">{events.slice(0, 5).map((event) => <article key={event.id} className="py-3"><p className="text-sm font-bold text-slate-800">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{tenantName(event.tenant_id)} · {new Date(event.created_at).toLocaleString()}</p></article>)}{!events.length && <p className="py-8 text-center text-sm text-slate-500">No platform events recorded yet.</p>}</div></section></section>
      <section className="grid gap-4 md:grid-cols-3"><ConsoleCard href={route("/tenants")} title="Tenants dashboard" text="Create, suspend, license, and enter client workspaces." /><ConsoleCard href={route("/plans")} title="Plans & licensing" text="Manage annual plans, capacity, and modules." /><ConsoleCard href={route("/store-nodes")} title="Store nodes" text="Manage releases and offline-first fleet health." /></section>
    </>}
  </div></PermissionGate></DashboardShell>;
}

function Summary({ label, value, detail, tone = "slate" }: { label: string; value: string; detail: string; tone?: "slate" | "teal" | "amber" | "indigo" }) {
  const colors = { slate: "border-slate-200", teal: "border-teal-100 bg-teal-50", amber: "border-amber-100 bg-amber-50", indigo: "border-indigo-100 bg-indigo-50" };
  return <article className={`rounded-2xl border p-5 ${colors[tone]}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>;
}

function ConsoleCard({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:bg-teal-50"><p className="font-bold text-slate-900">{title}</p><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p><span className="mt-4 inline-block text-sm font-bold text-teal-700">Open section →</span></Link>;
}
