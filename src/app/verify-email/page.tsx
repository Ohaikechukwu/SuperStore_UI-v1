"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/config";

export default function VerifyEmailPage() {
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const token = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") || "";
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); try { const response = await fetch(`${API_BASE}/api/v1/auth/email/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: String(new FormData(event.currentTarget).get("token")) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Unable to verify email."); setMessage("Email address verified. You can now return to the workspace."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to verify email."); } }
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Email verification</p><h1 className="mt-2 text-3xl font-bold">Verify your email</h1><p className="mt-2 text-sm text-slate-500">Paste the verification token from the email sent by your workspace.</p>{error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<label className="mt-5 block text-xs font-bold text-slate-600">Verification token<input name="token" defaultValue={token} required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label><button className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Verify email</button><Link href="/login" className="mt-5 block text-center text-sm font-bold text-teal-700">Back to sign in</Link></form></main>;
}
