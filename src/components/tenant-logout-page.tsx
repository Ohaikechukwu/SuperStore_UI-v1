"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CheckCircle2, LogIn, Sparkles } from "lucide-react";
import { apiFetch, clearTokens } from "@/auth";
import { API_BASE } from "@/lib/config";
import { applyTenantTheme, type TenantTheme } from "@/tenantTheme";

export default function TenantLogoutPage({ tenantPublicId, initialTheme }: {
  tenantPublicId: string;
  initialTheme: TenantTheme | null;
}) {
  const brandName = initialTheme?.settings.brand_name || initialTheme?.name || "Your workspace";
  const logoUrl = initialTheme?.settings.logo_url;
  const footer = initialTheme?.settings.login_footer || "Your workspace is ready whenever you are.";

  useEffect(() => {
    if (initialTheme) applyTenantTheme(initialTheme);
    // This also makes a directly visited sign-out URL invalidate the active
    // session. Preserve the server-rendered tenant identity for this page.
    void apiFetch(API_BASE, "/api/v1/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => clearTokens({ resetTheme: false }));
  }, [initialTheme]);

  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
    <section className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-950/5">
      <div className="bg-slate-950 px-7 py-8 text-white">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-teal-500">{logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : <Sparkles size={21} />}</span><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Signed out</p><h1 className="mt-1 text-lg font-bold">{brandName}</h1></div></div>
      </div>
      <div className="p-7"><CheckCircle2 className="text-teal-600" size={30} /><h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">You have signed out safely.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your {brandName} session is closed on this browser.</p><Link href={`/t/${tenantPublicId}/login`} className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-bold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-700">Sign in again <LogIn size={17} /></Link><p className="mt-5 text-center text-xs text-slate-400">{footer}</p></div>
    </section>
  </main>;
}
