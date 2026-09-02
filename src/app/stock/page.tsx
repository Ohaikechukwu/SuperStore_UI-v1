"use client";

import { ArrowRightLeft, Boxes, ClipboardCheck, PackagePlus } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";

const links = [
  { title: "Stock balances", text: "Review quantities, batches, expiry risks, and low-stock alerts.", href: "/inventory", icon: Boxes },
  { title: "Receive stock", text: "Record supplier deliveries into the tenant and branch stock ledger.", href: "/purchasing", icon: PackagePlus },
  { title: "Transfer and count", text: "Use the inventory workspace for branch transfers and physical counts.", href: "/inventory", icon: ArrowRightLeft },
];

export default function StockPage() {
  return <DashboardShell title="Stock" subtitle="Branch stock control, transfers, counts, and batch integrity"><PermissionGate permission="inventory.read" module="stock"><div className="mx-auto max-w-[1100px] space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Stock module</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Stock control</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Stock is separated from retail operations so teams can control quantity, batches, and branch movement without opening the Store workspace.</p></header>
    <div className="grid gap-5 md:grid-cols-3">{links.map((item) => { const Icon = item.icon; return <a key={item.title} href={item.href} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-teal-200 hover:shadow-md"><Icon className="text-teal-600" size={23}/><h2 className="mt-5 text-lg font-bold text-slate-900">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p></a>; })}</div>
    <section className="rounded-3xl border border-teal-100 bg-teal-50 p-6"><div className="flex items-center gap-3"><ClipboardCheck className="text-teal-700" size={22}/><div><h2 className="font-bold text-slate-900">Offline-safe stock ledger</h2><p className="mt-1 text-sm text-slate-600">Receipts, transfers, counts, and the resulting accounting entries are written locally first and synchronize in order when the tenant node reconnects.</p></div></div></section>
  </div></PermissionGate></DashboardShell>;
}
