"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

type ToastTone = "success" | "warning" | "error" | "info";
type Toast = { id: number; title: string; description?: string; tone: ToastTone };
type ToastApi = { show: (tone: ToastTone, title: string, description?: string) => void; success: (title: string, description?: string) => void; warning: (title: string, description?: string) => void; error: (title: string, description?: string) => void; info: (title: string, description?: string) => void };

const ToastContext = createContext<ToastApi | null>(null);
const styles: Record<ToastTone, { panel: string; icon: ReactNode }> = {
  success: { panel: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: <CheckCircle2 className="text-emerald-600" size={19} /> },
  warning: { panel: "border-amber-200 bg-amber-50 text-amber-950", icon: <AlertTriangle className="text-amber-600" size={19} /> },
  error: { panel: "border-rose-200 bg-rose-50 text-rose-950", icon: <XCircle className="text-rose-600" size={19} /> },
  info: { panel: "border-sky-200 bg-sky-50 text-sky-950", icon: <Info className="text-sky-600" size={19} /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const show = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = Date.now() + Math.floor(Math.random() * 10000);
    setToasts((items) => [...items, { id, tone, title, description }].slice(-5));
    window.setTimeout(() => dismiss(id), tone === "warning" ? 8000 : 5000);
  }, [dismiss]);
  const value = useMemo<ToastApi>(() => ({
    show,
    success: (title, description) => show("success", title, description),
    warning: (title, description) => show("warning", title, description),
    error: (title, description) => show("error", title, description),
    info: (title, description) => show("info", title, description),
  }), [show]);
  return <ToastContext.Provider value={value}>{children}<div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-md flex-col gap-3">
    {toasts.map((toast) => <div key={toast.id} role={toast.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex gap-3 rounded-2xl border p-4 shadow-xl shadow-slate-900/10 ${styles[toast.tone].panel}`}>
      <span className="mt-0.5 shrink-0">{styles[toast.tone].icon}</span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{toast.title}</p>{toast.description && <p className="mt-1 text-xs leading-5 opacity-80">{toast.description}</p>}</div><button onClick={() => dismiss(toast.id)} aria-label="Dismiss notification" className="-mr-1 -mt-1 rounded-lg p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"><X size={16} /></button>
    </div>)}
  </div></ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
