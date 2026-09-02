"use client";

import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import Link from "next/link";
import { platformConsolePath } from "@/auth";

export default function PlatformPlansPage() {
  return <DashboardShell title="Plans & licensing" subtitle="Annual pricing, capacity, terminal allowances, and module entitlements."><PermissionGate permission="tenant.read"><div className="mx-auto max-w-[1100px] space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Platform configuration</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Plans & licensing</h1><p className="mt-2 text-sm text-slate-500">Pricing plans are managed from the platform Command Center to keep plan configuration, tenant assignment, and audit evidence together.</p></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Manage plans in Command Center</h2><p className="mt-2 text-sm leading-6 text-slate-600">Create and edit annual plans, included modules, terminal capacity, and branding add-ons from the central platform control panel.</p><Link href={platformConsolePath("/command-center")} className="mt-5 inline-flex rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">Open Command Center</Link></section></div></PermissionGate></DashboardShell>;
}
