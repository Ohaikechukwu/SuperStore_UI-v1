"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
    <section role="alert" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <AlertTriangle aria-hidden="true" className="mx-auto text-amber-600" size={32} />
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">This page couldn’t load</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Try loading the page again. If you were saving a transaction, check its status before submitting it again.</p>
      <button onClick={retry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
        <RotateCcw size={16} aria-hidden="true" /> Try again
      </button>
    </section>
  </main>;
}
