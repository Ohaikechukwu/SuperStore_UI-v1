import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <SearchX aria-hidden="true" className="mx-auto text-slate-400" size={36} />
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-teal-700">404 · Page not found</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">We can’t find that page</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">The address may be incorrect, or the page may no longer be available.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Return to home</Link>
    </section>
  </main>;
}
