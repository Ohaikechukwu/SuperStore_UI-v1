"use client";

import { FormEvent, useEffect, useState } from "react";
import { Clock3, KeyRound, Laptop, LockKeyhole, ShieldCheck, ShieldOff, UserRound, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Session = { session_id: string; device_id: string | null; created_at: string; expires_at: string; revoked: boolean };
type AuditActor = { id: string | null; name: string; email: string | null; source: string };
type CashSessionContext = {
  session_number: string; branch_name: string; cash_point_number: number | null;
  operator: AuditActor | null; opened_at: string | null; closed_at: string | null;
  status: string; closure_reason: string | null;
};
type AuditEvent = {
  id: string; action: string; entity_type: string; entity_id: string; actor_id: string | null;
  actor: AuditActor | null; device_id: string | null; reason: string | null; created_at: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  context: CashSessionContext | null;
};
type Detail = { label: string; value: string };
type AuthEvent = { id: string; user_id: string | null; event_type: string; success: boolean; reason: string | null; created_at: string };
type ClinicalAccessEvent = { id: string; patient_id: string; actor_id: string; action: string; purpose: string; fields_accessed: string[]; created_at: string };

const moneyKeys = new Set(["opening_cash", "closing_cash", "expected_cash", "variance", "gross_sales", "refund_total", "net_sales", "total", "subtotal", "amount", "unit_cost", "unit_price"]);
const labels: Record<string, string> = {
  session_number: "Session", branch_name: "Branch", cash_point_number: "Terminal",
  opened_at: "Opened", closed_at: "Closed", work_period_started_at: "Work period opened",
  work_period_ends_at: "Work period ends", closure_reason: "Closure reason",
  opening_cash: "Opening float", closing_cash: "Closing cash", expected_cash: "Expected cash",
  variance: "Cash variance", sales_count: "Sales", gross_sales: "Gross sales", refund_total: "Refunds",
  net_sales: "Net sales", payments_by_method: "Payments", customer_number: "Customer no.",
  supplier_number: "Supplier no.", purchase_order_number: "Purchase order", receipt_number: "Receipt",
  name: "Name", active: "Status", status: "Status", quantity: "Quantity", reason: "Reason",
};

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll(".", " · ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function valueFor(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (key.endsWith("_at")) return dateTime(String(value));
  if (typeof value === "boolean") return value ? "Active" : "Inactive";
  if (moneyKeys.has(key)) {
    const amount = Number(value);
    return Number.isFinite(amount) ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount) : String(value);
  }
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "None";
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>)
    .map(([name, amount]) => `${humanize(name)}: ${valueFor("amount", amount)}`).join(" · ");
  return String(value);
}

function auditDetails(event: AuditEvent): Detail[] {
  const details: Detail[] = [];
  const add = (label: string, value: unknown, key = label) => {
    if (value !== null && value !== undefined && value !== "" && !details.some((item) => item.label === label)) {
      details.push({ label, value: valueFor(key, value) });
    }
  };
  if (event.context) {
    add("Session", event.context.session_number);
    add("Branch", event.context.branch_name);
    add("Terminal", event.context.cash_point_number);
    add("Opened", event.context.opened_at, "opened_at");
    if (event.action.includes("closed")) add("Closed", event.context.closed_at, "closed_at");
    add("Session status", event.context.status);
    add("Closure reason", event.context.closure_reason);
  }
  const data = event.after || event.before || {};
  const priority = ["receipt_number", "customer_number", "supplier_number", "purchase_order_number", "name", "active", "work_period_started_at", "work_period_ends_at", "opening_cash", "closing_cash", "expected_cash", "variance", "sales_count", "gross_sales", "refund_total", "net_sales", "payments_by_method", "quantity", "status"];
  for (const key of priority) {
    if (key in data) add(labels[key] || humanize(key), data[key], key);
  }
  for (const [key, value] of Object.entries(data)) {
    if (key.endsWith("_id") || priority.includes(key) || key === "id") continue;
    add(labels[key] || humanize(key), value, key);
  }
  return details.slice(0, 10);
}

function actorLabel(event: AuditEvent) {
  if (event.actor) return event.actor.name;
  return "Not recorded (historic event)";
}

function browserLabel(deviceId: string | null) {
  return deviceId ? `Browser · ${deviceId.slice(-8).toUpperCase()}` : "Browser device not recorded";
}

export default function Page() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [mfa, setMfa] = useState<{ enabled: boolean; secret?: string; uri?: string }>({ enabled: false });
  const [mfaOpen, setMfaOpen] = useState(false);
  const [verification, setVerification] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const results = await Promise.allSettled([
      api.get<Session[]>("/api/v1/auth/sessions"),
      api.get<AuditEvent[]>("/api/v1/auth/audit"),
    ]);
    if (results[0].status === "fulfilled") setSessions(results[0].value);
    if (results[1].status === "fulfilled") setEvents(results[1].value);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected" && failed.reason instanceof ApiError) setError(failed.reason.message);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function setupMfa() {
    try {
      const result = await api.post<{ enabled: boolean; secret: string; otpauth_uri: string }>("/api/v1/auth/mfa/setup", {});
      setMfa({ enabled: result.enabled, secret: result.secret, uri: result.otpauth_uri });
      setMfaOpen(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to start MFA setup.");
    }
  }

  async function changeMfa(event: FormEvent<HTMLFormElement>, action: "enable" | "disable") {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code"));
    try {
      await api.post(`/api/v1/auth/mfa/${action}`, { code });
      setMfa({ enabled: action === "enable" });
      setMfaOpen(false);
      setNotice(action === "enable" ? "MFA enabled." : "MFA disabled.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Invalid MFA code.");
    }
  }

  async function revoke(sessionId: string) {
    try {
      await api.post(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, {});
      setNotice("Session revoked.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to revoke session.");
    }
  }
  async function requestVerification() { try { const result = await api.post<{ status: string; dev_token?: string | null }>("/api/v1/auth/email/verification/request", {}); setVerification(result.dev_token ? `Verification token: ${result.dev_token}` : result.status); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to request email verification."); } }

  const sessionScroll = sessions.length > 15;
  const auditScroll = events.length > 15;
  return <DashboardShell title="Security & audit" subtitle="MFA, active sessions, authentication activity, and audit history"><PermissionGate permission="audit.read"><div className="mx-auto max-w-[1280px] space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Security center</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Security & audit</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Every audited action records who performed it, when it happened, and the operational information needed for review.</p></div>
    {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}{notice && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><ShieldCheck className={mfa.enabled ? "text-emerald-600" : "text-amber-600"} size={22} /><div><h2 className="text-xl font-bold">Multi-factor authentication</h2><p className="mt-1 text-xs text-slate-400">Protect this account with TOTP.</p></div></div><p className={`mt-6 rounded-xl p-3 text-sm font-bold ${mfa.enabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{mfa.enabled ? "MFA is enabled" : "MFA is not enabled"}</p><button onClick={() => void setupMfa()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><KeyRound size={16} /> {mfa.enabled ? "Regenerate setup" : "Set up MFA"}</button>{mfa.enabled && <button onClick={() => setMfaOpen(true)} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-100 px-4 py-3 text-sm font-bold text-rose-600"><ShieldOff size={16} /> Disable MFA</button>}</section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Laptop className="text-teal-600" size={21} /><div><h2 className="text-xl font-bold">Active sessions</h2><p className="mt-1 text-xs text-slate-400">Only non-revoked, unexpired sessions are shown.</p></div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{sessions.length}</span></div><div className={`mt-5 divide-y divide-slate-100 ${sessionScroll ? "max-h-[52rem] overflow-y-auto pr-2" : ""}`}>{sessions.map((session) => <div key={session.session_id} className="flex items-center gap-3 py-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50"><Laptop size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{browserLabel(session.device_id)}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Clock3 size={12} /> Started {dateTime(session.created_at)} · Expires {dateTime(session.expires_at)}</p></div><button onClick={() => void revoke(session.session_id)} className="text-xs font-bold text-rose-600">Revoke</button></div>)}{!sessions.length && <p className="py-8 text-sm text-slate-500">No active sessions.</p>}</div></section></div>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><LockKeyhole className="text-teal-600" size={21} /><div><h2 className="text-xl font-bold">Audit activity</h2><p className="mt-1 text-xs text-slate-400">Latest {events.length} recorded events. Historic events without a captured actor are clearly marked.</p></div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{events.length}</span></div><div className={`mt-5 divide-y divide-slate-100 ${auditScroll ? "max-h-[58rem] overflow-y-auto pr-2" : ""}`}>{events.map((event) => { const details = auditDetails(event); return <article key={event.id} className="py-5"><div className="flex items-start gap-4"><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" /><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-bold text-slate-900">{humanize(event.action)}</p><p className="text-xs text-slate-400">{dateTime(event.created_at)}</p></div><p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><UserRound size={14} className="text-slate-400" /> {actorLabel(event)}{event.actor?.email && <span className="text-slate-400">· {event.actor.email}</span>}</p>{details.length > 0 && <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">{details.map((detail) => <div key={detail.label} className="min-w-0"><dt className="font-semibold text-slate-400">{detail.label}</dt><dd className="mt-0.5 break-words font-medium text-slate-700">{detail.value}</dd></div>)}</dl>}{event.reason && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Reason: {event.reason}</p>}</div></div></article>; })}{!events.length && <p className="py-8 text-sm text-slate-500">No audit events available.</p>}</div></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold">Email verification</h2><p className="mt-1 text-sm text-slate-500">Request a verification link for the signed-in account.</p>{verification && <p className="mt-3 break-all rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{verification}</p>}</div><button onClick={() => void requestVerification()} className="rounded-xl border border-teal-200 px-4 py-2.5 text-sm font-bold text-teal-700">Send verification</button></div></section>
    <SecurityEventPanels />
    {mfaOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void changeMfa(event, mfa.enabled ? "disable" : "enable")} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{mfa.enabled ? "Disable MFA" : "Confirm MFA setup"}</h2><button type="button" onClick={() => setMfaOpen(false)}><X size={18} /></button></div>{!mfa.enabled && <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5"><p className="font-bold">Add this secret to your authenticator app:</p><p className="mt-2 break-all font-mono text-teal-700">{mfa.secret}</p><p className="mt-3 break-all text-slate-500">{mfa.uri}</p></div>}<label className="mt-5 block text-xs font-bold text-slate-600">Authenticator code<input name="code" required inputMode="numeric" pattern="[0-9]{6,8}" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-lg tracking-[0.4em]" /></label><button className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">{mfa.enabled ? "Disable MFA" : "Enable MFA"}</button></form></div>}
  </div></PermissionGate></DashboardShell>;
}

function SecurityEventPanels() { const [authEvents, setAuthEvents] = useState<AuthEvent[]>([]); const [clinicalEvents, setClinicalEvents] = useState<ClinicalAccessEvent[]>([]); useEffect(() => { void Promise.allSettled([api.get<AuthEvent[]>("/api/v1/auth/events"), api.get<ClinicalAccessEvent[]>("/api/v1/clinical/access-events")]).then(([auth, clinical]) => { if (auth.status === "fulfilled") setAuthEvents(auth.value); if (clinical.status === "fulfilled") setClinicalEvents(clinical.value); }); }, []); return <div className="grid gap-6 xl:grid-cols-2"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Authentication activity</h2><p className="mt-1 text-xs text-slate-400">Recent successful and unsuccessful authentication events.</p><div className="mt-5 divide-y divide-slate-100">{authEvents.map((event) => <div key={event.id} className="flex justify-between gap-3 py-3"><div><p className="font-semibold">{humanize(event.event_type)}</p>{event.reason && <p className="mt-1 text-xs text-slate-500">{event.reason}</p>}</div><div className="text-right"><p className={event.success ? "text-xs font-bold text-emerald-700" : "text-xs font-bold text-rose-700"}>{event.success ? "Success" : "Failed"}</p><p className="mt-1 text-xs text-slate-400">{dateTime(event.created_at)}</p></div></div>)}{!authEvents.length && <p className="py-6 text-sm text-slate-500">No authentication events available.</p>}</div></section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Clinical record access</h2><p className="mt-1 text-xs text-slate-400">Access to patient records is logged with the declared clinical purpose.</p><div className="mt-5 divide-y divide-slate-100">{clinicalEvents.map((event) => <div key={event.id} className="py-3"><div className="flex justify-between gap-3"><p className="font-semibold">{humanize(event.action)}</p><p className="text-xs text-slate-400">{dateTime(event.created_at)}</p></div><p className="mt-1 text-sm text-slate-600">{event.purpose}</p><p className="mt-1 text-xs text-slate-400">Patient {event.patient_id.slice(0, 8)} · {event.fields_accessed.join(", ")}</p></div>)}{!clinicalEvents.length && <p className="py-6 text-sm text-slate-500">No patient record access has been logged.</p>}</div></section></div>; }
