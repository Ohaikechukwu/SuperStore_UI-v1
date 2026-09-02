"use client";

import FormSelect from "@/components/form-select";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, Monitor, RefreshCw, Search, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Branch = { id: string; name: string; code: string };
type Session = {
  id: string; session_number: string; status: "open" | "closed" | string;
  branch_id: string; branch_name: string; cash_point_number: number | null;
  opened_by_name: string; opened_at: string | null; closed_at: string | null;
  work_period_started_at: string | null; work_period_ends_at: string | null; closure_reason: string | null;
  opening_cash: string; expected_cash: string; closing_cash: string | null;
  variance: string | null; sales_count: number; gross_sales: string;
  refund_count: number; refund_total: string; net_sales: string;
  payments_by_method: Record<string, string>; closing_notes: string | null;
};
type SessionDetail = Session & {
  sales: Array<{ id: string; receipt_number: string; status: string; customer_name: string; total: string; created_at: string }>;
  returns: Array<{ id: string; return_number: string; status: string; reason: string; refund_method: string; total: string; created_at: string }>;
};

const money = (value: string | null) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN",
}).format(Number(value || 0));
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

function failure(caught: unknown, fallback: string) {
  return caught instanceof ApiError ? caught.message : fallback;
}

export default function TerminalSessionsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(selectedBranch = branchId) {
    setLoading(true); setError("");
    try {
      const [branchData, sessionData] = await Promise.all([
        api.get<Branch[]>("/api/v1/catalog/branches"),
        api.get<Session[]>(`/api/v1/pos/sessions?limit=250${selectedBranch ? `&branch_id=${encodeURIComponent(selectedBranch)}` : ""}`),
      ]);
      setBranches(branchData); setSessions(sessionData);
    } catch (caught) { setError(failure(caught, "Unable to load terminal sessions.")); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.get<Branch[]>("/api/v1/catalog/branches"),
      api.get<Session[]>("/api/v1/pos/sessions?limit=250"),
    ])
      .then(([branchData, sessionData]) => {
        if (!active) return;
        setBranches(branchData); setSessions(sessionData);
      })
      .catch((caught) => active && setError(failure(caught, "Unable to load terminal sessions.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return sessions;
    return sessions.filter((session) => [session.session_number, session.branch_name,
      `pos ${session.cash_point_number || ""}`, session.opened_by_name]
      .some((value) => value.toLocaleLowerCase().includes(term)));
  }, [query, sessions]);

  async function showDetails(session: Session) {
    setDetailLoading(true); setError("");
    try { setSelected(await api.get<SessionDetail>(`/api/v1/pos/sessions/${session.id}`)); }
    catch (caught) { setError(failure(caught, "Unable to load this terminal session.")); }
    finally { setDetailLoading(false); }
  }

  return <DashboardShell title="Terminal sessions" subtitle="Opening floats, closing reconciliation, sales and returns by POS terminal">
    <PermissionGate permission="cash_sessions.open">
      <div className="mx-auto max-w-[1280px] space-y-6">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">POS audit trail</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Terminal sessions</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Every time a cashier opens or closes a POS terminal, the opening float, expected cash, counted cash and difference are retained here.</p></div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
        </section>
        {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row">
            <FormSelect value={branchId} onChange={(event) => { const value = event.target.value; setBranchId(value); void load(value); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><option value="">All permitted branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</FormSelect>
            <label className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Session number, POS terminal, branch or cashier" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500" /></label>
          </div>
          {loading ? <div className="p-10 text-sm text-slate-500">Loading terminal-session history…</div> : !visible.length ? <div className="p-12 text-center"><Monitor className="mx-auto text-slate-300" size={34} /><p className="mt-3 text-sm font-bold text-slate-700">No terminal sessions found</p><p className="mt-1 text-xs text-slate-500">Open a POS terminal to begin recording its session history.</p></div> : <div className="overflow-x-auto"><table className="min-w-[1260px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Terminal / session</th><th className="px-5 py-3">Cashier</th><th className="px-5 py-3">Opened</th><th className="px-5 py-3">Work period</th><th className="px-5 py-3">Opening cash</th><th className="px-5 py-3">Expected cash</th><th className="px-5 py-3">Closing cash</th><th className="px-5 py-3">Difference</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{visible.map((session) => <tr key={session.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold text-slate-800">POS {session.cash_point_number ?? "—"} · {session.branch_name}</p><p className="mt-1 font-mono text-xs text-slate-400">{session.session_number}</p></td><td className="px-5 py-4 font-semibold text-slate-700">{session.opened_by_name}</td><td className="px-5 py-4 text-xs text-slate-600"><p>{dateTime(session.opened_at)}</p>{session.closed_at && <p className="mt-1 text-slate-400">Closed {dateTime(session.closed_at)}</p>}</td><td className="px-5 py-4 text-xs text-slate-600"><p>{dateTime(session.work_period_started_at)}</p><p className="mt-1 text-slate-400">Ends {dateTime(session.work_period_ends_at)}</p></td><td className="px-5 py-4 font-bold">{money(session.opening_cash)}</td><td className="px-5 py-4 font-bold">{money(session.expected_cash)}</td><td className="px-5 py-4 font-bold">{session.closing_cash === null ? "—" : money(session.closing_cash)}</td><td className={`px-5 py-4 font-bold ${session.variance && Number(session.variance) !== 0 ? "text-rose-700" : "text-emerald-700"}`}>{session.variance === null ? (session.status === "auto_closed" ? "Not counted" : "Open") : money(session.variance)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${session.status === "open" ? "bg-amber-50 text-amber-700" : session.status === "auto_closed" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>{session.status === "open" ? "Open" : session.status === "auto_closed" ? "Auto-closed" : "Closed"}</span></td><td className="px-5 py-4 text-right"><button onClick={() => void showDetails(session)} disabled={detailLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-teal-700 hover:border-teal-300 disabled:opacity-40">Details <ChevronRight size={14} /></button></td></tr>)}</tbody></table></div>}
        </section>
      </div>
      {selected && <SessionDetailModal session={selected} close={() => setSelected(null)} />}
    </PermissionGate>
  </DashboardShell>;
}

function SessionDetailModal({ session, close }: { session: SessionDetail; close: () => void }) {
  const values: Array<[string, string, boolean?]> = [
    ["Work period", `${dateTime(session.work_period_started_at)} → ${dateTime(session.work_period_ends_at)}`],
    ["Opening cash", money(session.opening_cash)], ["Cash sales expected", money(session.expected_cash)],
    ["Counted closing cash", session.closing_cash === null ? "Not closed" : money(session.closing_cash)],
    ["Cash difference", session.variance === null ? "Not closed" : money(session.variance), Boolean(session.variance && Number(session.variance) !== 0)],
    ["Gross sales", money(session.gross_sales)], ["Returns", `${session.refund_count} · ${money(session.refund_total)}`],
    ["Net sales", money(session.net_sales)], ["Receipts", String(session.sales_count)],
  ];
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><div className="mx-auto my-6 w-full max-w-5xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">POS {session.cash_point_number ?? "—"} session</p><h2 className="mt-1 text-2xl font-bold">{session.session_number}</h2><p className="mt-2 text-sm text-slate-500">{session.branch_name} · Opened by {session.opened_by_name} on {dateTime(session.opened_at)}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><CalendarClock size={13} /> Closed: {dateTime(session.closed_at)}{session.closure_reason === "work_period_elapsed" ? " · Automatically closed at the scheduled work-period end" : ""}</p></div><button onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close session details"><X size={20} /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{values.map(([label, value, bad]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 text-sm font-bold ${bad ? "text-rose-700" : "text-slate-800"}`}>{value}</p></div>)}</div>{session.closing_notes && <p className="mt-4 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600"><strong className="text-slate-800">Closing note:</strong> {session.closing_notes}</p>}<section className="mt-6"><h3 className="font-bold text-slate-800">Payment methods</h3><div className="mt-3 flex flex-wrap gap-2">{Object.entries(session.payments_by_method).map(([method, amount]) => <span key={method} className="rounded-full bg-teal-50 px-3 py-2 text-xs font-bold capitalize text-teal-800">{method.replaceAll("_", " ")} · {money(amount)}</span>)}{!Object.keys(session.payments_by_method).length && <span className="text-sm text-slate-500">No payments were posted in this session.</span>}</div></section><section className="mt-7"><h3 className="font-bold text-slate-800">Sales receipts</h3><SessionRecords rows={session.sales} type="sales" /></section><section className="mt-7"><h3 className="font-bold text-slate-800">Return receipts</h3><SessionRecords rows={session.returns} type="returns" /></section></div></div>;
}

function SessionRecords({ rows, type }: { rows: SessionDetail["sales"] | SessionDetail["returns"]; type: "sales" | "returns" }) {
  if (!rows.length) return <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No {type} in this terminal session.</p>;
  return <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-100"><table className="min-w-[650px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((item) => <tr key={item.id}><td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{"receipt_number" in item ? item.receipt_number : item.return_number}</td><td className="px-4 py-3"><p className="font-semibold text-slate-700">{"customer_name" in item ? item.customer_name : item.reason}</p><p className="mt-1 text-xs capitalize text-slate-400">{item.status}{"refund_method" in item ? ` · ${item.refund_method.replaceAll("_", " ")}` : ""}</p></td><td className="px-4 py-3 text-xs text-slate-500">{dateTime(item.created_at)}</td><td className="px-4 py-3 text-right font-bold">{money(item.total)}</td></tr>)}</tbody></table></div>;
}
