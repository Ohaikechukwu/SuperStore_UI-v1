"use client";

import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import PricingPlanEditor from "@/components/pricing-plan-editor";

export default function PlatformPlansPage() {
  return <DashboardShell title="Plans & licensing" subtitle="Annual pricing, capacity, terminal allowances, and module entitlements."><PermissionGate allowedRoles={["platform_super_admin"]}><div className="mx-auto max-w-[1100px] space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Platform configuration</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Plans & licensing</h1><p className="mt-2 text-sm text-slate-500">Create, price, activate, and update the annual plans available to tenants.</p></div><PricingPlanEditor /></div></PermissionGate></DashboardShell>;
}
