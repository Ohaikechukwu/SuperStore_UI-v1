"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { accessToken, apiFetch, signedInHomePath, tenantLoginPath } from "@/auth";
import { API_BASE } from "@/lib/config";

const passwordPolicy = "Use 12+ characters with uppercase, lowercase, a number, and a symbol. Spaces are not allowed.";
function isStrongPassword(value: string) {
  return value.length >= 12 && !/\s/.test(value) && /[a-z]/.test(value) && /[A-Z]/.test(value)
    && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken()) router.replace(tenantLoginPath());
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isStrongPassword(password)) { setError(passwordPolicy); return; }
    if (password !== confirmation) { setError("The passwords do not match."); return; }
    setSaving(true); setError("");
    try {
      const response = await apiFetch(API_BASE, "/api/v1/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ new_password: password }),
      });
      if (!response.ok) throw new Error("password change failed");
      router.replace(signedInHomePath());
    } catch {
      setError("We could not update your password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-950/5">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-600 text-white"><KeyRound size={22} /></div>
      <p className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-600"><ShieldCheck size={15} /> Account security</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Set your password</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Your administrator gave you a temporary password. {passwordPolicy}</p>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">New password</span><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" /></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Confirm new password</span><input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" /></label>
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{error}</p>}
        <button disabled={saving} className="h-12 w-full rounded-xl bg-teal-600 text-sm font-bold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60">{saving ? "Updating password…" : "Continue to workspace"}</button>
      </form>
    </section>
  </main>;
}
