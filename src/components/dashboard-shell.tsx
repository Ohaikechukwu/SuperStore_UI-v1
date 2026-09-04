"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Boxes, Building2, CalendarDays, ChevronDown, ClipboardList, CreditCard, KeyRound,
  FlaskConical, GitBranch, HeartPulse, LayoutDashboard, LogOut, Menu, MessageCircle, Package, Pill, RefreshCw, Settings, ShoppingCart, ShieldCheck, Bell,
  Monitor, ReceiptText, RotateCcw, Stethoscope, Users, WalletCards, Wifi, WifiOff, X,
} from "lucide-react";
import { apiFetch, clearTenantRoute, clearTokens, platformConsolePath, saveTenantPublicId, tenantLoginPath } from "@/auth";
import type { AuthorizationContext } from "@/lib/authorization";
import { can, hasModule, loadAuthorizationContext, readCachedAuthorizationContext } from "@/lib/authorization";
import { ApiError } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { cn } from "@/lib/ui";
import { loadTenantTheme, resetPlatformTheme } from "@/tenantTheme";
import SyncManager, { emptySummary, type SyncState } from "@/components/sync-manager";
import { useTenantTheme } from "@/components/tenant-theme-provider";
import { useApiConnectivity } from "@/lib/connectivity";
import { useRealtimeEvents } from "@/lib/realtime";

type UserProfile = { user_id: string; tenant_id: string; email: string; full_name: string; role: string; attributes?: Record<string, unknown> };
type Notification = { id: string; title: string; message: string; severity: string; link?: string | null; read_at: string | null };

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; permission?: string; anyPermissions?: string[]; module?: string; platformOnly?: boolean; roles?: string[]; children?: NavItem[] };

const navItems: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Direct messages", href: "/messages", icon: MessageCircle },
  { label: "Patient portal", href: "/patient-portal", icon: HeartPulse, permission: "patient.portal.access", module: "hospital", roles: ["patient"], children: [{ label: "Manage appointments", href: "/patient-portal/appointments/manage", icon: CalendarDays, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Book appointment", href: "/patient-portal/appointments", icon: CalendarDays, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "My care", href: "/patient-portal/care", icon: HeartPulse, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Refill requests", href: "/patient-portal/refills", icon: Pill, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Family access", href: "/patient-portal/family", icon: Users, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Documents", href: "/patient-portal/documents", icon: ClipboardList, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Patient wallet", href: "/patient-portal/wallet", icon: WalletCards, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Patient invoices", href: "/patient-portal/invoices", icon: CreditCard, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Secure messages", href: "/patient-portal/messages", icon: HeartPulse, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }, { label: "Profile & privacy", href: "/patient-portal/profile", icon: Settings, permission: "patient.portal.access", module: "hospital", roles: ["patient"] }] },
  { label: "Store", href: "/pos", icon: ShoppingCart, anyPermissions: ["sales.create", "catalog.product.read", "purchasing.read", "cash_sessions.open"], module: "store", children: [
    { label: "Point of sale", href: "/pos", icon: ShoppingCart, permission: "sales.create", module: "store" },
    { label: "Products", href: "/products", icon: Package, permission: "catalog.product.read", module: "store" },
    { label: "Terminal sessions", href: "/terminal-sessions", icon: Monitor, permission: "cash_sessions.open", module: "store" },
    { label: "Sales returns", href: "/returns", icon: RotateCcw, permission: "sales.refund", module: "store" },
    { label: "Purchasing", href: "/purchasing", icon: ClipboardList, permission: "purchasing.read", module: "store" },
    { label: "Customers & suppliers", href: "/contacts", icon: Users, anyPermissions: ["customers.read", "purchasing.read"], module: "store" },
    { label: "Customer CRM & loyalty", href: "/crm", icon: Users, permission: "crm.read", module: "store" },
  ] },
  { label: "Inventory", href: "/inventory", icon: Boxes, permission: "inventory.read", module: "inventory", children: [
    { label: "Inventory overview", href: "/inventory", icon: Boxes, permission: "inventory.read", module: "inventory" },
  ] },
  { label: "Stock", href: "/stock", icon: Boxes, permission: "inventory.read", module: "stock", children: [
    { label: "Stock control", href: "/stock", icon: Boxes, permission: "inventory.read", module: "stock" },
    { label: "Inventory balances", href: "/inventory", icon: Boxes, permission: "inventory.read", module: "stock" },
  ] },
  { label: "Hospital", href: "/hospital", icon: Stethoscope, anyPermissions: ["hospital.patients.read", "hospital.appointments.read", "hospital.lab.read", "pharmacy.prescriptions.read"], module: "hospital", children: [
    { label: "Patient management", href: "/hospital", icon: Users, permission: "hospital.patients.read", module: "hospital" },
    { label: "Patient portal accounts", href: "/hospital/patient-accounts", icon: Users, permission: "hospital.patients.update", module: "hospital" },
    { label: "Clinical chart", href: "/hospital/clinical", icon: HeartPulse, permission: "hospital.patients.read", module: "hospital" },
    { label: "Patient contacts", href: "/hospital/contacts", icon: Users, permission: "hospital.patients.read", module: "hospital" },
    { label: "Patient documents", href: "/hospital/documents", icon: ClipboardList, permission: "hospital.patients.read", module: "hospital" },
    { label: "Insurance coverage", href: "/hospital/insurance", icon: CreditCard, permission: "hospital.patients.read", module: "hospital" },
    { label: "Insurance claims", href: "/hospital/insurance-claims", icon: CreditCard, permission: "hospital.patients.read", module: "hospital" },
    { label: "Patient communications", href: "/hospital/communications", icon: RefreshCw, permission: "hospital.patients.read", module: "hospital" },
    { label: "Communication providers", href: "/hospital/communication-settings", icon: Settings, permission: "hospital.patients.update", module: "hospital" },
    { label: "Hospital reports", href: "/hospital/reports", icon: BarChart3, permission: "hospital.patients.read", module: "hospital" },
    { label: "Clinical billing settings", href: "/hospital/billing-settings", icon: CreditCard, permission: "hospital.billing.approve", module: "hospital" },
    { label: "Verify clinical payments", href: "/hospital/payment-verifications", icon: ShieldCheck, permission: "hospital.billing.post", module: "hospital" },
    { label: "Patient wallets", href: "/hospital/wallets", icon: WalletCards, permission: "hospital.billing.post", module: "hospital" },
    { label: "Verify HMO cover", href: "/hospital/hmo-verifications", icon: ShieldCheck, permission: "hospital.billing.approve", module: "hospital" },
    { label: "Problems & history", href: "/hospital/problems", icon: HeartPulse, permission: "hospital.patients.read", module: "hospital" },
    { label: "Treatment plans", href: "/hospital/treatment-plans", icon: ClipboardList, permission: "hospital.patients.read", module: "hospital" },
    { label: "Emergency department", href: "/hospital/emergency", icon: HeartPulse, permission: "hospital.encounters.read", module: "hospital" },
    { label: "Medication administration", href: "/hospital/medications", icon: ClipboardList, permission: "hospital.nursing.document", module: "hospital" },
    { label: "Theatre & operations", href: "/hospital/theatre", icon: ClipboardList, permission: "hospital.encounters.read", module: "hospital" },
    { label: "Maternity & neonatal", href: "/hospital/maternity", icon: HeartPulse, permission: "hospital.encounters.read", module: "hospital" },
    { label: "Appointments", href: "/hospital/appointments", icon: ClipboardList, permission: "hospital.appointments.read", module: "hospital" },
    { label: "Providers", href: "/hospital/providers", icon: Stethoscope, permission: "hospital.appointments.read", module: "hospital" },
    { label: "Provider schedule", href: "/hospital/schedule", icon: CalendarDays, permission: "hospital.appointments.read", module: "hospital" },
    { label: "Clinician availability", href: "/hospital/availability", icon: CalendarDays, permission: "hospital.appointments.read", module: "hospital" },
    { label: "Patient flow queue", href: "/hospital/queue", icon: Users, permission: "hospital.appointments.read", module: "hospital" },
    { label: "Discharge summaries", href: "/hospital/discharge", icon: LogOut, permission: "hospital.admissions.manage", module: "hospital" },
    { label: "Nursing & ward rounds", href: "/hospital/nursing", icon: ClipboardList, permission: "hospital.nursing.document", module: "hospital" },
    { label: "Radiology worklist", href: "/hospital/radiology", icon: ClipboardList, permission: "hospital.radiology.order", module: "hospital" },
    { label: "Radiology approvals", href: "/hospital/radiology-approval", icon: ShieldCheck, permission: "hospital.radiology.perform", module: "hospital" },
    { label: "Referrals", href: "/hospital/referrals", icon: GitBranch, permission: "hospital.encounters.read", module: "hospital" },
  ] },
  { label: "Laboratory", href: "/laboratory", icon: FlaskConical, permission: "hospital.lab.read", module: "laboratory", children: [
    { label: "Worklist & results", href: "/laboratory", icon: FlaskConical, permission: "hospital.lab.read", module: "laboratory" },
    { label: "Billing & receivables", href: "/laboratory?tab=billing", icon: CreditCard, permission: "hospital.lab.read", module: "laboratory" },
    { label: "Specimen collection", href: "/laboratory/specimens", icon: FlaskConical, permission: "hospital.lab.read", module: "laboratory" },
    { label: "Quality control", href: "/laboratory/quality-control", icon: FlaskConical, permission: "hospital.lab.read", module: "laboratory" },
  ] },
  { label: "Pharmacy", href: "/pharmacy", icon: Pill, permission: "pharmacy.prescriptions.read", module: "pharmacy", children: [
    { label: "Prescriptions & dispensing", href: "/pharmacy", icon: Pill, permission: "pharmacy.prescriptions.read", module: "pharmacy" },
    { label: "POS collection", href: "/pos", icon: ShoppingCart, permission: "sales.create" },
    { label: "Medicine inventory", href: "/inventory", icon: Boxes, permission: "inventory.read" },
    { label: "Purchasing", href: "/purchasing", icon: ClipboardList, permission: "purchasing.read" },
  ] },
  { label: "Accounting", href: "/accounting", icon: CreditCard, anyPermissions: ["accounting.read", "expenses.read", "payroll.read"], module: "accounting", children: [
    { label: "Expenses & taxes", href: "/expenses", icon: ReceiptText, permission: "expenses.read" },
    { label: "Payroll & loans", href: "/payroll", icon: WalletCards, permission: "payroll.read" },
    { label: "Tenant payment setup", href: "/settings/payment", icon: CreditCard, permission: "accounting.manage" },
  ] },
  { label: "Administration", href: "/settings", icon: Settings, anyPermissions: ["reports.read", "sync.commands.read", "audit.read", "users.administer"], children: [
    { label: "Reports", href: "/reports", icon: BarChart3, permission: "reports.read" },
    { label: "Sync center", href: "/sync", icon: RefreshCw, permission: "sync.commands.read" },
    { label: "Security & audit", href: "/security", icon: ShieldCheck, permission: "audit.read" },
    { label: "People & access", href: "/people", icon: Users, permission: "users.administer" },
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Payment setup", href: "/settings/payment", icon: CreditCard, permission: "accounting.manage" },
    { label: "HMO setup", href: "/settings/hmo", icon: ShieldCheck, permission: "hospital.billing.approve", module: "hospital" },
    { label: "Platform administration", href: "/platform", icon: Building2, platformOnly: true },
    { label: "Tenant portal IDs", href: "/platform/tenant-portals", icon: KeyRound, roles: ["platform_admin"] },
  ] },
];

const platformConsoleNav: NavItem[] = [
  { label: "Tenants dashboard", href: "/platform", icon: LayoutDashboard },
  { label: "Command centre", href: "/platform/tenants", icon: Building2 },
  { label: "Tenant portal IDs", href: "/platform/tenant-portals", icon: KeyRound },
  { label: "Plans & licensing", href: "/platform/plans", icon: CreditCard },
  { label: "Subscription payments", href: "/platform/payments", icon: ReceiptText },
  { label: "Platform activity", href: "/platform/activity", icon: ClipboardList },
  { label: "Store nodes", href: "/platform/store-nodes", icon: Monitor },
];

export type DashboardData = {
  sales: { sale_count: number; gross_sales: string; refunds: string; net_sales: string } | null;
  inventory: { low_stock: Array<unknown>; expiring_batches: Array<unknown> } | null;
  pharmacy: { prescriptions: number; dispenses: number; controlled_drug_entries: number } | null;
  hospital: { active_admissions: number; billing: { outstanding: string } } | null;
};

function sameSyncState(current: SyncState, next: SyncState) {
  return current.phase === next.phase
    && current.error === next.error
    && current.summary.total === next.summary.total
    && current.summary.actionable === next.summary.actionable
    && current.summary.needsReview === next.summary.needsReview
    && current.summary.blocked === next.summary.blocked
    && current.summary.legacy === next.summary.legacy;
}

function sameNotifications(current: Notification[], next: Notification[]) {
  return current.length === next.length && current.every((item, index) => {
    const candidate = next[index];
    return candidate && item.id === candidate.id && item.title === candidate.title && item.message === candidate.message && item.severity === candidate.severity && item.link === candidate.link && item.read_at === candidate.read_at;
  });
}

export default function DashboardShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const routePathname = usePathname();
  const platformRoute = routePathname.match(/^\/a\/[0-9a-f-]+(?:\/(.*))?$/i);
  const platformConsoleBase = routePathname.match(/^\/a\/[0-9a-f-]+/i)?.[0] ?? null;
  const isPlatformConsoleRoute = Boolean(platformRoute && platformConsoleBase);
  const pathname = platformRoute
    ? `/platform${platformRoute[1] ? `/${platformRoute[1]}` : ""}`
    : routePathname.replace(/^\/t\/[0-9a-f-]+(?=\/|$)/i, "") || "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => ({
    Store: ["/pos", "/products", "/terminal-sessions", "/returns", "/purchasing", "/contacts", "/crm"].some((prefix) => pathname.startsWith(prefix)),
    Inventory: pathname.startsWith("/inventory"),
    Stock: pathname.startsWith("/stock"),
    Hospital: pathname.startsWith("/hospital"),
    "Patient portal": pathname.startsWith("/patient-portal"),
    Laboratory: pathname.startsWith("/laboratory"),
    Pharmacy: pathname.startsWith("/pharmacy"),
    Accounting: pathname.startsWith("/accounting") || pathname.startsWith("/expenses") || pathname.startsWith("/payroll"),
    Administration: ["/reports", "/sync", "/security", "/people", "/settings", "/platform"].some((prefix) => pathname.startsWith(prefix)),
  }));
  const { online } = useApiConnectivity();
  // Match the server's unauthenticated shell during hydration. The cached
  // context is applied in a layout effect before this shell becomes visible,
  // avoiding both a menu flash and a structural hydration mismatch.
  const [auth, setAuth] = useState<AuthorizationContext | null>(null);
  const [platformDenied, setPlatformDenied] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const theme = useTenantTheme();
  const [syncState, setSyncState] = useState<SyncState>({ phase: "idle", summary: emptySummary, error: null });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const updateSyncState = useCallback((next: SyncState) => {
    setSyncState((current) => sameSyncState(current, next) ? current : next);
  }, []);

  useLayoutEffect(() => {
    const cached = readCachedAuthorizationContext();
    if (cached) setAuth(cached);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      let authorization: AuthorizationContext;
      try {
        authorization = await loadAuthorizationContext();
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) router.replace(isPlatformConsoleRoute && platformConsoleBase ? `${platformConsoleBase}/login` : tenantLoginPath());
        else if (caught instanceof ApiError && caught.status === 403) router.replace("/change-password");
        // A temporary network or rate-limit error must not be treated as a
        // logout. Leave the current shell visible and let its next request
        // recover normally.
        return;
      }
      if (!active) return;
      if (isPlatformConsoleRoute && authorization.role !== "platform_super_admin") {
        setPlatformDenied(true);
        return;
      }
      if (active) setAuth(authorization);
      if (authorization.tenant_public_id) {
        if (isPlatformConsoleRoute) {
          clearTenantRoute();
          resetPlatformTheme();
        }
        else saveTenantPublicId(authorization.tenant_public_id);
      }
      const profileResponse = await apiFetch(API_BASE, "/api/v1/auth/me").catch(() => null);
      if (profileResponse?.ok && profileResponse.headers.get("content-type")?.includes("application/json") && active) {
        setProfile(await profileResponse.json());
      }
      // The authenticated session supplies the opaque public tenant ID used by
      // the same resolver as the pre-login route.
      if (authorization.tenant_public_id && active && !isPlatformConsoleRoute) {
        await loadTenantTheme(API_BASE, authorization.tenant_public_id).catch(() => null);
      }
    }
    void load(); return () => { active = false; };
  }, [isPlatformConsoleRoute, platformConsoleBase, router]);

  const loadUserActivity = useCallback(async () => {
    try {
      const [notificationResponse, messageResponse] = await Promise.all([
        apiFetch(API_BASE, "/api/v1/hospital/notifications"),
        apiFetch(API_BASE, "/api/v1/hospital/messages/conversations"),
      ]);
      if (notificationResponse.ok) {
        const next = await notificationResponse.json() as Notification[];
        setNotifications((current) => sameNotifications(current, next) ? current : next);
      }
      if (messageResponse.ok) {
        const messages = await messageResponse.json() as { unread_count?: number };
        setUnreadMessages(messages.unread_count || 0);
      }
    } catch { /* Connectivity indicator handles unavailable API state. */ }
  }, []);
  useEffect(() => { void loadUserActivity(); }, [loadUserActivity]);
  useRealtimeEvents((event) => {
    if (event.type === "notification" || event.type === "message") void loadUserActivity();
  }, !isPlatformConsoleRoute);
  async function markNotificationRead(id: string) { await apiFetch(API_BASE, `/api/v1/hospital/notifications/${id}/read`, { method: "PATCH" }); setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item)); }

  const isPlatformAdmin = auth?.role === "platform_super_admin";
  const tenantWorkspaceBase = routePathname.match(/^\/t\/[0-9a-f-]+/i)?.[0]
    || (auth?.tenant_public_id && !isPlatformConsoleRoute ? `/t/${auth.tenant_public_id}` : "");
  const tenantWorkspacePath = (href: string) => tenantWorkspaceBase ? `${tenantWorkspaceBase}${href}` : href;
  const messageHref = tenantWorkspacePath(auth?.role === "patient" ? "/patient-portal/messages" : "/messages");
  const canSeeNavItem = useCallback((item: NavItem) => (!item.platformOnly || isPlatformAdmin)
    && (!item.roles || (auth ? item.roles.includes(auth.role) : false))
    && (!item.permission || isPlatformAdmin || can(auth, item.permission))
    && (!item.anyPermissions || isPlatformAdmin || item.anyPermissions.some((permission) => can(auth, permission)))
    && (!item.module || hasModule(auth, item.module)), [auth, isPlatformAdmin]);
  const visibleNav = useMemo(() => {
    if (isPlatformConsoleRoute) return platformConsoleNav;
    const items = navItems.filter(canSeeNavItem);
    return auth?.role === "patient" ? items.filter((item) => item.label === "Patient portal") : items;
  }, [auth?.role, canSeeNavItem, isPlatformConsoleRoute]);
  const brand = theme?.settings.brand_name || "Superstore Health Suite";
  const connected = online && syncState.phase !== "offline";
  const syncLabel = !connected ? "Offline"
    : syncState.phase === "syncing" ? "Synchronizing"
      : syncState.phase === "review" ? "Sync review needed"
        : syncState.phase === "blocked" ? "Sync action needed"
          : syncState.phase === "pending" ? `${syncState.summary.total} queued for sync`
            : "Online";
  const syncStyle = !connected || ["review", "blocked"].includes(syncState.phase)
    ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";

  function logout() { const tenantSignIn = tenantLoginPath(); const signOutPath = isPlatformConsoleRoute && platformConsoleBase ? `${platformConsoleBase}/login` : tenantSignIn.replace(/\/login$/, "/logout"); void apiFetch(API_BASE, "/api/v1/auth/logout", { method: "POST" }).catch(() => undefined).finally(() => { clearTokens({ resetTheme: !signOutPath.endsWith("/logout"), purgeData: true }); router.replace(signOutPath); }); }

  if (platformDenied) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-6xl font-bold tracking-tight text-slate-900">404</p><h1 className="mt-4 text-xl font-bold">Page not found</h1><p className="mt-2 text-sm text-slate-500">The page you requested could not be found.</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Return home</Link></section></main>;

  return (
    <div className="tenant-shell min-h-screen bg-slate-50 text-slate-900">
      <SyncManager onStateChange={updateSyncState} />
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center justify-between border-b border-slate-100 px-6">
          <Link suppressHydrationWarning href={isPlatformConsoleRoute ? platformConsoleBase! : tenantWorkspaceBase || "/"} className="flex items-center gap-3" onClick={() => setOpen(false)}>
            {theme?.settings.logo_url ? <img src={theme.settings.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span style={{ backgroundColor: "var(--tenant-primary)" }} className="grid h-10 w-10 place-items-center rounded-xl text-white"><Activity size={21} /></span>}
            <span suppressHydrationWarning data-tenant-brand className="max-w-40 truncate text-sm font-bold tracking-tight">{brand}</span>
          </Link>
          <button className="rounded-lg p-2 text-slate-400 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{isPlatformConsoleRoute ? "Platform" : "Workspace"}</p>
          <nav className="space-y-1">
            {visibleNav.map((item) => { const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); const children = item.children?.filter(canSeeNavItem); const expanded = Boolean(children?.length && expandedMenus[item.label]); const href = isPlatformConsoleRoute ? `${platformConsoleBase}${item.href.slice("/platform".length)}` : item.platformOnly ? platformConsolePath() : tenantWorkspacePath(item.href); return <div key={item.href}><div className="flex items-center gap-1"><Link href={href} onClick={() => setOpen(false)} style={active ? { backgroundColor: "color-mix(in srgb, var(--tenant-primary) 10%, white)", color: "var(--tenant-primary)" } : undefined} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition", active ? "" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}><Icon size={18} strokeWidth={active ? 2.5 : 2} /><span>{item.label}</span>{active && !children?.length && <span style={{ backgroundColor: "var(--tenant-primary)" }} className="ml-auto h-1.5 w-1.5 rounded-full" />}</Link>{children?.length ? <button type="button" onClick={() => setExpandedMenus((current) => ({ ...current, [item.label]: !expanded }))} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label} menu`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"><ChevronDown size={16} className={cn("transition-transform", expanded && "rotate-180")} /></button> : null}</div>{expanded ? <nav className="ml-6 mt-1 space-y-1 border-l border-slate-100 pl-3">{children?.map((child) => { const ChildIcon = child.icon; const childIsActive = pathname === child.href || pathname.startsWith(`${child.href}/`); const childHref = isPlatformConsoleRoute ? `${platformConsoleBase}${child.href.slice("/platform".length)}` : child.platformOnly ? platformConsolePath() : tenantWorkspacePath(child.href); return <Link key={child.href} href={childHref} onClick={() => setOpen(false)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition", childIsActive ? "bg-teal-50 text-teal-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}><ChildIcon size={15} /><span>{child.label}</span></Link>; })}</nav> : null}</div>; })}
          </nav>
        </div>
        <div className="border-t border-slate-100 p-4"><div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{(profile?.full_name || auth?.role || "SH").slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{profile?.full_name || "Loading profile"}</p><p className="truncate text-[11px] capitalize text-slate-500">{profile?.role?.replaceAll("_", " ") || auth?.role?.replaceAll("_", " ") || "Loading access"}</p><p className="truncate text-[10px] text-slate-400">{profile?.email || (connected ? "Connected" : "Offline mode")}</p></div><button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600" aria-label="Sign out"><LogOut size={16} /></button></div></div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <main className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4"><button className="shrink-0 rounded-xl border border-slate-200 p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={19} /></button><div className="min-w-0"><p className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</p>{subtitle && <p className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>}</div></div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className={cn("hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold xl:flex", syncStyle)}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{syncLabel}</span>
            <button className="hidden min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 lg:flex"><Building2 className="shrink-0" size={15} /><span suppressHydrationWarning data-tenant-brand className="max-w-40 truncate">{theme?.settings.brand_name || theme?.name || "Current workspace"}</span><ChevronDown className="shrink-0" size={14} /></button>
            {!isPlatformConsoleRoute && <Link href={messageHref} aria-label="Direct messages" title="Direct messages" className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-700"><MessageCircle size={18} />{unreadMessages > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-teal-600 px-1 text-[9px] font-bold text-white">{unreadMessages > 9 ? "9+" : unreadMessages}</span>}</Link>}
            <div className="relative"><button onClick={() => setShowNotifications((value) => !value)} className="relative rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm" aria-label="Notifications"><Bell size={18}/>{notifications.some((item) => !item.read_at) && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-rose-500" />}</button>{showNotifications && <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"><p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">Notifications</p>{!notifications.length ? <p className="p-3 text-sm text-slate-500">No notifications.</p> : notifications.slice(0, 8).map((item) => <button key={item.id} onClick={() => void markNotificationRead(item.id)} className={cn("block w-full rounded-xl p-3 text-left", !item.read_at && "bg-teal-50")}><p className="truncate text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-600">{item.message}</p></button>)}</div>}</div>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3"><div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-slate-900 text-xs font-bold text-white">{profile?.attributes?.avatar_url ? <img src={String(profile.attributes.avatar_url)} alt={profile.full_name} className="h-full w-full object-cover" /> : (profile?.full_name || "SH").slice(0, 2).toUpperCase()}</div><div className="hidden max-w-32 sm:block"><p className="truncate text-xs font-bold text-slate-800">{profile?.full_name || "Loading profile"}</p><p className="truncate text-[10px] capitalize text-slate-400">{profile?.role?.replaceAll("_", " ") || ""}</p></div></div>
          </div>
        </header>
        <div className="app-grid min-h-[calc(100vh-5rem)] px-5 py-7 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
