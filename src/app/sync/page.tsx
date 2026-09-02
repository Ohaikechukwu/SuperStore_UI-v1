"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Cloud, RefreshCw, RotateCcw, Server, Smartphone, XCircle } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import {
  flushQueue,
  pendingCommands,
  queueSummary,
  retryBlockedCommands,
  type OfflineCommand,
  type QueueSummary,
} from "@/offlineQueue";

type ServerCommand = {
  command_id: string;
  device_id: string;
  command_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  dead_lettered: boolean;
};
type Conflict = { id: string; command_id: string; reason: string; status: string; created_at: string };
type SyncDevice = { id: string; device_id: string; created_at?: string; last_seen_at?: string | null; active?: boolean };

const emptySummary: QueueSummary = { total: 0, actionable: 0, needsReview: 0, blocked: 0, legacy: 0 };

export default function Page() {
  const [queued, setQueued] = useState<OfflineCommand[]>([]);
  const [commands, setCommands] = useState<ServerCommand[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [summary, setSummary] = useState<QueueSummary>(emptySummary);
  const [busy, setBusy] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [serverCommands, openConflicts, registeredDevices, localCommands, localSummary] = await Promise.all([
        api.get<ServerCommand[]>("/api/v1/sync/commands"),
        api.get<Conflict[]>("/api/v1/sync/conflicts"),
        api.get<SyncDevice[]>("/api/v1/sync/devices"),
        pendingCommands(),
        queueSummary(),
      ]);
      setCommands(serverCommands);
      setConflicts(openConflicts);
      setDevices(registeredDevices);
      setQueued(localCommands);
      setSummary(localSummary);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load synchronization state.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    const refresh = () => { void load(); };
    window.addEventListener("superstore:sync-complete", refresh);
    window.addEventListener("superstore:live-change", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("superstore:sync-complete", refresh);
      window.removeEventListener("superstore:live-change", refresh);
    };
  }, []);

  async function syncNow() {
    setSyncing(true);
    setError("");
    try {
      // This is a deliberate user retry for a request rejected before the
      // server could record it (for example, a refreshed sign-in token).
      await retryBlockedCommands();
      const results = await flushQueue(API_BASE);
      const outstanding = await queueSummary();
      const posted = results.filter((item) => ["accepted", "duplicate"].includes(item.status)).length;
      if (outstanding.needsReview) {
        setNotice(`${posted} command${posted === 1 ? "" : "s"} posted. A remaining command needs conflict review.`);
      } else if (outstanding.blocked) {
        setNotice("The queue is retained, but one or more commands still need sign-in or permission review.");
      } else {
        setNotice(`${posted} queued command${posted === 1 ? "" : "s"} synchronized.`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to synchronize offline commands.");
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function retry(commandId: string) {
    try {
      await api.post(`/api/v1/sync/commands/${encodeURIComponent(commandId)}/retry`, {});
      setNotice("Command retry completed.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to retry command.");
    }
  }

  async function resolve(conflictId: string, resolution: "retry" | "reject") {
    try {
      await api.post(`/api/v1/sync/conflicts/${conflictId}/resolve`, { resolution });
      await flushQueue(API_BASE).catch(() => undefined);
      setNotice(`Conflict ${resolution} request completed.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to resolve conflict.");
    }
  }

  return <DashboardShell title="Sync center" subtitle="Ordered offline work, live delivery, and conflict review"><PermissionGate permission="sync.commands.read"><div className="mx-auto max-w-[1280px] space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Offline operations</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Sync center</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Commands are tenant-bound, sent in order, and retained until the server accepts them or an authorised user explicitly rejects them.</p></div><button onClick={() => void syncNow()} disabled={syncing} className="inline-flex items-center gap-2 self-start rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Cloud size={16} /> {syncing ? "Synchronizing…" : "Sync now"}</button></div>
    {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}{notice && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    {summary.legacy > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{summary.legacy} command{summary.legacy === 1 ? "" : "s"} from an older app version were retained without an owner and will never be sent automatically. Contact an administrator to review the original browser data.</div>}
    <div className="grid gap-4 sm:grid-cols-5"><Metric icon={<Smartphone size={18} />} label="Local queue" value={String(summary.total)} /><Metric icon={<Server size={18} />} label="Server commands" value={String(commands.length)} /><Metric icon={<Smartphone size={18} />} label="Registered devices" value={String(devices.length)} /><Metric icon={<AlertTriangle size={18} />} label="Needs review" value={String(Math.max(summary.needsReview, conflicts.length))} /><Metric icon={<XCircle size={18} />} label="Blocked locally" value={String(summary.blocked)} /></div>
    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Local queue</h2><button onClick={() => void load()} className="text-slate-400" aria-label="Refresh queue"><RefreshCw size={17} /></button></div><div className="mt-5 divide-y divide-slate-100">{queued.map((item) => <div key={item.commandId} className="py-4"><div className="flex justify-between gap-3"><p className="font-bold">{item.commandType}</p><span className="text-xs font-semibold capitalize text-slate-500">{item.status.replaceAll("_", " ")}</span></div><p className="mt-1 truncate text-xs text-slate-400">{item.commandId} · {item.attempts} delivery attempt{item.attempts === 1 ? "" : "s"}</p>{item.lastError && <p className="mt-1 text-xs text-rose-600">{item.lastError}</p>}</div>)}{!queued.length && <p className="py-8 text-sm text-emerald-600">Local queue is empty.</p>}</div></section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Server command history</h2><div className="mt-5 divide-y divide-slate-100">{commands.slice(0, 12).map((item) => <div key={item.command_id} className="flex items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.command_type}</p><p className="truncate text-xs text-slate-400">{item.command_id} · {item.attempts} attempts</p>{item.last_error && <p className="mt-1 text-xs text-rose-600">{item.last_error}</p>}</div><span className="text-xs font-bold capitalize text-slate-500">{item.status.replaceAll("_", " ")}</span>{["retrying", "pending"].includes(item.status) && !item.dead_lettered && <button onClick={() => void retry(item.command_id)} className="rounded-lg p-2 text-teal-600" aria-label="Retry command"><RotateCcw size={15} /></button>}</div>)}{!commands.length && <p className="py-8 text-sm text-slate-500">No server commands recorded.</p>}</div></section></div>
    <section className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><AlertTriangle className="text-rose-600" size={20} /><h2 className="text-xl font-bold">Conflict review</h2></div><p className="mt-2 text-sm text-slate-500">Retry only after correcting the cause. Rejecting preserves the server audit trail and releases later commands in this browser queue.</p><div className="mt-5 divide-y divide-rose-100">{conflicts.map((conflict) => <div key={conflict.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-bold">{conflict.command_id}</p><p className="mt-1 text-sm text-rose-700">{conflict.reason}</p></div><div className="flex gap-2"><button onClick={() => void resolve(conflict.id, "retry")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Retry</button><button onClick={() => void resolve(conflict.id, "reject")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white">Reject</button></div></div>)}{!conflicts.length && <p className="py-8 text-sm text-emerald-600">No open conflicts.</p>}</div></section>{busy && <p className="text-center text-sm text-slate-500">Loading synchronization state…</p>}
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><Smartphone className="text-teal-600" size={20} /><div><h2 className="text-xl font-bold">Registered devices</h2><p className="mt-1 text-xs text-slate-400">Browsers and store installations authorised to send this tenant’s offline commands.</p></div></div><div className="mt-5 divide-y divide-slate-100">{devices.map((device) => <div key={device.id || device.device_id} className="flex justify-between gap-3 py-3"><div><p className="font-mono text-sm font-semibold">{device.device_id}</p>{device.created_at && <p className="mt-1 text-xs text-slate-400">Registered {new Date(device.created_at).toLocaleString()}</p>}</div><span className={`self-center text-xs font-bold ${device.active === false ? "text-slate-400" : "text-emerald-700"}`}>{device.active === false ? "Inactive" : "Active"}</span></div>)}{!devices.length && <p className="py-6 text-sm text-slate-500">No devices have registered with this workspace yet.</p>}</div></section>{busy && <p className="text-center text-sm text-slate-500">Loading synchronization state…</p>}
  </div></PermissionGate></DashboardShell>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-teal-600">{icon}<p className="text-xs font-semibold text-slate-400">{label}</p></div><p className="mt-3 text-2xl font-bold">{value}</p></div>;
}
