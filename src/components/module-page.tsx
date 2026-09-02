"use client";

import { ArrowUpRight, BarChart3, Boxes, ClipboardList, CreditCard, FileText, Pill, Plus, ShoppingCart, Stethoscope, Users } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";

const icons = { inventory: Boxes, pos: ShoppingCart, purchasing: ClipboardList, pharmacy: Pill, hospital: Stethoscope, accounting: CreditCard, reports: BarChart3, people: Users, settings: FileText } as const;
const copy = {
  inventory: ["Inventory control", "Monitor stock, batches, transfers, counts, and reorder activity.", "inventory.read"],
  pos: ["Point of sale", "Open a cash session and keep every sale synced with inventory and accounting.", "sales.create"],
  purchasing: ["Purchasing", "Manage suppliers, purchase orders, approvals, and receiving.", "purchasing.read"],
  pharmacy: ["Pharmacy operations", "Prescriptions, FEFO dispensing, batch traceability, claims, and controlled medicines.", "pharmacy.prescriptions.read"],
  hospital: ["Hospital operations", "Patients, encounters, admissions, diagnostics, nursing, and clinical billing.", "hospital.patients.read"],
  accounting: ["Accounting", "Chart of accounts, journals, payables, receivables, and fiscal periods.", "accounting.read"],
  reports: ["Reports", "Understand sales, stock, purchasing, cash, pharmacy, hospital, and financial performance.", "reports.read"],
  people: ["People & access", "Manage employees, roles, permissions, branch scope, and audit access.", "users.read"],
  settings: ["Workspace settings", "Configure your organization, branding, modules, and operational preferences.", "tenant.read"],
} as const;

export default function ModulePage({ module }: { module: keyof typeof copy }) {
  const Icon = icons[module]; const [title, description] = copy[module];
  return <DashboardShell title={title} subtitle="Connected to your live operational workspace."><div className="mx-auto max-w-[1200px]"><div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-600"><Icon size={26} /></div><p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Module workspace</p><h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{description}</p><div className="mt-8 flex flex-wrap gap-3"><button className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"><Plus size={16} /> Create new</button><button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:border-slate-300">View activity <ArrowUpRight size={16} /></button></div></div></div></DashboardShell>;
}
