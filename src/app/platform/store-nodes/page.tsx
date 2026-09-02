"use client";

import FormSelect from "@/components/form-select";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Cloud, HardDrive, Plus, Rocket, Server, UploadCloud } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { platformConsolePath } from "@/auth";
import { api, ApiError } from "@/lib/api";
import type { AuthorizationContext } from "@/lib/authorization";

type Tenant = { id: string; name: string; slug: string; active: boolean };
type Branch = { id: string; name: string; code: string };
type StoreNode = {
  id: string; tenant_id: string; node_key: string; name: string; branch_ids: string[]; active: boolean;
  app_version: string | null; last_seen_at: string | null; last_sync_at: string | null;
  last_backup_at: string | null; target_release_id: string | null; update_status: string | null;
  update_status_at: string | null; update_error: string | null; health: Record<string, unknown>;
  bootstrap_completed_at: string | null; backup_restore_verified_at: string | null; offline_approved_at: string | null;
  offline_readiness: { status: string; ready: boolean; requirements: Record<string, boolean> };
};
type StoreNodeRelease = {
  id: string; version: string; image_ref: string; release_notes: string | null;
  status: string; created_at: string; published_at: string | null;
};

const prettyTime = (value: string | null) => value ? new Date(value).toLocaleString() : "Never";
const isOnline = (value: string | null) => !!value && Date.now() - new Date(value).getTime() < 5 * 60_000;

export default function StoreNodesPage() {
  const [auth, setAuth] = useState<AuthorizationContext | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [nodes, setNodes] = useState<StoreNode[]>([]);
  const [releases, setReleases] = useState<StoreNodeRelease[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [releaseId, setReleaseId] = useState("");
  const [enrollment, setEnrollment] = useState<{ node_key: string; node_secret: string; branch_ids: string[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);

  const selectedTenant = useMemo(() => tenants.find((tenant) => tenant.id === tenantId), [tenantId, tenants]);
  const publishedReleases = releases.filter((release) => release.status === "published");

  async function load() {
    setBusy(true);
    try {
      const context = await api.get<AuthorizationContext>("/api/v1/auth/me/authorization");
      setAuth(context);
      if (context.is_global_role && context.role === "platform_super_admin") {
        const [tenantRows, nodeRows, releaseRows] = await Promise.all([
          api.get<Tenant[]>("/api/v1/platform/tenants"),
          api.get<StoreNode[]>("/api/v1/edge/nodes"),
          api.get<StoreNodeRelease[]>("/api/v1/edge/releases"),
        ]);
        setTenants(tenantRows.filter((tenant) => tenant.active));
        setNodes(nodeRows);
        setReleases(releaseRows);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load store-node operations.");
    } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    setBranchIds([]);
    if (!tenantId) { setBranches([]); return; }
    void api.get<Branch[]>(`/api/v1/edge/tenants/${tenantId}/branches`)
      .then(setBranches)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load tenant branches."));
  }, [tenantId]);

  function toggle(list: string[], id: string, set: (value: string[]) => void) {
    set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!tenantId || !branchIds.length) { setError("Choose an active tenant and at least one branch."); return; }
    try {
      const node = await api.post<StoreNode & { node_secret: string }>("/api/v1/edge/nodes", {
        tenant_id: tenantId, name: String(form.get("name")), branch_ids: branchIds,
      });
      setEnrollment({ node_key: node.node_key, node_secret: node.node_secret, branch_ids: node.branch_ids });
      setNotice(`Store node ${node.name} enrolled. Save the installation values now; the secret cannot be shown again.`);
      event.currentTarget.reset(); setBranchIds([]); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to enrol store node."); }
  }

  async function createRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const release = await api.post<StoreNodeRelease>("/api/v1/edge/releases", {
        version: String(form.get("version")), image_ref: String(form.get("image_ref")),
        release_notes: String(form.get("release_notes") || "") || null,
      });
      setNotice(`Release ${release.version} created. Publish it when it has been reviewed.`);
      event.currentTarget.reset(); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to create release."); }
  }

  async function publish(release: StoreNodeRelease) {
    try { await api.post(`/api/v1/edge/releases/${release.id}/publish`, {}); setNotice(`${release.version} is available for assignment.`); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to publish release."); }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!releaseId || !selectedNodes.length) { setError("Choose a published release and at least one active store node."); return; }
    try {
      await api.post(`/api/v1/edge/releases/${releaseId}/assign`, { node_ids: selectedNodes });
      setNotice("Release offered to selected nodes. Each store stages it locally; operators apply it on their own schedule.");
      setSelectedNodes([]); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to assign release."); }
  }

  async function verifyBackupRestore(node: StoreNode) {
    try {
      await api.post(`/api/v1/edge/nodes/${node.id}/verify-backup-restore`, {});
      setNotice(`${node.name} backup restore verification recorded. Re-approve it only after reviewing all current evidence.`);
      await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to record backup restore verification."); }
  }

  async function approveOfflineGoLive(node: StoreNode) {
    try {
      await api.post(`/api/v1/edge/nodes/${node.id}/approve-offline-go-live`, {});
      setNotice(`${node.name} is approved for offline go-live.`);
      await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to approve offline go-live."); }
  }

  return <DashboardShell title="Store node operations" subtitle="Monitor store-local health and control staged software releases"><PermissionGate permission="tenant.read"><main className="mx-auto max-w-[1280px] space-y-6">
    {auth?.role !== "platform_super_admin" ? <AccessDenied /> : <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><Link href={platformConsolePath()} className="inline-flex items-center gap-1 text-xs font-bold text-teal-700"><ArrowLeft size={14} /> Platform administration</Link><p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Offline-first fleet</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Store node operations</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Nodes synchronise through the cloud API. A release is only staged after assignment and is never applied automatically.</p></div><div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm"><p className="text-xs text-slate-400">Reporting nodes</p><p className="text-2xl font-bold">{nodes.filter((node) => isOnline(node.last_seen_at)).length} <span className="text-sm font-medium text-slate-400">/ {nodes.length}</span></p></div></div>
      {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}{notice && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {enrollment && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="font-bold text-amber-950">Store-node installation values — secret shown once</p><p className="mt-1 text-sm text-amber-800">On the store machine, copy these values into <code>.env</code> using <code>deploy/store-node/.env.example</code>. Keep the secret in the machine&apos;s protected configuration; do not send it in chat or email.</p><pre className="mt-3 overflow-x-auto rounded-xl bg-amber-100 px-3 py-3 text-xs leading-6 text-amber-950">{`EDGE_NODE_ID=${enrollment.node_key}\nEDGE_NODE_SECRET=${enrollment.node_secret}\nEDGE_BRANCH_IDS=${enrollment.branch_ids.join(",")}`}</pre><button onClick={() => setEnrollment(null)} className="mt-3 text-xs font-bold text-amber-900">I have saved these values</button></div>}
      <div className="grid gap-6 xl:grid-cols-2"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><Server className="text-teal-600" size={20} /><div><h2 className="text-xl font-bold">Enrol a store node</h2><p className="text-xs text-slate-400">A branch belongs to one active local installation only.</p></div></div><form onSubmit={(event) => void enroll(event)} className="mt-5 space-y-4"><label className="block text-xs font-bold text-slate-600">Tenant<FormSelect value={tenantId} onChange={(event) => setTenantId(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Select tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</option>)}</FormSelect></label><label className="block text-xs font-bold text-slate-600">Store name<input name="name" required placeholder="Lekki retail store" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><fieldset><legend className="text-xs font-bold text-slate-600">Assigned branches</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{branches.map((branch) => <label key={branch.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={() => toggle(branchIds, branch.id, setBranchIds)} />{branch.name} <span className="text-xs text-slate-400">{branch.code}</span></label>)}{tenantId && !branches.length && <p className="text-sm text-slate-500">This tenant has no active branches available for a node.</p>}</div></fieldset><button className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">Enrol node</button></form></section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><Rocket className="text-teal-600" size={20} /><div><h2 className="text-xl font-bold">Prepare a release</h2><p className="text-xs text-slate-400">Images must use an immutable SHA-256 digest.</p></div></div><form onSubmit={(event) => void createRelease(event)} className="mt-5 space-y-4"><label className="block text-xs font-bold text-slate-600">Version<input name="version" required placeholder="2026.08.26.1" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label className="block text-xs font-bold text-slate-600">Immutable image reference<input name="image_ref" required placeholder="registry.example/store-node@sha256:…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label className="block text-xs font-bold text-slate-600">Release notes<textarea name="release_notes" rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Create release</button></form></section></div>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><Cloud className="text-teal-600" size={20} /><div><h2 className="text-xl font-bold">Fleet health</h2><p className="text-xs text-slate-400">A node is Online when its heartbeat is less than five minutes old. Offline go-live needs all listed evidence.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{nodes.map((node) => <article key={node.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{node.name}</p><p className="mt-1 text-xs text-slate-400">{tenants.find((tenant) => tenant.id === node.tenant_id)?.name || node.tenant_id}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isOnline(node.last_seen_at) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{isOnline(node.last_seen_at) ? "Online" : "Offline"}</span></div><dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-400">Last heartbeat</dt><dd className="text-right font-medium">{prettyTime(node.last_seen_at)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Last sync</dt><dd className="text-right font-medium">{prettyTime(node.last_sync_at)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Last backup</dt><dd className="text-right font-medium">{prettyTime(node.last_backup_at)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">App version</dt><dd className="text-right font-medium">{node.app_version || "Unknown"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Update</dt><dd className="text-right font-medium capitalize">{node.update_status || "None"}</dd></div></dl><p className="mt-4 text-xs text-slate-500">{node.branch_ids.length} assigned branch{node.branch_ids.length === 1 ? "" : "es"}</p><div className={`mt-3 rounded-xl p-3 text-xs ${node.offline_readiness.ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}><p className="font-bold capitalize">Offline readiness: {node.offline_readiness.status.replaceAll("_", " ")}</p><ul className="mt-2 grid grid-cols-2 gap-1">{Object.entries(node.offline_readiness.requirements).map(([label, complete]) => <li key={label} className={complete ? "text-emerald-700" : "text-amber-800"}>{complete ? "✓" : "•"} {label.replaceAll("_", " ")}</li>)}</ul>{node.offline_readiness.status === "restore_verification_required" && <button onClick={() => void verifyBackupRestore(node)} className="mt-3 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-bold">Record restore verification</button>}{node.offline_readiness.status === "approval_required" && <button onClick={() => void approveOfflineGoLive(node)} className="mt-3 rounded-lg bg-teal-700 px-2.5 py-1.5 font-bold text-white">Approve offline go-live</button>}</div>{node.update_error && <p className="mt-3 rounded-xl bg-rose-50 p-2 text-xs text-rose-700">{node.update_error}</p>}</article>)}{!nodes.length && <p className="py-8 text-sm text-slate-500">{busy ? "Loading nodes…" : "No store nodes enrolled."}</p>}</div></section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><UploadCloud className="text-teal-600" size={20} /><div><h2 className="text-xl font-bold">Staged release control</h2><p className="text-xs text-slate-400">Publishing makes a release assignable. Assignment only offers it to the selected stores.</p></div></div><div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]"><div className="space-y-3">{releases.map((release) => <div key={release.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><p className="font-bold">{release.version}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${release.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{release.status}</span></div><p className="mt-1 break-all text-xs text-slate-400">{release.image_ref}</p>{release.release_notes && <p className="mt-3 text-sm text-slate-600">{release.release_notes}</p>}</div>{release.status === "draft" && <button onClick={() => void publish(release)} className="inline-flex items-center gap-1 self-start rounded-xl border border-teal-200 px-3 py-2 text-xs font-bold text-teal-700"><CheckCircle2 size={14} /> Publish</button>}</div></div>)}{!releases.length && <p className="py-8 text-sm text-slate-500">No releases prepared.</p>}</div><form onSubmit={(event) => void assign(event)} className="rounded-2xl bg-slate-50 p-5"><h3 className="font-bold">Offer a published release</h3><label className="mt-4 block text-xs font-bold text-slate-600">Release<FormSelect value={releaseId} onChange={(event) => setReleaseId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Select published release</option>{publishedReleases.map((release) => <option key={release.id} value={release.id}>{release.version}</option>)}</FormSelect></label><fieldset className="mt-4"><legend className="text-xs font-bold text-slate-600">Active nodes</legend><div className="mt-2 space-y-2">{nodes.filter((node) => node.active).map((node) => <label key={node.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={selectedNodes.includes(node.id)} onChange={() => toggle(selectedNodes, node.id, setSelectedNodes)} />{node.name}</label>)}{!nodes.filter((node) => node.active).length && <p className="text-sm text-slate-500">No active nodes available.</p>}</div></fieldset><button disabled={!publishedReleases.length} className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Offer staged release</button></form></div></section>
    </>}
  </main></PermissionGate></DashboardShell>;
}

function AccessDenied() { return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8"><p className="text-xs font-bold uppercase tracking-wider text-rose-600">Platform access required</p><h1 className="mt-3 text-2xl font-bold text-rose-950">This workspace is restricted to platform super administrators.</h1></div>; }
