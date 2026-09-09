import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-600 shadow-sm">
      <LoaderCircle aria-hidden="true" className="animate-spin text-teal-700" size={20} />
      Loading your workspace…
    </div>
  </main>;
}
