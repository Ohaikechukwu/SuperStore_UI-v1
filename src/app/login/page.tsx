"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearTenantRoute, login, savePlatformAdminPublicId } from "@/auth";
import { API_BASE } from "@/lib/config";
import { applyTenantTheme, resetPlatformTheme, resolveTenantTheme, type TenantTheme } from "@/tenantTheme";

export function TenantLoginPage({
  tenantPublicId,
  initialTheme = null,
  authenticatedRedirect,
  platformAdminLogin = false,
}: {
  tenantPublicId: string;
  initialTheme?: TenantTheme | null;
  authenticatedRedirect?: string;
  platformAdminLogin?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [theme, setTheme] = useState<TenantTheme | null>(initialTheme);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedPlan = typeof window === "undefined" ? "" : (() => {
    const next = new URLSearchParams(window.location.search).get("next") || "";
    return next.startsWith("/subscribe?") ? new URLSearchParams(next.split("?")[1]).get("plan") || "" : "";
  })();

  useEffect(() => {
    const key = tenantPublicId.trim();
    let active = true;
    if (!key) return () => { active = false; };
    if (platformAdminLogin) {
      resetPlatformTheme();
      return () => { active = false; };
    }
    if (initialTheme?.public_id === key) {
      applyTenantTheme(initialTheme);
      return () => { active = false; };
    }
    resetPlatformTheme();
    const timer = window.setTimeout(() => {
      void resolveTenantTheme(API_BASE, key)
        .then((nextTheme) => {
          if (!active) return;
          applyTenantTheme(nextTheme);
          setTheme(nextTheme);
        })
        // A missing workspace should retain the platform look; submit returns
        // the normal sign-in error without revealing tenant details.
        .catch(() => undefined);
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [initialTheme, platformAdminLogin, tenantPublicId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const tokens = await login(API_BASE, tenantPublicId, email, password, platformAdminLogin);
      if (platformAdminLogin) {
        // The platform tenant is only the credential authority for this
        // account. It must not become the user's normal /t/<id> workspace.
        clearTenantRoute();
        savePlatformAdminPublicId(tenantPublicId);
      }
      const requestedNext = new URLSearchParams(window.location.search).get("next") || authenticatedRedirect || "";
      const tenantHome = `/t/${tenantPublicId.trim()}`;
      // `/` is the public marketing page. A tenant sign-in must always return
      // to the explicit tenant route, not rely on a browser routing cookie.
      const next = platformAdminLogin
        ? authenticatedRedirect || "/"
        : requestedNext.startsWith(tenantHome)
          ? requestedNext
          : requestedNext.startsWith("/") && !requestedNext.startsWith("//")
            ? `${tenantHome}${requestedNext === "/" ? "" : requestedNext}`
            : tenantHome;
      const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : tenantHome;
      router.replace(tokens.password_change_required ? "/change-password" : safeNext);
    }
    catch { setError("We could not sign you in. Check your email and password, then try again."); }
    finally { setLoading(false); }
  }

  const selectedTheme = theme?.public_id === tenantPublicId.trim() ? theme : null;
  const brandName = selectedTheme?.settings.brand_name || "Superstore Health Suite";
  const brandLogo = selectedTheme?.settings.logo_url;
  const loginBackground = selectedTheme?.settings.login_background_url;
  const loginEyebrow = selectedTheme?.settings.login_eyebrow || "One connected workspace";
  const loginHeadline = selectedTheme?.settings.login_headline || "Run every part of care and commerce with confidence.";
  const loginDescription = selectedTheme?.settings.login_description || "Inventory, point of sale, pharmacy, hospital operations, and accounting—connected and ready for your team.";
  const loginFooter = selectedTheme?.settings.login_footer || "Secure workspace access · v0.1";
  const loginBadges = selectedTheme?.settings.login_badges?.filter(Boolean).slice(0, 3);
  const visibleLoginBadges = loginBadges?.length ? loginBadges : ["Offline-first", "Role-aware", "Audit-ready"];
  const safeLoginBackground = loginBackground?.replaceAll('"', "%22").replaceAll("'", "%27");
  const heroStyle = safeLoginBackground ? { backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.86), rgba(2, 6, 23, 0.9)), url("${safeLoginBackground}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined;
  return <main className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
    <section style={heroStyle} className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-teal-500/20 blur-3xl" /><div className="absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-3xl" /><div className="relative flex items-center gap-3"><div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-teal-500">{brandLogo ? <img src={brandLogo} alt="" className="h-full w-full object-cover" /> : <Sparkles size={21} />}</div><span className="font-bold tracking-tight">{brandName}</span></div><div className="relative max-w-xl"><p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-teal-300">{loginEyebrow}</p><h1 className="text-5xl font-bold leading-[1.08] tracking-tight">{loginHeadline}</h1><p className="mt-6 max-w-lg text-base leading-7 text-slate-300">{loginDescription}</p><div className="mt-10 flex flex-wrap gap-3">{visibleLoginBadges.map((badge) => <span key={badge} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">{badge}</span>)}</div></div><p className="relative text-xs text-slate-500">{loginFooter}</p></section>
    <section className="flex items-center justify-center bg-white px-6 py-12 sm:px-12"><div className="w-full max-w-md"><div className="mb-10 lg:hidden"><div className="mb-5 grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-teal-600 text-white">{brandLogo ? <img src={brandLogo} alt="" className="h-full w-full object-cover" /> : <Sparkles size={21} />}</div><p className="text-sm font-bold">{brandName}</p></div><div className="mb-8"><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-600"><ShieldCheck size={15} /> Secure sign in</p><h2 className="text-3xl font-bold tracking-tight text-slate-950">Welcome back</h2><p className="mt-2 text-sm text-slate-500">Sign in to continue to your operations workspace.</p></div><form className="space-y-5" onSubmit={submit}><label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Email address</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Password</span><div className="relative"><LockKeyhole size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" /></div></label>{error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{error}</p>}<button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-bold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}{!loading && <ArrowRight size={17} />}</button></form><div className="mt-6 flex justify-between text-xs font-bold text-teal-700"><Link href="/forgot-password">Forgot password?</Link><Link href={selectedPlan ? `/signup?plan=${encodeURIComponent(selectedPlan)}` : "/signup"}>Create workspace</Link></div></div></section>
  </main>;
}

export default function LoginPage() {
  const [platformTheme, setPlatformTheme] = useState<TenantTheme | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    void fetch(`${API_BASE}/api/v1/catalog/tenant/resolve?slug=platform`)
      .then(async (response) => response.ok ? response.json() as Promise<TenantTheme> : null)
      .then((theme) => { setPlatformTheme(theme); setUnavailable(!theme); })
      .catch(() => setUnavailable(true));
  }, []);

  if (platformTheme) {
    return <TenantLoginPage tenantPublicId={platformTheme.public_id} authenticatedRedirect={`/a/${platformTheme.public_id}`} platformAdminLogin />;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Platform administrator</p><h1 className="mt-3 text-3xl font-bold tracking-tight">{unavailable ? "Platform sign-in is unavailable" : "Preparing secure sign in…"}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{unavailable ? "The platform workspace could not be resolved. Confirm that the API is running and the Platform tenant exists." : "Loading the platform administration workspace."}</p></section></main>;
}
