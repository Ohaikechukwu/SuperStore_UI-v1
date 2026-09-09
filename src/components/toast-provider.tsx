"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
  }, []);
  const value = useMemo<ToastApi>(() => ({
    show,
    success: (title, description) => show("success", title, description),
    warning: (title, description) => show("warning", title, description),
    error: (title, description) => show("error", title, description),
    info: (title, description) => show("info", title, description),
  }), [show]);
  return <ToastContext.Provider value={value}>{children}<div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-md flex-col gap-3">
    {toasts.map((toast) => <ToastMessage key={toast.id} toast={toast} dismiss={dismiss} />)}
  </div></ToastContext.Provider>;
}

function ToastMessage({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // Errors remain until dismissed. Give readers a fresh interval after interaction.
    if (toast.tone === "error" || hovered || focused) return;
    const timer = window.setTimeout(() => dismiss(toast.id), toast.tone === "warning" ? 8000 : 6000);
    return () => window.clearTimeout(timer);
  }, [dismiss, focused, hovered, toast.id, toast.tone]);
  return <div role={toast.tone === "error" ? "alert" : "status"} aria-atomic="true"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    className={`pointer-events-auto flex gap-3 rounded-2xl border p-4 shadow-xl shadow-slate-900/10 ${styles[toast.tone].panel}`}>
    <span aria-hidden="true" className="mt-0.5 shrink-0">{styles[toast.tone].icon}</span>
    <div className="min-w-0 flex-1"><p className="text-sm font-bold">{toast.title}</p>{toast.description && <p className="mt-1 text-sm leading-6">{toast.description}</p>}</div>
    <button type="button" onClick={() => dismiss(toast.id)} aria-label={`Dismiss notification: ${toast.title}`} className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl hover:bg-black/5"><X size={18} /></button>
  </div>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
